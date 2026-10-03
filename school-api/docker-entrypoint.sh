#!/bin/sh
# Container entrypoint: optionally apply migrations, then exec the command.
#
# RUN_MIGRATIONS=true (default) suits docker compose, where exactly one
# replica (the api service) should migrate. In orchestrated production set
# RUN_MIGRATIONS=false and run migrations as a separate initContainer/Job
# so N replicas never race the migration lock.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "applying database migrations..."
  alembic upgrade head
fi

exec "$@"
