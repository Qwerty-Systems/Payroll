# Monitoring, reporting and restore verification

## Application reporting

The tenant Reports workspace exposes an operational dashboard and CSV downloads for:
- approved/finalized payroll runs, including earnings, deductions, employer contributions and statutory component columns;
- attendance for an explicit date range;
- tenant audit events for an explicit date range.

CSV exports escape spreadsheet formula-leading text. Payroll CSV export is limited to finalized runs. Report endpoints are tenant-scoped and require the relevant report/audit permissions.

## Prometheus, Alertmanager and Grafana

The API exposes `GET /api/v1/health/metrics`. It is disabled unless `METRICS_BEARER_TOKEN` is configured and rejects requests without the matching bearer token.

1. Configure `METRICS_BEARER_TOKEN` in the API service environment.
2. Create a local secret file containing exactly the same token at `./secrets/metrics-token`; restrict access to the deployment operator.
3. Create `./secrets/slack-webhook-url` containing the Slack incoming webhook URL for the alert channel.
4. Set `GRAFANA_ADMIN_PASSWORD` to a strong unique value. Keep Grafana bound to localhost unless a protected reverse proxy is configured.
5. Start the overlay from the deployment directory:

   ```bash
   docker compose -f docker-compose.monitoring.yml up -d
   ```

The overlay joins the existing `jengaflow_jengaflow` Docker network, scrapes the API on its internal port, loads dependency and memory alerts, and provisions a Prometheus datasource in Grafana. The Grafana port defaults to `127.0.0.1:3000`; use an SSH tunnel or protected reverse proxy for remote access. Do not expose Prometheus or Alertmanager publicly.

The included alert rules cover API scrape failure, database/Redis/object-storage readiness and sustained resident memory above 1 GiB. Tune thresholds and notification routing to the service's measured baseline before production activation.

## Disposable database restore verification

The backup image includes `/usr/local/bin/jengaflow-restore-verify`. This command downloads an encrypted PostgreSQL backup and checksum from object storage, verifies the checksum, decrypts it using an age identity, restores into a disposable database, and checks core table queries.

It refuses database names that do not begin with `jengaflow_restore_verify_`. It drops and recreates only that explicitly named disposable database. The restore role must have permission to create/drop that disposable database and restore its schema.

Example (run from a secured operator shell; replace every placeholder):

```bash
docker run --rm \
  --network jengaflow_jengaflow \
  --entrypoint /usr/local/bin/jengaflow-restore-verify \
  -v "$PWD/secrets/backup-age-identity:/run/secrets/backup-age-identity:ro" \
  -e BACKUP_OBJECT_KEY='backups/postgres/REPLACE_WITH_BACKUP_FILENAME.dump.age' \
  -e BACKUP_AGE_IDENTITY='/run/secrets/backup-age-identity' \
  -e RESTORE_VERIFY_DATABASE='jengaflow_restore_verify_YYYYMMDD' \
  -e RESTORE_VERIFY_USERNAME='RESTORE_ROLE' \
  -e RESTORE_VERIFY_PASSWORD='REPLACE_WITH_SECRET' \
  -e DATABASE_HOST='DATABASE_HOST' \
  -e DATABASE_PORT='5432' \
  -e SEAWEEDFS_ENDPOINT='s3.qwerty.co.ke' \
  -e SEAWEEDFS_PORT='443' \
  -e SEAWEEDFS_USE_SSL='true' \
  -e SEAWEEDFS_BUCKET='jenga-flow' \
  -e SEAWEEDFS_ACCESS_KEY='REPLACE_WITH_SECRET' \
  -e SEAWEEDFS_SECRET_KEY='REPLACE_WITH_SECRET' \
  -e S3_REGION='us-east-1' \
  registry.qwerty.co.ke/jengaflow/backup:production
```

The script leaves the disposable database in place for inspection. Remove it after sign-off. Do not point `RESTORE_VERIFY_DATABASE` at the production database.

**Scope limitation:** this procedure verifies PostgreSQL restoration only. It does not yet back up and restore the private object-storage bucket containing worker documents. That storage layer needs a separately configured, encrypted backup/replication and restore drill before claiming a complete application disaster-recovery test.

## Browser workflow tests

The web package now has a Playwright Chromium smoke test for the sign-in page and Google/Auth0 redirect parameters. CI installs Chromium, runs the browser test, and syntax-checks backup shell scripts. This is an initial browser smoke test, not a complete end-to-end suite for every tenant workflow.
