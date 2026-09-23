"""Render the seven-stop Back to School Night schedule on the site map."""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFont

from map_highlighter import highlight_rooms


PERIODS = [
    (1, "F-04", "F4", "Int Engr Des PLTW", "Grim", "#e3265d"),
    (2, "M-03", "M3", "3D Art", "Buck", "#7c3aed"),
    (3, "J-03", "J3", "Biology", "Wynn", "#0284c7"),
    (4, "K-01", "K1", "Ethnic Studies 9", "Tuomy", "#059669"),
    (5, "N-110", "N110", "English 9", "Cadenas", "#f97316"),
    (6, "N-211 · 2F", "N211", "Alg2/Trig H", "Richards", "#b88700"),
    (7, "Bow Gym", None, "PE 9", "Anderson", "#dc2626"),
]

BOW_GYM_ROOMS = {"BG111", "BG138", "BG117"}
BADGE_POINTS = {
    "F4": (350, 711),
    "M3": (1085, 430),
    "J3": (388, 324),
    "K1": (533, 520),
    "N110": (1362, 444),
    "N211": (1685, 455),
    "BG111": (1491, 893),
    "BG138": (1491, 1107),
    "BG117": (1614, 893),
}


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "Arial Bold.ttf" if bold else "Arial.ttf"
    return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{filename}", size)


def render_schedule_preview(
    output_path: str | Path,
    *,
    bow_gym_room: str | None = None,
) -> Path:
    """Save a map with schedule highlights and a legend.

    ``bow_gym_room`` must be BG111, BG138, or BG117 when known. An omitted
    choice leaves stop 7 unfilled rather than guessing which gym room applies.
    """
    if bow_gym_room is not None:
        bow_gym_room = bow_gym_room.upper()
        if bow_gym_room not in BOW_GYM_ROOMS:
            raise ValueError(f"bow_gym_room must be one of {sorted(BOW_GYM_ROOMS)}")

    room_colors = {room: color for _, _, room, _, _, color in PERIODS if room is not None}
    if bow_gym_room is not None:
        room_colors[bow_gym_room] = PERIODS[-1][-1]

    with tempfile.TemporaryDirectory(prefix="gunn-schedule-") as temp_dir:
        highlighted = Path(temp_dir) / "highlighted.png"
        highlight_rooms(room_colors, highlighted, opacity=0.5)
        with Image.open(highlighted) as source:
            map_image = source.convert("RGB")

    width, map_height = map_image.size
    canvas = Image.new("RGB", (width, map_height + 360), "#f7f9fc")
    canvas.paste(map_image, (0, 0))
    draw = ImageDraw.Draw(canvas)

    number_font = _font(20, bold=True)
    for number, _, room, _, _, color in PERIODS:
        if room is None:
            if number != 7 or bow_gym_room is None:
                continue
            room = bow_gym_room
        x, y = BADGE_POINTS[room]
        draw.ellipse((x - 17, y - 17, x + 17, y + 17), fill=color, outline="white", width=3)
        label = str(number)
        bounds = draw.textbbox((0, 0), label, font=number_font)
        draw.text((x - (bounds[2] - bounds[0]) / 2, y - 12), label, fill="white", font=number_font)

    title_font = _font(34, bold=True)
    heading_font = _font(25, bold=True)
    body_font = _font(20)
    small_font = _font(17)
    draw.text((35, map_height + 19), "Back to School Night · 7-stop route preview", fill="#172334", font=title_font)
    draw.text(
        (35, map_height + 62),
        "N-211 is on floor 2; its room outline comes from the supplied N-building reference.",
        fill="#674d10",
        font=body_font,
    )

    card_width = 572
    card_height = 103
    x_positions = [35, 633, 1231, 1829]
    y_positions = [map_height + 107, map_height + 223]
    for number, display_room, _, course, teacher, color in PERIODS:
        index = number - 1
        row, column = divmod(index, 4)
        x, y = x_positions[column], y_positions[row]
        draw.rounded_rectangle((x, y, x + card_width, y + card_height), radius=12, fill="white", outline=color, width=3)
        draw.rounded_rectangle((x + 12, y + 12, x + 47, y + 47), radius=10, fill=color)
        draw.text((x + 23, y + 15), str(number), fill="white", font=heading_font)
        room_title = display_room
        if number == 7 and bow_gym_room is not None:
            room_title = f"Bow Gym · {bow_gym_room}"
        draw.text((x + 59, y + 12), room_title, fill="#172334", font=heading_font)
        draw.text((x + 16, y + 52), f"{course} · {teacher}", fill="#26364a", font=body_font)
        if number == 7 and bow_gym_room is None:
            draw.text((x + 16, y + 78), "specific BG room not selected", fill="#8c6500", font=small_font)

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, format="PNG")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", help="Output PNG path")
    parser.add_argument("--bow-gym-room", choices=sorted(BOW_GYM_ROOMS))
    args = parser.parse_args()
    print(render_schedule_preview(args.output, bow_gym_room=args.bow_gym_room))
