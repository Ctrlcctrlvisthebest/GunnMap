# GunnMap

An unofficial campus map for Henry M. Gunn High School. The React browser app, Node.js server, map tools, and checks are written in TypeScript. No Python runtime is required.

<table>
  <tr>
    <th>Schedule Map</th>
    <th>Generated Map</th>
  </tr>
  <tr>
    <td><img src="output/demo_schedule.webp" alt="GunnMap Schedule Map page" width="440"></td>
    <td><img src="output/demo_ui.webp" alt="GunnMap Generated Map page" width="440"></td>
  </tr>
  <tr>
    <th>Evacuation Routes</th>
    <th>Find a Room</th>
  </tr>
  <tr>
    <td><img src="output/demo_evacuation.webp" alt="GunnMap Evacuation Routes page" width="440"></td>
    <td><img src="output/demo_find_room.webp" alt="GunnMap Find a Room page" width="440"></td>
  </tr>
</table>

## Run

Install Node.js 22.12 or newer, then:

```sh
npm ci
npm run dev -- --port 8080
```

Open http://127.0.0.1:8080. For a compiled build:

```sh
npm run build
npm start -- --port 8080
```

The server binds to `127.0.0.1` by default. Set `HOST` and `PORT` to configure it. `npm run dev` type-checks and bundles the browser app before starting the server. After editing browser code, run `npm run build:web` and reload the page, or restart the development server.

Compiled files live in `dist/`, including the React browser bundles and service worker in `dist/web/`. Keep `web/index.html`, `web/style.css`, the web app manifest and icons, `public/assets/`, `src/map/`, `room_regions.json`, `room_index.csv`, `building_regions.json`, and `evacuation_data.json` alongside `dist/` when deploying. The server serves the same SPA shell for all four routes and delivers its bundle and static assets from these locations.

## Browser app structure

The browser is a React single-page app with routes for Schedule Map, Evacuation Routes, Find a Room, and Generated Map. The shared shell owns navigation and the mobile brand scroll position; each route is a page component. Schedule persistence and editing, room lookup and suggestions, evacuation data, and map pan/zoom live in feature modules. Shared controls and toast notifications live in `web/src/shared/`. Selects use native controls; one shared color editor loads only when opened, and evacuation tooltips load with their page. Room matching is shared across the browser and Node service in `src/domain/room-matching.ts`. Keep page-specific UI in `web/src/pages/` and put reusable domain behavior in the feature that owns it. The Node server, Sharp map renderer, room data, and API contracts remain outside the React UI.

```text
web/
  index.html
  style.css
  src/
    app/          # React bootstrap, routes, and persistent site shell
    pages/        # Schedule, evacuation, room lookup, and generated map
    features/     # Schedule, rooms, maps, and evacuation behavior
    shared/       # Theme, native controls, and notifications
src/domain/       # Domain rules shared by the browser and Node server
```

## Campus maps

### Schedule Map

Enter a room and choose a color for each of seven periods. A recognized room label or alias selects its building automatically. Matching ignores case, spaces, Unicode hyphens, and full-width characters, so `A134`, `a-134`, and `Ａ１３４` resolve to the same room. Room inputs use the themed, accessible autocomplete component, with human-readable labels and no internal IDs; duplicate labels use location aliases. Missing and ambiguous matches appear beside the relevant input with choices where available. Generate Map focuses the first unresolved room. Periods can be left blank.

Generate Map creates a downloadable PNG and opens `/generate-map` with that exact image. Panzoom handles dragging, mouse-wheel zoom, and touch gestures while keeping the image within the viewer. Evacuation details are shown on the separate Evacuation Routes page, where the current saved schedule appears as clickable, color-coded period circles positioned over each classroom. If several periods share a room, the PNG map highlight shows every period color.

The editor supports Undo and Redo for recent room edits, template creation, replacement and deletion, examples, and clearing the schedule. Save Current stores a named schedule on this device. Share Link first previews the shared schedule and lets the user choose whether to use it temporarily, save it on this device, or keep the current schedule. Temporary edits stay separate across page changes until explicitly saved. Drafts and templates use versioned cookies; previous-version cookies are read for compatibility and never overwritten, so returning to the previous release retains its saved data. They are not tied to an account or cloud database.

### Evacuation Routes

The `/evacuation` page shows the supplied route map, with room-group information in the `i` dialog. Open the map to zoom and pan it in a same-page viewer; use the `×` button to close it or download the PNG. When a schedule is saved on the device, clickable period circles identify each classroom and compact cards summarize its assembly point. Reference notes include the source image details and validation state.

### Find a Room

The separate Find a Room page supports a room number or familiar aliases such as `library`, with the same themed suggestions as the schedule editor. If a name matches more than one room, choose the intended building. The result shows its building, floor, and confirmed evacuation destination above a zoomable campus map centered on the room. Unconfirmed locations remain explicit instead of inferring a route.

