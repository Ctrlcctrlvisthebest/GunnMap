const PERIOD_COLORS = ["#e11d48", "#7c3aed", "#0284c7", "#059669", "#f97316", "#d4a017", "#dc2626"];
const DRAFT_COOKIE_NAME = "gunnmap_schedule_draft";
const TEMPLATES_COOKIE_NAME = "gunnmap_schedule_templates";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
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
const templateDialog = document.querySelector("#template-dialog");
const templateName = document.querySelector("#template-name");
const templateMessage = document.querySelector("#template-message");
const deleteTemplateDialog = document.querySelector("#delete-template-dialog");
const mapImage = document.querySelector("#map-image");
const downloadLink = document.querySelector("#download-link");
const legend = document.querySelector("#legend");
const warning = document.querySelector("#warning");
const draftStatus = document.querySelector("#draft-status");
const roomMarkers = document.querySelector("#room-markers");
const roomHitAreas = document.querySelector("#room-hit-areas");
const evacuationDialog = document.querySelector("#room-evacuation");
const SVG_NS = "http://www.w3.org/2000/svg";
const interactiveMap = document.querySelector(".interactive-map");
const roomLeaders = document.createElementNS(SVG_NS, "svg");
roomLeaders.classList.add("room-leaders");
roomLeaders.setAttribute("aria-hidden", "true");
interactiveMap.insertBefore(roomLeaders, roomMarkers);

let rooms = [];
let buildings = [];
let selectedRooms = new Map();
let markerMapSize = [1, 1];
let markerLayoutFrame = 0;
let scheduleRevision = 0;
let activeRender = null;
let pendingDownload = false;
let roomsLoaded = false;
let pendingTemplateDeletion = "";

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

function getCookie(name) {
  const encodedName = encodeURIComponent(name);
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${encodedName}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(encodedName.length + 1));
  } catch {
    return null;
  }
}

function setCookie(name, value) {
  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  document.cookie = `${encodedName}=${encodedValue}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  return getCookie(name) === value;
}

function removeCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; SameSite=Lax`;
}

function saveDraft() {
  try {
    if (!setCookie(DRAFT_COOKIE_NAME, JSON.stringify({ version: 1, periods: readPeriods() }))) throw new Error("Cookie was not saved");
    showDraftStatus("Draft saved on this device.");
  } catch {
    showDraftStatus("Draft could not be saved in this browser.", true);
  }
}

function loadDraft() {
  try {
    const saved = getCookie(DRAFT_COOKIE_NAME);
    if (!saved) return null;
    const draft = JSON.parse(saved);
    if (!isValidDraft(draft)) {
      removeCookie(DRAFT_COOKIE_NAME);
      return null;
    }
    return draft.periods;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    removeCookie(DRAFT_COOKIE_NAME);
    return getCookie(DRAFT_COOKIE_NAME) === null;
  } catch {
    return false;
  }
}

function loadTemplates() {
  try {
    const saved = getCookie(TEMPLATES_COOKIE_NAME);
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
    return setCookie(TEMPLATES_COOKIE_NAME, JSON.stringify(templates.slice(0, 8)));
  } catch {
    return false;
  }
}

function renderTemplateOptions(selectedName = templateSelect.value) {
  templateSelect.replaceChildren(new Option("Choose a saved template", ""));
  for (const template of loadTemplates()) {
    templateSelect.append(new Option(template.name, template.name));
  }
  templateSelect.value = loadTemplates().some(template => template.name === selectedName) ? selectedName : "";
  deleteTemplateButton.disabled = !templateSelect.value;
}
function invalidatePreview(message = "Schedule changed. Generate Map to update room locations and evacuation details.") {
  scheduleRevision += 1;
  if (evacuationDialog.open) evacuationDialog.close();
  selectedRooms.clear();
  roomMarkers.replaceChildren();
  roomHitAreas.replaceChildren();
  roomLeaders.replaceChildren();
  legend.replaceChildren();
  updateDuplicateWarnings();
  document.querySelector("#room-click-help").hidden = true;
  if (mapImage.getAttribute("src") !== "/map.png") mapImage.src = "/map.png";
  mapImage.alt = "Original Gunn campus map; generate an updated map for this schedule";
  downloadLink.href = "#";
  downloadLink.classList.add("is-disabled");
  downloadLink.setAttribute("aria-disabled", "true");
  status.textContent = message;
  status.classList.remove("error");
}

