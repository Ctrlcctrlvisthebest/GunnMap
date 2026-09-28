import { useEffect } from "react";
import type { RefObject } from "react";
import Panzoom from "@panzoom/panzoom";
import { setBoundedImageTransform } from "./map-pan-bounds.js";

interface UsePanzoomOptions {
  active: boolean;
  fit?: boolean;
  focus?: { x: number; y: number; scale?: number };
  sourceKey?: string;
}

export function usePanzoom(
  stage: RefObject<HTMLElement | null>,
  art: RefObject<HTMLElement | null>,
  image: RefObject<HTMLImageElement | null>,
  { active, fit = false, focus, sourceKey }: UsePanzoomOptions,
) {
  useEffect(() => {
    const viewport = stage.current;
    const artwork = art.current;
    const mapImage = image.current;
    if (!active || !viewport || !artwork || !mapImage) return;
    let instance: ReturnType<typeof Panzoom> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let wheelListener: ((event: WheelEvent) => void) | null = null;

    const destroyPanzoom = () => {
      if (wheelListener) viewport.removeEventListener("wheel", wheelListener);
      wheelListener = null;
      instance?.destroy();
      instance = null;
    };

    const initialize = () => {
      if (!mapImage.naturalWidth || !mapImage.naturalHeight || !viewport.clientWidth || !viewport.clientHeight) return;
      destroyPanzoom();
      if (fit) {
        const style = window.getComputedStyle(viewport);
        const width = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const height = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const scale = Math.min(width / mapImage.naturalWidth, height / mapImage.naturalHeight);
        artwork.style.width = `${Math.round(mapImage.naturalWidth * scale)}px`;
        artwork.style.height = `${Math.round(mapImage.naturalHeight * scale)}px`;
      }
      instance = Panzoom(artwork, {
        canvas: true,
        minScale: 1,
        maxScale: 7,
        startScale: 1,
        panOnlyWhenZoomed: true,
        pinchAndPan: true,
        setTransform: (element, values) => {
          const bounded = setBoundedImageTransform(element as HTMLElement, viewport, values);
          if (bounded.x !== values.x || bounded.y !== values.y) {
            requestAnimationFrame(() => instance?.pan(bounded.x, bounded.y, { animate: false, relative: false }));
          }
        },
        touchAction: "none",
        cursor: "grab",
      });
      wheelListener = instance.zoomWithWheel;
      viewport.addEventListener("wheel", wheelListener, { passive: false });
      if (focus && !fit) {
        const active = instance;
        active.zoom(focus.scale ?? 2, { animate: false });
        requestAnimationFrame(() => {
          if (instance !== active) return;
          const targetX = focus.x * artwork.clientWidth;
          const targetY = focus.y * artwork.clientHeight;
          active.pan(
            artwork.clientWidth / 2 - targetX,
            artwork.clientHeight / 2 - targetY,
            { animate: false, relative: false },
          );
        });
      }
    };

    if (mapImage.complete && mapImage.naturalWidth) initialize();
    else mapImage.addEventListener("load", initialize, { once: true });
    resizeObserver = new ResizeObserver(() => {
      if (!mapImage.naturalWidth) return;
      if (fit) destroyPanzoom();
      initialize();
    });
    resizeObserver.observe(viewport);

    return () => {
      mapImage.removeEventListener("load", initialize);
      resizeObserver?.disconnect();
      destroyPanzoom();
    };
  }, [active, art, fit, focus?.x, focus?.y, focus?.scale, image, sourceKey, stage]);
}
