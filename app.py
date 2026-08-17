import hashlib
import json
import os
import secrets
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

from flask import Flask, g, jsonify, render_template, request

STREAM_URL = "https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8"
METADATA_URL = "https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json"
PORT = 5000
DB_PATH = Path(os.environ.get("RADIOCALICO_DB_PATH") or Path(__file__).parent / "radiocalico.db")
# Set in production (docker-compose.yml, from .env) to switch the backend from
# SQLite to Postgres. Dev and the pytest suite never set this, so they keep
# using plain SQLite files with no extra services required.
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    import psycopg2
UID_COOKIE_NAME = "rc_uid"
UID_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2  # 2 years

app = Flask(__name__)


@app.before_request
def ensure_uid_cookie():
    uid = request.cookies.get(UID_COOKIE_NAME)
    g.uid_is_new = uid is None
    g.uid = uid or secrets.token_hex(16)


@app.after_request
def set_uid_cookie(response):
    if getattr(g, "uid_is_new", False):
        response.set_cookie(
            UID_COOKIE_NAME,
            g.uid,
            max_age=UID_COOKIE_MAX_AGE,
            httponly=True,
            samesite="Lax",
        )
    return response


def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        if DATABASE_URL:
            db = g._database = psycopg2.connect(DATABASE_URL)
        else:
            db = g._database = sqlite3.connect(DB_PATH)
    return db


@app.teardown_appcontext
def close_db(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()


def db_execute(db, sql, params=()):
    """Run a query against either backend. Rows are always plain tuples —
    access columns by position, not by name (sqlite3.Row-style dict access
    isn't available on psycopg2's default cursor)."""
    if DATABASE_URL:
        cur = db.cursor()
        cur.execute(sql.replace("?", "%s"), params)
        return cur
    return db.execute(sql, params)


SQLITE_SCHEMA = """
    CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_key TEXT NOT NULL,
        artist TEXT,
        title TEXT,
        client_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (track_key, client_id)
    )
"""

POSTGRES_SCHEMA = """
    CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        track_key TEXT NOT NULL,
        artist TEXT,
        title TEXT,
        client_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (track_key, client_id)
    )
"""


def init_db():
    if DATABASE_URL:
        db = psycopg2.connect(DATABASE_URL)
        try:
            with db.cursor() as cur:
                cur.execute(POSTGRES_SCHEMA)
            db.commit()
        finally:
            db.close()
    else:
        with sqlite3.connect(DB_PATH) as db:
            db.execute(SQLITE_SCHEMA)


def get_client_id():
    ip = request.remote_addr or ""
    user_agent = request.headers.get("User-Agent", "")
    fingerprint = f"{ip}:{user_agent}:{g.uid}"
    return hashlib.sha256(fingerprint.encode()).hexdigest()


def rating_counts(db, track_key):
    up = db_execute(
        db, "SELECT COUNT(*) FROM ratings WHERE track_key = ? AND rating = 'up'", (track_key,)
    ).fetchone()[0]
    down = db_execute(
        db, "SELECT COUNT(*) FROM ratings WHERE track_key = ? AND rating = 'down'", (track_key,)
    ).fetchone()[0]
    return up, down


@app.get("/")
def index():
    return render_template("index.html", stream_url=STREAM_URL)


@app.get("/api/nowplaying")
def nowplaying():
    try:
        with urllib.request.urlopen(METADATA_URL, timeout=5) as response:
            data = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return jsonify({"error": "metadata unavailable"}), 502
    return jsonify(data)


@app.get("/api/ratings")
def get_ratings():
    track_key = (request.args.get("track_key") or "").strip()
    if not track_key:
        return jsonify({"error": "track_key is required"}), 400

    db = get_db()
    up, down = rating_counts(db, track_key)

    client_id = get_client_id()
    row = db_execute(
        db,
        "SELECT rating FROM ratings WHERE track_key = ? AND client_id = ?",
        (track_key, client_id),
    ).fetchone()
    user_rating = row[0] if row else None

    return jsonify({"up": up, "down": down, "user_rating": user_rating})


@app.post("/api/ratings")
def post_rating():
    data = request.get_json(silent=True) or {}
    track_key = (data.get("track_key") or "").strip()
    rating = data.get("rating")
    client_id = get_client_id()

    if not track_key:
        return jsonify({"error": "track_key is required"}), 400
    if rating not in ("up", "down"):
        return jsonify({"error": "rating must be 'up' or 'down'"}), 400

    db = get_db()
    db_execute(
        db,
        """
        INSERT INTO ratings (track_key, artist, title, client_id, rating)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (track_key, client_id) DO UPDATE SET
            rating = excluded.rating,
            artist = excluded.artist,
            title = excluded.title,
            created_at = CURRENT_TIMESTAMP
        """,
        (track_key, data.get("artist"), data.get("title"), client_id, rating),
    )
    db.commit()

    up, down = rating_counts(db, track_key)
    return jsonify({"up": up, "down": down, "user_rating": rating})


init_db()

if __name__ == "__main__":
    print(f"RadioCalico prototype running at http://127.0.0.1:{PORT}")
    app.run(host="127.0.0.1", port=PORT)
