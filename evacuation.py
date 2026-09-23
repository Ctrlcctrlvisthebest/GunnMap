"""Room-to-assembly annotations transcribed from the supplied evacuation map.

``evacuation_for_room`` accepts an inventory room (id, label, building) and
returns a JSON-safe dictionary. ``status`` is ``mapped`` or ``unconfirmed``;
``group`` is the annotation's color name and ``color`` is its CSS color.
``focus`` is a rectangle around the printed group label, normalized to the
original 1852 x 1156 evacuation image, never to the classroom map.

The labels indicate approximate assembly areas, not independently verified
routes. Numeric ranges are inclusive and deliberately do not match leading
zeroes: E01 cannot safely be equated with the source annotation E1-E2.
"""

from __future__ import annotations

import re


IMAGE_WIDTH = 1852
IMAGE_HEIGHT = 1156

_COLORS = {
    "red": "#f53622",
    "blue": "#304ffe",
    "green": "#527d32",
    "black": "#202529",
}

_DESTINATIONS = {
    "red": "Red assembly area marked beside PREP",
    "blue": "Blue assembly area marked beside Spangenberg Theater and the bike racks",
    "green": "Green assembly area shown below Bow Gym / Titan Gym",
    "black": "Football field",
}

# Prefix, inclusive start/end, source color, exact source label, source pixels.
# Rectangles surround the printed labels, not inferred paths or boundaries.
_RANGES = (
    ("H", 1, 3, "red", "H1-H3", (404, 427, 489, 459)),
    ("H", 4, 5, "red", "H4-H5", (461, 456, 552, 487)),
    ("G", 1, 3, "red", "G1-G3", (460, 486, 552, 515)),
    ("G", 4, 7, "red", "G4-G7", (460, 512, 553, 543)),
    ("F", 1, 2, "red", "F1-F2", (478, 544, 560, 576)),
    ("F", 4, 6, "red", "F4-F6", (498, 585, 580, 618)),
    ("M", 1, 5, "blue", "M1-M5", (1078, 473, 1173, 505)),
    ("K", 1, 5, "green", "K-1-K5", (1298, 927, 1399, 954)),
    ("K", 6, 13, "green", "K6-K13", (1298, 953, 1399, 981)),
    ("L", 1, 4, "green", "L1-L4", (1306, 979, 1390, 1007)),
    ("L", 5, 8, "green", "L5-L8", (1306, 1004, 1390, 1033)),
    ("C", 1, 3, "green", "C-1-C3", (1298, 1028, 1400, 1058)),
    ("C", 4, 8, "green", "C-4-C8", (1144, 900, 1250, 934)),
    ("E", 1, 2, "green", "E1-E2", (1149, 871, 1245, 900)),
    ("J", 1, 5, "black", "J1 - J5", (1522, 380, 1663, 412)),
    ("J", 6, 10, "black", "J6- J10", (1554, 550, 1675, 583)),
    ("N", 101, 117, "black", "N101-N117", (1689, 550, 1818, 583)),
    ("N", 201, 217, "black", "N201-N217", (1696, 380, 1822, 412)),
)

# Explicit lists must not accidentally include intervening room numbers.
_EXACT = {
    "P105": ("blue", "P-105, P-115, P-117", (1030, 508, 1285, 542)),
    "P115": ("blue", "P-105, P-115, P-117", (1030, 508, 1285, 542)),
    "P117": ("blue", "P-105, P-115, P-117", (1030, 508, 1285, 542)),
    "S101": ("blue", "S-101, S-102, S-121", (1035, 544, 1213, 604)),
    "S102": ("blue", "S-101, S-102, S-121", (1035, 544, 1213, 604)),
    "S121": ("blue", "S-101, S-102, S-121", (1035, 544, 1213, 604)),
    "S147": ("blue", "S-147", (1020, 608, 1105, 643)),
}

# These source annotations name an entire building, rather than room ranges.
_WHOLE_BUILDING = {
    "A": ("green", "A", (1176, 996, 1218, 1029)),
    "B": ("green", "B", (1176, 964, 1218, 995)),
    "D": ("green", "D", (1176, 932, 1218, 964)),
    "BG": ("green", "Bow Gym", (1284, 877, 1410, 908)),
    "TG": ("green", "Titan Gym", (1281, 904, 1418, 933)),
}


def _mapped(group: str, reference_label: str, pixels: tuple) -> dict:
    left, top, right, bottom = pixels
    destination = _DESTINATIONS[group]
    if group == "black":
        destination += f" — section labeled {reference_label}"
    return {
        "status": "mapped",
        "group": group,
        "color": _COLORS[group],
        "destination": destination,
        "reference_label": reference_label,
        "note": "Check the full reference map for the marked path to this assembly group.",
        "focus": {
            "x": left / IMAGE_WIDTH,
            "y": top / IMAGE_HEIGHT,
            "width": (right - left) / IMAGE_WIDTH,
            "height": (bottom - top) / IMAGE_HEIGHT,
        },
    }


def evacuation_for_room(room: dict) -> dict:
    """Return only assembly information explicitly supported by the source.

    Stable inventory IDs are intentionally not collapsed: two K6 rooms may
    have different map positions, but share the printed K6-K13 assembly group.
    Missing fields and rooms outside explicit groups return ``unconfirmed``.
    """
    label = str(room.get("label", "")).strip().upper()
    building = str(room.get("building", "")).strip().upper()
    canonical = re.sub(r"[\s-]+", "", label)
    numbered = re.fullmatch(r"([A-Z]+)([1-9][0-9]*)", canonical)
    # Inventory metadata must agree with the label before it can be mapped.
    matches_building = numbered is not None and numbered.group(1) == building
    is_library = building == "D" and canonical == "DLIB"
    is_gym = (building, canonical) in {("BG", "BOWGYM"), ("TG", "TITANGYM")}

    if building in _WHOLE_BUILDING and (matches_building or is_library or is_gym):
        return _mapped(*_WHOLE_BUILDING[building])
    if matches_building:
        if canonical in _EXACT:
            return _mapped(*_EXACT[canonical])
        number = int(numbered.group(2))
        for prefix, start, end, group, reference_label, pixels in _RANGES:
            if building == prefix and start <= number <= end:
                return _mapped(group, reference_label, pixels)

    note = "The supplied evacuation map does not clearly identify an assembly area for this room. Confirm the location with school staff."
    if canonical == "E01":
        note = "The supplied map labels E1-E2, while this classroom is labeled E01. Their correspondence is unconfirmed; confirm the location with school staff."
    return {
        "status": "unconfirmed",
        "group": None,
        "color": None,
        "destination": "Assembly area not confirmed for this room",
        "reference_label": None,
        "note": note,
        "focus": None,
    }
