"""Offline contract tests for the gameweek snapshot generator."""
import unittest
from datetime import datetime, timezone

from scripts.sync_gameweek import normalize_events, parse_utc


def sample_events():
    return [{
        "id": number,
        "name": f"Gameweek {number}",
        "deadline_time": f"2026-{(number - 1) // 4 + 1:02d}-{(number - 1) % 4 + 1:02d}T10:00:00Z",
        "is_current": number == 7,
        "is_next": number == 8,
        "finished": number < 7,
    } for number in range(1, 39)]


class GameweekSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 2, 1, tzinfo=timezone.utc)

    def test_array_endpoint_shape(self):
        data = normalize_events(sample_events(), "https://example.test/api/events/", self.now)
        self.assertEqual(data["schema_version"], 1)
        self.assertEqual(len(data["events"]), 38)
        self.assertEqual(data["events"][6]["id"], 7)
        self.assertEqual(data["events"][7]["is_next"], True)
        self.assertEqual(data["fetched_at"], "2026-02-01T00:00:00Z")

    def test_bootstrap_object_shape(self):
        data = normalize_events({"events": sample_events()}, "bootstrap", self.now)
        self.assertEqual(len(data["events"]), 38)

    def test_utc_dates_normalized(self):
        events = sample_events()
        events[0]["deadline_time"] = "2026-01-01T18:00:00+08:00"
        data = normalize_events(events, "events", self.now)
        self.assertEqual(data["events"][0]["deadline_time"], "2026-01-01T10:00:00Z")

    def test_reject_duplicate_games(self):
        events = sample_events()
        events[1]["id"] = 1
        with self.assertRaises(ValueError):
            normalize_events(events, "events", self.now)

    def test_reject_multiple_current(self):
        events = sample_events()
        events[8]["is_current"] = True
        with self.assertRaises(ValueError):
            normalize_events(events, "events", self.now)

    def test_reject_missing_or_naive_deadline(self):
        events = sample_events()
        events[0]["deadline_time"] = "2026-01-01T10:00:00"
        with self.assertRaises(ValueError):
            normalize_events(events, "events", self.now)

    def test_reject_too_few_events(self):
        with self.assertRaises(ValueError):
            normalize_events(sample_events()[:2], "events", self.now)

    def test_date_parser(self):
        self.assertEqual(parse_utc("2026-01-01T10:00:00Z").tzinfo, timezone.utc)


if __name__ == "__main__":
    unittest.main()
