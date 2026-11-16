#!/bin/sh
set -eu

TEMPLATE="/etc/nginx/templates/runtime-config.js.template"
OUTPUT="/usr/share/nginx/html/runtime-config.js"

if [ ! -r "$TEMPLATE" ]; then
  echo "Runtime configuration template is missing: $TEMPLATE" >&2
  exit 1
fi

envsubst '${VITE_AUTH0_DOMAIN} ${VITE_AUTH0_CLIENT_ID} ${VITE_AUTH0_AUDIENCE} ${VITE_AUTH0_REDIRECT_URI} ${VITE_API_BASE_URL}' \
  < "$TEMPLATE" > "$OUTPUT"

chmod 0644 "$OUTPUT"
echo "JengaFlow runtime configuration generated."
