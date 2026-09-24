# GunnMap

An unofficial campus map prototype for Henry M. Gunn High School.

![Seven-period map editor](output/demo_ui.png)

This Python prototype highlights individual labeled rooms on the original
school map. `room_regions.json` stores 146 active room polygons with stable
unique IDs. `room_index.csv` lists each ID, map label, building, and any special
purpose. The first page of the
[2025–26 site map](https://resources.finalsite.net/images/v1737500165/pausdorg/zmi9kqvwvpzd975e09bz/GunnSiteMap2025-26.pdf)
is the background. The earlier six large areas remain available in
`building_regions.json`.

Map files live in `src/map/`: the source PDF, its clean page-one PNG, the
user-supplied N-building reference crop, the augmented PNG used by the
highlighter, and the two earlier reference images. Generated previews live in
`output/`. Rebuild the augmented PNG from its sources with
`.venv/bin/python build_n_map.py`.

The second-floor N-building overlay and its room highlights are shown in
[this validation image](output/demo_n_second_floor.png). A seven-period result
is available as [a sample map](output/demo_seven_period_map.png).

Install the only dependency:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Call the room highlighter from another `main.py`:

```python
from map_highlighter import highlight_rooms

highlight_rooms(
    {"A134": "#ff595e", "B117": "#1982c4", "D-LIB": "#ffca3a"},
    "output/highlighted_map.png",
)
```

Three-room color check:

```python
highlight_rooms(
    {"C6": "#e53935", "图书馆": "#fb8c00", "F2": "#43a047"},
    "output/c6_library_f2.png",
    opacity=0.5,
)
```

The dictionary keys select map labels or unique IDs such as `R006`; values set
colors. The map prints `K6` in two places, so choose its ID from
`room_index.csv`. `图书馆` and `library` both select `D-LIB`. The aliases `男生`,
`女生`, `gender neutral`, and `瑜伽` select BG111, BG138, and BG117 respectively.
Color names and hex
colors accepted by Pillow work. `opacity=0.35` is the default; adjust it
between 0 and 1. Unselected areas stay unchanged. The input image is never
overwritten. Coordinates scale automatically if `base_image` uses a different
resolution of the same uncropped map.

Command-line example:

```bash
.venv/bin/python map_highlighter.py --rooms output/example.png 'A134=#ff595e' 'B117=#1982c4'
```

To produce the numbered review map:

```python
from map_highlighter import create_room_index_image
create_room_index_image("output/numbered_room_index.png")
```

The active index covers labeled rooms outside V, including the N-building
second-floor rooms N200–N217 and N223 transcribed from the supplied reference.
It excludes Titan Gym, Spangenberg Theater S130, and all Bow Gym spaces except BG111 (boys), BG138
(girls / gender neutral), and BG117 (yoga). The pool and other sports facilities
are not selectable. Room IDs remain stable, so the sequence has gaps where
rooms were excluded. Some suites on the source map lack a line between adjacent
labels; their separate highlight areas use the visible layout to divide the
shared space. `room_regions.json` is editable for a later precision pass.

## Seven-stop schedule preview

Render the English schedule from `src/map/MAP-English.png` on the original site map:

```bash
.venv/bin/python schedule_preview.py output/schedule_preview.png
```

Stops 1–6 highlight F4, M3, J3, K1, N110, and N211. N211 is on the second
floor and uses the room outline from the supplied N-building reference. The
schedule says only “Bow Gym” for stop 7. Once its room is known, add one of the
three mapped spaces:

```bash
.venv/bin/python schedule_preview.py output/schedule_preview.png --bow-gym-room BG111
```

The other supported choices are `BG138` and `BG117`.

## Local seven-period page

Start the local Python server and open the address it prints:

```bash
.venv/bin/python web_app.py --port 8000
```

At `http://127.0.0.1:8000/`, choose a building, type a room, and pick a color
for each of the seven periods. Unused periods may be blank. Click **Generate
Map** to preview the result and download a PNG. The latest image is also saved
at `output/period_map.png`. The **Load Example** button fills periods 1–6 with
the sample schedule; period 7 stays blank because its Bow Gym room is unspecified.

Room suggestions include second-floor N rooms. The two `K6` areas use their
separate choices `K6 (R069)` and `K6 (R070)`. If a room appears more than once,
the selected periods share the room area in equal color sections. The page
automatically saves the current seven-period draft in a browser cookie and
restores it when reopened. Use **Clear Schedule** to remove the saved cookie;
the draft stays on the current device. **Share Link** puts the schedule in the
URL fragment so it can be opened without server-side storage, while **Save
Current** stores multiple named templates in browser cookies.
The existing **Generate Map** action still sends the current form to the local
`/api/render` endpoint to produce the preview. The generated PNG includes a
period legend in the open lower-left area of the map.
