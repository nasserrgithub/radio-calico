import json
import urllib.error
from io import BytesIO

import app as app_module


class _FakeResponse(BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.close()


def test_nowplaying_proxies_cdn_json(client, monkeypatch):
    payload = {"artist": "Test Artist", "title": "Test Title"}

    def fake_urlopen(url, timeout):
        return _FakeResponse(json.dumps(payload).encode())

    monkeypatch.setattr(app_module.urllib.request, "urlopen", fake_urlopen)

    res = client.get("/api/nowplaying")
    assert res.status_code == 200
    assert res.get_json() == payload


def test_nowplaying_returns_502_when_cdn_unreachable(client, monkeypatch):
    def fake_urlopen(url, timeout):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(app_module.urllib.request, "urlopen", fake_urlopen)

    res = client.get("/api/nowplaying")
    assert res.status_code == 502
    assert res.get_json() == {"error": "metadata unavailable"}


def test_nowplaying_returns_502_on_bad_json(client, monkeypatch):
    def fake_urlopen(url, timeout):
        return _FakeResponse(b"not json")

    monkeypatch.setattr(app_module.urllib.request, "urlopen", fake_urlopen)

    res = client.get("/api/nowplaying")
    assert res.status_code == 502
