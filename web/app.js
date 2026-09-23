const PERIOD_COLORS = ["#e11d48", "#7c3aed", "#0284c7", "#059669", "#f97316", "#d4a017", "#dc2626"];
const DRAFT_STORAGE_KEY = "gunnmap.schedule-draft.v1";
const TEMPLATES_STORAGE_KEY = "gunnmap.schedule-templates.v1";
const SHARE_PARAM = "schedule";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EXAMPLE = [
  ["F", "F4"], ["M", "M3"], ["J", "J3"], ["K", "K1"],
  ["N", "N110"], ["N", "N211"], ["", ""],
];

const form = document.querySelector("#period-form");
const list = document.querySelector("#period-list");
const status = document.querySelector("#status");
const renderButton = document.querySelector("#render-button");
const sampleButton = document.querySelector("#sample-button");
const clearButton = document.querySelector("#clear-button");
const shareButton = document.querySelector("#share-button");
const templateSelect = document.querySelector("#template-select");
const saveTemplateButton = document.querySelector("#save-template-button");
const deleteTemplateButton = document.querySelector("#delete-template-button");
const mapImage = document.querySelector("#map-image");
const downloadLink = document.querySelector("#download-link");
const legend = document.querySelector("#legend");
const warning = document.querySelector("#warning");
const draftStatus = document.querySelector("#draft-status");

let rooms = [];
let buildings = [];

function showDraftStatus(message, isError = false) {
  draftStatus.textContent = message;
  draftStatus.classList.toggle("error", isError);
}

function isValidPeriods(periods) {
  return Boolean(
    Array.isArray(periods) &&
      periods.length === 7 &&
      periods.every((period) => (
        period &&
        typeof period.building === "string" &&
        typeof period.room === "string" &&
        typeof period.color === "string" &&
        HEX_COLOR.test(period.color)
      )),
  );
}

function isValidDraft(value) {
  return Boolean(value && value.version === 1 && isValidPeriods(value.periods));
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 1, periods: readPeriods() }));
    showDraftStatus("Draft saved on this device.");
  } catch {
    showDraftStatus("Draft could not be saved in this browser.", true);
  }
}

function loadDraft() {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return null;
    const draft = JSON.parse(saved);
    if (!isValidDraft(draft)) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return draft.periods;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function loadTemplates() {
  try {
    const saved = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!saved) return [];
    const templates = JSON.parse(saved);
    if (!Array.isArray(templates)) return [];
    return templates.filter((template) => (
      template &&
      typeof template.name === "string" &&
      template.name.trim() &&
      isValidPeriods(template.periods)
    ));
  } catch {
    return [];
  }
}

