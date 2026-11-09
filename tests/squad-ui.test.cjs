"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTeamId, validateSquad } = require("../squad.js");

function validSquad() {
  return {
    team: { id: 12345, name: "My FPL Team" },
    gameweek: { id: 10, deadline_time: "2026-11-06T18:30:00Z" },
    squad: Array.from({ length: 15 }, (_, index) => ({
      id: 200 + index, name: "Player " + index, club: "ARS", role: "MID",
      role_id: 3, squad_slot: index + 1,
      captain: index === 3, vice_captain: index === 5
    }))
  };
}

test("Team ID input is strictly numeric and length limited", () => {
  for (const invalid of ["", "0", "01", "1e2", "123abc", " 123", "123 ", "1234567890"]) {
    assert.equal(parseTeamId(invalid), null, invalid);
  }
  assert.equal(parseTeamId("12345"), 12345);
});

test("accepts verified roster with unique 1–15 squad slots", () => {
  const result = validateSquad(validSquad(), 12345);
  assert.equal(result.squad.length, 15);
  assert.equal(result.squad[0].squad_slot, 1);
  assert.equal(result.squad[14].squad_slot, 15);
});

test("rejects data for a different manager ID", () => {
  assert.throws(() => validateSquad(validSquad(), 22222), /Unexpected squad/);
});

test("rejects malformed player data and duplicate slots", () => {
  const duplicate = validSquad();
  duplicate.squad[1].squad_slot = 1;
  assert.throws(() => validateSquad(duplicate, 12345), /Incomplete player/);

  const fake = validSquad();
  fake.squad[0].name = "";
  assert.throws(() => validateSquad(fake, 12345), /Incomplete player/);
});

test("rejects missing captain instead of guessing a starter", () => {
  const invalid = validSquad();
  invalid.squad[3].captain = false;
  assert.throws(() => validateSquad(invalid, 12345), /Invalid captain/);
});
