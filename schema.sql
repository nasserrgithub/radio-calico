DROP TABLE IF EXISTS ratings;

CREATE TABLE ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_key TEXT NOT NULL,
    artist TEXT,
    title TEXT,
    client_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (track_key, client_id)
);
