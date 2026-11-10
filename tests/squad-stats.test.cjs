"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { playerCardStats, createPlayer, renderStarting, renderBench } = require("../squad.js");
const fs = require("node:fs");
const path = require("node:path");

function squadPlayer(slot, overrides = {}) {
  const role_id = slot === 1 || slot === 12 ? 1 : slot <= 5 ? 2 : slot <= 10 ? 3 : 4;
  return {
    id: slot + 100,
    name: slot === 6 ? "Muharemović" : "Player " + slot,
    club: slot % 2 ? "ARS" : "MCI", club_code: slot % 2 ? 3 : 43,
    role: ["", "GKP", "DEF", "MID", "FWD"][role_id], role_id, squad_slot: slot,
    captain: slot === 6, vice_captain: slot === 9,
    total_points: slot * 11, price_tenths: 60 + slot,
    ...overrides
  };
}

class Node {
  constructor(tag) {
    this.tag = tag;
    this.dataset = {};
    this.className = "";
    this.children = [];
    this.attributes = {};
    this.textContent = "";
    this.hidden = false;
  }
  append(...items) { this.children.push(...items); }
  setAttribute(key, val) { this.attributes[key] = val; }
  replaceChildren(...items) { this.children = items; }
}

function withDocument(callback) {
  const previous = global.document;
  global.document = {
    createElement: tag => new Node(tag),
    createDocumentFragment: () => new Node("fragment")
  };
  try { callback(); }
  finally {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  }
}

test("actual season points and now_cost tenths are formatted without predictions", () => {
  assert.deepEqual(playerCardStats({ total_points: 0, price_tenths: 75 }),
    { points: "0", price: "£7.5m" });
  assert.deepEqual(playerCardStats({ total_points: 154, price_tenths: 158 }),
    { points: "154", price: "£15.8m" });
});

test("missing or malformed statistics display dashes without guessing", () => {
  for (const player of [
    {}, { total_points: "154", price_tenths: "75" },
    { total_points: -1, price_tenths: 0 },
    { total_points: 2500, price_tenths: 2000 },
    { total_points: NaN, price_tenths: undefined }
  ]) assert.deepEqual(playerCardStats(player), { points: "—", price: "—" });
});

test("each player retains its shirt and name then adds semantic, text-only metrics", () => {
  withDocument(() => {
    const card = createPlayer(squadPlayer(2));
    assert.equal(card.className, "squad-player");
    assert.equal(card.dataset.club, "MCI");
    const [visual, caption] = card.children;
    assert.equal(visual.className, "player-visual");
    assert.equal(caption.children[0].textContent, "Player 2");
    assert.equal(caption.children[1].textContent, "MCI · DEF");
    const metrics = caption.children[2];
    assert.equal(metrics.className, "player-metrics");
    assert.deepEqual(metrics.children.map(row => row.children[1].textContent), ["22", "6.2m"]);
    assert.equal(metrics.children[0].attributes["aria-label"], "Season total points: 22");
    assert.equal(metrics.children[1].children[0].textContent, "£");
    assert.equal(metrics.children[1].attributes["aria-label"], "Current FPL price: £6.2m");
    assert.equal(visual.children[1].className, "player-kit-image");
  });
});

test("captain marker remains intact and missing stats never replace a player's name", () => {
  withDocument(() => {
    const card = createPlayer(squadPlayer(6, { total_points: null, price_tenths: null }));
    const [visual, caption] = card.children;
    assert.equal(visual.children[1].textContent, "C");
    assert.equal(caption.children[0].textContent, "Muharemović");
    assert.equal(caption.children[2].textContent, "Captain");
    assert.equal(caption.children[3].children[0].children[1].textContent, "—");
    assert.equal(caption.children[3].children[1].children[1].textContent, "—");
  });
});

test("all XI and bench cards include two metrics without changing published order", () => {
  withDocument(() => {
    const squad = Array.from({length:15},(_,i)=>squadPlayer(i+1));
    const pitch = new Node("pitch"),bench = new Node("bench");
    renderStarting(squad,pitch);
    renderBench(squad,bench);
    const first = pitch.children[0].children.flatMap(row=>row.children);
    const subs = bench.children[0].children;
    assert.equal(first.length,11);
    assert.equal(subs.length,4);
    assert.equal(first.every(card=>card.children[1].children.at(-1).children.length===2),true);
    assert.equal(subs.every(slot=>slot.children[1].children[1].children.at(-1).children.length===2),true);
    assert.equal(subs[0].children[0].textContent,"BENCH 1");
    assert.equal(subs[3].children[0].textContent,"BENCH 4");
  });
});

test("mobile layout retains compact bench and club accent while keeping five-player spacing", () => {
  const css=fs.readFileSync(path.join(__dirname,"../squad.css"),"utf8");
  const html=fs.readFileSync(path.join(__dirname,"../squad.html"),"utf8");
  assert.match(css, /\.player-metrics\s*\{/);
  assert.match(css, /\.squad-player\[data-club="ARS"\]/);
  assert.match(css, /\.squad-bench \.squad-player\s*\{\s*flex:0 0 auto/);
  assert.match(css, /\.player-metric-key\s*\{\s*font-size:\s*\.56rem/);
  assert.match(css, /\.squad-pitch\s*\{\s*min-height:\s*635px/);
  assert.match(html, /PTS = SEASON TOTAL/);
  assert.match(html, /squad\.css\?v=3\.8\.0/);
  assert.match(html, /squad\.js\?v=3\.7\.0/);
});
