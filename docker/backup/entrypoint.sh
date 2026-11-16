#!/bin/sh
set -eu
: "${BACKUP_CRON:=0 2 * * *}"
aws configure set default.s3.addressing_style path >/dev/null 2>&1 || true
mkdir -p /var/log
printf '%s /usr/local/bin/jengaflow-backup >> /var/log/backup.log 2>&1\n' "$BACKUP_CRON" > /etc/crontabs/root
echo "JengaFlow backup scheduler started; schedule: $BACKUP_CRON; timezone: $TZ"
exec crond -f -l 2
