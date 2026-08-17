import app as app_module


def test_get_ratings_requires_track_key(client):
    res = client.get("/api/ratings")
    assert res.status_code == 400
    assert res.get_json() == {"error": "track_key is required"}


def test_get_ratings_defaults_for_unrated_track(client):
    res = client.get("/api/ratings?track_key=artist::title")
    assert res.status_code == 200
    assert res.get_json() == {"up": 0, "down": 0, "user_rating": None}


def test_post_rating_up_is_reflected_in_get(client):
    post_res = client.post(
        "/api/ratings",
        json={"track_key": "artist::title", "artist": "artist", "title": "title", "rating": "up"},
    )
    assert post_res.status_code == 200
    assert post_res.get_json() == {"up": 1, "down": 0, "user_rating": "up"}

    get_res = client.get("/api/ratings?track_key=artist::title")
    assert get_res.get_json() == {"up": 1, "down": 0, "user_rating": "up"}


def test_post_rating_switches_vote_instead_of_duplicating(client):
    client.post("/api/ratings", json={"track_key": "artist::title", "rating": "up"})
    res = client.post("/api/ratings", json={"track_key": "artist::title", "rating": "down"})

    assert res.get_json() == {"up": 0, "down": 1, "user_rating": "down"}


def test_post_rating_requires_track_key(client):
    res = client.post("/api/ratings", json={"rating": "up"})
    assert res.status_code == 400
    assert res.get_json() == {"error": "track_key is required"}


def test_post_rating_rejects_invalid_rating_value(client):
    res = client.post("/api/ratings", json={"track_key": "artist::title", "rating": "sideways"})
    assert res.status_code == 400
    assert res.get_json() == {"error": "rating must be 'up' or 'down'"}


def test_post_rating_missing_body_is_rejected(client):
    res = client.post("/api/ratings")
    assert res.status_code == 400


def test_ratings_are_counted_independently_per_client(client):
    other_client = app_module.app.test_client()

    client.post("/api/ratings", json={"track_key": "shared::track", "rating": "up"})
    other_client.post("/api/ratings", json={"track_key": "shared::track", "rating": "down"})

    res = client.get("/api/ratings?track_key=shared::track")
    data = res.get_json()
    assert data["up"] == 1
    assert data["down"] == 1
    assert data["user_rating"] == "up"

    other_res = other_client.get("/api/ratings?track_key=shared::track")
    assert other_res.get_json()["user_rating"] == "down"
