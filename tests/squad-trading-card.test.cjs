"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPlayer, renderStarting, renderBench } = require("../squad.js");

const css = fs.readFileSync(path.join(__dirname, "../squad.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../squad.html"), "utf8");

class Node {
  constructor(tag) {
    this.tagName = tag;
    this.className = "";
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = "";
    this.hidden = false;
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceChildren(...children) { this.children = children; }
}

function withDOM(fn) {
  const previous = global.document;
  global.document = {
    createElement: tag => new Node(tag),
    createDocumentFragment: () => new Node("fragment")
  };
  try { fn(); }
  finally {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  }
}

function player(i, overrides = {}) {
  const role = i === 1 || i === 12 ? "GKP" : i <= 4 ? "DEF" : i <= 9 ? "MID" : "FWD";
  return {
    id: 100 + i, name: "Player " + i,
    club: i % 2 ? "ARS" : "MCI",
    club_code: i % 2 ? 3 : 43,
    role, role_id: ["","GKP","DEF","MID","FWD"].indexOf(role),
    squad_slot: i,
    captain: i === 6, vice_captain: i === 8,
    total_points: i * 12, price_tenths: 63 + i,
    ...overrides
  };
}

test("each card exposes FPL role and captaincy without changing jersey or text structure", () => {
  withDOM(() => {
    const regular = createPlayer(player(2));
    const captain = createPlayer(player(6));
    const vice = createPlayer(player(8));
    assert.equal(regular.className, "squad-player");
    assert.equal(regular.dataset.role, "DEF");
    assert.equal(regular.dataset.captaincy, "none");
    assert.equal(captain.dataset.role, "MID");
    assert.equal(captain.dataset.captaincy, "captain");
    assert.equal(vice.dataset.captaincy, "vice");
    assert.equal(regular.children.length, 2); // Jersey block + caption, no extra nesting
    assert.equal(regular.children[0].children.at(-1).className, "player-kit-image");
    assert.equal(regular.children[1].children[0].textContent, "Player 2");
  });
});

test("season points appear once, in a corner badge, with current price on the lower rail", () => {
  withDOM(() => {
    const card = createPlayer(player(6));
    const label = card.children[1];
    const metrics = label.children.at(-1);
    assert.equal(metrics.className, "player-metrics");
    assert.equal(metrics.children.length, 2);
    assert.equal(metrics.children[0].children[0].textContent, "PTS");
    assert.equal(metrics.children[0].children[1].textContent, "72");
    assert.equal(metrics.children[0].attributes["aria-label"], "Season total points: 72");
    assert.equal(metrics.children[1].children[0].textContent, "£");
    assert.equal(metrics.children[1].children[1].textContent, "6.9m");
    assert.equal(metrics.children[1].attributes["aria-label"], "Current FPL price: £6.9m");
  });
  assert.match(css, /\.player-metric:first-child\s*\{\s*position:absolute/);
  assert.match(css, /\.player-metric:last-child\s*\{/);
  // The card is the nearest positioned ancestor: do not accidentally anchor the
  // points badge inside the lower nameplate.
  const caption = css.match(/\.player-caption\s*\{([^}]*)\}/);
  assert.ok(caption);
  assert.doesNotMatch(caption[1], /position:\s*relative/);
  assert.match(css, /\.squad-player\s*\{\s*position:relative/);
});

test("club-accent frame stays compact on a five-player row, bench remains in order", () => {
  withDOM(() => {
    const team = Array.from({length:15},(_,i)=>player(i+1));
    const starting = new Node("pitch"),bench = new Node("bench");
    renderStarting(team,starting);
    renderBench(team,bench);
    const rows = starting.children[0].children;
    assert.equal(rows.reduce((count,row)=>count+row.children.length,0),11);
    assert.equal(rows.find(row=>row.children[0].dataset.role==="MID").children.length,5);
    assert.equal(bench.children[0].children.length,4);
    assert.equal(bench.children[0].children[0].children[0].textContent,"BENCH 1");
    assert.equal(bench.children[0].children[3].children[0].textContent,"BENCH 4");
  });
  assert.match(css, /\.squad-player\[data-club="ARS"\]/);
  assert.match(css, /\.squad-player::before\s*\{\s*content:attr\(data-role\)/);
  assert.match(css, /\.squad-player\[data-captaincy="captain"\]/);
  assert.match(css, /\.squad-bench \.squad-player\s*\{\s*flex:0 0 auto/);
  assert.match(css, /\.squad-pitch\s*\{\s*min-height:\s*635px/);
  assert.match(html, /squad\.css\?v=3\.8\.0/);
  assert.match(html, /squad\.js\?v=3\.7\.0/);
  assert.match(css, /grid-template-rows:repeat\(4,max-content\)/);
  assert.match(css, /align-content:space-evenly/);
  assert.match(css, /\.player-caption\s*\{[^}]*flex:0 0 auto/);
  assert.match(css, /\.player-metrics\s*\{[^}]*margin-top:\.24rem/);
});

test("unavailable points are not guessed or replaced with a fictitious card rating", () => {
  withDOM(() => {
    const card = createPlayer(player(2,{total_points:null,price_tenths:null}));
    const stats = card.children[1].children.at(-1).children;
    assert.equal(stats[0].children[1].textContent, "—");
    assert.equal(stats[1].children[1].textContent, "—");
  });
});
