"""Highlight named buildings on the original Gunn High School site map.

The editable polygon coordinates live in building_regions.json. They are stored
against the bundled 2448 x 1584 rendering of page 1 of the source PDF.
"""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFont


PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_REGIONS = PROJECT_DIR / "building_regions.json"
DEFAULT_ROOMS = PROJECT_DIR / "room_regions.json"


def _save_polygons(
    source_path: Path,
    image_size: list[int],
    colored_polygons: list[tuple[list[list[int]], tuple[int, int, int]]],
    output_path: str | Path,
    opacity: float,
) -> Path:
    if not 0 < opacity <= 1:
        raise ValueError("opacity must be greater than 0 and at most 1")

    with Image.open(source_path) as source:
        result = source.convert("RGBA")
    reference_width, reference_height = image_size
    scale_x = result.width / reference_width
    scale_y = result.height / reference_height
    overlay = Image.new("RGBA", result.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    alpha = round(255 * opacity)
    outline_width = max(2, round(min(scale_x, scale_y) * 3))

    for polygon, rgb in colored_polygons:
        points = [(round(x * scale_x), round(y * scale_y)) for x, y in polygon]
        draw.polygon(points, fill=(*rgb, alpha))
        draw.line(points + [points[0]], fill=(*rgb, min(255, alpha + 95)), width=outline_width, joint="curve")

    result = Image.alpha_composite(result, overlay).convert("RGB")
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(destination, format="PNG")
    return destination


def highlight_buildings(
    building_colors: Mapping[str, str],
    output_path: str | Path,
    *,
    base_image: str | Path | None = None,
    regions_path: str | Path = DEFAULT_REGIONS,
    opacity: float = 0.35,
) -> Path:
    """Save a PNG with selected buildings highlighted in caller-provided colors.

    Example: highlight_buildings({"A": "#ff5a5f", "图书馆": "blue"}, "result.png")
    Names are case-insensitive. The source map is never modified.
    """
    regions_file = Path(regions_path)
    with regions_file.open(encoding="utf-8") as handle:
        data = json.load(handle)

    if base_image is None:
        image_path = regions_file.parent / data["base_image"]
    else:
        image_path = Path(base_image)

    aliases = {}
    for canonical, region in data["regions"].items():
        for name in (canonical, *region.get("aliases", [])):
            key = name.strip().casefold()
            if key in aliases and aliases[key] != canonical:
                raise ValueError(f"Ambiguous region alias: {name}")
            aliases[key] = canonical

    selected = {}
    for name, color in building_colors.items():
        canonical = aliases.get(name.strip().casefold())
        if canonical is None:
            raise ValueError(
                f"Unknown building {name!r}; valid regions: "
                + ", ".join(data["regions"])
            )
        try:
            selected[canonical] = ImageColor.getcolor(color, "RGB")
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid color for {name!r}: {color!r}") from exc

    colored_polygons = []
    for canonical, rgb in selected.items():
        for polygon in data["regions"][canonical]["polygons"]:
            colored_polygons.append((polygon, rgb))
    return _save_polygons(image_path, data["image_size"], colored_polygons, output_path, opacity)


def highlight_rooms(
    room_colors: Mapping[str, str],
    output_path: str | Path,
    *,
    base_image: str | Path | None = None,
    rooms_path: str | Path = DEFAULT_ROOMS,
    opacity: float = 0.35,
) -> Path:
    """Highlight individual labeled rooms by map label or unique R-number.

    Example: highlight_rooms({"A134": "red", "R026": "#ffca3a"}, "rooms.png")
    The duplicated K6 label must be selected by its unique R-number.
    """
    rooms_file = Path(rooms_path)
    with rooms_file.open(encoding="utf-8") as handle:
        data = json.load(handle)
    image_path = Path(base_image) if base_image is not None else rooms_file.parent / data["base_image"]

    by_id = {room["id"].casefold(): room for room in data["rooms"]}
    by_label = defaultdict(list)
    for room in data["rooms"]:
        for name in (room["label"], *room.get("aliases", [])):
            by_label[name.casefold()].append(room)

    colored_polygons = []
    for name, color in room_colors.items():
        key = name.strip().casefold()
        matches = [by_id[key]] if key in by_id else by_label.get(key, [])
        if not matches:
            raise ValueError(f"Unknown room {name!r}; see room_index.csv for valid labels and IDs")
        if len(matches) > 1:
            ids = ", ".join(room["id"] for room in matches)
            raise ValueError(f"Room label {name!r} is duplicated; select one of {ids}")
        try:
            rgb = ImageColor.getcolor(color, "RGB")
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid color for {name!r}: {color!r}") from exc
        colored_polygons.append((matches[0]["polygon"], rgb))

    return _save_polygons(image_path, data["image_size"], colored_polygons, output_path, opacity)


def create_room_index_image(
    output_path: str | Path,
    *,
    rooms_path: str | Path = DEFAULT_ROOMS,
) -> Path:
    """Save a review image with a small numeric ID next to every room label."""
    rooms_file = Path(rooms_path)
    with rooms_file.open(encoding="utf-8") as handle:
        data = json.load(handle)
    with Image.open(rooms_file.parent / data["base_image"]) as source:
        image = source.convert("RGB")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=10)
    for room in data["rooms"]:
        x, y, _, _ = room["label_box"]
        tag_x, tag_y = room.get("tag_point", (x, y - 12))
        number = room["id"][1:].lstrip("0") or "0"
        tag_box = draw.textbbox((tag_x, tag_y), number, font=font)
        draw.rectangle(tag_box, fill="white")
        draw.text((tag_x, tag_y), number, fill="#d00000", font=font)
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG")
    return destination


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Highlight buildings on the Gunn site map")
    parser.add_argument("output", help="Output PNG path")
    parser.add_argument("selection", nargs="+", help="Name=Color, e.g. A134=#ff0000")
    parser.add_argument("--opacity", type=float, default=0.35)
    parser.add_argument("--rooms", action="store_true", help="Select individual rooms instead of buildings")
    args = parser.parse_args()
    try:
        colors = dict(item.split("=", 1) for item in args.selection)
    except ValueError as exc:
        parser.error("each selection must use Name=Color")
    highlighter = highlight_rooms if args.rooms else highlight_buildings
    print(highlighter(colors, args.output, opacity=args.opacity))
