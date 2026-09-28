import "./site-shell.js";
import "./ui-components.js";
import Panzoom from "@panzoom/panzoom";
import { setBoundedImageTransform } from "./map-pan-bounds.js";

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing evacuation page element: ${selector}`);
  return element;
}

const mapOpenButton = requiredElement<HTMLButtonElement>("#evacuation-map-open");
const infoOpenButton = requiredElement<HTMLButtonElement>("#map-info-open");
const infoDialog = requiredElement<HTMLDialogElement>("#map-info-dialog");
const mapDialog = requiredElement<HTMLDialogElement>("#evacuation-map-dialog");
const mapStage = requiredElement<HTMLDivElement>("#evacuation-map-stage");
const mapArt = requiredElement<HTMLDivElement>("#evacuation-viewer-art");
const mapImage = requiredElement<HTMLImageElement>("#evacuation-viewer-image");
const scheduleSection = requiredElement<HTMLElement>("#schedule-evacuation");
const scheduleList = requiredElement<HTMLDivElement>("#schedule-evacuation-list");
const pageOverlays = requiredElement<HTMLSpanElement>("#evacuation-schedule-overlays");
const viewerOverlays = requiredElement<HTMLSpanElement>("#evacuation-viewer-overlays");
const routeGroups = requiredElement<HTMLDivElement>("#route-groups");
const sourceProvenance = requiredElement<HTMLParagraphElement>("#source-provenance");
const validationStatus = requiredElement<HTMLParagraphElement>("#evacuation-validation-status");
const inventoryNotes = requiredElement<HTMLParagraphElement>("#evacuation-inventory-notes");

interface EvacuationGroupInfo {
  title: string;
  color: string;
  destination: string;
  short_destination: string;
  labels: string[];
  description?: string;
}

interface EvacuationOverview {
  provenance: {
    sourceFile: string;
    sourceImageSha256: string;
    sourceRevisionDate: string | null;
    verifiedOn: string | null;
    imageSize: [number, number];
  };
  groups: Record<string, EvacuationGroupInfo>;
  inventoryExceptions: Record<string, string>;
  validationIssues: string[];
}

interface RoomEvacuationInfo {
  status: "mapped" | "unconfirmed";
  group: string | null;
  color: string | null;
  destination: string;
  reference_label: string | null;
  short_destination: string | null;
  note: string;
  focus: { x: number; y: number; width: number; height: number } | null;
}

interface SchedulePeriod {
  building: string;
  room: string;
  color: string;
}

interface ScheduleRoom {
  id: string;
  label: string;
  building: string;
  floor: number;
  marker: [number, number];
  evacuation: RoomEvacuationInfo;
}

interface ScheduleLookupResponse {
  rooms: ScheduleRoom[];
  map_size: [number, number];
}

interface ScheduleEvacuationEntry {
  period: number;
  id: string;
  room: string;
  building: string;
  color: string;
  marker: [number, number] | null;
  evacuation: RoomEvacuationInfo | null;
}

interface ScheduleMarkerGroup {
  id: string;
  marker: [number, number];
  entries: ScheduleEvacuationEntry[];
}

let panzoom: ReturnType<typeof Panzoom> | null = null;
let wheelListener: ((event: WheelEvent) => void) | null = null;
let stageResizeObserver: ResizeObserver | null = null;
let campusMapSize: [number, number] = [2448, 1584];

const CURRENT_SCHEDULE_KEY = "gunnmap_current_schedule";

function createRouteGroup(title: string, info: EvacuationGroupInfo) {
  const article = document.createElement("article");
  article.className = "panel route-group";
  article.style.setProperty("--route-color", info.color);

  const heading = document.createElement("h3");
  const swatch = document.createElement("span");
  swatch.className = "route-swatch";
  swatch.setAttribute("aria-hidden", "true");
  heading.append(swatch, document.createTextNode(title));

  const list = document.createElement("ul");
  for (const label of info.labels) {
    const item = document.createElement("li");
    item.textContent = label;
    list.append(item);
  }
  article.append(heading, list);

  if (info.description) {
    const description = document.createElement("p");
    description.textContent = info.description;
    article.append(description);
  }
  return article;
}

function readCurrentSchedule(): SchedulePeriod[] {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(CURRENT_SCHEDULE_KEY);
  } catch {
    saved = null;
  }
  if (!saved) {
    const cookie = document.cookie.split("; ").find((item) => item.startsWith("gunnmap_schedule_draft="));
    if (cookie) {
      try {
        saved = decodeURIComponent(cookie.slice("gunnmap_schedule_draft=".length));
      } catch {
        saved = null;
      }
    }
  }
  if (!saved) return [];
  try {
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== "object" || !("periods" in value)) return [];
    const periods = (value as { periods?: unknown }).periods;
    if (!Array.isArray(periods) || periods.length !== 7) return [];
    const isSchedulePeriod = (period: unknown): period is SchedulePeriod =>
      Boolean(period && typeof period === "object" &&
        "building" in period && typeof period.building === "string" &&
        "room" in period && typeof period.room === "string" &&
        "color" in period && typeof period.color === "string" && /^#[\da-f]{6}$/i.test(period.color));
    return periods.every(isSchedulePeriod) ? periods : [];
  } catch {
    return [];
  }
}

function createScheduleEntry(entry: ScheduleEvacuationEntry) {
  const item = document.createElement("article");
  item.className = "schedule-evacuation-item";
  item.id = `schedule-period-${entry.period}`;
  item.tabIndex = -1;
  item.style.setProperty("--period-color", entry.color);

  const period = document.createElement("span");
  period.className = "schedule-evacuation-period";
  period.textContent = `P${entry.period}`;

  const route = document.createElement("strong");
  route.className = "schedule-evacuation-route";
  route.style.setProperty("--route-color", entry.evacuation?.color ?? "#92929d");
  if (!entry.evacuation || entry.evacuation.status !== "mapped") {
    route.textContent = `${entry.room} → Assembly area not confirmed`;
  } else {
    const reference = entry.evacuation.reference_label && !/^[A-Z]$/i.test(entry.evacuation.reference_label)
      ? `${entry.evacuation.reference_label} · `
      : "";
    const destination = entry.evacuation.short_destination ?? entry.evacuation.destination;
    route.textContent = `${entry.room} → ${reference}${destination} (${entry.evacuation.group})`;
  }

  const building = document.createElement("small");
  building.textContent = entry.building ? `${entry.building} Building` : "Choose a building to confirm this room";
  item.append(period, route, building);
  return item;
}

function renderScheduleOverlays(entries: ScheduleEvacuationEntry[]) {
  const grouped = new Map<string, ScheduleMarkerGroup>();
  for (const entry of entries) {
    if (!entry.marker) continue;
    const key = entry.id || `${entry.marker[0]}:${entry.marker[1]}`;
    const existing = grouped.get(key);
    if (existing) existing.entries.push(entry);
    else grouped.set(key, { id: key, marker: entry.marker, entries: [entry] });
  }

  const createMarks = (prefix: string) => Array.from(grouped.values()).flatMap((group) =>
    group.entries.map((entry, index) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.id = `${prefix}-period-marker-${entry.period}`;
      marker.className = "evacuation-period-marker";
      marker.textContent = `P${entry.period}`;
      marker.setAttribute("aria-label", `Period ${entry.period}, room ${entry.room}`);
      marker.style.setProperty("--period-color", entry.color);
      const xOffset = (index - (group.entries.length - 1) / 2) * 22;
      marker.style.left = `calc(${group.marker[0] / campusMapSize[0] * 100}% + ${xOffset}px)`;
      marker.style.top = `${group.marker[1] / campusMapSize[1] * 100}%`;

      const tooltip = document.createElement("wa-tooltip");
      tooltip.setAttribute("for", marker.id);
      tooltip.className = "schedule-room-tooltip";
      const reference = entry.evacuation?.reference_label && !/^[A-Z]$/i.test(entry.evacuation.reference_label)
        ? `${entry.evacuation.reference_label} · `
        : "";
      const route = entry.evacuation?.status === "mapped"
        ? `${entry.evacuation.group} group · ${reference}${entry.evacuation.short_destination ?? entry.evacuation.destination}`
        : "Assembly area not confirmed";
      tooltip.textContent = `P${entry.period} · ${entry.room}\n${entry.building ? `${entry.building} Building\n` : ""}${route}`;

      marker.addEventListener("click", () => {
        if (prefix !== "page") return;
        const item = document.getElementById(`schedule-period-${entry.period}`);
        item?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        item?.focus({ preventScroll: true });
      });

      const markerGroup = document.createElement("span");
      markerGroup.className = "evacuation-period-marker-group";
      markerGroup.append(marker, tooltip);
      return markerGroup;
    }),
  );

  pageOverlays.replaceChildren(...createMarks("page"));
  viewerOverlays.replaceChildren(...createMarks("viewer"));
}

async function loadScheduleEvacuation() {
  const periods = readCurrentSchedule();
  const selected = periods
    .map((period, index) => ({ ...period, period: index + 1, room: period.room.trim() }))
    .filter((period) => period.room);
  if (!selected.length) return;

  const entries = await Promise.all(selected.map(async (period): Promise<ScheduleEvacuationEntry> => {
    try {
      const response = await fetch(`/api/room-lookup?q=${encodeURIComponent(period.room)}`);
      if (!response.ok) throw new Error("Room lookup failed");
      const result = await response.json() as ScheduleLookupResponse;
      const matches = period.building
        ? result.rooms.filter((room) => room.building === period.building)
        : result.rooms;
      if (matches.length !== 1) {
        return { period: period.period, id: "", room: period.room, building: period.building, color: period.color, marker: null, evacuation: null };
      }
      campusMapSize = result.map_size;
      return {
        period: period.period,
        id: matches[0].id,
        room: matches[0].label,
        building: matches[0].building,
        color: period.color,
        marker: matches[0].marker,
        evacuation: matches[0].evacuation,
      };
    } catch {
      return { period: period.period, id: "", room: period.room, building: period.building, color: period.color, marker: null, evacuation: null };
    }
  }));

  if (!entries.length) return;
  scheduleList.replaceChildren(...entries.map(createScheduleEntry));
  renderScheduleOverlays(entries);
  scheduleSection.hidden = false;
}

async function loadEvacuationOverview() {
  try {
    const response = await fetch("/api/evacuation-data");
    if (!response.ok) throw new Error("Evacuation data is unavailable.");
    const overview = await response.json() as EvacuationOverview;
    const groups = Object.entries(overview.groups)
      .map(([key, info]) => createRouteGroup(info.title || `${key} markings`, info));
    routeGroups.replaceChildren(...groups);

    const sourceName = overview.provenance.sourceFile.split("/").pop() ?? "source image";
    const version = overview.provenance.sourceImageSha256.slice(0, 8);
    const revision = overview.provenance.sourceRevisionDate ?? "not shown on the supplied image";
    const verified = overview.provenance.verifiedOn ?? "not recorded";
    sourceProvenance.textContent =
      `Source: ${sourceName} · image version ${version} · revision date ${revision} · checked ${verified}.`;
    inventoryNotes.textContent = Object.values(overview.inventoryExceptions).join(" ");

    if (overview.validationIssues.length) {
      validationStatus.textContent = `Data check needs review: ${overview.validationIssues.join(" ")}`;
      validationStatus.classList.add("is-error");
    } else {
      validationStatus.textContent =
        "Data check passed: source image, room inventory, group labels, and reference coordinates match.";
      validationStatus.classList.remove("is-error");
    }
    await loadScheduleEvacuation();
  } catch {
    sourceProvenance.textContent = "Source image details could not be loaded.";
    validationStatus.textContent = "Evacuation data could not be checked.";
    validationStatus.classList.add("is-error");
  }
}

void loadEvacuationOverview();

function fitMapToStage() {
  const { naturalWidth, naturalHeight } = mapImage;
  const width = mapStage.clientWidth;
  const height = mapStage.clientHeight;
  if (!naturalWidth || !naturalHeight || !width || !height) return;
  const scale = Math.min(width / naturalWidth, height / naturalHeight);
  mapArt.style.width = `${Math.round(naturalWidth * scale)}px`;
  mapArt.style.height = `${Math.round(naturalHeight * scale)}px`;
}

function clearPanzoom() {
  stageResizeObserver?.disconnect();
  stageResizeObserver = null;
  if (panzoom) {
    panzoom.reset({ animate: false });
    panzoom.destroy();
    panzoom = null;
  }
  if (wheelListener) {
    mapStage.removeEventListener("wheel", wheelListener);
    wheelListener = null;
  }
}

function initializePanzoom() {
  clearPanzoom();
  fitMapToStage();
  panzoom = Panzoom(mapArt, {
    canvas: true,
    minScale: 1,
    maxScale: 7,
    startScale: 1,
    panOnlyWhenZoomed: true,
    pinchAndPan: true,
    setTransform: (element, values) => {
      const bounded = setBoundedImageTransform(element as HTMLElement, mapStage, values);
      if (bounded.x !== values.x || bounded.y !== values.y) {
        requestAnimationFrame(() => {
          panzoom?.pan(bounded.x, bounded.y, { animate: false, relative: false });
        });
      }
    },
    touchAction: "none",
    cursor: "grab",
  });
  wheelListener = panzoom.zoomWithWheel;
  mapStage.addEventListener("wheel", wheelListener, { passive: false });
  stageResizeObserver = new ResizeObserver(() => {
    fitMapToStage();
    panzoom?.reset({ animate: false });
  });
  stageResizeObserver.observe(mapStage);
}

function openMapViewer() {
  mapDialog.showModal();
  if (mapImage.complete && mapImage.naturalWidth) {
    requestAnimationFrame(initializePanzoom);
  } else {
    mapImage.addEventListener("load", initializePanzoom, { once: true });
  }
}

mapOpenButton.addEventListener("click", openMapViewer);
infoOpenButton.addEventListener("click", () => infoDialog.showModal());
mapDialog.addEventListener("close", clearPanzoom);
mapDialog.addEventListener("click", (event) => {
  if (event.target === mapDialog) mapDialog.close();
});
infoDialog.addEventListener("click", (event) => {
  if (event.target === infoDialog) infoDialog.close();
});
