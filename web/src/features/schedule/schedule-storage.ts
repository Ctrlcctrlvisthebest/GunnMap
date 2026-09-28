import scheduleDefaults from "./schedule-defaults.json";
import type { Period, ScheduleTemplate } from "./types.js";

export const PERIOD_COLORS = scheduleDefaults.periodColors;
export const EXAMPLE_SCHEDULE = scheduleDefaults.exampleSchedule;
export const DRAFT_COOKIE_NAME = "gunnmap_schedule_draft";
export const CURRENT_SCHEDULE_KEY = "gunnmap_current_schedule";
export const TEMPLATES_COOKIE_NAME = "gunnmap_schedule_templates";
export const GENERATED_MAP_SESSION_KEY = "gunnmap_generated_map";
export const SHARE_PARAM = "schedule";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

interface ScheduleDraft {
  version: 1;
  periods: Period[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultPeriods(): Period[] {
  return PERIOD_COLORS.map((color) => ({ building: "", room: "", color }));
}

export function isValidPeriods(value: unknown): value is Period[] {
  return Boolean(
    Array.isArray(value) &&
      value.length === 7 &&
      value.every((period) =>
        isRecord(period) &&
        typeof period.building === "string" &&
        typeof period.room === "string" &&
        typeof period.color === "string" &&
        HEX_COLOR.test(period.color),
      ),
  );
}

function getCookie(name: string) {
  const encodedName = encodeURIComponent(name);
  const entry = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${encodedName}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(encodedName.length + 1));
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string) {
  const cookieName = encodeURIComponent(name);
  const cookieValue = encodeURIComponent(value);
  document.cookie = `${cookieName}=${cookieValue}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  return getCookie(name) === value;
}

function removeCookie(name: string) {
  document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; SameSite=Lax`;
}

export function loadDraft(): Period[] | null {
  try {
    const saved = getCookie(DRAFT_COOKIE_NAME);
    if (!saved) return null;
    const draft: unknown = JSON.parse(saved);
    if (!isRecord(draft) || draft.version !== 1 || !isValidPeriods(draft.periods)) {
      removeCookie(DRAFT_COOKIE_NAME);
      return null;
    }
    return draft.periods;
  } catch {
    return null;
  }
}

export function saveDraft(periods: Period[]) {
  try {
    return setCookie(DRAFT_COOKIE_NAME, JSON.stringify({ version: 1, periods }));
  } catch {
    return false;
  }
}

export function clearDraft() {
  try {
    removeCookie(DRAFT_COOKIE_NAME);
    return getCookie(DRAFT_COOKIE_NAME) === null;
  } catch {
    return false;
  }
}

export function saveCurrentSchedule(periods: Period[]) {
  try {
    sessionStorage.setItem(CURRENT_SCHEDULE_KEY, JSON.stringify({ version: 1, periods }));
  } catch {
    // Keep editing available when session storage is blocked.
  }
}

export function readCurrentSchedule(): Period[] {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(CURRENT_SCHEDULE_KEY);
  } catch {
    saved = null;
  }
  if (!saved) {
    const entry = document.cookie
      .split("; ")
      .find((item) => item.startsWith(`${DRAFT_COOKIE_NAME}=`));
    if (entry) {
      try {
        saved = decodeURIComponent(entry.slice(`${DRAFT_COOKIE_NAME}=`.length));
      } catch {
        saved = null;
      }
    }
  }
  if (!saved) return [];
  try {
    const value: unknown = JSON.parse(saved);
    return isRecord(value) && isValidPeriods(value.periods) ? value.periods : [];
  } catch {
    return [];
  }
}

export function loadTemplates(): ScheduleTemplate[] {
  try {
    const saved = getCookie(TEMPLATES_COOKIE_NAME);
    if (!saved) return [];
    const templates: unknown = JSON.parse(saved);
    if (!Array.isArray(templates)) return [];
    return templates.filter((template): template is ScheduleTemplate =>
      isRecord(template) &&
      typeof template.name === "string" &&
      template.name.trim().length > 0 &&
      isValidPeriods(template.periods),
    );
  } catch {
    return [];
  }
}

export function saveTemplates(templates: ScheduleTemplate[]) {
  try {
    return setCookie(TEMPLATES_COOKIE_NAME, JSON.stringify(templates.slice(0, 8)));
  } catch {
    return false;
  }
}

export function readSharedSchedule(): Period[] | null {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  const encoded = new URLSearchParams(hash).get(SHARE_PARAM);
  if (!encoded) return null;
  try {
    const value: unknown = JSON.parse(encoded);
    return isValidPeriods(value) ? value : null;
  } catch {
    return null;
  }
}

export function removeSharedSchedule() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (!hash.has(SHARE_PARAM)) return;
  hash.delete(SHARE_PARAM);
  const fragment = hash.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + (fragment ? `#${fragment}` : ""),
  );
}
