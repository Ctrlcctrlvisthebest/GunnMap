// Execute the real TypeScript frontend against a small DOM and controllable async I/O.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { ROOT, rooms as inventory } from "./project.js";

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
    image_url: `/output/${label}.png`, warnings: [], map_size: [2448, 1584],
    selected: [{
      ...room, period: 1, color: "#0284c7", marker: [1663.5, 574.5],
      evacuation: { status: "mapped", group: label === "M3" ? "blue" : "black",
        destination: label === "M3" ? "Blue assembly area" : "Football field", focus: null },
    }],
  };
}

const draftCookie = "gunnmap_schedule_draft";
const templateCookie = "gunnmap_schedule_templates";
const blankPeriods = () => Array.from({ length: 7 }, () => ({ building: "", room: "", color: "#0284c7" }));
const scheduleFor = (label: string) => {
  const periods = blankPeriods();
  periods[0] = { building: label[0].toUpperCase(), room: label, color: "#0284c7" };
  return periods;
};

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
  get("#map-image").src = "/map.png";
  get("#download-link").classList.add("is-disabled");
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const io: { render: (options: RenderRequest) => Promise<TestResponse>; decode: () => Promise<void>; clipboard: string } = { render: async () => response(resultFor("M3")), decode: async () => {}, clipboard: "" };
  const window = {
    matchMedia: () => ({ matches: false }),
    location: new URL(`http://localhost:8765/${hash}`),
    history: { replaceState(_state: unknown, _title: string, url: string | URL) { window.location = new URL(url, window.location); } },
    setTimeout(callback: () => void) { timerId += 1; timers.set(timerId, callback); return timerId; },
    clearTimeout(id: number) { timers.delete(id); },
    open() {},
  };
  vm.runInNewContext(frontendCode, {
    exports: {},
    require: (name: string) => {
      assert.equal(name, "./period-editor.js");
      return { mountPeriodEditor };
    },
    document, URLSearchParams, requestAnimationFrame: () => 1,
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
    for (const selector of ["#room-markers", "#room-hit-areas", "#legend"]) {
      assert.equal(get(selector).children.length, 0, `${selector} still contains old room data`);
    }
    assert.equal(get("#map-image").src, "/map.png");
    assert.equal(get("#download-link").getAttribute("aria-disabled"), "true");
    assert.equal(get("#room-click-help").hidden, true);
    assert.equal(get("#room-evacuation").open, false);
    assert.equal(get("#map-preview-dialog").open, false);
  };
  if (renderOnStart) {
    setRoom("M3");
    await submit();
    assert.equal(get("#room-markers").children.length, 1);
    assert.equal(get("#map-image").src, "/output/M3.png");
    assert.equal(get("#map-preview-dialog").open, true);
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
  return { get, io, window, readCookie, readPeriods, setRoom, submit, assertCleared, saveTemplate };
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
  test(`${event} clears old M3 details before N214 is regenerated`, async () => {
    const h = await harness();
    await h.get("#room-markers").children[0].trigger("click");
    assert.equal(h.get("#assembly-destination").textContent, "Blue assembly area");
    h.setRoom("n214");
    await h.get("#period-form").trigger(event);
    h.assertCleared();
    h.io.render = async options => {
      assert.equal(JSON.parse(options.body).periods[0].room, "n214");
      return response(resultFor("N214"));
    };
    await h.submit();
    await h.get("#room-markers").children[0].trigger("click");
    assert.equal(h.get("#assembly-destination").textContent, "Football field");
  });
}

test("loading the example clears the previous clickable map", async () => {
  const h = await harness();
  await h.get("#sample-button").trigger("click");
  h.assertCleared();
  assert.match(h.get("#toast-region").textContent, /Example loaded/);
});

test("failed regeneration never leaves old room targets or downloads", async () => {
  const h = await harness();
  h.io.render = async () => response({ error: "Room not found" }, false);
  await h.submit();
  h.assertCleared();
  assert.equal(h.get("#status").textContent, "Room not found");
  assert.equal(h.get("#status").classList.contains("error"), true);
});

test("editing while a response is pending discards the old response", async () => {
  const h = await harness();
  const pending = deferred<TestResponse>();
  h.io.render = () => pending.promise;
  const submit = h.submit();
  h.setRoom("n214");
  await h.get("#period-form").trigger("input");
  pending.resolve(response(resultFor("M3")));
  await submit;
  h.assertCleared();
  assert.match(h.get("#status").textContent, /Schedule changed/);
});

test("editing while an image decodes cannot publish its stale room markers", async () => {
  const h = await harness();
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
  assert.match(h.get("#status").textContent, /Schedule changed/);
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
  assert.match(restored.get("#draft-status").textContent, /Draft restored/);
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
  await h.get("#room-markers").children[0].trigger("click");
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

test("template loads discard old render responses as well as rendered markers", async () => {
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
  assert.deepEqual(restored.readPeriods(), h.readPeriods());
  assert.match(restored.get("#draft-status").textContent, /share link/);
  assert.match(restored.window.location.hash, /schedule=/);
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
  assert.equal(h.get("#template-select").children.length, 1);
  assert.equal(h.readCookie(draftCookie), null);
  assert.equal(h.get("#status").classList.contains("error"), false);
  h.setRoom("N214");
  await h.submit();
  assert.equal(h.get("#room-markers").children.length, 1);
});

test("blocked cookies report save failures while map generation remains available", async () => {
  const h = await harness({ cookieWrites: false });
  await h.get("#period-form").trigger("input");
  assert.equal(h.get("#draft-status").classList.contains("error"), true);
  await h.saveTemplate();
  assert.match(h.get("#template-message").textContent, /could not be saved/);
  assert.equal(h.get("#template-dialog").open, true);
  await h.submit();
  assert.equal(h.get("#room-markers").children.length, 1);
});

test("repeated classrooms use one multicolor target and each legend opens all periods", async () => {
  const h = await harness();
  h.setRoom("n214", 0, "#e11d48");
  h.setRoom("N214", 1, "#0284c7");
  await h.get("#period-form").trigger("input");
  assert.match(h.get("#warning").textContent, /Periods 1, 2 share N214/);
  const result = resultFor("N214");
  result.selected[0].color = "#e11d48";
  result.selected.push({ ...result.selected[0], period: 2, color: "#0284c7" });
  h.io.render = async () => response(result);
  await h.submit();
  assert.equal(h.get("#room-markers").children.length, 1);
  assert.equal(h.get("#room-hit-areas").children.length, 1);
  const marker = h.get("#room-markers").children[0];
  assert.equal(marker.children[0].textContent, "1/2");
  assert.match(marker.style["--period-colors"], /#e11d48 0% 50%, #0284c7 50% 100%/);
  assert.equal(h.get("#legend").children.length, 2);
  await h.get("#legend").children[1].trigger("click");
  assert.equal(h.get("#room-dialog-periods").textContent, "Periods 1, 2");
  assert.equal(h.get("#assembly-destination").textContent, "Football field");
});

test("download generates a current PNG once even while Generate Map is pending", async () => {
  const h = await harness();
  h.setRoom("N214");
  await h.get("#period-form").trigger("input");
  const pending = deferred<TestResponse>();
  let requests = 0;
  h.io.render = () => { requests += 1; return pending.promise; };
  const submission = h.submit();
  const download = h.get("#download-link").trigger("click");
  await h.get("#download-link").trigger("click");
  assert.equal(requests, 1);
  pending.resolve(response(resultFor("N214")));
  await Promise.all([submission, download]);
  assert.equal(h.get("#download-link").clicks, 1);
  assert.equal(h.get("#download-link").href, "/output/N214.png");
});

test("editing during automatic download never downloads the stale image", async () => {
  const h = await harness();
  await h.get("#period-form").trigger("input");
  const pending = deferred<TestResponse>();
  h.io.render = () => pending.promise;
  const download = h.get("#download-link").trigger("click");
  h.setRoom("N214");
  await h.get("#period-form").trigger("input");
  pending.resolve(response(resultFor("M3")));
  await download;
  h.assertCleared();
  assert.equal(h.get("#download-link").clicks, 0);
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
