const viewport = document.querySelector("#evacuation-viewport");
const evacuationImage = document.querySelector("#evacuation-image");
const zoomIn = document.querySelector("#zoom-in");
const zoomOut = document.querySelector("#zoom-out");
const zoomFit = document.querySelector("#zoom-fit");
const zoomLevel = document.querySelector("#zoom-level");
const ZOOM_STEPS = [1, 1.5, 2, 3, 4];
let zoomIndex = 0;

function setZoom(nextIndex) {
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
document.querySelector("#zoom-controls").hidden = false;
