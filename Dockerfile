# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RADIOCALICO_DB_PATH=/app/data/radiocalico.db
RUN groupadd -r app && useradd -r -g app -m -d /home/app app \
    && mkdir -p /app/data && chown -R app:app /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# --- dev: Flask dev server with debug/reload, code is bind-mounted by docker-compose ---
FROM base AS dev
COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .
ENV FLASK_APP=app.py \
    FLASK_DEBUG=1
EXPOSE 5000
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]

# --- prod: gunicorn, non-root, only the files the app needs at runtime ---
FROM base AS prod
RUN pip install --no-cache-dir gunicorn
COPY --chown=app:app app.py schema.sql ./
COPY --chown=app:app templates ./templates
COPY --chown=app:app static ./static
USER app
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--access-logfile", "-", "app:app"]
