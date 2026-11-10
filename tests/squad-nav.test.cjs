"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { activeSectionAt, initSquadNavigation } = require("../squad-nav.js");

const IDS = [
  "squad-team-summary",
  "squad-starting-section",
  "squad-bench-section"
];

test("scroll tracking chooses the latest section above the sticky bar", () => {
  const sections = IDS.map((id, index) => ({ id, top: [140, 590, 1250][index] }));
  assert.equal(activeSectionAt(sections, 85), IDS[0]);
  sections[0].top = -150;
  sections[1].top = 80;
  assert.equal(activeSectionAt(sections, 85), IDS[1]);
  sections[2].top = 75;
  assert.equal(activeSectionAt(sections, 85), IDS[2]);
  assert.equal(activeSectionAt([], 85), null);
});

function simulateNavigation(run) {
  const previous = {
    document: global.document,
    window: global.window,
    MutationObserver: global.MutationObserver
  };
  const top = { [IDS[0]]: 140, [IDS[1]]: 590, [IDS[2]]: 1250 };
  const attrs = IDS.map((id, index) => new Map(index === 0 ? [["aria-current", "location"]] : []));
  const links = IDS.map((id, index) => ({
    getAttribute: key => key === "href" ? "#" + id : (attrs[index].get(key) ?? null),
    setAttribute: (key, val) => attrs[index].set(key, val),
    removeAttribute: key => attrs[index].delete(key),
    hasAttribute: key => attrs[index].has(key)
  }));
  const data = { hidden: false };
  const nav = {
    querySelectorAll: selector => selector === 'a[href^="#"]' ? links : [],
    getBoundingClientRect: () => ({ bottom: 70 })
  };
  const sections = Object.fromEntries(IDS.map(id => [id, {
    id, getBoundingClientRect: () => ({ top: top[id] })
  }]));
  const listeners = {};
  let visibilityObserver = null;
  global.document = {
    getElementById: id => id === "squad-quick-nav" ? nav
      : id === "squad-data" ? data : (sections[id] ?? null)
  };
  global.window = {
    requestAnimationFrame: cb => cb(),
    addEventListener: (name, callback) => { listeners[name] = callback; }
  };
  global.MutationObserver = class {
    constructor(callback) { visibilityObserver = callback; }
    observe(target, options) {
      assert.equal(target, data);
      assert.deepEqual(options.attributeFilter, ["hidden"]);
    }
  };
  try {
    initSquadNavigation();
    run({ top, links, attrs, data, listeners, notify: () => visibilityObserver() });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete global[name];
      else global[name] = value;
    }
  }
}

test("active label updates on scroll while native links remain intact", () => {
  simulateNavigation(({ top, links, attrs, listeners }) => {
    assert.equal(attrs[0].get("aria-current"), "location");
    assert.equal(links[2].getAttribute("href"), "#squad-bench-section");
    top[IDS[0]] = -250; top[IDS[1]] = 80;
    listeners.scroll();
    assert.equal(attrs[0].has("aria-current"), false);
    assert.equal(attrs[1].get("aria-current"), "location");
    top[IDS[1]] = -700; top[IDS[2]] = 40;
    listeners.scroll();
    assert.equal(attrs[1].has("aria-current"), false);
    assert.equal(attrs[2].get("aria-current"), "location");
  });
});

test("hidden squad avoids scroll updates until verified data is revealed", () => {
  simulateNavigation(({ top, attrs, data, listeners, notify }) => {
    data.hidden = true;
    top[IDS[1]] = 50;
    listeners.scroll();
    assert.equal(attrs[0].get("aria-current"), "location");
    data.hidden = false;
    notify();
    assert.equal(attrs[0].has("aria-current"), false);
    assert.equal(attrs[1].get("aria-current"), "location");
  });
});

test("Squad navigation is accessible, sticky and clear of Safari's bottom toolbar", () => {
  const html = fs.readFileSync(path.join(__dirname, "../squad.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../squad.css"), "utf8");
  assert.match(html, /aria-label="Squad sections"/);
  for (const id of IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, new RegExp(`href="#${id}"`));
  }
  assert.match(html, /src="squad-nav\.js\?v=3\.5\.0"/);
  assert.match(css, /\.site-shell\s*\{\s*overflow:\s*visible/);
  assert.match(css, /\.squad-section-nav\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /top:\s*max\(10px,\s*env\(safe-area-inset-top/);
  assert.match(css, /\.squad-section-links a\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /a\[aria-current="location"\]/);
});
