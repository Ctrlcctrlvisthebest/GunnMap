const PERIOD_COLORS = ["#e11d48", "#7c3aed", "#0284c7", "#059669", "#f97316", "#d4a017", "#dc2626"];
const DRAFT_STORAGE_KEY = "gunnmap.schedule-draft.v1";
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

function isValidDraft(value) {
  return Boolean(
    value &&
      value.version === 1 &&
      Array.isArray(value.periods) &&
      value.periods.length === 7 &&
      value.periods.every((period) => (
        period &&
        typeof period.building === "string" &&
        typeof period.room === "string" &&
        typeof period.color === "string" &&
        HEX_COLOR.test(period.color)
      )),
  );
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
  });
  card.querySelector('input[type="text"]').addEventListener("input", saveDraft);
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
}

function resetPeriods() {
  applyPeriods(PERIOD_COLORS.map((color) => ({ building: "", room: "", color })));
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
    warning.textContent = result.warnings.join(" ");
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
    const draft = loadDraft();
    if (draft) {
      applyPeriods(draft);
      showDraftStatus("Draft restored from this device.");
    } else {
      showDraftStatus("Your schedule is saved locally as you edit it.");
    }
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
    renderButton.disabled = true;
    sampleButton.disabled = true;
    clearButton.disabled = true;
  }
}

init();
