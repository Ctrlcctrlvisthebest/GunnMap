export {};

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing evacuation page element: ${selector}`);
  return element;
}

const viewport = requiredElement<HTMLDivElement>("#evacuation-viewport");
const evacuationImage = requiredElement<HTMLImageElement>("#evacuation-image");
const zoomIn = requiredElement<HTMLButtonElement>("#zoom-in");
const zoomOut = requiredElement<HTMLButtonElement>("#zoom-out");
const zoomFit = requiredElement<HTMLButtonElement>("#zoom-fit");
const zoomLevel = requiredElement<HTMLOutputElement>("#zoom-level");
const zoomControls = requiredElement<HTMLDivElement>("#zoom-controls");
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
let zoomIndex = 0;

function setZoom(nextIndex: number): void {
  const oldScale = ZOOM_STEPS[zoomIndex];
  zoomIndex = Math.max(0, Math.min(nextIndex, ZOOM_STEPS.length - 1));
  const scale = ZOOM_STEPS[zoomIndex];
  // Keep the currently visible map center in view when changing the scale.
  const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
  const centerY = viewport.scrollTop + viewport.clientHeight / 2;
  evacuationImage.style.width = `${scale * 100}%`;
  viewport.scrollLeft = centerX * scale / oldScale - viewport.clientWidth / 2;
  viewport.scrollTop = centerY * scale / oldScale - viewport.clientHeight / 2;
  zoomLevel.value = `${scale * 100}%`;
  zoomOut.disabled = zoomIndex === 0;
  zoomIn.disabled = zoomIndex === ZOOM_STEPS.length - 1;
  if (zoomIndex === 0) viewport.scrollTo(0, 0);
}

zoomIn.addEventListener("click", () => setZoom(zoomIndex + 1));
zoomOut.addEventListener("click", () => setZoom(zoomIndex - 1));
zoomFit.addEventListener("click", () => setZoom(0));
zoomControls.hidden = false;