### Responsive and installable use

All map viewers include visible zoom and reset controls. When the map is focused, use +/− to zoom, arrow keys to pan, and Home or 0 to reset.

The navigation links to Schedule Map, Evacuation Routes, Find a Room, and Generated Map. On narrow screens, the GunnMap brand scrolls away while the navigation remains available. Switching pages preserves the brand's current position: if it is fully visible, partly visible, or hidden, it stays in that state on the next page, including when that page is too short to scroll naturally. Scrolling back toward the top reveals it. Page cards share the same border, width, and outer gutter. The assembly-point heading moves above its cards when the available width is limited. At widths up to 430 px, building selection is created only when the manual-building control is opened; room auto-detection remains the default. The site includes a web app manifest and install icons for supported browsers.

### Offline use

On HTTPS or localhost, the app downloads a consistent version of its pages, campus maps, room directory, and evacuation reference. Wait for “Campus maps are available offline on this device” before disconnecting. Find a Room and evacuation details then work offline; generating a new highlighted image requires a connection.

On Generated Map, choose **Save offline** to keep one personal map on this device. Saving another replaces it only after a complete image downloads and decodes successfully. **Remove offline copy** deletes it. Personal maps are never automatically put into the offline cache. Download PNG remains available for browsers without service workers or when browser storage is full. Browser settings can clear offline data.

An available app update offers an explicit reload. A per-resource revision manifest reuses unchanged public assets from the previous cache and downloads changed resources. The new worker activates only after its complete cache has been prepared; a failed install preserves the previous working version and the saved personal image. For browser changes during development, rebuild, reload, and accept the update prompt. Existing open pages continue using their previous complete build until the update is activated. Room lookup and saved personal images use a bounded network wait before falling back to their offline copies, including when a weak connection hangs instead of failing immediately.

Public maps are displayed and cached as lossless WebP files built from the original PNGs. The build preserves their pixels, dimensions and map coordinates. Download PNG creates a real PNG from this display copy in the browser, so downloading also works offline without caching both formats. The original PNG routes and map source files remain available.

## Map data and maintenance