function saveTemplates(templates) {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

function renderTemplateOptions(selectedName = templateSelect.value) {
  templateSelect.replaceChildren(new Option("Choose a saved template", ""));
  for (const template of loadTemplates()) {
    templateSelect.append(new Option(template.name, template.name));
  }
  templateSelect.value = selectedName;
  deleteTemplateButton.disabled = !templateSelect.value;
}

function buildingName(code) {
  if (code === "BG") return "Bow Gym";
  if (code === "D") return "D Building / Library";
  return `${code} Building`;
}

function updateSuggestions(card, clearRoom = true) {
  const building = card.querySelector("select").value;
  const input = card.querySelector('input[type="text"]');
  const dataList = card.querySelector("datalist");
  if (clearRoom) input.value = "";
  dataList.replaceChildren();
  if (!building) return;

  const candidates = rooms.filter((room) => room.building === building);
  const counts = new Map();
  for (const room of candidates) counts.set(room.label, (counts.get(room.label) || 0) + 1);
  for (const room of candidates) {
    const option = document.createElement("option");
    option.value = counts.get(room.label) > 1 ? `${room.label} (${room.id})` : room.label;
    option.label = `${room.id}${room.floor === 2 ? " · 2F" : ""}`;
    dataList.append(option);
  }
}

function createPeriod(number) {
  const card = document.createElement("div");
  card.className = "period-card";
  card.dataset.period = String(number);
  card.innerHTML = `
    <div class="period-number"><span>PERIOD</span><strong>${number}</strong></div>
    <label class="field field-building"><span>Building</span><select aria-label="Period ${number} building"><option value="">Choose a building</option></select></label>
    <label class="field field-room"><span>Room</span><input type="text" list="rooms-${number}" placeholder="e.g. N211" autocomplete="off" aria-label="Period ${number} room"><datalist id="rooms-${number}"></datalist></label>
    <label class="field field-color"><span>Color</span><input type="color" value="${PERIOD_COLORS[number - 1]}" aria-label="Period ${number} color"></label>
  `;
  const select = card.querySelector("select");
  for (const building of buildings) {
    const option = document.createElement("option");
    option.value = building;
    option.textContent = buildingName(building);
    select.append(option);
  }
  select.addEventListener("change", () => {
    updateSuggestions(card);
    saveDraft();
    updateDuplicateWarnings();
  });
  card.querySelector('input[type="text"]').addEventListener("input", () => {
    saveDraft();
    updateDuplicateWarnings();
  });
  card.querySelector('input[type="color"]').addEventListener("input", saveDraft);
  return card;
}

function readPeriods() {
  return [...list.querySelectorAll(".period-card")].map((card) => ({
    building: card.querySelector("select").value,
    room: card.querySelector('input[type="text"]').value.trim(),
    color: card.querySelector('input[type="color"]').value,
  }));
}

function findRoom(period) {
  const building = period.building.trim().toUpperCase();
  const roomName = period.room.trim();
  if (!building || !roomName) return null;
  return rooms.find((room) => (
    room.building === building &&
    (room.id === roomName || room.label === roomName || `${room.label} (${room.id})` === roomName)
  ));
}

function duplicateWarningText(periods = readPeriods()) {
  const groups = new Map();
  periods.forEach((period, index) => {
    const room = findRoom(period);
    if (!room) return;
    const group = groups.get(room.id) || { room, periods: [] };
    group.periods.push(index + 1);
    groups.set(room.id, group);
  });
  return [...groups.values()]
    .filter(({ periods: selectedPeriods }) => selectedPeriods.length > 1)
    .map(({ room, periods: selectedPeriods }) => (
      `Periods ${selectedPeriods.join(", ")} share ${room.label}; each color fills 1/${selectedPeriods.length} of the room.`
    ))
    .join(" ");
}

function updateDuplicateWarnings() {
  warning.textContent = duplicateWarningText();
}

function showLegend(selected) {
  legend.replaceChildren();
  for (const item of selected) {
    const chip = document.createElement("div");
    chip.className = "legend-item";
    const color = document.createElement("span");
    color.className = "legend-color";
    color.style.backgroundColor = item.color;
    const label = document.createElement("span");
    label.textContent = `P${item.period} · ${item.label}${item.floor === 2 ? " (2F)" : ""}`;
    chip.append(color, label);
    legend.append(chip);
  }
}

function resetPreview() {
  mapImage.src = "/map.png";
  mapImage.alt = "Original Gunn campus map; selected rooms will appear highlighted after generation";
  downloadLink.href = "#";
  downloadLink.classList.add("is-disabled");
  downloadLink.setAttribute("aria-disabled", "true");
  legend.replaceChildren();
  warning.textContent = "";
}

function applyPeriods(periods) {
  periods.forEach((period, index) => {
    const card = list.children[index];
    const select = card.querySelector("select");
    const roomInput = card.querySelector('input[type="text"]');
    const colorInput = card.querySelector('input[type="color"]');
    select.value = buildings.includes(period.building) ? period.building : "";
    updateSuggestions(card, false);
    roomInput.value = select.value ? period.room : "";
    colorInput.value = HEX_COLOR.test(period.color) ? period.color : PERIOD_COLORS[index];
  });
  updateDuplicateWarnings();
}

function resetPeriods() {
  applyPeriods(PERIOD_COLORS.map((color) => ({ building: "", room: "", color })));
}

function loadSharedSchedule() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const encoded = new URLSearchParams(hash).get(SHARE_PARAM);
  if (!encoded) return null;
  try {
    const periods = JSON.parse(encoded);
    return isValidPeriods(periods) ? periods : null;
  } catch {
    return null;
  }
}

async function shareSchedule() {
  const encoded = encodeURIComponent(JSON.stringify(readPeriods()));
  const shareUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#${SHARE_PARAM}=${encoded}`;
  window.history.replaceState(null, "", shareUrl);
  try {
    await navigator.clipboard.writeText(window.location.href);
    status.textContent = "Share link copied.";
  } catch {
    status.textContent = "Share link ready in the address bar.";
  }
  status.classList.remove("error");
}

