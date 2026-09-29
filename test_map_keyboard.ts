import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleMapKeydown, type KeyboardMapInstance } from './web/src/features/maps/map-keyboard.js';

function harness(scale = 2) {
  const viewport = new EventTarget();
  const calls: unknown[][] = [];
  const instance: KeyboardMapInstance = {
    getScale: () => scale,
    zoomIn: options => calls.push(['zoomIn', options]),
    zoomOut: options => calls.push(['zoomOut', options]),
    reset: options => calls.push(['reset', options]),
    pan: (x, y, options) => calls.push(['pan', x, y, options]),
  };
  const press = (key: string, extra: Partial<KeyboardEvent> = {}, target = viewport, map: KeyboardMapInstance | null = instance) => {
    const event = new Event('keydown', {cancelable: true}) as KeyboardEvent;
    Object.defineProperties(event, {
      key: {value: key}, target: {value: target},
      ...Object.fromEntries(Object.entries(extra).map(([name, value]) => [name, {value}])),
    });
    const handled = handleMapKeydown(event, viewport, map);
    return {handled, prevented: event.defaultPrevented};
  };
  return {press, calls, viewport};
}

test('focused map keyboard shortcuts zoom and reset without scrolling the page', () => {
  const map = harness();
  for (const key of ['+', '=', '-', '_', '0', 'Home']) assert.deepEqual(map.press(key), {handled: true, prevented: true});
  assert.deepEqual(map.calls.map(call => call[0]), ['zoomIn', 'zoomIn', 'zoomOut', 'zoomOut', 'reset', 'reset']);
  assert.ok(map.calls.every(call => (call[1] as {animate: boolean}).animate === false));
});

test('arrow keys pan a stable screen distance at different zoom levels', () => {
  for (const scale of [1, 2, 4]) {
    const map = harness(scale);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) map.press(key);
    assert.deepEqual(map.calls.map(call => call.slice(1, 3)), [[-64 / scale, 0], [64 / scale, 0], [0, -64 / scale], [0, 64 / scale]]);
    assert.ok(map.calls.every(call => (call[3] as {relative: boolean}).relative));
    map.press('ArrowRight', {shiftKey: true});
    assert.equal(map.calls.at(-1)?.[1], 160 / scale);
  }
});

test('map keyboard shortcuts do not intercept overlays, browser shortcuts or dialog escape', () => {
  const map = harness();
  for (const extra of [{ctrlKey: true}, {metaKey: true}, {altKey: true}, {isComposing: true}, {defaultPrevented: true}]) {
    assert.equal(map.press('+', extra).handled, false);
  }
  assert.deepEqual(map.press('ArrowRight', {}, new EventTarget()), {handled: false, prevented: false});
  assert.deepEqual(map.press('+', {}, map.viewport, null), {handled: false, prevented: false});
  for (const key of ['Escape', 'Tab', 'Enter', 'a']) assert.deepEqual(map.press(key), {handled: false, prevented: false});
  assert.deepEqual(map.calls, []);
});
