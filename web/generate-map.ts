import "./site-shell.js";
import Panzoom from "@panzoom/panzoom";
import { setBoundedImageTransform } from "./map-pan-bounds.js";

function query<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing generated map element: ${selector}`);
  return element;
}

const GENERATED_MAP_SESSION_KEY = "gunnmap_generated_map";
const IMAGE_PATH = /^\/output\/period_map_[0-9a-f]{32}\.png$/i;
const content = query<HTMLDivElement>("#generated-map-content");
const emptyState = query<HTMLDivElement>("#generated-map-empty");
const help = query<HTMLParagraphElement>("#generated-map-help");
const stage = query<HTMLDivElement>("#generated-map-stage");
const art = query<HTMLDivElement>("#generated-map-art");
const image = query<HTMLImageElement>("#generated-map-image");
const download = query<HTMLAnchorElement>("#generated-map-download");

let panzoom: ReturnType<typeof Panzoom> | null = null;
let wheelListener: ((event: WheelEvent) => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

function savedImagePath() {
  const requested = new URLSearchParams(window.location.search).get("image") ?? "";
  if (IMAGE_PATH.test(requested)) return requested;
  try {
    const saved = window.sessionStorage.getItem(GENERATED_MAP_SESSION_KEY) ?? "";
    return IMAGE_PATH.test(saved) ? saved : "";
  } catch {
    return "";
  }
}

function fitMapToStage() {
  const { naturalWidth, naturalHeight } = image;
  const style = window.getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  if (!naturalWidth || !naturalHeight || !width || !height) return false;

  const scale = Math.min(width / naturalWidth, height / naturalHeight);
  art.style.width = `${Math.round(naturalWidth * scale)}px`;
  art.style.height = `${Math.round(naturalHeight * scale)}px`;
  return true;
}

function clearPanzoom() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (panzoom) {
    panzoom.reset({ animate: false });
    panzoom.destroy();
    panzoom = null;
  }
  if (wheelListener) {
    stage.removeEventListener("wheel", wheelListener);
    wheelListener = null;
  }
}

function initializePanzoom() {
  clearPanzoom();
  if (!fitMapToStage()) return;

  panzoom = Panzoom(art, {
    canvas: true,
    minScale: 1,
    maxScale: 7,
    startScale: 1,
    panOnlyWhenZoomed: true,
    pinchAndPan: true,
    setTransform: (element, values) => {
      const bounded = setBoundedImageTransform(element as HTMLElement, stage, values);
      if (bounded.x !== values.x || bounded.y !== values.y) {
        requestAnimationFrame(() => {
          panzoom?.pan(bounded.x, bounded.y, { animate: false, relative: false });
        });
      }
    },
    touchAction: "none",
    cursor: "grab",
  });
  wheelListener = panzoom.zoomWithWheel;
  stage.addEventListener("wheel", wheelListener, { passive: false });
  resizeObserver = new ResizeObserver(() => {
    if (!fitMapToStage()) return;
    panzoom?.reset({ animate: false });
  });
  resizeObserver.observe(stage);
}

function showEmptyState() {
  emptyState.hidden = false;
  help.hidden = true;
  content.hidden = true;
  download.hidden = true;
}

const imagePath = savedImagePath();
if (!imagePath) {
  showEmptyState();
} else {
  image.src = imagePath;
  download.href = imagePath;
  content.hidden = false;
  help.hidden = false;
  download.hidden = false;
  image.addEventListener("load", () => requestAnimationFrame(initializePanzoom), { once: true });
  image.addEventListener("error", showEmptyState, { once: true });
  if (image.complete && image.naturalWidth) requestAnimationFrame(initializePanzoom);
}

window.addEventListener("pagehide", clearPanzoom);
