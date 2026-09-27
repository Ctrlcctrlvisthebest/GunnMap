import Panzoom from "@panzoom/panzoom";

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing evacuation page element: ${selector}`);
  return element;
}

const mapOpenButton = requiredElement<HTMLButtonElement>("#evacuation-map-open");
const mapFullSizeButton = requiredElement<HTMLButtonElement>("#evacuation-map-fullsize");
const infoOpenButton = requiredElement<HTMLButtonElement>("#map-info-open");
const infoDialog = requiredElement<HTMLDialogElement>("#map-info-dialog");
const mapDialog = requiredElement<HTMLDialogElement>("#evacuation-map-dialog");
const mapStage = requiredElement<HTMLDivElement>("#evacuation-map-stage");
const mapImage = requiredElement<HTMLImageElement>("#evacuation-viewer-image");

let panzoom: ReturnType<typeof Panzoom> | null = null;
let wheelListener: ((event: WheelEvent) => void) | null = null;
let mapPanListener: ((event: Event) => void) | null = null;
let stageResizeObserver: ResizeObserver | null = null;

function fitMapToStage() {
  const { naturalWidth, naturalHeight } = mapImage;
  const width = mapStage.clientWidth;
  const height = mapStage.clientHeight;
  if (!naturalWidth || !naturalHeight || !width || !height) return;
  const scale = Math.min(width / naturalWidth, height / naturalHeight);
  mapImage.style.width = `${Math.round(naturalWidth * scale)}px`;
  mapImage.style.height = `${Math.round(naturalHeight * scale)}px`;
}

function clearPanzoom() {
  stageResizeObserver?.disconnect();
  stageResizeObserver = null;
  if (mapPanListener) {
    mapImage.removeEventListener("panzoomchange", mapPanListener);
    mapPanListener = null;
  }
  if (panzoom) {
    panzoom.reset({ animate: false });
    panzoom.destroy();
    panzoom = null;
  }
  if (wheelListener) {
    mapStage.removeEventListener("wheel", wheelListener);
    wheelListener = null;
  }
}

function keepMapInsideViewer(event: Event) {
  if (!panzoom) return;
  const { x, y, scale } = (event as CustomEvent<{ x: number; y: number; scale: number }>).detail;
  const maxX = Math.max(0, (mapImage.offsetWidth * scale - mapStage.clientWidth) / (2 * scale));
  const maxY = Math.max(0, (mapImage.offsetHeight * scale - mapStage.clientHeight) / (2 * scale));
  const boundedX = Math.max(-maxX, Math.min(maxX, x));
  const boundedY = Math.max(-maxY, Math.min(maxY, y));
  if (boundedX !== x || boundedY !== y) panzoom.pan(boundedX, boundedY, { animate: false });
}

function initializePanzoom() {
  clearPanzoom();
  fitMapToStage();
  panzoom = Panzoom(mapImage, {
    canvas: true,
    minScale: 1,
    maxScale: 7,
    startScale: 1,
    panOnlyWhenZoomed: true,
    pinchAndPan: true,
    touchAction: "none",
    cursor: "grab",
  });
  mapPanListener = keepMapInsideViewer;
  mapImage.addEventListener("panzoomchange", mapPanListener);
  wheelListener = panzoom.zoomWithWheel;
  mapStage.addEventListener("wheel", wheelListener, { passive: false });
  stageResizeObserver = new ResizeObserver(() => {
    fitMapToStage();
    panzoom?.reset({ animate: false });
  });
  stageResizeObserver.observe(mapStage);
}

function openMapViewer() {
  mapDialog.showModal();
  if (mapImage.complete && mapImage.naturalWidth) {
    requestAnimationFrame(initializePanzoom);
  } else {
    mapImage.addEventListener("load", initializePanzoom, { once: true });
  }
}

mapOpenButton.addEventListener("click", openMapViewer);
mapFullSizeButton.addEventListener("click", openMapViewer);
infoOpenButton.addEventListener("click", () => infoDialog.showModal());
mapDialog.addEventListener("close", clearPanzoom);
mapDialog.addEventListener("click", (event) => {
  if (event.target === mapDialog) mapDialog.close();
});
infoDialog.addEventListener("click", (event) => {
  if (event.target === infoDialog) infoDialog.close();
});
