# Repository guide for coding agents

## Project layout

- `map_highlighter.py` is the core Pillow renderer for building and room polygons.
- `web_app.py` serves the local seven-period editor in `web/` and writes its rendered map to `output/period_map.png`.
- `schedule_preview.py` renders the example route and legend.
- `build_n_map.py` rebuilds `src/map/gunn_site_map.png` from the clean page-one PNG and the N-building reference image.
- `room_regions.json` contains selectable room polygons; `room_index.csv` is the human-readable index. `building_regions.json` contains the older building-level polygons.
- `src/map/` contains source and working map assets. `output/` contains generated previews; only `output/demo_*.png` is tracked.

## Working conventions

- Work from the repository root. Follow `README.md` for setup and usage; the only Python dependency is in `requirements.txt`.
- Preserve existing room IDs when editing `room_regions.json`. Keep `room_index.csv` aligned with any added, removed, or renamed rooms. The two `K6` rooms have distinct IDs, so do not merge them by label.
- Polygon coordinates are based on the 2448 × 1584 map recorded in the JSON files. Check changes against the map images, especially for the N-building second floor. Do not overwrite the source PDF or clean page-one PNG when rebuilding the working map.
- Keep the current room-selection scope documented in `README.md`: V rooms and most athletic spaces are excluded; the supported Bow Gym rooms are BG111, BG138, and BG117.
- Put temporary renders in `output/` or a temporary directory. Avoid committing generated previews unless they are intentionally named `demo_*.png` and meant for the README.

## Verification

- For Python changes, run `python3 -m compileall -q map_highlighter.py web_app.py schedule_preview.py build_n_map.py n_floor_validation.py`.
- For polygon or rendering changes, render a representative room map with `python3 map_highlighter.py --rooms output/check.png 'A134=#ff595e' 'N211=#1982c4'` and inspect the result. Install `requirements.txt` first if Pillow is unavailable.
- For web changes, run `python3 web_app.py --port 8000` and check the room list and map generation in the local page. There is no automated test suite yet.
