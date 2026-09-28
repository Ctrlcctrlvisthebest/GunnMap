# GunnMap UI patterns: source-backed recommendations

Researched 2026-09-26. The recommendations below apply official accessibility guidance and platform patterns to GunnMap; where the sources do not prescribe one exact layout, the recommendation is marked as a design inference.

## Skip to Content

Keep the skip link as the first keyboard-accessible item so keyboard users can bypass repeated navigation. It may be visually hidden until focused, but must become clearly visible and move focus to the main content when activated ([W3C WAI: Skip Link](https://www.w3.org/WAI/test-evaluate/easy-checks/skip-link/), [Technique G1](https://www.w3.org/WAI/WCAG21/Techniques/general/G1)). If it appears after tapping a nav link, inspect whether its reveal style uses `:focus` for pointer focus; use `:focus-visible`, which differentiates when a focus indicator is useful by input modality, while preserving the link for keyboard users ([MDN `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/%3Afocus-visible)). The source guidance supports visibility on keyboard focus; the exact cause on GunnMap needs code verification.

## Page-to-page navigation motion

Cross-document View Transitions capture old and new snapshots for elements with matching, unique `view-transition-name` values. The default page transition is a cross-fade; a shared site shell can remain in place while changed content fades ([Chrome for Developers](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document), [WebKit](https://webkit.org/blog/16967/two-lines-of-cross-document-view-transitions-code-you-can-use-on-every-website-today/)).

**GunnMap recommendation:** keep the global nav and page background visually stable. Do not put the same transition name on whichever nav link happens to be active: the old selected link and the new selected link then become a matched moving snapshot, which can look like a duplicate sliding across the bar. Either let only the page content cross-fade or deliberately animate a single selection indicator inside the nav. This diagnosis is an inference from the snapshot/matching model. Honor reduced-motion preferences for any custom movement ([WebKit motion guidance](https://webkit.org/blog/16967/two-lines-of-cross-document-view-transitions-code-you-can-use-on-every-website-today/)).

## Emergency map citation note and compact help

For the emergency map, keep the provenance/currency caveat adjacent to the map as one readable line, for example: **“Reference map · Revision date unavailable. Follow current staff instructions.”** The symbol `(i)` can accompany a button that reveals extra source detail, but it should not be the only place the emergency caveat is available. W3C guidance recommends short hint text for pertinent help and programmatic association where needed; its tooltip pattern requires focus/hover access and Escape dismissal, and remains a work in progress ([GOV.UK hint text](https://design-system.service.gov.uk/components/text-input/#hint-text), [WAI-ARIA tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)). For longer, low-frequency background detail, a native disclosure is appropriate; GOV.UK says `details` is for information only some users need, not information most users need ([GOV.UK Details](https://design-system.service.gov.uk/components/details/)).

## Save feedback: “Schedule 1 saved”

Saving is routine feedback, so use a short, non-blocking snackbar/toast such as **“Schedule 1 saved”**, not a modal alert. Material’s snackbar guidance specifically includes successful data submission, says it appears briefly at the screen bottom, and disappears after a few seconds ([Android Developers: Snackbar](https://developer.android.com/develop/ui/compose/components/snackbar)). For the web, expose the message through `role="status"`; WAI-ARIA defines it as advisory information, politely announced without moving focus or interrupting the current task ([WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria/#status), [MDN status role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role)). **GunnMap inference:** anchor it to the viewport rather than the end of the long document, and offset it above the home indicator/sticky controls so it is visible but not at the extreme bottom. Reserve modal alerts for important, actionable cases; Apple says alerts interrupt and should not be used just to provide information ([Apple HIG: Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)).

## Room Groups by Color / supporting map information

The legend explains the map and should live beside or inside the map-preview surface, not after the entire page. On a wide screen, use a primary map with a narrow supporting pane; on a phone, put a compact legend immediately below the map or behind a clearly labeled disclosure. This is a layout inference grounded in Material’s supporting-pane pattern ([Material Design: canonical layout examples](https://m3.material.io/foundations/layout/canonical-examples/overview)) and Apple’s direction to give essential content room and place secondary information in another part of the window/view ([Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)). Mapbox likewise treats legends as map UI controls ([Mapbox GL JS plugins](https://docs.mapbox.com/mapbox-gl-js/plugins/)). Keep the legend text and color samples together; never make color alone the meaning.

## Map Preview

Because the user explicitly opens the map to inspect it, a centered, large dialog is a good fit for the preview; the map becomes the primary content, with its legend and source line attached to it. This is a design choice rather than a W3C requirement. If modal, it must actually block interaction with the page behind it, have a visible close button and accessible title, move focus inside, keep Tab navigation inside, close with Escape, and return focus to the opener ([WAI-ARIA APG: Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [W3C technique for HTML `<dialog>`](https://www.w3.org/WAI/WCAG22/Techniques/html/H102)). On phone, adapt it to a near-full-screen dialog so the map remains large and the close control remains reachable. Do not use a modal merely for a passive thumbnail or glance.

## Hero curves SVG

If the curves are decorative artwork, restore them as a CSS background or non-interactive layer behind the hero copy. W3C recommends CSS backgrounds for decorative images and warns not to use them to carry information that needs an alternative text ([W3C WAI: Decorative Images](https://www.w3.org/WAI/tutorials/images/decorative/), [WCAG technique C9](https://www.w3.org/WAI/WCAG22/Techniques/css/C9)). Preserve a solid-color fallback and keep text legible above the curves. Apple’s layout guidance also says backgrounds and full-screen artwork should extend to the display edges ([Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)).

## Low-frequency actions and disclosure alignment

Put secondary actions such as **Share Link** and **Saved Schedule** under one **More** disclosure, while leaving the common schedule-editing action visible. This follows the `details` guidance above: disclose only help or controls some users need. Use one shared disclosure-header style and one chevron asset/box size for both **More** and **Saved schedules** so their baselines and hit areas match. The exact icon sizing is an implementation detail rather than something the cited guidance standardizes.

## 2026-09-27 follow-up: GunnWATT image viewer and component libraries

This section records UI research that began before the React migration. Framework-specific notes have been updated for the current React app; Web Awesome remains the shared control library and Panzoom remains the map gesture library.

### GunnWATT's real image-map flow

The current [GunnWATT Map page source](https://github.com/GunnWATT/watt/blob/main/client/src/pages/utilities/Map.tsx) places an **Image Map** thumbnail and “Use the mouse to pan and scroll to zoom” caption in an `ImageBox`; clicking it opens a `Dialog` containing `ImageMap`. The [ImageBox source](https://github.com/GunnWATT/watt/blob/main/client/src/components/layout/ImageBox.tsx) confirms the thumbnail is the opener. The [ImageMap source](https://github.com/GunnWATT/watt/blob/main/client/src/components/utilities/ImageMap.tsx) implements a viewport-filling overlay, explicit close action, pointer drag, wheel zoom, and multi-touch zoom/rotation; its touch-only orientation affordance is also present.

**GunnMap recommendation:** make the map thumbnail an obvious “Open map preview” trigger, then give the map the main space in a centered dialog on desktop and a near-full-screen dialog on phones. Keep close, legend, and source note reachable in that viewer. GunnWATT is a useful first-party reference for the *open → large viewer* flow; it hand-writes its gesture logic, so its gestures are not evidence that a custom implementation is preferable. Panzoom remains useful because it works with a React ref and effect without requiring a framework-specific adapter.

### Reusable pan/zoom for the preview

[Panzoom](https://github.com/timmywil/panzoom) is a vanilla JavaScript library that imports as `@panzoom/panzoom`; its project documentation describes pointer-based panning, pinch zoom on iOS/Android, zoom-to-point and wheel helpers, min/max scale, and `destroy()` cleanup. A React component can initialize it against a `ref` in an effect and call `destroy()` on cleanup. The repo’s Vite bundler can import the documented ESM entry (`import Panzoom from '@panzoom/panzoom'`). This makes it the recommended candidate for the map gesture layer, with the viewer shell still implemented as a semantic dialog.

**Verification limit:** Panzoom’s repository claims iOS and touch support, but this research did not physically test GunnMap on an iPhone 17, in Safari, or in an installed web app. Check that opening/closing the modal reinitializes and cleans up correctly, that the map stays bounded, and that pinch/scroll gestures feel right on the target device before shipping.

### One control library for tooltip, color picker, and select

The schedule editor uses **Web Awesome** for a shared visual style. Its official catalog includes `<wa-tooltip>`, `<wa-color-picker>`, and `<wa-select>`/`<wa-option>`. Its controls share theme tokens, and component-specific CSS custom properties/`::part()` hooks allow GunnMap to tune details. Tooltips appear on hover and keyboard focus by default and dismiss on Escape; the color picker supports a label, value formats and named swatches; the select is form-compatible and owns its popup/listbox behavior ([Tooltip](https://webawesome.com/docs/components/tooltip/), [Color Picker](https://webawesome.com/docs/components/color-picker/), [Select](https://webawesome.com/docs/components/select/), [Theming](https://webawesome.com/docs/customizing)).

The controls remain Web Components inside React. GunnMap wraps the select and color picker with React components that synchronize values and listen for their native events through refs. TypeScript custom-element declarations live in `web/src/shared/assets.d.ts`.

**Suggested integration shape** (the docs recommend `dist/` imports for bundlers such as Vite and allow components to be cherry-picked):

```sh
npm install @awesome.me/webawesome
```

```ts
import '@awesome.me/webawesome/dist/styles/themes/shoelace.css';
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js';
import '@awesome.me/webawesome/dist/components/color-picker/color-picker.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
```

The app imports the Shoelace theme, then maps GunnMap’s existing colors/radii to Web Awesome’s design tokens and uses CSS parts only where needed. Do not import its optional `native.css` reset unless intentionally changing global element defaults; the [installation guide](https://webawesome.com/docs/) marks that reset optional and documents cherry-picking component modules.

**Trade-offs:** one package gives all three controls coordinated typography, sizes, popup behavior, and palette hooks without implementing a tooltip or custom picker from scratch. The styling boundary is Shadow DOM, so current GunnMap selectors will not style component internals; theme tokens and documented CSS parts are the supported adjustment points. Web Awesome’s default appearance may need tuning to match GunnMap, and its custom select/color-picker should be checked on iOS home-screen mode before replacing the native controls.

Ark UI also documents tooltip, color-picker, and select components for React, Solid, Vue, and Svelte. GunnMap uses Web Awesome’s native custom elements so it can share controls with the existing web-component setup ([Ark UI component docs](https://ark-ui.com/docs/components/tooltip)).

### Actionable recommendation

Use Web Awesome for the three editor controls, with one GunnMap-matched theme and only the needed component imports. Keep native controls only where the mobile browser’s native picker is a deliberate UX choice. For image preview, use a large accessible dialog and Panzoom for map movement/zoom, then verify it in the target iPhone 17 installed-web-app environment. The library integration is implemented; the actual visual match and installed-web-app behavior still need device review.
