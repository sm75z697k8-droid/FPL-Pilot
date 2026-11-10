"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readSavedTeamId, saveTeamId, forgetTeamId, init } = require("../squad.js");

const KEY = "fplpilot.savedTeamId.v1";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    get values() { return values; }
  };
}

function mockSquad(teamId = 12345, teamName = "The Team") {
  return {
    team: { id: teamId, name: teamName },
    gameweek: { id: 10, deadline_time: "2026-11-06T18:30:00Z" },
    squad: Array.from({ length: 15 }, (_, index) => ({
      id: 101 + index,
      name: "Player " + index,
      role: index === 0 ? "GKP" : "MID",
      role_id: index === 0 ? 1 : 3,
      club: "ARS", squad_slot: index + 1,
      captain: index === 1, vice_captain: index === 2
    }))
  };
}

class Node {
  constructor(name = "div") {
    this.name = name;
    this.events = {};
    this.children = [];
    this.attributes = {};
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
  }
  addEventListener(name, fn) { this.events[name] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
}

const IDS = [
  "squad-form", "team-id", "squad-submit", "squad-state",
  "squad-message", "squad-data", "squad-team-name",
  "squad-team-reference", "squad-gameweek", "squad-starting",
  "squad-bench", "squad-context", "squad-fetched",
  "saved-team", "saved-team-heading", "saved-team-id",
  "saved-team-reload", "saved-team-change", "saved-team-forget"
];

function setup(memory, fetcher = async () => ({ ok: true, json: async () => mockSquad() })) {
  const previous = { window: global.window, document: global.document, fetch: global.fetch };
  const nodes = Object.fromEntries(IDS.map(id => [id, new Node(id)]));
  nodes["saved-team"].hidden = true;
  nodes["squad-data"].hidden = true;
  const calls = [];
  global.window = { localStorage: memory };
  global.document = {
    getElementById: id => nodes[id],
    createElement: tag => new Node(tag),
    createDocumentFragment: () => new Node("#fragment")
  };
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return fetcher(url, options);
  };
  init();
  return {
    nodes, calls,
    submit: async id => {
      nodes["team-id"].value = id;
      await nodes["squad-form"].events.submit({ preventDefault() {} });
    },
    click: name => nodes[name].events.click(),
    restore: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete global[key];
        else global[key] = value;
      }
    }
  };
}

test("only a valid numeric public Team ID is saved", () => {
  const memory = storage();
  assert.equal(saveTeamId(12345, memory), true);
  assert.deepEqual([...memory.values.keys()], [KEY]);
  assert.equal(memory.getItem(KEY), "12345");
  assert.equal(readSavedTeamId(memory), 12345);
  assert.equal(saveTeamId("bad-id", memory), false);
  assert.equal(memory.getItem(KEY), "12345");
  assert.equal(forgetTeamId(memory), true);
  assert.equal(readSavedTeamId(memory), null);
});

test("invalid persisted IDs are discarded safely, and restricted storage degrades", () => {
  const invalid = storage({ [KEY]: "<script>" });
  assert.equal(readSavedTeamId(invalid), null);
  assert.equal(invalid.getItem(KEY), null);
  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); }
  };
  assert.equal(readSavedTeamId(unavailable), null);
  assert.equal(saveTeamId(12345, unavailable), false);
  assert.equal(forgetTeamId(unavailable), false);
});

test("successful lookup remembers ID, auto-loads on return, and allows change or forget", async () => {
  const memory = storage();
  const first = setup(memory);
  try {
    assert.equal(first.calls.length, 0);
    await first.submit("12345");
    assert.equal(memory.getItem(KEY), "12345");
    assert.equal(first.nodes["saved-team"].hidden, false);
    assert.equal(first.nodes["squad-form"].hidden, true);
    assert.equal(first.nodes["saved-team-heading"].textContent, "The Team");
    assert.equal(first.nodes["squad-data"].hidden, false);
    first.click("saved-team-change");
    assert.equal(first.nodes["squad-form"].hidden, false);
    assert.equal(memory.getItem(KEY), "12345"); // Don't lose saved team until replacement succeeds.
    assert.equal(first.nodes["team-id"].selected, true);
    first.nodes["team-id"].value = "invalid";
    await first.nodes["squad-form"].events.submit({ preventDefault() {} });
    assert.equal(memory.getItem(KEY), "12345");
    assert.equal(first.nodes["squad-state"].textContent, "UNAVAILABLE");
  } finally { first.restore(); }

  const second = setup(memory);
  try {
    assert.equal(second.calls.length, 1); // Auto-load from saved ID.
    assert.match(second.calls[0].url, /team=12345$/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(second.nodes["saved-team"].hidden, false);
    assert.equal(second.nodes["squad-data"].hidden, false);
    second.click("saved-team-forget");
    assert.equal(memory.getItem(KEY), null);
    assert.equal(second.nodes["squad-form"].hidden, false);
    assert.equal(second.nodes["squad-data"].hidden, true);
  } finally { second.restore(); }
});

test("failed squad fetch never remembers an invalid or unavailable team", async () => {
  const memory = storage();
  const ui = setup(memory, async () => ({ ok: false, json: async () => ({ error: "Team not found" }) }));
  try {
    await ui.submit("12345");
    assert.equal(memory.getItem(KEY), null);
    assert.equal(ui.nodes["squad-state"].textContent, "UNAVAILABLE");
    assert.equal(ui.nodes["squad-form"].hidden, false);
  } finally { ui.restore(); }
});

test("storage failure still displays a valid squad without claiming it was remembered", async () => {
  const memory = {
    getItem: () => null,
    setItem: () => { throw new Error("private mode"); },
    removeItem: () => {}
  };
  const ui = setup(memory);
  try {
    await ui.submit("12345");
    assert.equal(ui.nodes["squad-data"].hidden, false);
    assert.equal(ui.nodes["squad-form"].hidden, false);
    assert.equal(ui.nodes["saved-team"].hidden, true);
    assert.match(ui.nodes["squad-message"].textContent, /storage is unavailable/);
  } finally { ui.restore(); }
});
