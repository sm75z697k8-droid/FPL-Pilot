"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { validateSnapshot, chooseUpcoming, formatCountdown } = require("../gameweek.js");

const now = Date.parse("2026-11-10T00:00:00Z");
const events = Array.from({ length: 38 }, (_, i) => ({
  id: i + 1,
  deadline_time: new Date(now + (i - 10) * 7 * 86400_000 + 86400_000).toISOString(),
  is_current: i === 9,
  is_next: i === 10,
}));
const snapshot = {
  schema_version: 1,
  fetched_at: new Date(now - 15 * 60_000).toISOString(),
  events,
};

test("accepts validated current snapshots", () => {
  const data = validateSnapshot(snapshot, now);
  assert.equal(data.delayed, false);
  assert.equal(data.events.length, 38);
});

test("rejects expired snapshots instead of inventing a deadline", () => {
  const old = { ...snapshot, fetched_at: new Date(now - 25 * 3600_000).toISOString() };
  assert.throws(() => validateSnapshot(old, now), /too old/);
});

test("recognizes delayed snapshots", () => {
  const old = { ...snapshot, fetched_at: new Date(now - 5 * 3600_000).toISOString() };
  assert.equal(validateSnapshot(old, now).delayed, true);
});

test("chooses the soonest future deadline", () => {
  assert.equal(chooseUpcoming(events, now).id, 11);
});

test("handles end-of-season without a fictional event", () => {
  assert.equal(chooseUpcoming(events, now + 300 * 86400_000), null);
});

test("countdown and expiry are stable", () => {
  assert.equal(formatCountdown(now + 86400_000 + 61000, now), "1d  00h  01m  01s");
  assert.equal(formatCountdown(now, now), "Deadline passed");
});

test("invalid timestamps cannot reach the interface", () => {
  const bad = { ...snapshot, events: [{ id: 1, deadline_time: "not-a-date" }, ...events.slice(1)] };
  assert.throws(() => validateSnapshot(bad, now), /Invalid gameweek/);
});
