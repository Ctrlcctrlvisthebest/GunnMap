// Execute the real frontend against a small DOM and controllable async I/O.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.fields = new Map();
    this.events = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.value = "";
    this.textContent = "";
    this.open = false;
    this.clicks = 0;
    this.clientWidth = 800;
    this.clientHeight = 518;
    this.offsetWidth = this.offsetHeight = 36;
    this.style = { setProperty(name, value) { this[name] = value; } };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const add = force === undefined ? !classes.has(name) : force;
        if (add) classes.add(name); else classes.delete(name);
        return add;
      },
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  insertBefore(child) { this.children.unshift(child); }
  set innerHTML(value) {
    const color = value.match(/type="color" value="([^"]+)"/);
    if (color) this.querySelector('input[type="color"]').value = color[1];
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return name === "src" ? this.src : this.attributes.get(name); }
  querySelector(selector) {
    if (!this.fields.has(selector)) this.fields.set(selector, new Element());
    return this.fields.get(selector);
  }
  querySelectorAll() { return this.children; }
  addEventListener(type, listener) {
    if (!this.events.has(type)) this.events.set(type, []);
    this.events.get(type).push(listener);
  }
  trigger(type) {
    return Promise.all((this.events.get(type) || []).map(fn => fn({ preventDefault() {} })));
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
  select() {}
  focus() {}
  click() { this.clicks += 1; return this.trigger("click"); }
}

const inventory = JSON.parse(readFileSync(join(__dirname, "room_regions.json"))).rooms;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const response = (data, ok = true) => ({ ok, json: async () => data });
function resultFor(label) {
  const room = inventory.find(item => item.label === label);
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
const scheduleFor = (label) => {
  const periods = blankPeriods();
  periods[0] = { building: label[0].toUpperCase(), room: label, color: "#0284c7" };
  return periods;
};

async function harness({ renderOnStart = true, cookies = {}, hash = "", cookieWrites = true } = {}) {
  const document = new Element();
  document.createElement = document.createElementNS = () => new Element();
  const cookieJar = new Map(Object.entries(cookies).map(([name, value]) => [name, encodeURIComponent(JSON.stringify(value))]));
  Object.defineProperty(document, "cookie", {
    get: () => [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; "),
    set: value => {
      if (!cookieWrites) return;
      const [entry] = value.split(";");
      const index = entry.indexOf("=");
      const name = entry.slice(0, index);
      if (value.includes("max-age=0")) cookieJar.delete(name);
      else cookieJar.set(name, entry.slice(index + 1));
    },
  });
  const get = selector => document.querySelector(selector);
  get("#map-image").src = "/map.png";
  get("#download-link").classList.add("is-disabled");
  const io = { render: async () => response(resultFor("M3")), decode: async () => {}, clipboard: "" };
  const window = {
    matchMedia: () => ({ matches: false }),
    location: new URL(`http://localhost:8765/${hash}`),
    history: { replaceState(_state, _title, url) { window.location = new URL(url, window.location); } },
    open() {},
  };
  vm.runInNewContext(readFileSync(join(__dirname, "web/app.js"), "utf8"), {
    document, URLSearchParams, requestAnimationFrame: () => 1,
    ResizeObserver: class { observe() {} },
    Image: class { decode() { return io.decode(); } },
    Option: class extends Element { constructor(text, value) { super(); this.textContent = text; this.value = value; } },
    window,
    navigator: { clipboard: { writeText: async text => { io.clipboard = text; } } },
    fetch: async (url, options) => url === "/api/rooms"
      ? response({ rooms: inventory, buildings: [...new Set(inventory.map(room => room.building))] })
      : io.render(options),
  }, { filename: "web/app.js" });
  await tick();
  assert.equal(get("#period-list").children.length, 7);
  const setRoom = (label, index = 0, color = "#0284c7") => {
    const card = get("#period-list").children[index];
    card.querySelector("select").value = label[0].toUpperCase();
    card.querySelector('input[type="text"]').value = label;
    card.querySelector('input[type="color"]').value = color;
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
  };
  if (renderOnStart) {
    setRoom("M3");
    await submit();
    assert.equal(get("#room-markers").children.length, 1);
    assert.equal(get("#map-image").src, "/output/M3.png");
  }
  const readCookie = name => cookieJar.has(name) ? JSON.parse(decodeURIComponent(cookieJar.get(name))) : null;
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
  assert.match(h.get("#status").textContent, /Example loaded/);
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
  const pending = deferred();
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
  assert.equal(h.readCookie(templateCookie).length, 1);
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
  assert.equal(h.readCookie(draftCookie).periods[0].room, "N214");
  h.assertCleared();
  await h.get("#delete-template-button").trigger("click");
  assert.equal(h.get("#delete-template-dialog").open, true);
  assert.equal(h.readCookie(templateCookie).length, 1);
  await h.get("#delete-template-form").trigger("submit");
  assert.deepEqual(h.readCookie(templateCookie), []);
  assert.equal(h.get("#delete-template-button").disabled, true);
  assert.equal(h.readPeriods()[0].room, "N214");
});

test("template loads discard old render responses as well as rendered markers", async () => {
  const h = await harness({ cookies: { [templateCookie]: [{ name: "Field", periods: scheduleFor("N214") }] } });
  const pending = deferred();
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
  assert.equal(restored.readCookie(draftCookie).periods[0].room, "N211");
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
  const pending = deferred();
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
  const pending = deferred();
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
  await h.get("#delete-template-button").trigger("click");
  await h.get("#cancel-delete-template-button").trigger("click");
  assert.equal(h.get("#delete-template-dialog").open, false);
  assert.equal(h.readCookie(templateCookie).length, 1);
});
