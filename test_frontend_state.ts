// Execute the real TypeScript frontend against a small DOM and controllable async I/O.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { ROOT, rooms as inventory } from "./project.js";
import { setBoundedImageTransform } from "./web/map-pan-bounds.js";

interface TestEvent { preventDefault(): void }
type TestListener = (event: TestEvent) => unknown;
interface Period { building: string; room: string; color: string }
interface Draft { version: number; periods: Period[] }
interface Template { name: string; periods: Period[] }
interface TestResponse { ok: boolean; json(): Promise<unknown> }
interface RenderRequest { body: string }
interface HarnessOptions {
  renderOnStart?: boolean;
  cookies?: Record<string, unknown>;
  hash?: string;
  cookieWrites?: boolean;
}

class TestStyle {
  [property: `--${string}`]: string;
  left = "";
  top = "";
  backgroundColor = "";
  cursor = "";
  setProperty(name: `--${string}`, value: string) { this[name] = value; }
}

class Element {
  children: Element[] = [];
  fields = new Map<string, Element>();
  events = new Map<string, TestListener[]>();
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  value = "";
  textContent = "";
  className = "";
  src = "";
  href = "";
  hidden = false;
  disabled = false;
  open = false;
  clicks = 0;
  clientWidth = 800;
  clientHeight = 518;
  offsetWidth = 36;
  offsetHeight = 36;
  style = new TestStyle();
  private classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const add = force === undefined ? !this.classes.has(name) : force;
      if (add) this.classes.add(name); else this.classes.delete(name);
      return add;
    },
  };
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = children; }
  insertBefore(child: Element) { this.children.unshift(child); }
  set innerHTML(value: string) {
    const color = value.match(/type="color" value="([^"]+)"/);
    if (color) this.querySelector('input[type="color"]').value = color[1];
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  getAttribute(name: string) { return name === "src" ? this.src : this.attributes.get(name); }
  querySelector(selector: string): Element {
    const existing = this.fields.get(selector);
    if (existing) return existing;
    const element = new Element();
    this.fields.set(selector, element);
    return element;
  }
  querySelectorAll() { return this.children; }
  addEventListener(type: string, listener: TestListener) {
    const listeners = this.events.get(type) ?? [];
    listeners.push(listener);
    this.events.set(type, listeners);
  }
  trigger(type: string) {
    return Promise.all((this.events.get(type) ?? []).map(fn => fn({ preventDefault() {} })));
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
  select() {}
  focus() {}
  click() { this.clicks += 1; return this.trigger("click"); }
}

class TestDocument extends Element {
  createElement() { return new Element(); }
  createElementNS() { return new Element(); }
}

