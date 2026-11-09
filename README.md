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
- The Team ID is sent to the read-only Worker for the requested lookup and is
  not stored by the website.
- Only the public team name, published picks and player metadata are returned.
  A user's private team state cannot be retrieved through the public endpoint.

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
