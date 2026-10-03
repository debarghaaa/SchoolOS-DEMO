# SchoolOS API / worker image (shared: CMD selects the process).
# Multi-stage: build tools and pip caches never reach the runtime layer,
# and the app runs as a non-root user.
#
#   docker build -t schoolos/api:1.0 .
#   docker run -p 8000:8000 --env-file .env schoolos/api:1.0
#   docker run --env-file .env schoolos/api:1.0 python -m app.workers.worker

# ---------- builder: prod dependencies into an isolated venv ----------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---------- runtime: app code + venv only ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /srv

COPY --from=builder /opt/venv /opt/venv
COPY alembic.ini ./
COPY alembic ./alembic
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY app ./app

RUN useradd -m appuser \
    && chown -R appuser:appuser /srv \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"

ENTRYPOINT ["docker-entrypoint.sh"]

# Single worker process per container; scale with replicas (each pod exposes
# /metrics and Prometheus aggregates). Workers override the command.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
