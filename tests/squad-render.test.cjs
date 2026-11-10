"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlayer, renderStarting, renderBench } = require("../squad.js");

class ElementStub {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(name, value) { this.attributes[name] = value; }
}
function withDocument(callback) {
  const previous = global.document;
  global.document = {
    createElement: name => new ElementStub(name),
    createDocumentFragment: () => new ElementStub("#fragment")
  };
  try { callback(); }
  finally {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  }
}
const players = Array.from({ length: 15 }, (_, index) => ({
  id: index + 101,
  name: index === 5 ? "Saka" : "Player " + (index + 1),
  club: "ARS",
  role_id: index === 0 || index === 11 ? 1 :
    index >= 1 && index <= 4 || index === 12 ? 2 :
    index >= 5 && index <= 7 || index === 13 ? 3 : 4,
  role: index === 0 || index === 11 ? "GKP" :
    index >= 1 && index <= 4 || index === 12 ? "DEF" :
    index >= 5 && index <= 7 || index === 13 ? "MID" : "FWD",
  squad_slot: index + 1,
  captain: index === 5,
  vice_captain: index === 9
}));

test("player caption retains verified name and club without HTML injection", () => {
  withDocument(() => {
    const player = createPlayer({ ...players[1], name: "<img onerror=alert(1)>" });
    assert.equal(player.className, "squad-player");
    assert.equal(player.children.length, 2);
    const [visual, caption] = player.children;
    assert.equal(visual.className, "player-visual");
    assert.equal(visual.attributes["aria-hidden"], "true");
    assert.equal(caption.className, "player-caption");
    assert.equal(caption.children[0].textContent, "<img onerror=alert(1)>");
    assert.equal(caption.children[1].textContent, "ARS · DEF");
  });
});

test("captain and vice captain appear as distinct shirt badges with accessible descriptions", () => {
  withDocument(() => {
    const captain = createPlayer(players[5]);
    const vice = createPlayer(players[9]);
    assert.equal(captain.children[0].children[1].textContent, "C");
    assert.equal(captain.children[0].children[1].dataset.kind, "captain");
    assert.equal(captain.children[1].children[2].textContent, "Captain");
    assert.equal(vice.children[0].children[1].textContent, "VC");
    assert.equal(vice.children[0].children[1].dataset.kind, "vice");
    assert.equal(vice.children[1].children[2].textContent, "Vice captain");
    const regular = createPlayer(players[1]);
    assert.equal(regular.children[0].children.length, 1);
  });
});

test("published starting eleven stays arranged into real position lines", () => {
  withDocument(() => {
    const target = new ElementStub("div");
    renderStarting(players, target);
    const rows = target.children[0].children;
    assert.deepEqual(rows.map(row => row.children.length), [3, 3, 4, 1]);
    assert.equal(rows[0].children[0].children[1].children[1].textContent, "ARS · FWD");
  });
});

test("bench retains four published players and substitute order", () => {
  withDocument(() => {
    const target = new ElementStub("div");
    renderBench(players, target);
    const slots = target.children[0].children;
    assert.equal(slots.length, 4);
    assert.equal(slots[0].children[0].textContent, "BENCH 1");
    assert.equal(slots[3].children[0].textContent, "BENCH 4");
    assert.equal(slots[3].children[1].children[1].children[0].textContent, "Player 15");
  });
});


test("official FPL shirt URLs require a valid club code from the backend", () => {
  const { officialKitUrl } = require("../squad.js");
  assert.equal(officialKitUrl({ club_code: 3 }), "https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_3-110.png");
  assert.equal(officialKitUrl({ club_code: 3 }, true), "https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_3_1-110.png");
  for (const value of [null, undefined, "3", -2, 0, 10000, NaN]) {
    assert.equal(officialKitUrl({ club_code: value }), null);
  }
});

test("official club shirt loads, replaces illustrated shirt, then preserves the player caption", () => {
  withDocument(() => {
    const player = createPlayer({ ...players[1], club_code: 3 });
    const [fallback, image] = player.children[0].children;
    assert.equal(fallback.className, "player-kit");
    assert.equal(image.className, "player-kit-image");
    assert.equal(image.src, "https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_3-110.png");
    // Regression: lazy + display:none prevented Safari from fetching jerseys.
    assert.equal(image.loading, "eager");
    assert.equal(image.hidden, false);
    assert.equal(image.alt, "");
    assert.equal(image.dataset.loaded, undefined);
    image.onload();
    assert.equal(image.dataset.loaded, "true");
    assert.equal(image.hidden, false);
    assert.equal(fallback.hidden, true);
    assert.equal(player.children[1].children[0].textContent, "Player 2");
  });
});

test("unavailable official image keeps the original illustrated jersey", () => {
  withDocument(() => {
    const player = createPlayer({ ...players[1], club_code: 3 });
    const [fallback, image] = player.children[0].children;
    assert.equal(fallback.hidden, false);
    assert.equal(image.hidden, false);
    image.onerror();
    assert.equal(image.hidden, true);
    assert.equal(fallback.hidden, false);
  });
});

test("goalkeepers try the official keeper variant then the home jersey", () => {
  withDocument(() => {
    const player = createPlayer({ ...players[0], club_code: 3 });
    const [fallback, image] = player.children[0].children;
    assert.match(image.src, /shirt_3_1-110\.png$/);
    image.onerror();
    assert.match(image.src, /shirt_3-110\.png$/);
    image.onerror();
    assert.equal(fallback.hidden, false);
    assert.equal(image.hidden, true);
  });
});
