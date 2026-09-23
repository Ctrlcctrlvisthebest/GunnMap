"""Regression checks for room identity and independent browser map renders."""

from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

import web_app


def periods_for(building, room, color="#0284c7"):
    return [{"building": building, "room": room, "color": color}] + [
        {"building": "", "room": "", "color": "#000000"} for _ in range(6)
    ]


class QuietHandler(web_app.Handler):
    def log_message(self, format, *args):
        pass


@contextmanager
def running_server():
    with ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            thread.join()


class RoomRenderTests(unittest.TestCase):
    def test_n214_input_variants_resolve_to_same_room(self):
        for value in ("N214", "n214", "n-214", " N214 "):
            with self.subTest(value=value):
                room = web_app._resolve_room("N", value)
                self.assertEqual(room["id"], "R148")
                self.assertEqual(room["label"], "N214")
                self.assertEqual(room["building"], "N")

    def test_blue_period_color_does_not_change_n214_assembly_group(self):
        with TemporaryDirectory() as directory, patch.object(
            web_app, "OUTPUT", Path(directory) / "period_map.png"
        ):
            result = web_app._render_periods(periods_for("n", "n214"))
        selected = result["selected"][0]
        self.assertEqual(selected["label"], "N214")
        self.assertEqual(selected["color"], "#0284c7")
        self.assertEqual(selected["evacuation"]["group"], "black")
        self.assertEqual(selected["evacuation"]["reference_label"], "N201-N217")
        self.assertEqual(
            selected["evacuation"]["destination"],
            "Football field — section labeled N201-N217",
        )
        expected = web_app._resolve_room("N", "N214")
        self.assertEqual(selected["polygon"], expected["polygon"])
        self.assertEqual(selected["marker"], [1663.5, 574.5])

    def test_later_render_cannot_replace_an_earlier_tabs_image(self):
        with TemporaryDirectory() as directory, patch.object(
            web_app, "OUTPUT", Path(directory) / "period_map.png"
        ):
            first = web_app._render_periods(periods_for("M", "M3"))
            first_path = Path(directory) / Path(first["image_url"]).name
            first_bytes = first_path.read_bytes()
            second = web_app._render_periods(periods_for("N", "n214"))
            second_path = Path(directory) / Path(second["image_url"]).name
            second_bytes = second_path.read_bytes()

            self.assertNotEqual(first["image_url"], second["image_url"])
            self.assertNotEqual(first_bytes, second_bytes)
            self.assertEqual(first_path.read_bytes(), first_bytes)
            self.assertEqual(web_app.OUTPUT.read_bytes(), second_bytes)
            for result, room_name, group in ((first, "M3", "blue"), (second, "N214", "black")):
                selected = result["selected"][0]
                expected = web_app._resolve_room(room_name[0], room_name)
                self.assertEqual(selected["id"], expected["id"])
                self.assertEqual(selected["polygon"], expected["polygon"])
                self.assertEqual(selected["evacuation"]["group"], group)

            with running_server() as address:
                for url, expected_bytes in (
                    (first["image_url"], first_bytes),
                    (second["image_url"], second_bytes),
                    ("/output/period_map.png", second_bytes),
                ):
                    with self.subTest(url=url), urlopen(address + url) as response:
                        self.assertEqual(response.headers["Content-Type"], "image/png")
                        self.assertEqual(response.read(), expected_bytes)
                for url in (
                    "/output/period_map_not-a-render.png",
                    "/output/../room_regions.json",
                    "/output/%2e%2e/room_regions.json",
                    "/output/period_map_" + "a" * 32 + ".png",
                ):
                    with self.subTest(url=url), self.assertRaises(HTTPError) as error:
                        urlopen(address + url)
                    self.assertEqual(error.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
