.PHONY: help dev dev-down dev-logs prod prod-down prod-logs prod-clean test test-py test-js

help:
	@echo "make dev          - start the dev stack (Flask debug server, SQLite, live reload)"
	@echo "make dev-down     - stop the dev stack"
	@echo "make dev-logs     - tail dev logs"
	@echo "make prod         - start the prod stack (nginx + gunicorn + Postgres), builds first"
	@echo "make prod-down    - stop the prod stack (keeps Postgres data)"
	@echo "make prod-logs    - tail prod logs"
	@echo "make prod-clean   - stop the prod stack and delete its Postgres volume"
	@echo "make test         - run backend (pytest) and frontend (vitest) tests"
	@echo "make test-py      - run backend tests only"
	@echo "make test-js      - run frontend tests only"

dev:
	docker compose --profile dev up --build

dev-down:
	docker compose --profile dev down

dev-logs:
	docker compose --profile dev logs -f

prod:
	@test -f .env || (echo "Missing .env - run: cp .env.example .env, then set a real POSTGRES_PASSWORD" && exit 1)
	docker compose --profile prod up --build -d

prod-down:
	docker compose --profile prod down

prod-logs:
	docker compose --profile prod logs -f

prod-clean:
	docker compose --profile prod down -v

test: test-py test-js

test-py:
	.venv/bin/python -m pytest

test-js:
	npm test