`room_regions.json` stores the 146 active room polygons and stable IDs, including the N-building second floor. `room_index.csv` lists labels, IDs, and disambiguating aliases. The background combines the [district site map](https://resources.finalsite.net/images/v1737500165/pausdorg/zmi9kqvwvpzd975e09bz/GunnSiteMap2025-26.pdf) with the supplied second-floor reference. The N-building overlay and schedule legend are SVG assets in `src/map/`. Browser navigation icons are external SVG assets in `public/assets/`. Editable building regions remain in `building_regions.json`. Original images and the PDF are in `src/map/`. V rooms, Titan Gym, Spangenberg Theater S130, the pool, and most athletic spaces are excluded; selectable Bow Gym rooms are BG111, BG138, and BG117. Some room boundaries are approximate where the source map has no visible dividing line.

Period colors and evacuation groups are independent. Default colors and the example schedule are stored in `web/src/features/schedule/schedule-defaults.json`. `n214`, `N214`, and `n-214` resolve to the same second-floor room and the football-field section **N201–N217**. The two K6 rooms are distinguished by their upper and lower map locations; stable R-numbers remain accepted for older shared schedules. Stale render requests are discarded, and each render gets an independent image URL so different tabs cannot overwrite each other's maps.

`evacuation_data.json` records room assignments, group colors, source kind, original filename, source hash, and source dimensions. `npm run data:validate` checks room polygons, stable IDs, CSV alignment, ambiguous aliases, supplied image integrity, assignment boundaries and overlaps, group labels, and reference coordinates; the build runs it automatically. The supplied image has no revision date, and a manual verification date has not been recorded; both remain explicitly unknown. `evacuation.ts` leaves unlisted rooms unconfirmed, including E01 rather than guessing it means E1. Public room and evacuation responses are prepared at server startup; restart after changing these data files. This is a reference, not live emergency routing; follow current school staff instructions.

Public static files and inventory JSON use ETags for revalidation; text responses support gzip, and Vite assets with content hashes can be cached for a year. A bounded server cache reuses file bytes, compressed representations and their ETags, avoiding repeated reads and compression for unchanged requests. File metadata is rechecked so development rebuilds invalidate cached representations. The landing schedule is included in the entry to avoid a serial script request; secondary pages and the color editor load separately. Personal generated images use `Cache-Control: no-store` and unique URLs. The shared `/output/period_map.png` URL is neither written nor served.

The server retains completed generated images for seven days by default. Set a positive `MAP_RETENTION_DAYS` value to change this, for example `MAP_RETENTION_DAYS=14 npm run dev`. Expired images are removed at startup, every hour, and on download requests; expired URLs return 404. Cleanup only targets completed UUID image files and preserves demos, temporary files, and source assets. Render admission, concurrency, queue length and storage budgets are bounded; reaching a limit rejects new work rather than deleting unexpired images. Tune these limits against measured traffic and available server resources.

Drafts and templates remain versioned JavaScript-readable cookies for compatibility. HTTPS cookies have `Secure` and `SameSite=Lax`; HTTP localhost remains usable for development. Public API and image fetches omit credentials. Cookies can still accompany ordinary same-origin navigation and asset requests: do not log Cookie headers, and do not describe these drafts as guaranteed to stay off the server. Sharing encodes schedules in the URL fragment, which is not sent in HTTP request URLs.

## Server limits and deployment

`POST /api/render` accepts `application/json` only. Browser requests must originate from the same site; non-browser clients without an Origin header remain supported. Cross-site Fetch Metadata is rejected. Defaults are intentionally bounded and configurable:

| Variable | Default | Purpose |
| --- | --- | --- |
| `RENDER_RATE_LIMIT` | `60` | Accepted render requests per client per window |
| `RENDER_RATE_WINDOW_MS` | `60000` | Rate-limit window |
| `RENDER_RATE_CLIENTS` | `10000` | Maximum tracked clients; expired entries are discarded |
| `RENDER_CONCURRENCY` | `2` | Simultaneous image renders |
| `RENDER_QUEUE_LIMIT` | `8` | Maximum waiting requests; `0` disables waiting |
| `RENDER_QUEUE_TIMEOUT_MS` | `10000` | Maximum queue wait |
| `MAP_STORAGE_BYTES` | `536870912` | Completed personal images plus in-flight reservations, 512 MiB |
| `MAP_MAX_BYTES` | `16777216` | Per-render reservation and maximum generated file size, 16 MiB |

Rate limits return 429; full/expired queues or exhausted storage return 503. Retryable rejections include `Retry-After`. These limits apply to one Node process and the generated-image budget does not cover other files on the disk. Do not run multiple processes against one output directory without a shared admission/storage coordinator. Concurrency and rate settings are starting values, not throughput guarantees.

The client key is the socket IP. Forwarded client headers are not trusted automatically. A reverse proxy or school NAT can put many users under one allowance; configure edge rate limits and the app allowance together for your deployment. Set `PUBLIC_ORIGIN=https://your-domain.example` behind an HTTPS reverse proxy so same-origin browser requests are accepted independently of its internal HTTP connection. Forwarded scheme/host headers do not override this setting.

Responses include a Content Security Policy restricting scripts and connections to this origin, `nosniff`, anti-framing headers and a no-referrer policy. Inline styles remain allowed for React map positioning and the component theme. TLS is terminated by the deployment platform or trusted proxy. Set `ENABLE_HSTS=true` only after HTTPS works permanently and an HTTPS `PUBLIC_ORIGIN` is configured; it is off by default for local development.

## Map tools

The TypeScript renderer uses Sharp to composite highlights into PNG images. It accepts room labels, IDs, and English inventory aliases such as `library`, `boys`, `yoga`, and `gender neutral`. The two K6 rooms have location-based aliases; their R-numbers remain supported as stable identifiers.

```sh
npm run highlight -- --rooms output/example.png 'A134=#ff595e' 'B117=#1982c4'
npm run highlight -- output/buildings.png 'A=red' 'Library=blue'
npm run map:index -- output/numbered_room_index.png
npm run map:preview -- output/schedule_preview.png --bow-gym-room BG111
npm run map:validate
npm run map:rebuild
```

`map:rebuild` regenerates the working base PNG from the clean page-one image and the second-floor reference. To inspect a rebuild without replacing the working image, pass an output path. The schedule preview leaves Bow Gym unspecified unless BG111, BG138, or BG117 is selected.

```ts
import { highlightRooms } from './map_highlighter.js';

await highlightRooms(
  { A134: '#ff595e', B117: '#1982c4' },
  'output/map.png',
);
```

## Validation

```sh
npm run typecheck
npm test
npm run build
```

The tests cover room matching, map panning and keyboard controls, data integrity, evacuation assignments, rendering, API contracts, HTTP caching and compression, retention, and offline behavior. React tests mount the actual editor and autocomplete in jsdom to check persistence, share isolation, templates, Undo/Redo, validation, and stale asynchronous work. Worker tests execute the built service worker to check public and personal cache boundaries, offline lookup, and recovery. Evacuation boundary cases are stored in `evacuation_test_cases.json`. `npm test` builds the browser app before running the TypeScript checks. Server, browser, and service worker configurations enable strict type checking. GitHub Actions runs type checks, tests, and a production build on pushes and pull requests.