function mountPeriodEditor(target: Element, initial: Period[], rooms: typeof inventory, _buildings: string[], onChange: (periods: Period[]) => void) {
  let periods = initial.map(period => ({ ...period }));
  const autoBuildings = periods.map(period => {
    const matches = rooms.filter(item => [item.id, item.label, `${item.label} (${item.id})`, ...(item.aliases ?? [])]
      .some(candidate => candidate.toUpperCase() === period.room.trim().toUpperCase()));
    const candidates = [...new Set(matches.map(item => item.building))];
    return candidates.length === 1 && candidates[0] === period.building ? period.building : "";
  });
  const cards: (Element & { update(): void })[] = Array.from({ length: 7 }, (_, index) => {
    const card = new Element() as Element & { update(): void };
    card.className = "period-card";
    card.dataset.period = String(index + 1);
    const room = card.querySelector('input[type="text"]');
    const building = card.querySelector("select");
    const color = card.querySelector('input[type="color"]');
    const dataList = card.querySelector("datalist");
    const matches = (value: string) => rooms.filter(item =>
      [item.id, item.label, `${item.label} (${item.id})`, ...(item.aliases ?? [])]
        .some(candidate => candidate.toUpperCase() === value.trim().toUpperCase()));
    const update = () => {
      const period = periods[index];
      room.value = period.room;
      building.value = period.building;
      color.value = period.color;
      card.style.setProperty("--period-accent", period.color);
      const candidates = rooms.filter(item => !period.building || item.building === period.building);
      dataList.replaceChildren(...candidates.map(item => {
        const option = new Element();
        const duplicates = candidates.filter(candidate => candidate.label === item.label).length > 1;
        option.value = duplicates ? item.aliases?.[0] ?? item.label : item.label;
        option.textContent = `${item.building}${item.floor === 2 ? " · 2nd floor" : ""}`;
        return option;
      }));
    };
    const publish = (next: Period[]) => {
      periods = next;
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) cards[cardIndex].update();
      onChange(next.map(period => ({ ...period })));
    };
    const editRoom = () => {
      const next = periods.map(period => ({ ...period }));
      next[index].room = room.value;
      const buildings = [...new Set(matches(room.value).map(item => item.building))];
      if (buildings.length === 1) {
        next[index].building = buildings[0];
        autoBuildings[index] = buildings[0];
      } else if (autoBuildings[index] && next[index].building === autoBuildings[index]) {
        next[index].building = "";
        autoBuildings[index] = "";
      }
      publish(next);
    };
    room.addEventListener("input", editRoom);
    room.addEventListener("change", editRoom);
    building.addEventListener("change", () => {
      const next = periods.map(period => ({ ...period }));
      next[index].building = building.value;
      next[index].room = "";
      autoBuildings[index] = "";
      publish(next);
    });
    color.addEventListener("input", () => {
      const next = periods.map(period => ({ ...period }));
      next[index].color = color.value;
      publish(next);
    });
    card.update = update;
    return card;
  });
  target.replaceChildren(...cards);
  for (const card of cards) card.update();
  return {
    setPeriods(next: Period[]) {
      periods = next.map(period => ({ ...period }));
      periods.forEach((period, index) => {
        const matches = rooms.filter(item => [item.id, item.label, `${item.label} (${item.id})`, ...(item.aliases ?? [])]
          .some(candidate => candidate.toUpperCase() === period.room.trim().toUpperCase()));
        const candidates = [...new Set(matches.map(item => item.building))];
        autoBuildings[index] = candidates.length === 1 && candidates[0] === period.building ? period.building : "";
      });
      for (const card of cards) card.update();
    },
  };
}

const frontendCode = transpileModule(readFileSync(join(ROOT, "web/app.ts"), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  fileName: "web/app.ts",
}).outputText;
const scheduleDefaults = JSON.parse(readFileSync(join(ROOT, "web/schedule-defaults.json"), "utf8")) as {
  periodColors: string[];
  exampleSchedule: Period[];
};
const generatedMapSessionKey = "gunnmap_generated_map";
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const response = (data: unknown, ok = true): TestResponse => ({ ok, json: async () => data });
function resultFor(label: string) {
  const room = inventory.find(item => item.label === label);
  assert.ok(room, `Missing test room ${label}`);
  return {
    image_url: imagePathFor(label), warnings: [], map_size: [2448, 1584],
    selected: [{
      ...room, period: 1, color: "#0284c7", marker: [1663.5, 574.5],
      evacuation: { status: "mapped", group: label === "M3" ? "blue" : "black",
        destination: label === "M3" ? "Blue assembly area" : "Football field", focus: null },
    }],
  };
}
function imagePathFor(label: string) {
  const token = label.toLowerCase().padEnd(32, "0").slice(0, 32);
  return `/output/period_map_${token}.png`;
}

const draftCookie = "gunnmap_schedule_draft";
const templateCookie = "gunnmap_schedule_templates";
const blankPeriods = () => Array.from({ length: 7 }, () => ({ building: "", room: "", color: "#0284c7" }));
const scheduleFor = (label: string) => {
  const periods = blankPeriods();
  periods[0] = { building: label[0].toUpperCase(), room: label, color: "#0284c7" };
  return periods;
};

