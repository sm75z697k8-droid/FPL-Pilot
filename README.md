# FPLPilot

A responsive, independent Fantasy Premier League companion website with the **Matchday Studio** design system.

## Step 3 — Squad Intelligence (read-only)

Open `squad.html` from the homepage and enter the **numeric FPL Team ID** from
the official **Points** page address (for example, the `1234567` in
`https://fantasy.premierleague.com/entry/1234567/event/10`).

The page displays the latest available **published** 15-player squad (starting
XI and four substitutes) including player name, club, position, captain and
vice-captain as reported by Fantasy Premier League.

**Important limitations:**
- This is **not** the live editable squad; transfers made after the shown
  gameweek deadline are not visible until publicly published.
- The endpoint is an **undocumented** public FPL API and may change or become
  unavailable. Errors are shown instead of invented players.
- No password, cookies, token, or FPL sign-in is requested.
- After a successful lookup, the **public numeric Team ID only** is stored
  in this browser's `localStorage` (key `fplpilot.savedTeamId.v1`). It is sent
  to the read-only Worker when loading a squad. The actual squad, team name,
  passwords, and tokens are **not** stored on the device by this feature.
- Browser-local storage is not an encrypted vault and may be unavailable in
  private browsing or cleared with website data. No ID is synced between
  devices by FPLPilot.
- Only the public team name, published picks and player metadata are returned.
  A user's private team state cannot be retrieved through the public endpoint.


### Step 3.6 — Enhanced player cards

Starting XI and bench cards now display two **official current-season FPL values**:

- **PTS**: `elements[].total_points`, the player's season points so far, **not**
  the selected gameweek score or a prediction
- **£**: `elements[].now_cost / 10` in millions of pounds, the **current FPL
  market price**, not the manager's historical purchase or selling price

The read-only squad Worker passes these validated fields as `total_points`
and `price_tenths`, from the **existing** `bootstrap-static` response. No new
upstream API calls, personal data or account permissions were added. Missing
or malformed values appear as an em dash; zero season points is valid.

A restrained club-colour accent is purely decorative and uses verified club
abbreviations with a neutral fallback. On narrow iPhones the price value
appears next to a £ symbol in a two-row stat strip, preserving jersey
visibility, player names, captaincy and the compact bench.

Because published squad picks can be from an earlier gameweek, player
season points and prices still reflect **current FPL bootstrap data**, not
their values at the time of that historical pick. They may update when
the upstream dataset refreshes.

### Step 3.5 — Sticky squad navigation

After a verified squad has loaded, the Team / Starting XI / Bench navigation
appears above the team summary. On iPhone and desktop it sticks near the **top**
of the screen as users scroll through the published squad. Native section
anchors remain usable even if JavaScript is unavailable.

The small `squad-nav.js` progressively highlights the visible section using
`aria-current="location"`. The nav is not displayed when no squad data is
available and does not cover Safari's bottom controls. The squad-specific
stylesheet overrides the shared `overflow: hidden` wrapper (which otherwise
prevents sticky positioning in Safari) without modifying the homepage.

This feature requires **no** additional API requests, credentials or locally
stored information. Offline tests are in `tests/squad-nav.test.cjs`.

### Step 3.3 — Official FPL club jersey images

Squad Intelligence now attempts to display the current official FPL shirt
graphic for each player's Premier League club. Club codes are taken directly
from the official `bootstrap-static` team record, not guessed from club names.

The image patterns were verified in the FPL Statistics page during the
2026/27 season:

- Outfield: `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_{club.code}-110.png`
- Goalkeeper: first tries `shirt_{club.code}_1-110.png`; if unavailable,
  tries the ordinary club home shirt.
- Images remain hosted by Fantasy Premier League; this repository **does not
  download or redistribute the jersey files**. Images are not embedded in
  the static site or the Cloudflare API.

The pre-existing, accessible position-shirt illustrations remain as
fallbacks if the official image is missing, blocked or changes. Player
names and captaincy still come from validated public FPL data.

