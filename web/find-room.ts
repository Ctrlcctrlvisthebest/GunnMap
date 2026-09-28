import "./site-shell.js";
import Panzoom from "@panzoom/panzoom";
import { mountRoomSuggestions, type RoomSuggestion } from "./room-suggestions.js";

interface EvacuationInfo {
  status: "mapped" | "unconfirmed";
  group: string | null;
  color: string | null;
  destination: string;
  short_destination: string | null;
  reference_label: string | null;
  note: string;
}

interface LocatedRoom extends RoomSuggestion {
  polygon: [number, number][];
  marker: [number, number];
  evacuation: EvacuationInfo;
}

interface RoomLookupResponse {
  rooms: LocatedRoom[];
  map_size: [number, number];
  error?: string;
}

function query<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing page element: ${selector}`);
  return element;
}

const form = query<HTMLFormElement>("#find-room-form");
const input = query<HTMLInputElement>("#find-room-input");
const submit = query<HTMLButtonElement>("#find-room-submit");
const message = query<HTMLParagraphElement>("#find-room-message");
const choices = query<HTMLDivElement>("#find-room-choices");
const result = query<HTMLDivElement>("#find-room-result");
const roomTitle = query<HTMLHeadingElement>("#room-result-title");
const buildingLabel = query<HTMLSpanElement>("#room-result-building");
const floorLabel = query<HTMLSpanElement>("#room-result-floor");
const destination = query<HTMLParagraphElement>("#room-result-destination");
const note = query<HTMLParagraphElement>("#room-result-note");
const mapStage = query<HTMLDivElement>("#room-locator-stage");
const mapArt = query<HTMLDivElement>("#room-locator-art");
const mapImage = query<HTMLImageElement>("#room-locator-image");
const mapHighlight = query<HTMLSpanElement>("#room-locator-highlight");
const mapLabel = query<HTMLSpanElement>("#room-locator-label");
const toastRegion = query<HTMLDivElement>("#toast-region");

let roomOptions: RoomSuggestion[] = [];
let mapSize: [number, number] = [2448, 1584];
let requestRevision = 0;
let mapPanzoom: ReturnType<typeof Panzoom> | null = null;
let mapWheelListener: ((event: WheelEvent) => void) | null = null;
let mapResizeObserver: ResizeObserver | null = null;
let toastTimer = 0;

function buildingName(code: string) {
  if (code === "BG") return "Bow Gym";
  if (code === "D") return "D Building / Library";
  return `${code} Building`;
}

function showToast(text: string) {
  toastRegion.textContent = text;
  toastRegion.classList.add("is-visible");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastRegion.classList.remove("is-visible");
    toastRegion.textContent = "";
    toastTimer = 0;
  }, 3200);
}

function setMessage(text: string) {
  message.textContent = text;
  message.classList.remove("is-error");
}

function clearResult() {
  requestRevision += 1;
  result.hidden = true;
  choices.hidden = true;
  choices.replaceChildren();
  mapHighlight.hidden = true;
  mapLabel.hidden = true;
  setMessage("");
}

function renderRoom(room: LocatedRoom) {
  result.hidden = false;
  choices.hidden = true;
  choices.replaceChildren();
  buildingLabel.textContent = buildingName(room.building);
  roomTitle.textContent = room.label;
  floorLabel.textContent = room.floor === 2 ? "2nd floor" : "1st floor";
  if (room.evacuation.status === "mapped") {
    const reference = room.evacuation.reference_label && !/^[A-Z]$/i.test(room.evacuation.reference_label)
      ? `${room.evacuation.reference_label} · `
      : "";
    destination.textContent = `${room.label} → ${reference}${room.evacuation.short_destination ?? room.evacuation.destination} (${room.evacuation.group})`;
  } else {
    destination.textContent = `${room.label} → ${room.evacuation.destination}`;
  }
  note.textContent = room.evacuation.note;

  mapImage.alt = `Gunn campus map with ${room.label} highlighted`;
  mapHighlight.hidden = false;
  mapHighlight.style.clipPath = `polygon(${room.polygon.map(([x, y]) =>
    `${x / mapSize[0] * 100}% ${y / mapSize[1] * 100}%`).join(", ")})`;
  mapHighlight.style.setProperty("--room-route-color", room.evacuation.color ?? "#f38470");
  mapLabel.hidden = false;
  mapLabel.textContent = room.label;
  mapLabel.style.left = `${room.marker[0] / mapSize[0] * 100}%`;
  mapLabel.style.top = `${room.marker[1] / mapSize[1] * 100}%`;
  mapLabel.style.setProperty("--room-route-color", room.evacuation.color ?? "#f38470");
  setMessage("");
  requestAnimationFrame(initializeMapPanzoom);
}

function clearMapPanzoom() {
  mapResizeObserver?.disconnect();
  mapResizeObserver = null;
  if (mapPanzoom) {
    mapPanzoom.reset({ animate: false });
    mapPanzoom.destroy();
    mapPanzoom = null;
  }
  if (mapWheelListener) {
    mapStage.removeEventListener("wheel", mapWheelListener);
    mapWheelListener = null;
  }
}

function centerLocatedRoom() {
  if (!mapPanzoom) return;
  const panzoom = mapPanzoom;
  const focusScale = 2;
  panzoom.zoom(focusScale, { animate: false });
  window.requestAnimationFrame(() => {
    if (mapPanzoom !== panzoom) return;
    const markerX = Number.parseFloat(mapLabel.style.left) / 100 * mapArt.clientWidth;
    const markerY = Number.parseFloat(mapLabel.style.top) / 100 * mapArt.clientHeight;
    panzoom.pan(
      mapArt.clientWidth / 2 - markerX,
      mapArt.clientHeight / 2 - markerY,
      { animate: false, relative: false },
    );
  });
}

function initializeMapPanzoom() {
  clearMapPanzoom();
  if (!mapStage.clientWidth || !mapStage.clientHeight) return;

  mapPanzoom = Panzoom(mapArt, {
    canvas: true,
    minScale: 1,
    maxScale: 7,
    startScale: 1,
    panOnlyWhenZoomed: true,
    pinchAndPan: true,
    contain: "outside",
    touchAction: "none",
    cursor: "grab",
  });
  mapWheelListener = mapPanzoom.zoomWithWheel;
  mapStage.addEventListener("wheel", mapWheelListener, { passive: false });
  window.setTimeout(centerLocatedRoom, 0);
  mapResizeObserver = new ResizeObserver(() => {
    window.requestAnimationFrame(centerLocatedRoom);
  });
  mapResizeObserver.observe(mapStage);
}

function createChoice(room: LocatedRoom) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "room-lookup-choice";
  const label = document.createElement("span");
  label.textContent = room.label;
  const location = document.createElement("small");
  location.textContent = `${buildingName(room.building)}${room.floor === 2 ? " · 2nd floor" : ""}`;
  button.append(label, location);
  button.addEventListener("click", () => renderRoom(room));
  return button;
}

async function lookupRoom(value: string, building = "") {
  const queryText = value.trim();
  clearResult();
  if (!queryText) {
    showToast("Enter a room number or alias to search.");
    input.focus();
    return;
  }

  const revision = ++requestRevision;
  submit.disabled = true;
  setMessage("Searching…");
  try {
    const response = await fetch(`/api/room-lookup?q=${encodeURIComponent(queryText)}`);
    const data = await response.json() as RoomLookupResponse;
    if (revision !== requestRevision) return;
    if (!response.ok) throw new Error(data.error ?? "Room search failed.");
    mapSize = data.map_size;
    const matches = building
      ? data.rooms.filter((room) => room.building === building)
      : data.rooms;
    if (!matches.length) {
      setMessage("");
      showToast("No matching room. Check the number or choose a listed suggestion.");
      return;
    }
    if (matches.length > 1) {
      setMessage("More than one room matches. Choose the right location.");
      choices.replaceChildren(...matches.map(createChoice));
      choices.hidden = false;
      return;
    }
    renderRoom(matches[0]);
  } catch (error) {
    if (revision !== requestRevision) return;
    setMessage("");
    showToast(error instanceof Error ? error.message : "Room search failed.");
  } finally {
    submit.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void lookupRoom(input.value);
});
async function initialize() {
  try {
    const response = await fetch("/api/rooms");
    if (!response.ok) throw new Error("The room list is unavailable.");
    const data = await response.json() as { rooms: RoomSuggestion[] };
    roomOptions = data.rooms;
    mountRoomSuggestions(input, roomOptions, {
      onInput: clearResult,
    });
  } catch {
    showToast("The room list could not be loaded. Try reloading the page.");
    input.disabled = true;
    submit.disabled = true;
  }
}

void initialize();