function saveTemplate() {
  const defaultName = `Schedule ${loadTemplates().length + 1}`;
  const enteredName = window.prompt("Name this schedule template:", defaultName);
  const name = enteredName && enteredName.trim().slice(0, 60);
  if (!name) return;
  const templates = loadTemplates().filter((template) => template.name !== name);
  templates.unshift({ name, periods: readPeriods() });
  if (!saveTemplates(templates)) {
    status.textContent = "Template could not be saved in this browser.";
    status.classList.add("error");
    return;
  }
  renderTemplateOptions(name);
  status.textContent = `Template “${name}” saved.`;
  status.classList.remove("error");
}

function loadSelectedTemplate() {
  const name = templateSelect.value;
  const template = loadTemplates().find((item) => item.name === name);
  deleteTemplateButton.disabled = !template;
  if (!template) return;
  applyPeriods(template.periods);
  saveDraft();
  status.textContent = `Template “${name}” loaded.`;
  status.classList.remove("error");
}

function deleteSelectedTemplate() {
  const name = templateSelect.value;
  if (!name || !window.confirm(`Delete the “${name}” template?`)) return;
  const templates = loadTemplates().filter((template) => template.name !== name);
  if (!saveTemplates(templates)) {
    status.textContent = "Template could not be deleted in this browser.";
    status.classList.add("error");
    return;
  }
  renderTemplateOptions();
  status.textContent = `Template “${name}” deleted.`;
  status.classList.remove("error");
}

sampleButton.addEventListener("click", () => {
  applyPeriods(EXAMPLE.map(([building, room], index) => ({
    building,
    room,
    color: PERIOD_COLORS[index],
  })));
  saveDraft();
  status.textContent = "Example loaded. Select Generate Map to preview it.";
  status.classList.remove("error");
});

clearButton.addEventListener("click", () => {
  resetPeriods();
  resetPreview();
  const cleared = clearDraft();
  showDraftStatus(cleared ? "Saved draft cleared." : "Saved draft could not be cleared.", !cleared);
  status.textContent = "Schedule cleared. Add rooms and generate a new map.";
  status.classList.remove("error");
});

shareButton.addEventListener("click", shareSchedule);
templateSelect.addEventListener("change", loadSelectedTemplate);
saveTemplateButton.addEventListener("click", saveTemplate);
deleteTemplateButton.addEventListener("click", deleteSelectedTemplate);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  renderButton.disabled = true;
  status.textContent = "Generating map…";
  status.classList.remove("error");
  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periods: readPeriods() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Map generation failed.");
    mapImage.src = result.image_url;
    mapImage.alt = "Gunn campus map with the selected period rooms highlighted";
    downloadLink.href = result.image_url;
    downloadLink.classList.remove("is-disabled");
    downloadLink.setAttribute("aria-disabled", "false");
    warning.textContent = duplicateWarningText() || result.warnings.join(" ");
    showLegend(result.selected);
    status.textContent = "Map ready.";
    if (window.matchMedia("(max-width: 1100px)").matches) {
      document.querySelector(".preview").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    renderButton.disabled = false;
  }
});

mapImage.addEventListener("click", () => window.open(mapImage.src, "_blank", "noopener"));
mapImage.style.cursor = "zoom-in";

async function init() {
  try {
    const response = await fetch("/api/rooms");
    if (!response.ok) throw new Error("Could not load the room list.");
    const data = await response.json();
    rooms = data.rooms;
    buildings = data.buildings;
    for (let number = 1; number <= 7; number += 1) list.append(createPeriod(number));
    renderTemplateOptions();
    const sharedSchedule = loadSharedSchedule();
    const draft = loadDraft();
    if (sharedSchedule) {
      applyPeriods(sharedSchedule);
      saveDraft();
      showDraftStatus("Schedule loaded from the share link.");
      status.textContent = "Shared schedule loaded. Select Generate Map to preview it.";
    } else if (draft) {
      applyPeriods(draft);
      showDraftStatus("Draft restored from this device.");
    } else {
      showDraftStatus("Your schedule is saved locally as you edit it.");
    }
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
    for (const control of [renderButton, sampleButton, clearButton, shareButton, templateSelect, saveTemplateButton, deleteTemplateButton]) {
      control.disabled = true;
    }
  }
}

init();
