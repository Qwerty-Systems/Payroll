FROM postgres:17-alpine
RUN apk add --no-cache aws-cli age bash tzdata
ENV TZ=Africa/Nairobi
COPY docker/backup/backup.sh /usr/local/bin/jengaflow-backup
COPY docker/backup/entrypoint.sh /usr/local/bin/backup-entrypoint
RUN chmod 0755 /usr/local/bin/jengaflow-backup /usr/local/bin/backup-entrypoint
ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