**Asset rights:** The Premier League and clubs reserve rights over their
graphics, kit designs, marks and branding. Availability of a public image
URL does **not** grant a licence to reuse it on a publicly accessible
website. FPLPilot has no claim of approval or affiliation. Obtain
appropriate permission before representing this implementation as
licensed or releasing it commercially. Official FPL terms:
`https://fantasy.premierleague.com/help/terms`.

### Step 3.2 — Remember your Team ID (iPhone-friendly)

When a manager enters a valid Team ID and the public squad loads successfully,
FPLPilot remembers **only the Team ID** in that browser. Returning to
`squad.html` automatically fetches a fresh published squad for that ID; it
doesn't cache players or display a fictional squad when the API is unavailable.

The saved-team card offers:

- **Reload squad:** requests the most recent publicly published picks.
- **Change team:** opens the Team ID form. The previous saved ID remains until
  a **new valid squad loads successfully**, so an invalid new ID does not
  silently replace the saved team.
- **Forget saved Team ID:** deletes the browser-local key, hides the old squad,
  and restores the entry form.

If a browser blocks `localStorage`, the manual squad lookup still works and
the page explicitly states that saving is unavailable. All three controls are
keyboard-accessible. No backend database or login was added.

### Read-only API service

GitHub Pages cannot execute server code and the FPL API cannot reliably be
called cross-origin from a browser. The small API Worker lives in
`worker/squad-api.mjs` and has been deployed separately to:

`https://fplpilot-squad-api.4b9fgkmtpy.workers.dev/squad?team=1234567`

It uses only `GET`, validates requested IDs and the returned player roster,
restricts browser CORS to FPLPilot's GitHub Pages origin, applies upstream
caching, and returns generic upstream errors without exposing raw FPL payloads.

Check the Worker source in the GitHub repository before changing its
deployment; editing the source file alone does **not** redeploy the Worker.
Cloudflare configuration or the FPL upstream service may require maintenance.

Tests: `node --test tests/*.test.cjs`. This suite is also included in the
GitHub Actions workflow. Static and simulated API tests do not replace a
real-manager lookup in iPhone Safari.

## Step 2 — Gameweek overview

The homepage gameweek panel shows:
- The current gameweek **as flagged by FPL**.
- The next upcoming **official FPL transfer deadline** in the visitor's local time.
- A second-by-second countdown using the visitor's device clock.
- The source refresh time, with clear delayed/unavailable states.

No player statistics, squad recommendations, or predicted points are included yet.

### How data updates

The GitHub Actions workflow at `.github/workflows/sync-gameweek.yml` runs hourly (at minute 17 UTC). It fetches public gameweek information from the **unofficial, undocumented** FPL website endpoints, validates the result, and commits only `data/gameweek.json` to the default branch. The site reads the raw GitHub file, avoiding browser CORS restrictions on FPL's API.

GitHub Pages builds are **not triggered** by commits made using `GITHUB_TOKEN`. This is why the widget fetches the raw repository snapshot rather than relying on the deployed Pages copy of the file. There are no API tokens or passwords embedded in the website.

**When first setting up on an iPhone:**
1. In GitHub, open this repository's **Actions** tab.
2. Select **Sync FPL gameweek data**.
3. Choose **Run workflow** on the `main` branch to populate the first snapshot.
4. Check that the run succeeds and that `data/gameweek.json` exists, then refresh the website.

If the Actions button is unavailable, check repository **Settings → Actions → General** to confirm actions are permitted. The workflow requests `contents: write` only so it can commit the public snapshot.

Scheduled runs may be delayed and can automatically stop after a public repository has had 60 days without activity. The website will label updates older than four hours as delayed and reject snapshots older than 24 hours rather than present dates as current.

### Run offline contract tests

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/gameweek.test.cjs
```

The refresh script can be run manually with `python3 scripts/sync_gameweek.py`. It requires network access to the official FPL website, and it never replaces a previous snapshot if validation or download fails.

The FPL website API has no public stability guarantee. This project is independent and is not affiliated with or endorsed by the Premier League.
