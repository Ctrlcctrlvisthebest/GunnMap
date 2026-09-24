# Repository guide for coding agents

## Project layout

- `map_highlighter.ts` is the Sharp renderer for building and room polygons, including color strips for repeated rooms.
- `web_app.ts` serves the seven-period editor and evacuation page in `web/`, attaches assembly information, and writes unique per-render PNGs plus `output/period_map.png`.
- `web/app.ts` and `web/evacuation.ts` implement the browser interactions. `tsconfig.web.json` compiles them into ES modules in `dist/web/`; the server serves these compiled files at `/app.js` and `/evacuation.js`.
- `evacuation.ts` and `evacuation_data.json` map explicit source-image groups to rooms. Unlisted rooms remain unconfirmed.
- `project.ts` loads the inventory and resolves room IDs and aliases.
- `schedule_preview.ts` renders the example schedule; `build_n_map.ts` rebuilds the working map from the clean page-one PNG and second-floor reference.
- `room_regions.json` contains selectable room polygons; `room_index.csv` is the human-readable index. `building_regions.json` contains building-level polygons.
- `src/map/` contains source and working map assets. Only `output/demo_*.png` previews are tracked.

## Working conventions

- Use Node.js 22 or newer and strict TypeScript for browser, server, rendering, and test code. Install dependencies with `npm ci`; do not reintroduce JavaScript source files or a Python runtime. Generated JavaScript belongs in ignored `dist/`.
- Preserve room IDs. Keep `room_index.csv` aligned with inventory changes. The two K6 rooms have distinct IDs and positions.
- Polygon coordinates refer to the 2448 × 1584 map. Keep PNG legends within those dimensions so interactive room targets remain aligned.
- Do not overwrite the source PDF or clean page-one PNG when rebuilding the working map.
- Retain the documented selection scope: V rooms and most athletic spaces are excluded; selectable Bow Gym rooms are BG111, BG138, and BG117.
- Schedule drafts and templates use cookies. Every schedule edit or load must invalidate outdated clickable targets, and stale async results must not restore them.
- Each rendered image has its own URL. Never replace a previous tab's image with another tab's generated map.
- Keep evacuation assignments grounded in the supplied reference image. Do not infer destinations for unlisted rooms; N214 belongs to the football-field section N201–N217.
- Put temporary renders in `output/` or a temporary directory; do not commit them unless deliberately named `demo_*.png` for documentation.

## Verification

- Run `npm run typecheck`, `npm test`, and `npm run build`.
- `npm run dev` builds the browser modules before starting the TypeScript server. Run `npm run build:web` after browser source edits, or restart the development server. `npm start` uses the compiled server and requires `npm run build` first.
- For rendering changes, generate a representative map including a repeated room and N214, and inspect the PNG and legend.
- For interface changes, run `npm run dev -- --port 8000` and check draft restoration, templates, sharing, generation, download, classroom evacuation details, and invalidation after edits.
