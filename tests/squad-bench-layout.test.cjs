"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../squad.css"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^$\u007b\u007d()|[\]\\]/g, "\\$&");
  // Return the first rule matching exactly this selector.
  const match = css.match(new RegExp("(^|\\n)\\s*" + escaped + "\\s*\\{([^}]*)\\}", "m"));
  assert.ok(match, `Expected stylesheet rule for ${selector}`);
  return match[2];
}

test("bench players do not inherit the pitch player's vertical flex-basis", () => {
  assert.match(rule(".squad-player"), /flex:\s*0\s+1\s+148px/);
  assert.match(rule(".squad-bench .squad-player"), /flex:\s*0\s+0\s+auto/);
  assert.match(rule(".squad-bench .squad-player"), /max-width:\s*100%/);
});

test("bench names can wrap but are visually limited to two lines", () => {
  assert.match(rule(".squad-bench .player-name"), /-webkit-line-clamp:\s*2/);
  assert.match(rule(".squad-bench .player-name"), /overflow-wrap:\s*anywhere/);
});

test("mobile keeps four equal bench columns and compact nameplates", () => {
  assert.match(rule(".squad-bench"), /grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*540px\)/);
  assert.match(css, /\.squad-bench \.player-caption\s*\{\s*min-height:\s*84px/);
  assert.match(css, /\.squad-bench \.player-visual\s*\{\s*width:\s*47px;\s*height:\s*48px/);
});
