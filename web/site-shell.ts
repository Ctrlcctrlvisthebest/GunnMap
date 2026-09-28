const mobileViewport = window.matchMedia("(max-width: 700px)");
const scrollStorageKey = "gunnmap_navigation_scroll";

function readSavedScrollPosition(): number | null {
  try {
    const savedPosition = window.sessionStorage.getItem(scrollStorageKey);
    window.sessionStorage.removeItem(scrollStorageKey);

    if (savedPosition === null) return null;

    const scrollPosition = Number(savedPosition);
    return Number.isFinite(scrollPosition) && scrollPosition >= 0
      ? scrollPosition
      : null;
  } catch {
    return null;
  }
}

function restoreScrollPosition(scrollPosition: number): void {
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const maximumScroll = Math.max(
    0,
    scrollingElement.scrollHeight - scrollingElement.clientHeight,
  );

  if (scrollPosition > maximumScroll) {
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    spacer.dataset.brandScrollSpacer = "";
    const requiredScrollHeight = scrollPosition + scrollingElement.clientHeight;
    const extraHeight = Math.max(
      0,
      requiredScrollHeight - document.body.scrollHeight,
    ) + 32;
    spacer.style.height = `${extraHeight}px`;
    document.body.append(spacer);

    const removeSpacerAtTop = () => {
      if (window.scrollY > 0) return;
      spacer.remove();
      window.removeEventListener("scroll", removeSpacerAtTop);
    };

    window.addEventListener("scroll", removeSpacerAtTop, { passive: true });
  }

  window.scrollTo(0, scrollPosition);
  document.body.classList.remove("brand-restoring");
}

if (mobileViewport.matches) {
  const savedPosition = readSavedScrollPosition();

  if (savedPosition !== null && document.body) {
    window.history.scrollRestoration = "manual";
    document.body.classList.add("brand-restoring");

    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          restoreScrollPosition(savedPosition);
        });
      });
    };

    window.addEventListener("pageshow", restore, { once: true });
    if (document.readyState === "complete") restore();
  }

  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link || (link.target && link.target !== "_self")) return;

    const destination = new URL(link.href, window.location.href);
    if (
      destination.origin !== window.location.origin ||
      destination.pathname === window.location.pathname
    ) {
      return;
    }

    try {
      const brandHeader = document.querySelector<HTMLElement>(".site-sidebar");
      const hiddenThreshold = (brandHeader?.offsetHeight ?? 0) + 2;
      const scrollPosition = Math.min(window.scrollY, hiddenThreshold);
      window.sessionStorage.setItem(scrollStorageKey, String(scrollPosition));
    } catch {
      // Navigation still works when storage is unavailable.
    }
  });
} else {
  try {
    window.sessionStorage.removeItem(scrollStorageKey);
  } catch {
    // Ignore unavailable storage on desktop.
  }
}