// Edited inputs must never retain clickable evacuation data from an old room.
function removeSharedSchedule() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (!hash.has(SHARE_PARAM)) return;
  hash.delete(SHARE_PARAM);
  const fragment = hash.toString();
  window.history.replaceState(null, "", window.location.pathname + window.location.search + (fragment ? `#${fragment}` : ""));
}

function scheduleEdited() {
  invalidatePreview();
  removeSharedSchedule();
  saveDraft();
}

form.addEventListener("input", scheduleEdited);
form.addEventListener("change", scheduleEdited);

function layoutRoomMarkers() {
  const width = interactiveMap.clientWidth;
  const height = interactiveMap.clientHeight;
  roomLeaders.replaceChildren();
  if (!width || !height || !selectedRooms.size) return;
  roomLeaders.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const entries = [...roomMarkers.children].map((marker) => {
    const room = selectedRooms.get(marker.dataset.roomId);
    return {
      marker, room,
      anchorX: room.marker[0] / markerMapSize[0] * width,
      anchorY: room.marker[1] / markerMapSize[1] * height,
      halfWidth: marker.offsetWidth / 2,
      halfHeight: marker.offsetHeight / 2,
    };
  });
  const centerX = entries.reduce((total, item) => total + item.anchorX, 0) / entries.length;
  const centerY = entries.reduce((total, item) => total + item.anchorY, 0) / entries.length;
  const placed = [];
  const gap = 6;
  const edge = 4;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));

  for (const [index, entry] of entries.entries()) {
    const clampPoint = (x, y) => ({
      x: clamp(x, entry.halfWidth + edge, width - entry.halfWidth - edge),
      y: clamp(y, entry.halfHeight + edge, height - entry.halfHeight - edge),
    });
    const fits = (point, protectAnchors) => {
      if (placed.some((other) =>
        Math.abs(point.x - other.x) < entry.halfWidth + other.halfWidth + gap &&
        Math.abs(point.y - other.y) < entry.halfHeight + other.halfHeight + gap)) return false;
      return !protectAnchors || !entries.some((other) => other !== entry &&
        Math.abs(point.x - other.anchorX) < entry.halfWidth + gap &&
        Math.abs(point.y - other.anchorY) < entry.halfHeight + gap);
    };
    // Search outwards from each room in rendered pixels so nearby classrooms
    // remain separately clickable even when the map shrinks on a phone.
    const outwardAngle = entry.anchorX === centerX && entry.anchorY === centerY
      ? index * Math.PI * 2 / entries.length
      : Math.atan2(entry.anchorY - centerY, entry.anchorX - centerX);
    let position;
    for (const protectAnchors of [true, false]) {
      const anchor = clampPoint(entry.anchorX, entry.anchorY);
      if (fits(anchor, protectAnchors)) position = anchor;
      for (let radius = 12; !position && radius <= Math.hypot(width, height) + 12; radius += 12) {
        const steps = Math.max(12, Math.ceil(2 * Math.PI * radius / 12));
        for (let step = 0; step < steps; step += 1) {
          const angle = outwardAngle + step * Math.PI * 2 / steps;
          const candidate = clampPoint(entry.anchorX + Math.cos(angle) * radius,
            entry.anchorY + Math.sin(angle) * radius);
          if (fits(candidate, protectAnchors)) {
            position = candidate;
            break;
          }
        }
      }
      if (position) break;
    }
    position ||= clampPoint(entry.anchorX, entry.anchorY);
    entry.marker.style.left = `${position.x}px`;
    entry.marker.style.top = `${position.y}px`;
    placed.push({...entry, ...position});
    if (Math.hypot(position.x - entry.anchorX, position.y - entry.anchorY) > 1) {
      const line = document.createElementNS(SVG_NS, "line");
      for (const [name, value] of Object.entries({
        x1: entry.anchorX, y1: entry.anchorY, x2: position.x, y2: position.y,
        stroke: entry.room.color,
      })) line.setAttribute(name, String(value));
      const endpoint = document.createElementNS(SVG_NS, "circle");
      endpoint.setAttribute("cx", String(entry.anchorX));
      endpoint.setAttribute("cy", String(entry.anchorY));
      endpoint.setAttribute("r", "3");
      endpoint.setAttribute("fill", entry.room.color);
      roomLeaders.append(line, endpoint);
    }
  }
}

