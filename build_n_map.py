"""Add the reference image's second-floor N rooms to the working site map.

The district PDF remains untouched. ``gunn_site_map_page1.png`` is its clean
page-one render; ``gunn_site_map.png`` is the room-highlighter's working base.
The small reference crop came from the user's supplied N-building image.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


MAP_DIR = Path(__file__).resolve().parent / "src" / "map"
SOURCE = MAP_DIR / "gunn_site_map_page1.png"
REFERENCE = MAP_DIR / "n_second_floor_reference.png"
DESTINATION = MAP_DIR / "gunn_site_map.png"

# The screenshot was registered to the page-one map using matching linework.
# Source screenshot coordinates approximately map to page pixels as follows:
# map_x = 1.22645 * screenshot_x - 622.744
# map_y = 1.22670 * screenshot_y - 320.161
SCALE_X = 1.22645
SCALE_Y = 1.22670
OFFSET_X = -622.744
OFFSET_Y = -320.161
REFERENCE_ORIGIN = (1500, 420)


def build_n_map() -> Path:
    with Image.open(SOURCE) as image:
        base = image.convert("RGBA")
    with Image.open(REFERENCE) as image:
        reference = image.convert("L")

    # Extract only the dark linework of the new second-floor cluster. This
    # preserves the original road and landscaping, and excludes the gray
    # landscaping shown in the reference screenshot.
    alpha = reference.point(lambda value: max(0, min(255, round((190 - value) * 255 / 160))))
    alpha_draw = ImageDraw.Draw(alpha)
    alpha_draw.rectangle((0, 0, 189, reference.height), fill=0)
    alpha_draw.rectangle((0, 0, reference.width, 22), fill=0)
    alpha_draw.rectangle((421, 0, reference.width, reference.height), fill=0)
    ink = Image.new("RGBA", reference.size, "black")
    ink.putalpha(alpha)

    inv_x = 1 / SCALE_X
    inv_y = 1 / SCALE_Y
    affine = (
        inv_x,
        0,
        (-OFFSET_X * inv_x) - REFERENCE_ORIGIN[0],
        0,
        inv_y,
        (-OFFSET_Y * inv_y) - REFERENCE_ORIGIN[1],
    )
    overlay = ink.transform(base.size, Image.Transform.AFFINE, affine, resample=Image.Resampling.BICUBIC)
    base = Image.alpha_composite(base, overlay)

    # The dashed second-floor perimeter begins over the existing N roof,
    # outside the ink crop used above.
    draw = ImageDraw.Draw(base)
    x0, y0 = 1387, 285
    x1, y1 = 1531, 232
    length = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    for start in range(0, round(length), 16):
        end = min(start + 8, length)
        draw.line(
            (
                x0 + (x1 - x0) * start / length,
                y0 + (y1 - y0) * start / length,
                x0 + (x1 - x0) * end / length,
                y0 + (y1 - y0) * end / length,
            ),
            fill="black",
            width=2,
        )

    # The label copied from the reference is blurred by the screenshot
    # transform. Redraw it at the map's native resolution so the D in BLDG
    # stays distinct from an O when the web preview scales the map down.
    label_box = (1514, 391, 1581, 413)
    draw.rectangle(label_box, fill="white", outline="black", width=1)
    try:
        font = ImageFont.truetype("Arial Bold.ttf", 15)
    except OSError:
        font = ImageFont.load_default(size=15)
    label = "N-BLDG"
    left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
    text_x = (label_box[0] + label_box[2] - (right - left)) / 2 - left
    text_y = (label_box[1] + label_box[3] - (bottom - top)) / 2 - top
    draw.text((text_x, text_y), label, font=font, fill="black")

    base.convert("RGB").save(DESTINATION)
    return DESTINATION


if __name__ == "__main__":
    print(build_n_map())
