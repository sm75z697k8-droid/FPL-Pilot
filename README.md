# FPLPilot

A responsive, independent Fantasy Premier League companion website with the **Matchday Studio** design system.

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
