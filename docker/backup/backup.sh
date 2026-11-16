#!/bin/bash
set -Eeuo pipefail

if [[ "${BACKUP_ENABLED:-false}" != "true" ]]; then
  echo "BACKUP_ENABLED is not true; scheduled backup skipped."
  exit 0
fi

required=(DATABASE_HOST DATABASE_USERNAME DATABASE_NAME SEAWEEDFS_ENDPOINT SEAWEEDFS_BUCKET SEAWEEDFS_ACCESS_KEY SEAWEEDFS_SECRET_KEY BACKUP_AGE_RECIPIENT)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then echo "Missing required backup setting: $name" >&2; exit 1; fi
done

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
file="$tmp/jengaflow-${DATABASE_NAME}-$stamp.dump.age"
export PGPASSWORD="${DATABASE_PASSWORD:-}"
pg_dump --host="$DATABASE_HOST" --port="${DATABASE_PORT:-5432}" \
  --username="$DATABASE_USERNAME" --dbname="$DATABASE_NAME" \
  --format=custom --no-owner --no-acl --verbose 2>"$tmp/pg_dump.log" \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$file"

endpoint="${SEAWEEDFS_USE_SSL:-true}"
scheme=http
[[ "$endpoint" == "true" ]] && scheme=https
port="${SEAWEEDFS_PORT:-443}"
aws_endpoint="$scheme://${SEAWEEDFS_ENDPOINT}:$port"
export AWS_ACCESS_KEY_ID="$SEAWEEDFS_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SEAWEEDFS_SECRET_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
export AWS_EC2_METADATA_DISABLED=true
sha256sum "$file" > "$file.sha256"
aws --endpoint-url "$aws_endpoint" s3 cp "$file" "s3://$SEAWEEDFS_BUCKET/backups/postgres/$(basename "$file")" --only-show-errors
aws --endpoint-url "$aws_endpoint" s3 cp "$file.sha256" "s3://$SEAWEEDFS_BUCKET/backups/postgres/$(basename "$file").sha256" --only-show-errors
echo "Encrypted backup uploaded: $(basename "$file")"
