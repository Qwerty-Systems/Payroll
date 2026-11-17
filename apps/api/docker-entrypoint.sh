#!/bin/sh
set -eu

if [ "${SKIP_DATABASE_MIGRATIONS:-false}" != "true" ]; then
  echo "[JengaFlow] Applying pending database migrations before starting the API..."

  # Prefer the dedicated migration credentials; the data source falls back
  # to DATABASE_* when MIGRATIONS_DATABASE_* are not configured.
  # Fail closed so the API never starts against an outdated schema.
  node node_modules/typeorm/cli.js \
    -d dist/database/data-source.js \
    migration:run

  echo "[JengaFlow] Database migrations completed."
else
  echo "[JengaFlow] Migration step handled by the deployment migrate service."
fi

exec node dist/main.js
