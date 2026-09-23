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
    this.clientWidth = 800;
    this.clientHeight = 518;
    this.offsetWidth = this.offsetHeight = 36;
    this.style = { setProperty(name, value) { this[name] = value; } };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  insertBefore(child) { this.children.unshift(child); }
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

async function harness() {
  const document = new Element();
  document.createElement = document.createElementNS = () => new Element();
  const get = selector => document.querySelector(selector);
  get("#map-image").src = "/map.png";
  const io = { render: async () => response(resultFor("M3")), decode: async () => {} };
  vm.runInNewContext(readFileSync(join(__dirname, "web/app.js"), "utf8"), {
    document, requestAnimationFrame: () => 1,
    ResizeObserver: class { observe() {} },
    Image: class { decode() { return io.decode(); } },
    window: { matchMedia: () => ({ matches: false }) },
    fetch: async (url, options) => url === "/api/rooms"
      ? response({ rooms: inventory, buildings: [...new Set(inventory.map(room => room.building))] })
      : io.render(options),
  }, { filename: "web/app.js" });
  await tick();
  assert.equal(get("#period-list").children.length, 7);
  const setRoom = label => {
    const card = get("#period-list").children[0];
    card.querySelector("select").value = label[0].toUpperCase();
    card.querySelector('input[type="text"]').value = label;
    card.querySelector('input[type="color"]').value = "#0284c7";
  };
  setRoom("M3");
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
  await submit();
  assert.equal(get("#room-markers").children.length, 1);
  assert.equal(get("#map-image").src, "/output/M3.png");
  return { get, io, setRoom, submit, assertCleared };
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