function scheduleMarkerLayout() {
  if (markerLayoutFrame) return;
  markerLayoutFrame = requestAnimationFrame(() => {
    markerLayoutFrame = 0;
    layoutRoomMarkers();
  });
}

new ResizeObserver(scheduleMarkerLayout).observe(interactiveMap);
mapImage.addEventListener("load", scheduleMarkerLayout);

function openEvacuation(room) {
  const info = room.evacuation;
  document.querySelector("#room-dialog-title").textContent = `${room.label}${room.floor === 2 ? " · 2nd floor" : ""}`;
  document.querySelector("#room-dialog-periods").textContent = `Period${room.periods.length > 1 ? "s" : ""} ${room.periods.join(", ")}`;
  const badge = document.querySelector("#assembly-group");
  badge.textContent = info.status === "mapped" ? `${info.group} assembly group` : "Needs confirmation";
  badge.style.setProperty("--assembly-color", info.color || "#66758b");
  document.querySelector("#assembly-destination").textContent = info.destination;
  const reference = document.querySelector("#assembly-reference");
  reference.textContent = info.reference_label ? `Your group on the map: ${info.reference_label}` : "";
  document.querySelector("#assembly-note").textContent = info.note;
  const location = document.querySelector("#assembly-location");
  location.hidden = !info.focus;
  if (info.focus) {
    const sourceWidth = 1852;
    const sourceHeight = 1156;
    const x = info.focus.x * sourceWidth;
    const y = info.focus.y * sourceHeight;
    const width = info.focus.width * sourceWidth;
    const height = info.focus.height * sourceHeight;
    const focus = document.querySelector("#assembly-focus");
    for (const [name, value] of Object.entries({x, y, width, height, stroke: info.color})) {
      focus.setAttribute(name, String(value));
    }
    // Include nearby landmarks; the box identifies the printed group label.
    const cropWidth = Math.min(sourceWidth, Math.max(650, width + 300));
    const cropHeight = Math.min(sourceHeight, Math.max(430, height + 250));
    const cropX = Math.max(0, Math.min(x + width / 2 - cropWidth / 2, sourceWidth - cropWidth));
    const cropY = Math.max(0, Math.min(y + height / 2 - cropHeight / 2, sourceHeight - cropHeight));
    document.querySelector("#assembly-map").setAttribute("viewBox", `${cropX} ${cropY} ${cropWidth} ${cropHeight}`);
    document.querySelector("#assembly-map-title").textContent = `${room.label}: ${info.reference_label} group on the evacuation reference`;
  }
  evacuationDialog.showModal();
}

