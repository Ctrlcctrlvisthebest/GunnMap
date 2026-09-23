"""Small local web UI for the seven-period Gunn room highlighter."""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from html import escape
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageColor, ImageDraw, ImageFont

from map_highlighter import highlight_rooms


ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
MAP = ROOT / "src" / "map" / "gunn_site_map.png"
OUTPUT = ROOT / "output" / "period_map.png"
ROOMS = json.loads((ROOT / "room_regions.json").read_text(encoding="utf-8"))["rooms"]
BUILDINGS = sorted({room["building"] for room in ROOMS}, key=lambda name: (name == "BG", name))
BY_ID = {room["id"].casefold(): room for room in ROOMS}
BY_BUILDING = defaultdict(list)
for _room in ROOMS:
    BY_BUILDING[_room["building"]].append(_room)


def _normalise(value: str) -> str:
    return re.sub(r"[\s-]+", "", value).casefold()


def _resolve_room(building: str, value: str) -> dict:
    if building not in BY_BUILDING:
        raise ValueError(f"Unknown building: {building}")
    value = value.strip()
    tagged = re.fullmatch(r".+\((R\d{3})\)", value, flags=re.IGNORECASE)
    key = (tagged.group(1) if tagged else value).casefold()
    if key in BY_ID:
        room = BY_ID[key]
        if room["building"] != building:
            raise ValueError(f"{room['label']} is not in {building} Building")
        return room

    matches = [
        room
        for room in BY_BUILDING[building]
        if _normalise(value) in {_normalise(room["label"]), *(_normalise(alias) for alias in room.get("aliases", []))}
    ]
    if not matches:
        raise ValueError(f"Room {value!r} was not found in {building} Building")
    if len(matches) > 1:
        choices = "、".join(f"{room['label']} ({room['id']})" for room in matches)
        raise ValueError(f"{value} appears twice on the map. Choose {choices}")
    return matches[0]


def _add_schedule_legend(image_path: Path, selected: list[dict]) -> None:
    if not selected:
        return
    with Image.open(image_path) as source:
        map_image = source.convert("RGB")
    padding = 24
    header_height = 42
    row_height = 34
    legend_height = padding * 2 + header_height + row_height * len(selected)
    canvas = Image.new("RGB", (map_image.width, map_image.height + legend_height), "white")
    canvas.paste(map_image, (0, 0))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=26)
    row_font = ImageFont.load_default(size=22)
    legend_top = map_image.height
    draw.text((padding, legend_top + padding), "Schedule Legend", fill="#182334", font=font)
    for index, item in enumerate(selected):
        y = legend_top + padding + header_height + index * row_height
        draw.rectangle((padding, y + 4, padding + 22, y + 26), fill=ImageColor.getcolor(item["color"], "RGB"))
        label = f"Period {item['period']} · {item['label']}"
        if item.get("floor") == 2:
            label += " (2F)"
        draw.text((padding + 34, y), label, fill="#344054", font=row_font)
    canvas.save(image_path, format="PNG")


def _render_periods(periods: object) -> dict:
    if not isinstance(periods, list) or len(periods) != 7:
        raise ValueError("Please submit all seven period slots")
    colors = defaultdict(list)
    selected = []
    for index, period in enumerate(periods, 1):
        if not isinstance(period, dict):
            raise ValueError(f"Period {index} has invalid data")
        building = str(period.get("building", "")).strip().upper()
        room_name = str(period.get("room", "")).strip()
        color = str(period.get("color", "")).strip()
        if not building and not room_name:
            continue
        if not building or not room_name:
            raise ValueError(f"Period {index}: choose a building and enter a room")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise ValueError(f"Period {index}: invalid color")
        try:
            room = _resolve_room(building, room_name)
        except ValueError as exc:
            raise ValueError(f"Period {index}: {exc}") from exc
        colors[room["id"]].append(color)
        selected.append({"period": index, "id": room["id"], "label": room["label"], "building": building, "floor": room.get("floor", 1), "color": color})

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.parent / f".period_map_{uuid.uuid4().hex}.png"
    try:
        highlight_rooms(colors, temp, opacity=0.55)
        _add_schedule_legend(temp, selected)
        os.replace(temp, OUTPUT)
    finally:
        temp.unlink(missing_ok=True)
    return {"image_url": f"/output/period_map.png?v={time.time_ns()}", "selected": selected, "warnings": []}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path, content_type: str) -> None:
        if not path.is_file():
            self.send_error(404)
            return
        self._send(200, path.read_bytes(), content_type)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            return self._file(WEB / "index.html", "text/html; charset=utf-8")
        if path == "/app.js":
            return self._file(WEB / "app.js", "text/javascript; charset=utf-8")
        if path == "/style.css":
            return self._file(WEB / "style.css", "text/css; charset=utf-8")
        if path.startswith("/__source/"):
            source_name = path.removeprefix("/__source/")
            source_path = {
                "app.js": WEB / "app.js",
                "index.html": WEB / "index.html",
                "style.css": WEB / "style.css",
                "web_app.py": ROOT / "web_app.py",
                "map_highlighter.py": ROOT / "map_highlighter.py",
                "README.md": ROOT / "README.md",
            }.get(source_name)
            if source_path is None or not source_path.is_file():
                self.send_error(404)
                return
            body = f'<textarea id="source">{escape(source_path.read_text(encoding="utf-8"))}</textarea>'.encode("utf-8")
            return self._send(200, body, "text/html; charset=utf-8")
        if path == "/map.png":
            return self._file(MAP, "image/png")
        if path == "/output/period_map.png":
            return self._file(OUTPUT, "image/png")
        if path == "/api/rooms":
            data = {
                "buildings": BUILDINGS,
                "rooms": [
                    {"id": room["id"], "label": room["label"], "building": room["building"], "floor": room.get("floor", 1), "aliases": room.get("aliases", [])}
                    for room in ROOMS
                ],
            }
            return self._send(200, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")
        if path == "/favicon.ico":
            return self._send(204, b"", "image/x-icon")
        self.send_error(404)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/render":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16000:
                raise ValueError("Request is empty or too large")
            payload = json.loads(self.rfile.read(length))
            result = _render_periods(payload.get("periods"))
        except (ValueError, TypeError, AttributeError, json.JSONDecodeError) as exc:
            body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8")
            return self._send(400, body, "application/json; charset=utf-8")
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self._send(200, body, "application/json; charset=utf-8")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Open http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
