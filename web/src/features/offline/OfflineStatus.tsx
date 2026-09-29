import { useEffect, useRef, useState } from 'react';

export function OfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [ready, setReady] = useState(() => Boolean(navigator.serviceWorker?.controller));
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [failed, setFailed] = useState(false);
  const reloading = useRef(false);
  useEffect(() => {
    const connected = () => setOnline(true), disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    let active = true;
    let controlled = Boolean(navigator.serviceWorker?.controller);
    const workerChanged = () => {
      const nextControlled = Boolean(navigator.serviceWorker?.controller);
      // An update activated in another tab also replaces this tab's cached build.
      // Initial installation may claim the page without requiring a reload.
      if (nextControlled && (controlled || reloading.current)) window.location.reload();
      controlled = nextControlled;
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'GUNNMAP_OFFLINE') setOnline(false);
      else if (event.data?.type === 'GUNNMAP_ONLINE') setOnline(true);
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', message);
      navigator.serviceWorker.addEventListener('controllerchange', workerChanged);
    }
    const register = async () => {
      if (!('serviceWorker' in navigator)) {setFailed(true); return;}
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'});
        if (!active) return;
        setReady(Boolean(registration.active));
        setWaiting(registration.waiting);
        const observe = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (!active) return;
            if (worker.state === 'activated') setReady(true);
            if (worker.state === 'installed' && registration.active) setWaiting(worker);
            if (worker.state === 'redundant' && !registration.active) setFailed(true);
          });
        };
        observe(registration.installing);
        registration.addEventListener('updatefound', () => observe(registration.installing));
      } catch {if (active) setFailed(true);}
    };
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Initial precaching competes with the first route's scripts and room list.
    // Existing workers check for updates immediately; new installs wait for idle.
    if (controlled) void register();
    else if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => { void register(); }, { timeout: 1500 });
    else timer = setTimeout(() => { void register(); }, 500);
    return () => {
      active = false;
      if (idle !== undefined) window.cancelIdleCallback(idle);
      clearTimeout(timer);
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
      navigator.serviceWorker?.removeEventListener('message', message);
      navigator.serviceWorker?.removeEventListener('controllerchange', workerChanged);
    };
  }, []);
  return <aside className={`offline-status${online ? '' : ' is-offline'}`} aria-label="Offline availability">
    <p role="status">{!online
      ? 'Offline: downloaded campus maps and classroom information are available. Reconnect to generate a new map.'
      : failed ? 'Offline setup is unavailable. You can download maps as PNGs.'
        : ready ? 'Campus maps are available offline on this device.' : 'Preparing campus maps for offline use…'}</p>
    {waiting && <button type="button" className="text-button" onClick={() => {
      reloading.current = true;
      waiting.postMessage({type: 'ACTIVATE_UPDATE'});
    }}>Update available · Reload</button>}
  </aside>;
}
