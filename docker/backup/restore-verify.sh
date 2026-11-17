#!/usr/bin/env bash
set -Eeuo pipefail

required=(BACKUP_OBJECT_KEY BACKUP_AGE_IDENTITY RESTORE_VERIFY_DATABASE RESTORE_VERIFY_USERNAME RESTORE_VERIFY_PASSWORD DATABASE_HOST DATABASE_PORT SEAWEEDFS_ENDPOINT SEAWEEDFS_BUCKET SEAWEEDFS_ACCESS_KEY SEAWEEDFS_SECRET_KEY)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then echo "Missing restore verification setting: $name" >&2; exit 1; fi
done
if [[ ! "$RESTORE_VERIFY_DATABASE" =~ ^jengaflow_restore_verify_[a-zA-Z0-9_]+$ ]]; then
  echo "Refusing to restore into a database not prefixed jengaflow_restore_verify_." >&2; exit 1
fi
if [[ ! -f "$BACKUP_AGE_IDENTITY" ]]; then echo "BACKUP_AGE_IDENTITY file not found." >&2; exit 1; fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
filename="$(basename "$BACKUP_OBJECT_KEY")"
encrypted="$tmp/$filename"
plain="$tmp/${filename%.age}"
scheme=http
[[ "${SEAWEEDFS_USE_SSL:-true}" == "true" ]] && scheme=https
port="${SEAWEEDFS_PORT:-443}"
endpoint="$scheme://$SEAWEEDFS_ENDPOINT:$port"
export AWS_ACCESS_KEY_ID="$SEAWEEDFS_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SEAWEEDFS_SECRET_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
export AWS_EC2_METADATA_DISABLED=true

aws --endpoint-url "$endpoint" s3 cp "s3://$SEAWEEDFS_BUCKET/$BACKUP_OBJECT_KEY" "$encrypted" --only-show-errors
aws --endpoint-url "$endpoint" s3 cp "s3://$SEAWEEDFS_BUCKET/$BACKUP_OBJECT_KEY.sha256" "$encrypted.sha256" --only-show-errors
(cd "$tmp" && sha256sum -c "$filename.sha256")
age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$plain" "$encrypted"
pg_restore --list "$plain" >/dev/null

export PGPASSWORD="$RESTORE_VERIFY_PASSWORD"
dropdb --if-exists --host="$DATABASE_HOST" --port="$DATABASE_PORT" --username="$RESTORE_VERIFY_USERNAME" --maintenance-db=postgres "$RESTORE_VERIFY_DATABASE"
createdb --host="$DATABASE_HOST" --port="$DATABASE_PORT" --username="$RESTORE_VERIFY_USERNAME" "$RESTORE_VERIFY_DATABASE"
pg_restore --host="$DATABASE_HOST" --port="$DATABASE_PORT" --username="$RESTORE_VERIFY_USERNAME" --dbname="$RESTORE_VERIFY_DATABASE" --no-owner --no-acl --exit-on-error "$plain"
psql --host="$DATABASE_HOST" --port="$DATABASE_PORT" --username="$RESTORE_VERIFY_USERNAME" --dbname="$RESTORE_VERIFY_DATABASE" --set=ON_ERROR_STOP=1 --tuples-only --command="SELECT 'tenants=' || count(*) FROM tenants; SELECT 'platform_users=' || count(*) FROM platform_users; SELECT 'migrations=' || count(*) FROM migrations;"
echo "Database restore verification succeeded in disposable database: $RESTORE_VERIFY_DATABASE"
