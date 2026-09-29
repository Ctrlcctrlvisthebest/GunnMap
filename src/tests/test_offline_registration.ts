import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';

test('first-install precaching waits for idle and cancelled pages never register a worker', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'https://gunnmap.test/'});
  const globals = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true};
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, {configurable: true, value});
  let idle: (() => void) | undefined;
  let cancelled = 0;
  let registrations = 0;
  Object.defineProperty(dom.window, 'requestIdleCallback', {value: (callback: () => void, options: IdleRequestOptions) => {
    assert.equal(options.timeout, 1500);
    idle = callback;
    return 1;
  }});
  Object.defineProperty(dom.window, 'cancelIdleCallback', {value: () => { cancelled++; idle = undefined; }});
  const registration = Object.assign(new dom.window.EventTarget(), {active: {}, installing: null, waiting: null});
  const serviceWorker = Object.assign(new dom.window.EventTarget(), {
    controller: null,
    register: async () => { registrations++; return registration; },
  });
  Object.defineProperty(dom.window.navigator, 'serviceWorker', {configurable: true, value: serviceWorker});
  try {
    const {createRoot} = await import('react-dom/client');
    const {OfflineStatus} = await import('../../web/src/features/offline/OfflineStatus.js');
    for (const runIdle of [false, true]) {
      const root = createRoot(document.querySelector('#root')!);
      try {
        await act(async () => { root.render(createElement(OfflineStatus)); });
        assert.equal(registrations, 0, 'mounting the first screen must not start precaching immediately');
        assert.ok(idle);
        if (runIdle) {
          await act(async () => { idle!(); await new Promise<void>(resolve => setImmediate(resolve)); });
          assert.equal(registrations, 1);
          assert.match(document.body.textContent!, /available offline on this device/);
        }
      } finally { await act(async () => { root.unmount(); }); }
      assert.equal(idle, undefined);
    }
    assert.equal(cancelled, 2);
  } finally {
    dom.window.close();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
