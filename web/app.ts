import "./site-shell.js";
import "./ui-components.js";
import { mountPeriodEditor, type Period as EditorPeriod, type PeriodEditorHandle, type RoomOption } from "./period-editor.js";
import { roomMatchesInput } from "./room-matching.js";
import scheduleDefaults from "./schedule-defaults.json";

type Period = EditorPeriod;
type Room = RoomOption;
interface ScheduleDraft { version: 1; periods: Period[] }
interface ScheduleTemplate { name: string; periods: Period[] }
interface RenderResult { image_url: string }
interface ActiveRender { revision: number; promise: Promise<boolean> }
function query<T extends Element = HTMLElement>(selector: string, parent: ParentNode = document): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing page element: ${selector}`);
  return element;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const PERIOD_COLORS = scheduleDefaults.periodColors;
const DRAFT_COOKIE_NAME = "gunnmap_schedule_draft";
const CURRENT_SCHEDULE_KEY = "gunnmap_current_schedule";
const TEMPLATES_COOKIE_NAME = "gunnmap_schedule_templates";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SHARE_PARAM = "schedule";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EXAMPLE = scheduleDefaults.exampleSchedule;

const form = query<HTMLFormElement>("#period-form");
const list = query("#period-list");
const renderButton = query<HTMLButtonElement>("#render-button");
const sampleButton = query<HTMLButtonElement>("#sample-button");
const clearButton = query<HTMLButtonElement>("#clear-button");
const shareButton = query<HTMLButtonElement>("#share-button");
const undoScheduleButton = query<HTMLButtonElement>("#undo-schedule-button");
const redoScheduleButton = query<HTMLButtonElement>("#redo-schedule-button");
type WaSelect = HTMLElement & { value: string; disabled: boolean };
const templateSelect = query<WaSelect>("#template-select");
const saveTemplateButton = query<HTMLButtonElement>("#save-template-button");
const deleteTemplateButton = query<HTMLButtonElement>("#delete-template-button");
const templateDialog = query<HTMLDialogElement>("#template-dialog");
const templateName = query<HTMLInputElement>("#template-name");
const templateMessage = query("#template-message");
const deleteTemplateDialog = query<HTMLDialogElement>("#delete-template-dialog");
const toastRegion = query("#toast-region");
const editorMore = query<HTMLDetailsElement>(".editor-more");
const sharedScheduleDialog = query<HTMLDialogElement>("#shared-schedule-dialog");
const sharedSchedulePreview = query<HTMLOListElement>("#shared-schedule-preview");
const sharedUseOnceButton = query<HTMLButtonElement>("#shared-use-once");
const sharedSaveButton = query<HTMLButtonElement>("#shared-save");
const sharedKeepCurrentButton = query<HTMLButtonElement>("#shared-keep-current");

let rooms: Room[] = [];
let buildings: string[] = [];
let periods: Period[] = PERIOD_COLORS.map((color) => ({ building: "", room: "", color }));
let periodEditor: PeriodEditorHandle | null = null;
let scheduleRevision = 0;
let activeRender: ActiveRender | null = null;
let undoHistory: Period[][] = [];
let redoHistory: Period[][] = [];
let lastInputUndoAt = 0;
let roomsLoaded = false;
let pendingTemplateDeletion = "";
let pendingSharedSchedule: Period[] | null = null;
let toastTimer = 0;

const GENERATED_MAP_SESSION_KEY = "gunnmap_generated_map";

function showToast(message: string) {
  toastRegion.textContent = message;
  toastRegion.classList.add("is-visible");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastRegion.classList.remove("is-visible");
    toastRegion.textContent = "";
    toastTimer = 0;
  }, 3000);
}

function closeMoreMenu() {
  editorMore.open = false;
}

function pushUndoState(previous: Period[]) {
  undoHistory.push(previous.map((period) => ({ ...period })));
  if (undoHistory.length > 20) undoHistory.shift();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoScheduleButton.disabled = undoHistory.length === 0;
  redoScheduleButton.disabled = redoHistory.length === 0;
}

function recordUndoState(previous = readPeriods()) {
  redoHistory = [];
  pushUndoState(previous);
  lastInputUndoAt = 0;
}

function undoLastScheduleChange() {
  const previous = undoHistory.pop();
  if (!previous) return;
  redoHistory.push(readPeriods());
  updateHistoryButtons();
  applyPeriods(previous);
  saveDraft();
  showToast("Last schedule change undone.");
}

function redoScheduleChange() {
  const next = redoHistory.pop();
  if (!next) return;
  pushUndoState(readPeriods());
  applyPeriods(next);
  saveDraft();
  showToast("Change restored.");
}

function isValidPeriods(periods: unknown): periods is Period[] {
  return Boolean(
    Array.isArray(periods) &&
      periods.length === 7 &&
      periods.every((period) => (
        isRecord(period) &&
        typeof period.building === "string" &&
        typeof period.room === "string" &&
        typeof period.color === "string" &&
        HEX_COLOR.test(period.color)
      )),
  );
}

function isValidDraft(value: unknown): value is ScheduleDraft {
  return isRecord(value) && value.version === 1 && isValidPeriods(value.periods);
}

function getCookie(name: string) {
  const encodedName = encodeURIComponent(name);
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${encodedName}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(encodedName.length + 1));
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string) {
  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  document.cookie = `${encodedName}=${encodedValue}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  return getCookie(name) === value;
}

