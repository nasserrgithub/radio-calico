import os
import sys
import tempfile
from pathlib import Path

import pytest

_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["RADIOCALICO_DB_PATH"] = _db_path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402


@pytest.fixture()
def client():
    yield app_module.app.test_client()
    with app_module.sqlite3.connect(app_module.DB_PATH) as db:
        db.execute("DELETE FROM ratings")
        db.commit()
