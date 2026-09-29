import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';

test('a mounted offline status reloads controlled tabs on activation but not on first installation', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'https://gunnmap.test/'});
  const bindings = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const originals = new Map(bindings.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let reloads = 0;
  // The real component mounts in jsdom; only navigation and service-worker I/O
  // are substituted because jsdom implements neither browser capability.
  const browserWindow = new Proxy(dom.window, {
    get(target, key) {
      if (key === 'location') return {reload: () => {reloads++;}};
      if (key === 'addEventListener') return target.addEventListener.bind(target);
      if (key === 'removeEventListener') return target.removeEventListener.bind(target);
      return Reflect.get(target, key, target);
    },
  });
  const globals = {window: browserWindow, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true};
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, {configurable: true, value});
  try {
    const {createRoot} = await import('react-dom/client');
    const {OfflineStatus} = await import('../../web/src/features/offline/OfflineStatus.js');
    for (const initiallyControlled of [true, false]) {
      reloads = 0;
      const activations: unknown[] = [];
      const initialWorker = initiallyControlled ? {} : null;
      const registration = Object.assign(new dom.window.EventTarget(), {
        active: initialWorker,
        installing: null,
        waiting: initiallyControlled ? {postMessage: (message: unknown) => activations.push(message)} : null,
      });
      const serviceWorker = Object.assign(new dom.window.EventTarget(), {
        controller: initialWorker,
        register: async () => registration,
      });
      Object.defineProperty(dom.window.navigator, 'serviceWorker', {configurable: true, value: serviceWorker});
      const root = createRoot(dom.window.document.getElementById('root')!);
      try {
        await act(async () => {
          root.render(createElement(OfflineStatus));
          await new Promise<void>(resolve => setImmediate(resolve));
        });
        assert.equal(reloads, 0);
        assert.deepEqual(activations, [], 'mounting does not activate a waiting update without user action');
        serviceWorker.controller = {};
        await act(async () => {serviceWorker.dispatchEvent(new dom.window.Event('controllerchange'));});
        assert.equal(reloads, initiallyControlled ? 1 : 0, initiallyControlled
          ? 'an update activated in another tab must refresh the old page'
          : 'the initial claim must not interrupt the page');
        if (!initiallyControlled) {
          serviceWorker.controller = {};
          await act(async () => {serviceWorker.dispatchEvent(new dom.window.Event('controllerchange'));});
          assert.equal(reloads, 1, 'a later update still refreshes a page that was claimed after its first install');
        }
      } finally { await act(async () => {root.unmount();}); }
    }
  } finally {
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