function removeCookie(name: string) {
  document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; SameSite=Lax`;
}

function saveDraft() {
  try {
    if (!setCookie(DRAFT_COOKIE_NAME, JSON.stringify({ version: 1, periods: readPeriods() }))) throw new Error("Cookie was not saved");
  } catch {
    showToast("Draft could not be saved in this browser.");
  }
}

function saveCurrentSchedule() {
  try {
    sessionStorage.setItem(CURRENT_SCHEDULE_KEY, JSON.stringify({ version: 1, periods: readPeriods() }));
  } catch {
    // The page still works if this browser blocks session storage.
  }
}

function loadDraft() {
  try {
    const saved = getCookie(DRAFT_COOKIE_NAME);
    if (!saved) return null;
    const draft: unknown = JSON.parse(saved);
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

function loadTemplates(): ScheduleTemplate[] {
  try {
    const saved = getCookie(TEMPLATES_COOKIE_NAME);
    if (!saved) return [];
    const templates: unknown = JSON.parse(saved);
    if (!Array.isArray(templates)) return [];
    return templates.filter((template): template is ScheduleTemplate => (
      isRecord(template) &&
      typeof template.name === "string" &&
      template.name.trim().length > 0 &&
      isValidPeriods(template.periods)
    ));
  } catch {
    return [];
  }
}

function saveTemplates(templates: ScheduleTemplate[]) {
  try {
    return setCookie(TEMPLATES_COOKIE_NAME, JSON.stringify(templates.slice(0, 8)));
  } catch {
    return false;
  }
}

function renderTemplateOptions(selectedName = decodeURIComponent(templateSelect.value || "")) {
  const templates = loadTemplates();
  templateSelect.replaceChildren(...templates.map((template) => {
    const option = document.createElement("wa-option");
    option.value = encodeURIComponent(template.name);
    option.textContent = template.name;
    return option;
  }));
  templateSelect.value = templates.some(template => template.name === selectedName) ? encodeURIComponent(selectedName) : "";
  deleteTemplateButton.disabled = !templateSelect.value;
}
function invalidatePreview() {
  scheduleRevision += 1;
  try {
    window.sessionStorage.removeItem(GENERATED_MAP_SESSION_KEY);
  } catch {
    // The schedule editor remains usable if session storage is unavailable.
  }
}

function removeSharedSchedule() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (!hash.has(SHARE_PARAM)) return;
  hash.delete(SHARE_PARAM);
  const fragment = hash.toString();
  window.history.replaceState(null, "", window.location.pathname + window.location.search + (fragment ? `#${fragment}` : ""));
}

function scheduleEdited(previous: Period[]) {
  const now = performance.now();
  if (now - lastInputUndoAt > 700) pushUndoState(previous);
  redoHistory = [];
  updateHistoryButtons();
  lastInputUndoAt = now;
  saveCurrentSchedule();
  invalidatePreview();
  removeSharedSchedule();
  saveDraft();
}

function buildingName(code: string) {
  if (code === "BG") return "Bow Gym";
  if (code === "D") return "D Building / Library";
  return `${code} Building`;
}

function readPeriods() {
  return periods.map((period) => ({ ...period, room: period.room.trim() }));
}

