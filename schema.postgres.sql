DROP TABLE IF EXISTS ratings;

CREATE TABLE ratings (
    id SERIAL PRIMARY KEY,
    track_key TEXT NOT NULL,
    artist TEXT,
    title TEXT,
    client_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (track_key, client_id)
);
