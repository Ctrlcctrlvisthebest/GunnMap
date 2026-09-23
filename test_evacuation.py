"""Regression checks for safety-relevant room group transcription."""

import json
from pathlib import Path
import unittest

from evacuation import evacuation_for_room


class EvacuationMappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data = json.loads(Path(__file__).with_name("room_regions.json").read_text())
        cls.rooms = data["rooms"]
        cls.by_label = {room["label"]: room for room in cls.rooms}

    def lookup(self, label):
        return evacuation_for_room(self.by_label[label])

    def test_all_explicit_groups_and_boundaries(self):
        expected = {
            "red": ["H1", "H3", "H4", "H5", "G1", "G3", "G4", "G7", "F1", "F2", "F4", "F6"],
            "blue": ["M1", "M5", "P105", "P115", "P117", "S101", "S102", "S121"],
            "green": ["A101", "A137", "B101", "B120", "D-LIB", "D1", "D2", "BG111", "BG117", "BG138", "C1", "C3", "C4", "C8", "K1", "K5", "K6", "K13", "L1", "L4", "L5", "L8"],
            "black": ["J1", "J5", "J6", "J10", "N101", "N117", "N201", "N217"],
        }
        for group, labels in expected.items():
            for label in labels:
                with self.subTest(label=label):
                    result = self.lookup(label)
                    self.assertEqual(result["status"], "mapped")
                    self.assertEqual(result["group"], group)

    def test_rooms_outside_the_annotations_remain_unconfirmed(self):
        for label in ["E01", "E04", "E09", "E10", "E14", "E15", "E17", "H110", "H112", "K14", "K15", "K16", "K100", "K102", "K105", "K107", "K109", "N100", "N123", "N200", "N223", "P106", "P116"]:
            with self.subTest(label=label):
                result = self.lookup(label)
                self.assertEqual(result["status"], "unconfirmed")
                self.assertIsNone(result["focus"])
                self.assertIsNone(result["group"])

    def test_explicit_ranges_do_not_expand_beyond_boundaries(self):
        for building, numbers in {"H": [0, 6], "G": [0, 8], "F": [0, 3, 7], "K": [0, 14], "L": [0, 9], "J": [0, 11], "N": [100, 118, 200, 218], "M": [0, 6], "C": [0, 9], "E": [0, 3]}.items():
            for number in numbers:
                with self.subTest(building=building, number=number):
                    result = evacuation_for_room({"building": building, "label": f"{building}{number}"})
                    self.assertEqual(result["status"], "unconfirmed")

    def test_explicit_labels_without_current_inventory_entries(self):
        for building, label, group in [("S", "S147", "blue"), ("E", "E1", "green"), ("E", "E2", "green"), ("TG", "Titan Gym", "green")]:
            with self.subTest(label=label):
                result = evacuation_for_room({"building": building, "label": label})
                self.assertEqual(result["group"], group)

    def test_field_groups_have_distinct_label_positions(self):
        groups = [self.lookup(label) for label in ["J1", "J6", "N101", "N201"]]
        self.assertEqual(len({item["reference_label"] for item in groups}), 4)
        self.assertEqual(len({tuple(item["focus"].values()) for item in groups}), 4)
        self.assertLess(groups[0]["focus"]["y"], groups[1]["focus"]["y"])
        self.assertGreater(groups[2]["focus"]["y"], groups[3]["focus"]["y"])
        for item in groups:
            self.assertIn(item["reference_label"], item["destination"])

    def test_duplicate_k6_room_ids_share_the_same_annotation(self):
        duplicates = [room for room in self.rooms if room["label"] == "K6"]
        self.assertEqual({room["id"] for room in duplicates}, {"R069", "R070"})
        before = json.dumps(duplicates, sort_keys=True)
        self.assertEqual(evacuation_for_room(duplicates[0]), evacuation_for_room(duplicates[1]))
        self.assertEqual(evacuation_for_room(duplicates[0])["reference_label"], "K6-K13")
        self.assertEqual(json.dumps(duplicates, sort_keys=True), before)

    def test_normalization_preserves_ambiguous_leading_zeroes(self):
        self.assertEqual(evacuation_for_room({"building": "p", "label": " p-105 "})["group"], "blue")
        self.assertEqual(evacuation_for_room({"building": "E", "label": "E01"})["status"], "unconfirmed")
        self.assertEqual(evacuation_for_room({"building": "H", "label": "H01"})["status"], "unconfirmed")
        self.assertEqual(evacuation_for_room({"building": "J", "label": "H1"})["status"], "unconfirmed")
        self.assertEqual(evacuation_for_room({})["status"], "unconfirmed")

    def test_every_inventory_result_has_a_safe_json_schema(self):
        keys = {"status", "group", "color", "destination", "reference_label", "note", "focus"}
        for room in self.rooms:
            with self.subTest(label=room["label"], id=room["id"]):
                result = evacuation_for_room(room)
                self.assertEqual(set(result), keys)
                self.assertEqual(json.loads(json.dumps(result)), result)
                if result["status"] == "mapped":
                    focus = result["focus"]
                    self.assertTrue(0 <= focus["x"] < 1)
                    self.assertTrue(0 <= focus["y"] < 1)
                    self.assertTrue(0 < focus["width"] <= 1 - focus["x"])
                    self.assertTrue(0 < focus["height"] <= 1 - focus["y"])


if __name__ == "__main__":
    unittest.main()
