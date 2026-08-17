# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RadioCalico is a single-page live-radio player: a Flask backend renders one Jinja2 page (`/`) that streams HLS audio via hls.js, shows now-playing metadata polled from an external CDN, and lets listeners thumbs-up/down the current track (persisted in SQLite). Treat `/` as the one real page — there is no separate `/radio` route and no CRUD demo; both were deliberately removed during the migration from the old Node app.

## Commands

- Run the app: `.venv/bin/python app.py` (serves at `http://127.0.0.1:5000`). This is the Flask dev server without debug/auto-reload — **after editing `app.py`, `templates/index.html`, or `static/`, kill and restart the process** (`pkill -f "python app.py"`) before checking in a browser; changes will not hot-reload.
- Install deps: `.venv/bin/pip install -r requirements.txt` (just `flask`; no venv/pip exists system-wide, so always use `.venv/bin/...`, not bare `python`/`pip`).
- Inspect the DB: `sqlite3 radiocalico.db ".tables"` / `.schema ratings`.
- Reset schema: `sqlite3 radiocalico.db < schema.sql` (drops and recreates `ratings` — destructive, loses existing ratings).
- Backend tests: `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest`. The `tests/` suite runs against a temp SQLite db (via `RADIOCALICO_DB_PATH`, set in `tests/conftest.py`), not `radiocalico.db`.
- Frontend tests: `npm install && npm test` (Vitest). Only `static/js/ratings.js` (pure ratings logic, no DOM) is unit tested — `static/js/app.js` is DOM-wiring glue and isn't covered.
- No linter is configured.
- Docker: `docker compose --profile dev up --build` runs the Flask debug server with the repo bind-mounted (live reload); `docker compose --profile prod up --build -d` runs gunicorn as a non-root user with only the runtime files baked into the image. Both use a named volume at `/app/data/radiocalico.db` (`RADIOCALICO_DB_PATH`) so ratings persist across container recreation — the two profiles are separate images/volumes, not dev-vs-prod views of the same data. Run pytest inside the dev container with `docker compose --profile dev exec app-dev python -m pytest`. See `Dockerfile` (targets `base`/`dev`/`prod`) and `docker-compose.yml`.

`legacy-node/` is the old Express/EJS/sqlite3 app, kept for reference only — do not run or modify it as part of feature work.

## Architecture

**Backend (`app.py`, single file):**
- `GET /` — renders `templates/index.html` with `stream_url`.
- `GET /api/nowplaying` — server-side proxy (stdlib `urllib`, no extra HTTP dependency) to the CDN's `metadatav2.json`, purely to dodge the CDN's missing CORS headers. Returns the raw JSON: `artist`/`title`/`album`/`date`/`bit_depth`/`sample_rate` for the current track, plus `prev_artist_N`/`prev_title_N` (N=1..5) for recently-played history.
- `GET/POST /api/ratings` — reads/writes the `ratings` table in `radiocalico.db` (schema in `schema.sql`). Rating is keyed on `(track_key, client_id)` with an upsert (`ON CONFLICT ... DO UPDATE`), so a listener can change their vote but only has one active vote per track.
- Anonymous identity: a random token is set in a 2-year HttpOnly `rc_uid` cookie on first visit (`before_request`/`after_request` hooks). `client_id` is `sha256(ip:user_agent:uid)` — this is how repeat ratings from the same browser are recognized without real auth. There is no login system to extend here; if per-user features grow beyond this, that's a deliberate architecture change, not a bug fix.

**Frontend — split across three files:**
- `templates/index.html` — markup only (Jinja2).
- `static/css/style.css` — all styling, linked via `<link>` in `index.html`.
- `static/js/app.js` — page behavior and DOM wiring, loaded via `<script type="module" src>` (plain static JS, no Jinja templating inside it). The HLS stream URL is the one piece of server-rendered data the JS needs; it's passed via `data-stream-url` on the `<audio>` element rather than templated directly into a script, so `app.js` stays a plain static asset.
- `static/js/ratings.js` — the ratings system's pure logic (track-key derivation, `/api/ratings` request/response shaping, whether a vote should be submitted), factored out with no DOM dependency so it's unit-testable; imported into `app.js`. `app.js` still owns DOM state (`lastTrackKey`, `currentUserRating`) and calls into `ratings.js`'s functions. `trackKey` is derived from CDN now-playing data, so `fetchRatings`/`postRating` treat it as tainted and re-check it against `TRACK_KEY_PATTERN` inline, right before the `fetch()` call, rather than delegating to the `isValidTrackKey` helper (used elsewhere, e.g. `shouldSubmitRating`) — SonarCloud's taint analysis doesn't trace sanitization through an extracted helper, so the check is intentionally duplicated at each sink. Don't refactor these two inline checks back into a shared call without confirming that doesn't reintroduce the finding.
- Audio playback uses `hls.js` against that stream URL, with Safari's native HLS as a fallback path.
- Now-playing metadata and the recently-played band are refreshed on a poll loop (`refreshNowPlaying`) hitting `/api/nowplaying`; ratings UI (`loadRatings`/`submitRating`) hits `/api/ratings` and is keyed by a `track_key` derived from the current track.
- The CDN's `cover.jpg` is served as `application/octet-stream`, not `image/jpeg` — harmless in an `<img src>` but relevant if you ever fetch/XHR it instead.
- Since these are static files (not templates), Flask serves them as-is — edits still require a process restart because the dev server has no auto-reload, but there's no Jinja re-render step for `style.css`/`app.js`.

**Styling:** Follow `RadioCalico_Style_Guide.txt` for any visual change instead of guessing — it's the source of truth for the color palette (Mint `#D8F2D5`, Forest `#1F4E23`, Teal `#38A29D`, Calico Orange `#EFA63C`, Charcoal `#231F20`, Cream `#F5EADA`), type scale (Montserrat headings, Open Sans body), component states (button hovers, focus rings), and spacing grid. `RadioCalicoLayout.png` is the structural layout reference (dark nav, two-column now-playing, pill-shaped player bar, mint "previously played" band). The stream is often not actually 24-bit/48kHz (varies per track) even though the guide's marketing copy claims it — the page intentionally shows both a dynamic "Source quality" line (from `/api/nowplaying`) and the static brand claim; don't collapse these into one line under the assumption they're redundant.
