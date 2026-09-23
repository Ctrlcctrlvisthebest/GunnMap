"""Generate a visual check of first- and second-floor N-building highlights."""

from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont

from map_highlighter import highlight_rooms


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output" / "n_second_floor_validation.png"
ROOM_COLORS = {
    "N110": "#f97316",  # first floor
    "N205": "#2563eb",  # second floor
    "N211": "#dc2626",  # second floor
    "N215": "#16a34a",  # second floor
}


def _font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)


def render_validation(output_path: str | Path = OUTPUT) -> Path:
    with TemporaryDirectory(prefix="n-floor-validation-") as temp_dir:
        highlighted = Path(temp_dir) / "map.png"
        highlight_rooms(ROOM_COLORS, highlighted, opacity=0.55)
        with Image.open(highlighted) as image:
            map_image = image.convert("RGB")

    width, map_height = map_image.size
    canvas = Image.new("RGB", (width, map_height + 1080), "#f5f7fb")
    canvas.paste(map_image, (0, 0))
    draw = ImageDraw.Draw(canvas)

    draw.text((60, map_height + 27), "N Building · room highlight validation", fill="#182334", font=_font(38, bold=True))
    draw.text(
        (60, map_height + 78),
        "Floor 1 and floor 2 are shown together, matching the supplied N-building reference.",
        fill="#42526b",
        font=_font(24),
    )

    detail = map_image.crop((1180, 205, 1745, 650)).resize((1130, 890), Image.Resampling.LANCZOS)
    canvas.paste(detail, (60, map_height + 130))
    draw.rounded_rectangle((1230, map_height + 130, 2390, map_height + 920), radius=18, fill="white", outline="#d5dce8", width=2)
    draw.text((1275, map_height + 167), "Highlighted rooms", fill="#182334", font=_font(34, bold=True))

    labels = [
        ("N110", "Floor 1", "#f97316"),
        ("N205", "Floor 2", "#2563eb"),
        ("N211", "Floor 2", "#dc2626"),
        ("N215", "Floor 2", "#16a34a"),
    ]
    for index, (room, floor, color) in enumerate(labels):
        y = map_height + 247 + 125 * index
        draw.rounded_rectangle((1275, y, 1330, y + 55), radius=10, fill=color)
        draw.text((1360, y + 2), room, fill="#182334", font=_font(31, bold=True))
        draw.text((1550, y + 6), floor, fill="#526078", font=_font(27))

    draw.text((1275, map_height + 770), "Each colored shape is one selectable room.", fill="#42526b", font=_font(23))
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)
    return destination


if __name__ == "__main__":
    print(render_validation())
