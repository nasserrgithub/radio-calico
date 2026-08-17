# RadioCalico

[![CI](https://github.com/nasserrgithub/radio-calico/actions/workflows/ci.yml/badge.svg)](https://github.com/nasserrgithub/radio-calico/actions/workflows/ci.yml)

RadioCalico is a single-page live-radio player. A Flask backend renders one
page that streams HLS audio via [hls.js](https://github.com/video-dev/hls.js/),
shows now-playing metadata polled from an external CDN, and lets listeners
thumbs-up/down the current track (persisted in SQLite locally, Postgres in
the Docker production deployment).

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

Locally and in the `dev` Docker profile, track ratings are stored in
`radiocalico.db` (SQLite), created automatically on first run. `app.py`
switches to Postgres whenever a `DATABASE_URL` environment variable is set —
that only happens in the `prod` Docker profile, via `docker-compose.yml`.

```bash
# Inspect the local SQLite db
sqlite3 radiocalico.db ".tables"
sqlite3 radiocalico.db ".schema ratings"

# Reset (destructive — drops and recreates the ratings table)
sqlite3 radiocalico.db < schema.sql
```

## Docker

The `Dockerfile` has `dev` and `prod` build targets, run via
`docker-compose.yml` profiles. `make help` lists shortcuts (`make dev`,
`make prod`, `make dev-down`, `make prod-down`, `make prod-clean`, `make
test`, ...) that wrap the commands below.

**Dev** — Flask debug server with reload, code bind-mounted from the repo,
SQLite in a named volume (`/app/data/radiocalico.db`):

```bash
docker compose --profile dev up --build
```

Serves at `http://127.0.0.1:5000`. Run the backend test suite inside it with
`docker compose --profile dev exec app-dev python -m pytest`.

**Prod** — gunicorn (non-root, only the runtime files baked into the image)
behind nginx, backed by Postgres. Copy `.env.example` to `.env` and fill in
real values first — `.env` is gitignored and is the only place the DB
password lives:

```bash
cp .env.example .env   # then edit POSTGRES_PASSWORD etc.
docker compose --profile prod up --build -d
```

This starts three containers:

- `db` — Postgres 16, data in the `radiocalico-pgdata` named volume
- `app-prod` — gunicorn running `app.py`, connects to `db` using
  `DATABASE_URL` (built from the `.env` values in `docker-compose.yml`); not
  reachable from the host directly
- `nginx` — listens on `http://127.0.0.1:80`, serves `/static/*` directly
  from files baked into its own image, and reverse-proxies `/` and `/api/*`
  to `app-prod`

```bash
# Inspect the prod Postgres db
docker compose --profile prod exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\dt'
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
  their vote but only has one active vote per track. Backend is SQLite or
  Postgres depending on `DATABASE_URL` (see [Database](#database)).
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

## Security scanning

```bash
make security      # both, see below
make security-py   # pip-audit against requirements.txt, requirements-dev.txt, requirements-prod.txt
make security-js   # npm audit
```

Both fail (non-zero exit) if a known vulnerability is found in a dependency.

## Project layout

```
app.py                      Flask app (routes, ratings, nowplaying proxy)
schema.sql                  SQLite schema for the ratings table
schema.postgres.sql         Postgres schema for the ratings table (prod)
Dockerfile                  Multi-stage build: base / dev (Flask debug) / prod (gunicorn)
docker-compose.yml          dev profile (SQLite) and prod profile (Postgres + nginx)
nginx/                      nginx Dockerfile + reverse-proxy/static config for prod
requirements-prod.txt       Extra prod-only deps (gunicorn, psycopg2-binary)
.env.example                Template for prod Postgres credentials (copy to .env)
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

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to
`master`/`main` and on every pull request: backend tests + `pip-audit`
(`make test-py`, `make security-py`) in one job, frontend tests + `npm
audit` (`make test-js`, `make security-js`) in another.

A `@claude` mention on a PR or issue comment triggers the Claude PR
Assistant (`.github/workflows/claude.yml`) on demand — there is no automatic
Claude code review on PRs anymore; that ran (and cost API usage) on every
PR unconditionally, so it was removed.

## Notes

- There is no linter configured.
- `legacy-node/` is not part of active development — do not run or modify it
  as part of feature work.
