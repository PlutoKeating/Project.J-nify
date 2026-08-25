# J-nify backend — Dockerfile
# Backend is fully containerized (SPEC: backend-only Docker deployment).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code.
COPY app ./app

# Runtime data (SQLite) lives under /app/data, backed by a volume.
RUN mkdir -p /app/data

# Listening port is supplied via .env (APP_PORT); default 8000 for the image.
EXPOSE 8000

# Read APP_HOST / APP_PORT from .env at runtime so the exposed port is fully
# operator-controlled.
CMD ["sh", "-c", "python -m uvicorn app.main:app --host ${APP_HOST:-0.0.0.0} --port ${APP_PORT:-8000}"]
