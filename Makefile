.PHONY: help dev dev-down dev-logs prod prod-down prod-logs prod-clean test test-py test-js security security-py security-js

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
	@echo "make security     - audit Python (pip-audit) and JS (npm audit) dependencies for known vulnerabilities"
	@echo "make security-py  - audit Python deps only (requirements.txt, requirements-dev.txt, requirements-prod.txt)"
	@echo "make security-js  - audit JS deps only (npm audit)"

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

security: security-py security-js

security-py:
	.venv/bin/pip install -q -r requirements-dev.txt
	.venv/bin/pip-audit
	@rm -rf .security-prod-audit
	.venv/bin/pip install -q --target .security-prod-audit -r requirements-prod.txt
	.venv/bin/pip-audit --path .security-prod-audit
	@rm -rf .security-prod-audit

security-js:
	npm audit