function showRoomTargets(selected, mapSize) {
  roomMarkers.replaceChildren();
  roomHitAreas.replaceChildren();
  roomLeaders.replaceChildren();
  markerMapSize = mapSize;
  selectedRooms = new Map();
  for (const item of selected) {
    const group = selectedRooms.get(item.id);
    if (group) {
      group.periods.push(item.period);
      group.colors.push(item.color);
    } else {
      selectedRooms.set(item.id, {...item, periods: [item.period], colors: [item.color]});
    }
  }
  const [width, height] = mapSize;
  roomHitAreas.setAttribute("viewBox", `0 0 ${width} ${height}`);
  for (const room of selectedRooms.values()) {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.setAttribute("points", room.polygon.map(point => point.join(",")).join(" "));
    polygon.addEventListener("click", () => openEvacuation(room));
    roomHitAreas.append(polygon);

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "room-marker";
    marker.dataset.roomId = room.id;
    marker.style.left = `${room.marker[0] / width * 100}%`;
    marker.style.top = `${room.marker[1] / height * 100}%`;
    marker.style.setProperty("--period-color", room.color);
    const colorStops = room.colors.map((color, index) =>
      `${color} ${index / room.colors.length * 100}% ${(index + 1) / room.colors.length * 100}%`);
    marker.style.setProperty("--period-colors", `conic-gradient(from -90deg, ${colorStops.join(", ")})`);
    const markerLabel = document.createElement("span");
    markerLabel.textContent = room.periods.join("/");
    marker.append(markerLabel);
    marker.setAttribute("aria-label", `${room.label}, period${room.periods.length > 1 ? "s" : ""} ${room.periods.join(", ")}: fire evacuation details`);
    marker.setAttribute("aria-haspopup", "dialog");
    marker.title = `${room.label} · Fire evacuation details`;
    marker.addEventListener("click", () => openEvacuation(room));
    roomMarkers.append(marker);
  }
  document.querySelector("#room-click-help").hidden = selected.length === 0;
  layoutRoomMarkers();
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
  select.addEventListener("change", () => updateSuggestions(card));
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
  const roomName = period.room.trim().toUpperCase();
  if (!building || !roomName) return null;
  return rooms.find((room) => (
    room.building === building &&
    (room.id.toUpperCase() === roomName || room.label.toUpperCase() === roomName || `${room.label} (${room.id})`.toUpperCase() === roomName)
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
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "legend-item";
    chip.setAttribute("aria-haspopup", "dialog");
    chip.setAttribute("aria-label", `Period ${item.period}, ${item.label}: fire evacuation details`);
    chip.addEventListener("click", () => openEvacuation(selectedRooms.get(item.id)));
    const color = document.createElement("span");
    color.className = "legend-color";
    color.style.backgroundColor = item.color;
    const label = document.createElement("span");
    label.textContent = `P${item.period} · ${item.label}${item.floor === 2 ? " (2F)" : ""}`;
    chip.append(color, label);
    legend.append(chip);
  }
}

function applyPeriods(periods, { clearShare = true } = {}) {
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
  if (clearShare) removeSharedSchedule();
  invalidatePreview();
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

function openTemplateDialog() {
  templateName.value = `Schedule ${loadTemplates().length + 1}`;
  templateMessage.textContent = "";
  templateDialog.showModal();
  templateName.select();
}

function saveTemplate(event) {
  event.preventDefault();
  const name = templateName.value.trim().slice(0, 60);
  if (!name) {
    templateMessage.textContent = "Enter a name for this schedule.";
    templateName.focus();
    return;
  }
  const templates = loadTemplates().filter((template) => template.name !== name);
  templates.unshift({ name, periods: readPeriods() });
  if (!saveTemplates(templates)) {
    templateMessage.textContent = "Template could not be saved in this browser. Browser storage may be disabled or full.";
    return;
  }
  renderTemplateOptions(name);
  templateDialog.close();
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

function confirmTemplateDeletion() {
  const name = templateSelect.value;
  if (!name) return;
  pendingTemplateDeletion = name;
  document.querySelector("#delete-template-description").textContent = `Delete the “${name}” template? Your current schedule will stay in the editor.`;
  document.querySelector("#delete-template-message").textContent = "";
  deleteTemplateDialog.showModal();
}

function deleteSelectedTemplate(event) {
  event.preventDefault();
  const name = pendingTemplateDeletion;
  if (!name) return;
  const templates = loadTemplates().filter((template) => template.name !== name);
  if (!saveTemplates(templates)) {
    document.querySelector("#delete-template-message").textContent = "Template could not be deleted in this browser.";
    return;
  }
  renderTemplateOptions();
  deleteTemplateDialog.close();
  pendingTemplateDeletion = "";
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
  invalidatePreview("Schedule cleared. Add rooms and generate a new map.");
  const cleared = clearDraft();
  showDraftStatus(cleared ? "Saved draft cleared." : "Saved draft could not be cleared.", !cleared);
  status.textContent = "Schedule cleared. Add rooms and generate a new map.";
  status.classList.remove("error");
});

shareButton.addEventListener("click", shareSchedule);
templateSelect.addEventListener("change", loadSelectedTemplate);
saveTemplateButton.addEventListener("click", openTemplateDialog);
deleteTemplateButton.addEventListener("click", confirmTemplateDeletion);
document.querySelector("#template-form").addEventListener("submit", saveTemplate);
document.querySelector("#cancel-template-button").addEventListener("click", () => templateDialog.close());
document.querySelector("#delete-template-form").addEventListener("submit", deleteSelectedTemplate);
document.querySelector("#cancel-delete-template-button").addEventListener("click", () => deleteTemplateDialog.close());
deleteTemplateDialog.addEventListener("close", () => { pendingTemplateDeletion = ""; });

async function renderMap(requestRevision, requestedPeriods) {
  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periods: requestedPeriods }),
    });
    const result = await response.json();
    if (requestRevision !== scheduleRevision) return false;
    if (!response.ok) throw new Error(result.error || "Map generation failed.");
    const nextImage = new Image();
    nextImage.src = result.image_url;
    await nextImage.decode();
    if (requestRevision !== scheduleRevision) return false;
    mapImage.src = result.image_url;
    mapImage.alt = "Gunn campus map with the selected period rooms highlighted";
    downloadLink.href = result.image_url;
    downloadLink.classList.remove("is-disabled");
    downloadLink.setAttribute("aria-disabled", "false");
    warning.textContent = result.warnings.join(" ") || duplicateWarningText(requestedPeriods);
    showRoomTargets(result.selected, result.map_size);
    showLegend(result.selected);
    status.textContent = result.selected.length ? "Map ready. Click a room for fire evacuation details." : "Map ready.";
    if (window.matchMedia("(max-width: 1100px)").matches) {
      document.querySelector(".preview").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return true;
  } catch (error) {
    if (requestRevision === scheduleRevision) {
      status.textContent = error.message;
      status.classList.add("error");
    }
    return false;
  }
}

function generateMap() {
  if (!roomsLoaded) return Promise.resolve(false);
  if (activeRender?.revision === scheduleRevision) return activeRender.promise;
  invalidatePreview("Generating map…");
  renderButton.disabled = true;
  const request = { revision: scheduleRevision };
  activeRender = request;
  request.promise = renderMap(request.revision, readPeriods()).finally(() => {
    if (activeRender === request) {
      activeRender = null;
      renderButton.disabled = false;
    }
  });
  return request.promise;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  return generateMap();
});

downloadLink.addEventListener("click", async (event) => {
  if (!downloadLink.classList.contains("is-disabled")) return;
  event.preventDefault();
  if (pendingDownload) return;
  pendingDownload = true;
  try {
    if (await generateMap()) downloadLink.click();
  } finally {
    pendingDownload = false;
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
    roomsLoaded = true;
    renderTemplateOptions();
    const sharedSchedule = loadSharedSchedule();
    const draft = loadDraft();
    if (sharedSchedule) {
      applyPeriods(sharedSchedule, { clearShare: false });
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
