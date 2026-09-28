import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GENERATED_MAP_SESSION_KEY } from "../features/schedule/schedule-storage.js";
import { usePanzoom } from "../features/maps/usePanzoom.js";

const imagePattern = /^\/output\/period_map_[0-9a-f]{32}\.png$/i;

function savedImagePath() {
  try {
    const saved = window.sessionStorage.getItem(GENERATED_MAP_SESSION_KEY) ?? "";
    return imagePattern.test(saved) ? saved : "";
  } catch {
    return "";
  }
}

export function GeneratedMapPage() {
  const [searchParams] = useSearchParams();
  const queryImage = searchParams.get("image") ?? "";
  const [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const validQueryImage = imagePattern.test(queryImage);
  const imagePath = savedImagePath();
  const source = validQueryImage ? queryImage : imagePath;

  useEffect(() => {
    setFailed(false);
  }, [source]);

  usePanzoom(stage, art, image, {
    active: Boolean(source) && !failed,
    fit: true,
    sourceKey: source,
  });

  return (
    <main id="main-content" className="generated-map-layout" tabIndex={-1}>
      <section className="panel generated-map-panel" aria-labelledby="generated-map-title">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">MAP PREVIEW</div>
            <h1 id="generated-map-title">Your campus map</h1>
          </div>
          {source && !failed && (
            <div className="generated-map-actions">
              <a
                className="download-link"
                href={source}
                download="gunn-period-map.png"
              >
                Download PNG
              </a>
              <Link className="download-link" to="/">
                Edit schedule
              </Link>
            </div>
          )}
        </div>
        {source && !failed ? <>
          <p className="map-help">Drag to move · Scroll or pinch to zoom</p>
          <div className="generated-map-content">
            <div
              ref={stage}
              className="generated-map-stage"
              role="region"
              aria-label="Zoomable schedule map"
              tabIndex={0}
            >
              <div ref={art} className="generated-map-art">
                <img
                  ref={image}
                  src={source}
                  alt="Gunn campus map with your schedule rooms highlighted"
                  onError={() => setFailed(true)}
                />
              </div>
            </div>
          </div>
        </> : (
          <div className="generated-map-empty">
            <p>Generate a map from your schedule to view it here.</p>
            <Link className="primary-button" to="/">
              Go to Schedule Map
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
