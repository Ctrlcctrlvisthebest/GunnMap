export interface KeyboardMapInstance {
  getScale(): number;
  zoomIn(options: { animate: boolean }): unknown;
  zoomOut(options: { animate: boolean }): unknown;
  reset(options: { animate: boolean }): unknown;
  pan(x: number, y: number, options: { relative: boolean; animate: boolean }): unknown;
}

/** Only handle keys on the map viewport, leaving its interactive overlays alone. */
export function handleMapKeydown(
  event: KeyboardEvent,
  viewport: EventTarget,
  instance: KeyboardMapInstance | null,
) {
  if (!instance || event.target !== viewport || event.defaultPrevented
    || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
  const options = { animate: false };
  const distance = (event.shiftKey ? 160 : 64) / instance.getScale();
  switch (event.key) {
    case "+":
    case "=": instance.zoomIn(options); break;
    case "-":
    case "_": instance.zoomOut(options); break;
    case "0":
    case "Home": instance.reset(options); break;
    case "ArrowLeft": instance.pan(-distance, 0, { ...options, relative: true }); break;
    case "ArrowRight": instance.pan(distance, 0, { ...options, relative: true }); break;
    case "ArrowUp": instance.pan(0, -distance, { ...options, relative: true }); break;
    case "ArrowDown": instance.pan(0, distance, { ...options, relative: true }); break;
    default: return false;
  }
  event.preventDefault();
  return true;
}
