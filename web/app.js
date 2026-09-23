const PERIOD_COLORS = ["#e11d48", "#7c3aed", "#0284c7", "#059669", "#f97316", "#d4a017", "#dc2626"];
const EXAMPLE = [
  ["F", "F4"], ["M", "M3"], ["J", "J3"], ["K", "K1"],
  ["N", "N110"], ["N", "N211"], ["", ""],
];

const form = document.querySelector("#period-form");
const list = document.querySelector("#period-list");
const status = document.querySelector("#status");
const renderButton = document.querySelector("#render-button");
const sampleButton = document.querySelector("#sample-button");
const mapImage = document.querySelector("#map-image");
const downloadLink = document.querySelector("#download-link");
const legend = document.querySelector("#legend");
const warning = document.querySelector("#warning");
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

function invalidatePreview(message = "Schedule changed. Generate Map to update room locations and evacuation details.") {
  scheduleRevision += 1;
  if (evacuationDialog.open) evacuationDialog.close();
  selectedRooms.clear();
  roomMarkers.replaceChildren();
  roomHitAreas.replaceChildren();
  roomLeaders.replaceChildren();
  legend.replaceChildren();
  warning.textContent = "";
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
form.addEventListener("input", () => invalidatePreview());
form.addEventListener("change", () => invalidatePreview());

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
    const periods = [...(selectedRooms.get(item.id)?.periods || []), item.period];
    selectedRooms.set(item.id, {...item, periods});
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
    marker.textContent = room.periods.join("/");
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

sampleButton.addEventListener("click", () => {
  [...list.children].forEach((card, index) => {
    card.querySelector("select").value = EXAMPLE[index][0];
    updateSuggestions(card);
    card.querySelector('input[type="text"]').value = EXAMPLE[index][1];
  });
  invalidatePreview("Example loaded. Select Generate Map to preview it.");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  invalidatePreview("Generating map…");
  const requestRevision = scheduleRevision;
  const requestedPeriods = readPeriods();
  renderButton.disabled = true;
  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periods: requestedPeriods }),
    });
    const result = await response.json();
    if (requestRevision !== scheduleRevision) return;
    if (!response.ok) throw new Error(result.error || "Map generation failed.");
    const nextImage = new Image();
    nextImage.src = result.image_url;
    await nextImage.decode();
    if (requestRevision !== scheduleRevision) return;
    mapImage.src = result.image_url;
    mapImage.alt = "Gunn campus map with the selected period rooms highlighted";
    downloadLink.href = result.image_url;
    downloadLink.classList.remove("is-disabled");
    downloadLink.setAttribute("aria-disabled", "false");
    warning.textContent = result.warnings.join(" ");
    showRoomTargets(result.selected, result.map_size);
    showLegend(result.selected);
    status.textContent = result.selected.length ? "Map ready. Click a room for fire evacuation details." : "Map ready.";
    if (window.matchMedia("(max-width: 1100px)").matches) {
      document.querySelector(".preview").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    if (requestRevision === scheduleRevision) {
      status.textContent = error.message;
      status.classList.add("error");
    }
  } finally {
    renderButton.disabled = false;
  }
});

async function init() {
  try {
    const response = await fetch("/api/rooms");
    if (!response.ok) throw new Error("Could not load the room list.");
    const data = await response.json();
    rooms = data.rooms;
    buildings = data.buildings;
    for (let number = 1; number <= 7; number += 1) list.append(createPeriod(number));
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
    renderButton.disabled = true;
    sampleButton.disabled = true;
  }
}

init();
