# RadioCalico

RadioCalico is a single-page live-radio player. A Flask backend renders one
page that streams HLS audio via [hls.js](https://github.com/video-dev/hls.js/),
shows now-playing metadata polled from an external CDN, and lets listeners
thumbs-up/down the current track (persisted in SQLite).

## Features

- Live HLS audio playback (hls.js, with Safari's native HLS as a fallback)
- Now-playing metadata (artist, title, album, source quality) polled from the
  CDN and displayed alongside a "previously played" history band
- Per-listener track ratings (thumbs up/down) without requiring an account —
  identity is a random token in an anonymous cookie
- Styling driven by the RadioCalico brand guide (see `RadioCalico_Style_Guide.txt`)

## Requirements

- Python 3
- Flask (see `requirements.txt`)
- Docker + Docker Compose (optional — see [Docker](#docker) for a container-only setup)

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Running the app

```bash
.venv/bin/python app.py
```

The app serves at `http://127.0.0.1:5000`. It's the Flask dev server without
debug/auto-reload, so after editing `app.py`, `templates/index.html`, or
anything under `static/`, kill and restart the process before checking
changes in a browser.

## Database

Track ratings are stored in `radiocalico.db` (SQLite), created automatically
on first run.

## Docker

The `Dockerfile` has two build targets, `dev` and `prod`, run via
`docker-compose.yml` profiles:

```bash
# dev: Flask debug server with reload, code bind-mounted from the repo
docker compose --profile dev up --build

# prod: gunicorn, non-root user, only the runtime files baked into the image
docker compose --profile prod up --build -d
```

Both serve at `http://127.0.0.1:5000`. The SQLite file lives in a named
volume (`/app/data/radiocalico.db`) so ratings persist across container
recreation. Run the backend test suite inside the dev container with
`docker compose --profile dev exec app-dev python -m pytest`.

```bash
# Inspect
sqlite3 radiocalico.db ".tables"
sqlite3 radiocalico.db ".schema ratings"

# Reset (destructive — drops and recreates the ratings table)
sqlite3 radiocalico.db < schema.sql
```

## Architecture

**Backend (`app.py`, single file):**

- `GET /` — renders `templates/index.html` with the stream URL.
- `GET /api/nowplaying` — server-side proxy to the CDN's `metadatav2.json`
  (works around the CDN's missing CORS headers). Returns artist/title/album/
  date/bit_depth/sample_rate for the current track, plus recently-played
  history.
- `GET/POST /api/ratings` — reads/writes the `ratings` table. A rating is
  keyed on `(track_key, client_id)` with an upsert, so a listener can change
  their vote but only has one active vote per track.
- Anonymous identity: a random token is set in a 2-year HttpOnly `rc_uid`
  cookie on first visit. `client_id` is a hash of IP + user agent + that
  token, which is how repeat ratings from the same browser are recognized
  without a login system.

**Frontend:**

- `templates/index.html` — markup only (Jinja2)
- `static/css/style.css` — all styling
- `static/js/app.js` — page behavior and DOM wiring, loaded as an ES module;
  the HLS stream URL is passed in via a `data-stream-url` attribute rather
  than templated into a script
- `static/js/ratings.js` — pure ratings logic (track-key derivation, request
  building/response shaping, vote-change check) with no DOM dependency,
  imported by `app.js`

## Testing

**Backend** (pytest, hits Flask's test client against a temp SQLite db):

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

**Frontend** (Vitest, unit tests for `static/js/ratings.js`):

```bash
npm install
npm test
```

## Project layout

```
app.py                      Flask app (routes, ratings, nowplaying proxy)
schema.sql                  SQLite schema for the ratings table
Dockerfile                  Multi-stage build: base / dev (Flask debug) / prod (gunicorn)
docker-compose.yml          dev/prod profiles, port 5000, named volume for the DB
tests/                      pytest suite for the Flask backend
templates/index.html        Page markup
static/css/style.css        Styling
static/js/app.js            Player + now-playing behavior, DOM wiring
static/js/ratings.js        Pure ratings logic, unit tested with Vitest
static/js/ratings.test.js   Vitest tests for ratings.js
static/img/                 Logo and image assets
RadioCalico_Style_Guide.txt Brand colors, type scale, component states
RadioCalicoLayout.png       Structural layout reference
legacy-node/                Old Express/EJS/sqlite3 app, kept for reference only
```

## CI

GitHub Actions runs an automated Claude code review on every pull request,
and a `@claude` mention on a PR or issue comment triggers the Claude PR
Assistant.

## Notes

- There is no linter configured.
- `legacy-node/` is not part of active development — do not run or modify it
  as part of feature work.