function applyPeriods(next: Period[], { clearShare = true } = {}) {
  const nextPeriods = PERIOD_COLORS.map((color, index) => {
    const period = next[index];
    return {
      building: period && buildings.includes(period.building) ? period.building : "",
      room: period?.room ?? "",
      color: period && HEX_COLOR.test(period.color) ? period.color : color,
    };
  });
  periods = nextPeriods;
  periodEditor?.setPeriods(periods);
  saveCurrentSchedule();
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
    const periods: unknown = JSON.parse(encoded);
    return isValidPeriods(periods) ? periods : null;
  } catch {
    return null;
  }
}

function renderSharedSchedulePreview(shared: Period[]) {
  sharedSchedulePreview.replaceChildren(...shared.map((period, index) => {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "shared-period-swatch";
    swatch.style.setProperty("--period-color", period.color);
    swatch.setAttribute("aria-hidden", "true");

    const number = document.createElement("span");
    number.className = "shared-period-number";
    number.textContent = String(index + 1);

    const detail = document.createElement("span");
    const matchingRooms = rooms.filter((room) => roomMatchesInput(room, period.room));
    const building = period.building || (
      matchingRooms.length === 1 ? matchingRooms[0].building : ""
    );
    detail.textContent = period.room.trim()
      ? `${period.room.trim()}${building ? ` · ${buildingName(building)}` : ""}`
      : "No room selected";
    item.append(swatch, number, detail);
    return item;
  }));
}

function useSharedSchedule(saveOnDevice: boolean) {
  if (!pendingSharedSchedule) return;
  const next = pendingSharedSchedule;
  recordUndoState();
  pendingSharedSchedule = null;
  applyPeriods(next);
  if (saveOnDevice) {
    saveDraft();
    showToast("Shared schedule saved on this device.");
  } else {
    showToast("Shared schedule loaded for this session.");
  }
  sharedScheduleDialog.close();
}

async function shareSchedule() {
  closeMoreMenu();
  const encoded = encodeURIComponent(JSON.stringify(readPeriods()));
  const shareUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#${SHARE_PARAM}=${encoded}`;
  window.history.replaceState(null, "", shareUrl);
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast("Share link copied.");
  } catch {
    showToast("Share link ready in the address bar.");
  }
}

function openTemplateDialog() {
  closeMoreMenu();
  templateName.value = `Schedule ${loadTemplates().length + 1}`;
  templateMessage.textContent = "";
  templateDialog.showModal();
  templateName.select();
}

function saveTemplate(event: Event) {
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
  showToast(`${name} saved.`);
}

function loadSelectedTemplate() {
  closeMoreMenu();
  const name = decodeURIComponent(templateSelect.value || "");
  const template = loadTemplates().find((item) => item.name === name);
  deleteTemplateButton.disabled = !template;
  if (!template) return;
  recordUndoState();
  applyPeriods(template.periods);
  saveDraft();
  showToast(`${name} loaded.`);
}

function confirmTemplateDeletion() {
  const name = decodeURIComponent(templateSelect.value || "");
  if (!name) return;
  pendingTemplateDeletion = name;
  query("#delete-template-description").textContent = `Delete the “${name}” template? Your current schedule will stay in the editor.`;
  query("#delete-template-message").textContent = "";
  deleteTemplateDialog.showModal();
}

function deleteSelectedTemplate(event: Event) {
  event.preventDefault();
  const name = pendingTemplateDeletion;
  if (!name) return;
  const templates = loadTemplates().filter((template) => template.name !== name);
  if (!saveTemplates(templates)) {
    query("#delete-template-message").textContent = "Template could not be deleted in this browser.";
    return;
  }
  renderTemplateOptions();
  deleteTemplateDialog.close();
  pendingTemplateDeletion = "";
  showToast(`${name} deleted.`);
}

sampleButton.addEventListener("click", () => {
  closeMoreMenu();
  recordUndoState();
  applyPeriods(EXAMPLE.map(({ building, room }, index) => ({
    building,
    room,
    color: PERIOD_COLORS[index],
  })));
  saveDraft();
  showToast("Example loaded. Select Generate Map to preview it.");
});

clearButton.addEventListener("click", () => {
  closeMoreMenu();
  recordUndoState();
  resetPeriods();
  const cleared = clearDraft();
  showToast(cleared ? "Schedule cleared." : "Schedule cleared, but the saved draft could not be removed.");
});

