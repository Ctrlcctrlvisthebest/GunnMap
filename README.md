# GunnMap

GunnMap is an unofficial local tool for coloring rooms on the Henry M. Gunn High School campus map. Build a downloadable map for a seven-period schedule through the web page, Python, or the command line.

![Seven-period map editor](output/demo_ui.png)

## Quick start

From the repository root, use Python 3.10 or newer to install [Pillow](requirements.txt) and start the local server:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python web_app.py --port 8000
```

Open <http://127.0.0.1:8000/>. Choose a building, enter a room, and pick a color for each period. Leave unused periods blank, or select **Load Example** to fill periods 1–6. Select **Generate Map** to preview and download the PNG. The latest render is also written to `output/period_map.png`.

The page runs on your computer and serves requests through the local `/api/render` endpoint. If a room is selected in more than one period, the last period sets its color and the page shows a warning.

## Generate a map from Python

Run this example from the repository root:

```python
from map_highlighter import highlight_rooms

highlight_rooms(
    {"A134": "#ff595e", "B117": "#1982c4", "D-LIB": "#ffca3a"},
    "output/highlighted_map.png",
)
```

You can also use the command line:

```bash
.venv/bin/python map_highlighter.py --rooms output/example.png 'A134=#ff595e' 'B117=#1982c4'
```

[room_index.csv](room_index.csv) lists room labels and stable `R` IDs; [room_regions.json](room_regions.json) contains aliases and polygons. `library` selects `D-LIB`, `boys` selects `BG111`, `yoga` selects `BG117`, and `girls` or `gender neutral` selects `BG138`.

The map contains two rooms labeled `K6`, so use `R069` or `R070` to choose one. Pillow color names and hex colors are accepted. The default `opacity` is `0.35`; valid values are greater than `0` and at most `1`.

## Sample schedule

`schedule_preview.py` renders the fixed seven-stop example represented in [MAP-English.png](src/map/MAP-English.png). It does not read the schedule from that image. Stop 7 is labeled only “Bow Gym,” so it stays unhighlighted until a specific mapped room is supplied:

```bash
.venv/bin/python schedule_preview.py output/schedule_preview.png
.venv/bin/python schedule_preview.py output/schedule_preview_bg111.png --bow-gym-room BG111
```

The other supported Bow Gym choices are `BG117` and `BG138`. This preview script loads Arial from the macOS system font directory; the web page and room highlighter do not use that font path.

## Map data and coverage

The working map is based on page 1 of the [2025–26 Gunn site map](https://resources.finalsite.net/images/v1737500165/pausdorg/zmi9kqvwvpzd975e09bz/GunnSiteMap2025-26.pdf). [room_regions.json](room_regions.json) contains 146 selectable room polygons, including N-building second-floor rooms N200–N217 and N223. [building_regions.json](building_regions.json) contains the earlier building-level regions, which can be rendered with `highlight_buildings` in `map_highlighter.py`.

The room index excludes V rooms, Titan Gym, Spangenberg Theater S130, the pool, and most other athletic areas. Some adjacent rooms on the source map have no visible dividing line, so their polygon boundaries are approximate. The source PDF and clean page-one PNG are preserved in `src/map/`; `build_n_map.py` rebuilds the augmented `src/map/gunn_site_map.png` from the clean image and the N-building reference crop:

```bash
.venv/bin/python build_n_map.py
```

See the [N-building validation image](output/demo_n_second_floor.png) and [sample seven-period map](output/demo_seven_period_map.png) for rendered results. Generated images belong in `output/`; the repository tracks only the `demo_*.png` examples there.

## License

The project code is released under the [MIT License](LICENSE). The campus map comes from the linked school district PDF.
