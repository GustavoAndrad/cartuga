#!/bin/sh
set -e

echo "Running migrations..."
alembic upgrade head

echo "Running seed..."
python -m app.seed

echo "Starting API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