shareButton.addEventListener("click", shareSchedule);
undoScheduleButton.addEventListener("click", undoLastScheduleChange);
redoScheduleButton.addEventListener("click", redoScheduleChange);
sharedUseOnceButton.addEventListener("click", () => useSharedSchedule(false));
sharedSaveButton.addEventListener("click", () => useSharedSchedule(true));
sharedKeepCurrentButton.addEventListener("click", () => {
  pendingSharedSchedule = null;
  sharedScheduleDialog.close();
});
sharedScheduleDialog.addEventListener("close", () => { pendingSharedSchedule = null; });
templateSelect.addEventListener("change", loadSelectedTemplate);
saveTemplateButton.addEventListener("click", openTemplateDialog);
deleteTemplateButton.addEventListener("click", confirmTemplateDeletion);
query("#template-form").addEventListener("submit", saveTemplate);
query("#cancel-template-button").addEventListener("click", () => templateDialog.close());
query("#delete-template-form").addEventListener("submit", deleteSelectedTemplate);
query("#cancel-delete-template-button").addEventListener("click", () => deleteTemplateDialog.close());
deleteTemplateDialog.addEventListener("close", () => { pendingTemplateDeletion = ""; });

async function renderMap(requestRevision: number, requestedPeriods: Period[]) {
  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periods: requestedPeriods }),
    });
    const result = await response.json() as RenderResult & { error?: string };
    if (requestRevision !== scheduleRevision) return false;
    if (!response.ok) throw new Error(result.error || "Map generation failed.");
    const nextImage = new Image();
    nextImage.src = result.image_url;
    await nextImage.decode();
    if (requestRevision !== scheduleRevision) return false;
    try {
      window.sessionStorage.setItem(GENERATED_MAP_SESSION_KEY, result.image_url);
    } catch {
      // The result URL remains available through the address bar query.
    }
    window.location.assign(`/generate-map?image=${encodeURIComponent(result.image_url)}`);
    return true;
  } catch (error) {
    if (requestRevision === scheduleRevision) {
      showToast(error instanceof Error ? error.message : String(error));
    }
    return false;
  }
}

function generateMap() {
  if (!roomsLoaded) return Promise.resolve(false);
  if (activeRender?.revision === scheduleRevision) return activeRender.promise;
  invalidatePreview();
  renderButton.disabled = true;
  const request: ActiveRender = {
    revision: scheduleRevision,
    promise: renderMap(scheduleRevision, readPeriods()).finally(() => {
      if (activeRender === request) {
        activeRender = null;
        renderButton.disabled = false;
      }
    }),
  };
  activeRender = request;
  return request.promise;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  return generateMap();
});

pendingSharedSchedule = loadSharedSchedule();
const draft = loadDraft();
periods = draft ?? periods;
periodEditor = mountPeriodEditor(list, periods, rooms, buildings, (next) => {
  const previous = periods.map((period) => ({ ...period }));
  periods = next;
  scheduleEdited(previous);
}, showToast);
form.inert = true;
form.setAttribute("aria-busy", "true");

async function init() {
  try {
    const response = await fetch("/api/rooms");
    if (!response.ok) throw new Error("Could not load the room list.");
    const data = await response.json() as { rooms: Room[]; buildings: string[] };
    rooms.push(...data.rooms);
    buildings.push(...data.buildings);
    periods = periods.map((period) => {
      if (period.building) return period;
      const candidates = [...new Set(rooms
        .filter((room) => roomMatchesInput(room, period.room))
        .map((room) => room.building))];
      return candidates.length === 1 ? { ...period, building: candidates[0] } : period;
    });
    periodEditor?.setPeriods(periods);
    saveCurrentSchedule();
    form.inert = false;
    form.removeAttribute("aria-busy");
    roomsLoaded = true;
    renderTemplateOptions();
    invalidatePreview();
    if (pendingSharedSchedule) {
      renderSharedSchedulePreview(pendingSharedSchedule);
      sharedScheduleDialog.showModal();
    }
  } catch (error) {
    form.inert = false;
    form.removeAttribute("aria-busy");
    showToast(error instanceof Error ? error.message : "Room list unavailable.");
    const controls = [
      renderButton,
      sampleButton,
      clearButton,
      shareButton,
      undoScheduleButton,
      redoScheduleButton,
      templateSelect,
      saveTemplateButton,
      deleteTemplateButton,
    ];
    for (const control of controls) {
      control.disabled = true;
    }
  }
}

init();