test("map panning is clamped to the image edges at its current zoom", () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      getComputedStyle: () => ({
        paddingLeft: "10px",
        paddingRight: "10px",
        paddingTop: "10px",
        paddingBottom: "10px",
      }),
    },
  });
  const image = { offsetWidth: 600, offsetHeight: 400, style: { transform: "" } } as unknown as HTMLElement;
  const viewport = { clientWidth: 500, clientHeight: 300 } as unknown as HTMLElement;
  try {
    assert.deepEqual(setBoundedImageTransform(image, viewport, { x: 1000, y: -1000, scale: 1 }), { x: 60, y: -60 });
    assert.equal(image.style.transform, "scale(1) translate(60px, -60px)");
    assert.deepEqual(setBoundedImageTransform(image, viewport, { x: 1000, y: -1000, scale: 2 }), { x: 180, y: -130 });
  } finally {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

async function harness({ renderOnStart = true, cookies = {}, hash = "", cookieWrites = true }: HarnessOptions = {}) {
  const document = new TestDocument();
  const cookieJar = new Map(Object.entries(cookies).map(([name, value]) => [name, encodeURIComponent(JSON.stringify(value))]));
  Object.defineProperty(document, "cookie", {
    get: () => [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; "),
    set: (value: string) => {
      if (!cookieWrites) return;
      const [entry] = value.split(";");
      const index = entry.indexOf("=");
      const name = entry.slice(0, index);
      if (value.includes("max-age=0")) cookieJar.delete(name);
      else cookieJar.set(name, entry.slice(index + 1));
    },
  });
  const get = (selector: string) => document.querySelector(selector);
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const io: { render: (options: RenderRequest) => Promise<TestResponse>; decode: () => Promise<void>; clipboard: string } = { render: async () => response(resultFor("M3")), decode: async () => {}, clipboard: "" };
  const currentUrl = new URL(`http://localhost:8765/${hash}`);
  const sessionValues = new Map<string, string>();
  let lastNavigation = "";
  const location = {
    get href() { return currentUrl.href; },
    get hash() { return currentUrl.hash; },
    get origin() { return currentUrl.origin; },
    get pathname() { return currentUrl.pathname; },
    get search() { return currentUrl.search; },
    assign(url: string) { lastNavigation = new URL(url, currentUrl).href; },
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    location,
    history: { replaceState(_state: unknown, _title: string, url: string | URL) { currentUrl.href = new URL(url, currentUrl).href; } },
    sessionStorage: {
      getItem(key: string) { return sessionValues.get(key) ?? null; },
      setItem(key: string, value: string) { sessionValues.set(key, value); },
      removeItem(key: string) { sessionValues.delete(key); },
    },
    setTimeout(callback: () => void) { timerId += 1; timers.set(timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
    open() {},
  };
  vm.runInNewContext(frontendCode, {
    exports: {},
    require: (name: string) => {
      if (name === "./site-shell.js") return {};
      if (name === "./ui-components.js") return {};
      if (name === "./period-editor.js") return { mountPeriodEditor };
      if (name === "./room-matching.js") {
        return {
          roomMatchesInput: (room: typeof inventory[number], value: string) =>
            [room.id, room.label, `${room.label} (${room.id})`, ...(room.aliases ?? [])]
              .some(candidate => candidate.replace(/[\s-]+/g, "").toLowerCase() === value.replace(/[\s-]+/g, "").toLowerCase()),
        };
      }
      if (name === "./schedule-defaults.json") return { default: scheduleDefaults };
      if (name === "./map-pan-bounds.js") return { setBoundedImageTransform() { return { x: 0, y: 0 }; } };
      if (name === "@panzoom/panzoom") return { default: () => { throw new Error("Panzoom is not expected in the state harness"); } };
      throw new Error(`Unexpected frontend dependency: ${name}`);
    },
    document, URLSearchParams, performance: { now: () => Date.now() }, requestAnimationFrame: () => 1,
    ResizeObserver: class { observe() {} },
    Image: class { decode() { return io.decode(); } },
    Option: class extends Element { constructor(text: string, value: string) { super(); this.textContent = text; this.value = value; } },
    window,
    navigator: { clipboard: { writeText: async (text: string) => { io.clipboard = text; } } },
    fetch: async (url: string, options?: RenderRequest) => {
      if (url === "/api/rooms") return response({ rooms: inventory, buildings: [...new Set(inventory.map(room => room.building))] });
      assert.ok(options, "Rendering requires request options");
      return io.render(options);
    },
  }, { filename: "web/app.ts" });
  await tick();
  assert.equal(get("#period-list").children.length, 7);
  const setRoom = (label: string, index = 0, color = "#0284c7") => {
    const card = get("#period-list").children[index];
    card.querySelector("select").value = label[0].toUpperCase();
    card.querySelector('input[type="text"]').value = label;
    card.querySelector('input[type="color"]').value = color;
    void card.querySelector('input[type="text"]').trigger("input");
    void card.querySelector('input[type="color"]').trigger("input");
  };
  const submit = () => get("#period-form").trigger("submit");
  const assertCleared = () => {
    assert.equal(window.sessionStorage.getItem(generatedMapSessionKey), null);
  };
  const assertGeneratedMap = (imagePath: string) => {
    assert.equal(window.sessionStorage.getItem(generatedMapSessionKey), imagePath);
    const destination = new URL(lastNavigation);
    assert.equal(destination.pathname, "/generate-map");
    assert.equal(destination.searchParams.get("image"), imagePath);
  };
  if (renderOnStart) {
    setRoom("M3");
    await submit();
    assertGeneratedMap(imagePathFor("M3"));
  }
  function readCookie(name: typeof draftCookie): Draft | null;
  function readCookie(name: typeof templateCookie): Template[] | null;
  function readCookie(name: string): Draft | Template[] | null {
    const encoded = cookieJar.get(name);
    return encoded === undefined ? null : JSON.parse(decodeURIComponent(encoded)) as Draft | Template[];
  }
  const readPeriods = () => get("#period-list").children.map(card => ({
    building: card.querySelector("select").value,
    room: card.querySelector('input[type="text"]').value,
    color: card.querySelector('input[type="color"]').value,
  }));
  const saveTemplate = async (name = "My schedule") => {
    await get("#save-template-button").trigger("click");
    assert.equal(get("#template-dialog").open, true);
    get("#template-name").value = name;
    await get("#template-form").trigger("submit");
  };
  return {
    get,
    io,
    window,
    readCookie,
    readPeriods,
    setRoom,
    submit,
    assertCleared,
    assertGeneratedMap,
    saveTemplate,
    get lastNavigation() { return lastNavigation; },
  };
}

test("room entry infers buildings from inventory without altering entered text", async () => {
  const h = await harness({ renderOnStart: false });
  const card = h.get("#period-list").children[0];
  const input = card.querySelector('input[type="text"]');
  const select = card.querySelector("select");
  assert.equal(card.querySelector("datalist").children.length, inventory.length);
  for (const room of inventory) {
    input.value = ` ${room.label.toLowerCase()} `;
    await input.trigger("input");
    assert.equal(select.value, room.building, room.label);
    assert.equal(input.value, ` ${room.label.toLowerCase()} `);
  }
  input.value = "n214";
  await input.trigger("change");
  await h.get("#period-form").trigger("change");
  assert.equal(h.readCookie(draftCookie)!.periods[0].building, "N");
  for (const value of ["214", "N999", ""]) {
    input.value = value;
    await input.trigger("input");
    assert.equal(select.value, "");
  }
  select.value = "N";
  await select.trigger("change");
  input.value = "214";
  await input.trigger("input");
  assert.equal(select.value, "N", "manual selection remains available for numeric rooms");
});

test("duplicate K6 room suggestions use map locations rather than internal IDs", async () => {
  const h = await harness({ renderOnStart: false });
  const options = h.get("#period-list").children[0].querySelector("datalist").children;
  const labels = options.map(option => option.value);
  assert.ok(labels.includes("K6 (upper map location)"));
  assert.ok(labels.includes("K6 (lower map location)"));
  assert.equal(labels.some(label => /R\d{3}/.test(label)), false);
});

test("restored room-only drafts infer a building and clear it when the room becomes invalid", async () => {
  const periods = blankPeriods();
  periods[0].room = "n214";
  const h = await harness({ renderOnStart: false, cookies: { [draftCookie]: { version: 1, periods } } });
  assert.equal(h.readPeriods()[0].building, "N");
  const input = h.get("#period-list").children[0].querySelector('input[type="text"]');
  input.value = "N999";
  await input.trigger("input");
  assert.equal(h.readPeriods()[0].building, "");
});

for (const event of ["input", "change"]) {
  test(`${event} clears the prior generated map before N214 is regenerated`, async () => {
    const h = await harness();
    h.setRoom("n214");
    await h.get("#period-form").trigger(event);
    h.assertCleared();
    h.io.render = async options => {
      assert.equal(JSON.parse(options.body).periods[0].room, "n214");
      return response(resultFor("N214"));
    };
    await h.submit();
    h.assertGeneratedMap(imagePathFor("N214"));
  });
}

test("loading the example clears the previous generated map", async () => {
  const h = await harness();
  await h.get("#sample-button").trigger("click");
  h.assertCleared();
  assert.match(h.get("#toast-region").textContent, /Example loaded/);
});

test("failed regeneration leaves no stale generated map", async () => {
  const h = await harness();
  const previousNavigation = h.lastNavigation;
  h.io.render = async () => response({ error: "Room not found" }, false);
  await h.submit();
  h.assertCleared();
  assert.equal(h.get("#toast-region").textContent, "Room not found");
  assert.equal(h.lastNavigation, previousNavigation);
});

test("editing while a response is pending discards the old response", async () => {
  const h = await harness();
  const previousNavigation = h.lastNavigation;
  const pending = deferred<TestResponse>();
  h.io.render = () => pending.promise;
  const submit = h.submit();
  h.setRoom("n214");
  await h.get("#period-form").trigger("input");
  pending.resolve(response(resultFor("M3")));
  await submit;
  h.assertCleared();
  assert.equal(h.lastNavigation, previousNavigation, "an outdated render must not navigate to the map page");
});

test("editing while an image decodes cannot publish its stale PNG", async () => {
  const h = await harness();
  const previousNavigation = h.lastNavigation;
  const pending = deferred();
  let decoding = false;
  h.io.decode = () => { decoding = true; return pending.promise; };
  const submit = h.submit();
  await tick();
  assert.equal(decoding, true);
  h.setRoom("n214");
  await h.get("#period-form").trigger("input");
  pending.resolve();
  await submit;
  h.assertCleared();
  assert.equal(h.lastNavigation, previousNavigation, "an outdated image decode must not navigate to the map page");
});

test("editing saves a draft that restores all seven periods and colors", async () => {
  const h = await harness();
  h.setRoom("n214", 0, "#e11d48");
  h.setRoom("M3", 2, "#059669");
  await h.get("#period-form").trigger("input");
  const draft = h.readCookie(draftCookie);
  assert.ok(draft);
  assert.deepEqual(draft.periods, h.readPeriods());
  const restored = await harness({ renderOnStart: false, cookies: { [draftCookie]: draft } });
  assert.deepEqual(restored.readPeriods(), draft.periods);
  restored.assertCleared();
});

test("clear removes the draft and shared URL without deleting saved templates", async () => {
  const h = await harness();
  await h.get("#period-form").trigger("input");
  await h.saveTemplate();
  await h.get("#share-button").trigger("click");
  assert.match(h.window.location.hash, /schedule=/);
  await h.get("#clear-button").trigger("click");
  assert.equal(h.readCookie(draftCookie), null);
  assert.equal(h.window.location.hash, "");
  assert.equal(h.readCookie(templateCookie)!.length, 1);
  assert.ok(h.readPeriods().every(period => !period.building && !period.room));
  h.assertCleared();
});

test("saving, loading and deleting a named template preserves evacuation freshness", async () => {
  const h = await harness();
  h.setRoom("N214");
  await h.saveTemplate("Monday");
  assert.equal(h.get("#template-dialog").open, false);
  h.setRoom("M3");
  await h.get("#period-form").trigger("input");
  await h.submit();
  h.get("#template-select").value = "Monday";
  await h.get("#template-select").trigger("change");
  assert.equal(h.readPeriods()[0].room, "N214");
  assert.equal(h.readCookie(draftCookie)!.periods[0].room, "N214");
  h.assertCleared();
  await h.get("#delete-template-button").trigger("click");
  assert.equal(h.get("#delete-template-dialog").open, true);
  assert.equal(h.readCookie(templateCookie)!.length, 1);
  await h.get("#delete-template-form").trigger("submit");
  assert.deepEqual(h.readCookie(templateCookie), []);
  assert.equal(h.get("#delete-template-button").disabled, true);
  assert.equal(h.readPeriods()[0].room, "N214");
});

test("template loads discard old render responses as well as old PNG previews", async () => {
  const h = await harness({ cookies: { [templateCookie]: [{ name: "Field", periods: scheduleFor("N214") }] } });
  const pending = deferred<TestResponse>();
  h.io.render = () => pending.promise;
  const submission = h.submit();
  h.get("#template-select").value = "Field";
  await h.get("#template-select").trigger("change");
  pending.resolve(response(resultFor("M3")));
  await submission;
  h.assertCleared();
  assert.equal(h.readPeriods()[0].room, "N214");
});

test("shared schedules round-trip and take precedence over the local draft", async () => {
  const h = await harness();
  h.setRoom("N214", 0, "#e11d48");
  await h.get("#share-button").trigger("click");
  assert.equal(h.io.clipboard, h.window.location.href);
  const restored = await harness({
    renderOnStart: false,
    hash: new URL(h.io.clipboard).hash,
    cookies: { [draftCookie]: { version: 1, periods: scheduleFor("M3") } },
  });
  assert.equal(restored.get("#shared-schedule-dialog").open, true);
  assert.equal(restored.readPeriods()[0].room, "M3", "the local schedule remains untouched before confirmation");
  await restored.get("#shared-use-once").trigger("click");
  assert.deepEqual(restored.readPeriods(), h.readPeriods());
  assert.match(restored.get("#toast-region").textContent, /shared schedule loaded for this session/i);
  assert.equal(restored.window.location.hash, "", "accepting the shared schedule consumes the link fragment");
  restored.setRoom("N211");
  await restored.get("#period-form").trigger("input");
  assert.equal(restored.window.location.hash, "");
  assert.equal(restored.readCookie(draftCookie)!.periods[0].room, "N211");
});

test("invalid saved and shared data cannot break initialization", async () => {
  const h = await harness({ renderOnStart: false, hash: "#schedule=%7Bbroken", cookies: {
    [draftCookie]: { version: 1, periods: [{ room: "N214" }] },
    [templateCookie]: [{ name: "Bad data", periods: [null] }],
  } });
  assert.equal(h.get("#template-select").children.length, 0);
  assert.equal(h.readCookie(draftCookie), null);
  h.setRoom("N214");
  h.io.render = async () => response(resultFor("N214"));
  await h.submit();
  h.assertGeneratedMap(imagePathFor("N214"));
});

test("blocked cookies report save failures while map generation remains available", async () => {
  const h = await harness({ cookieWrites: false });
  await h.get("#period-form").trigger("input");
  assert.match(h.get("#toast-region").textContent, /Draft could not be saved/);
  await h.saveTemplate();
  assert.match(h.get("#template-message").textContent, /could not be saved/);
  assert.equal(h.get("#template-dialog").open, true);
  await h.submit();
  h.assertGeneratedMap(imagePathFor("M3"));
});

test("repeated classrooms render to one PNG without an extra warning or DOM markers", async () => {
  const h = await harness();
  h.setRoom("n214", 0, "#e11d48");
  h.setRoom("N214", 1, "#0284c7");
  await h.get("#period-form").trigger("input");
  const indexHtml = readFileSync(join(ROOT, "web/index.html"), "utf8");
  assert.doesNotMatch(indexHtml, /id="warning"|room-markers|room-tooltips|room-evacuation/);
  const result = resultFor("N214");
  result.selected[0].color = "#e11d48";
  result.selected.push({ ...result.selected[0], period: 2, color: "#0284c7" });
  h.io.render = async () => response(result);
  await h.submit();
  h.assertGeneratedMap(imagePathFor("N214"));
});

test("blank periods are allowed and only filled rooms are sent for map generation", async () => {
  const h = await harness({ renderOnStart: false });
  h.setRoom("N214");
  let submitted: Period[] = [];
  h.io.render = async options => {
    submitted = JSON.parse(options.body).periods as Period[];
    return response(resultFor("N214"));
  };
  await h.submit();
  assert.equal(submitted.length, 7);
  assert.equal(submitted[0].room, "N214");
  assert.ok(submitted.slice(1).every(period => period.room === "" && period.building === ""));
  h.assertGeneratedMap(imagePathFor("N214"));
});

test("repeated Generate Map submissions share one pending render", async () => {
  const h = await harness();
  h.setRoom("N214");
  await h.get("#period-form").trigger("input");
  const pending = deferred<TestResponse>();
  let requests = 0;
  h.io.render = () => { requests += 1; return pending.promise; };
  const firstSubmission = h.submit();
  const secondSubmission = h.submit();
  assert.equal(requests, 1);
  pending.resolve(response(resultFor("N214")));
  await Promise.all([firstSubmission, secondSubmission]);
  h.assertGeneratedMap(imagePathFor("N214"));
});

test("editing during a pending render never navigates to its stale image", async () => {
  const h = await harness();
  const previousNavigation = h.lastNavigation;
  await h.get("#period-form").trigger("input");
  const pending = deferred<TestResponse>();
  h.io.render = () => pending.promise;
  const submission = h.submit();
  h.setRoom("N214");
  await h.get("#period-form").trigger("input");
  pending.resolve(response(resultFor("M3")));
  await submission;
  h.assertCleared();
  assert.equal(h.lastNavigation, previousNavigation);
});

test("template dialogs allow cancellation and require an explicit delete confirmation", async () => {
  const h = await harness();
  await h.get("#save-template-button").trigger("click");
  assert.equal(h.get("#template-name").value, "Schedule 1");
  await h.get("#cancel-template-button").trigger("click");
  assert.equal(h.get("#template-dialog").open, false);
  assert.equal(h.readCookie(templateCookie), null);
  await h.saveTemplate("   ");
  assert.match(h.get("#template-message").textContent, /Enter a name/);
  assert.equal(h.get("#template-dialog").open, true);
  h.get("#template-name").value = "Monday";
  await h.get("#template-form").trigger("submit");
  assert.equal(h.get("#template-dialog").open, false);
  assert.equal(h.get("#toast-region").textContent, "Monday saved.");
  assert.equal(h.get("#toast-region").classList.contains("is-visible"), true);
  await h.get("#delete-template-button").trigger("click");
  await h.get("#cancel-delete-template-button").trigger("click");
  assert.equal(h.get("#delete-template-dialog").open, false);
  assert.equal(h.readCookie(templateCookie)!.length, 1);
});
