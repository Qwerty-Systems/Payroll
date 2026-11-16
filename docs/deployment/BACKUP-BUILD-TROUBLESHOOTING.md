# Backup image build troubleshooting

## Fix for missing backup scripts during Docker build

The backup service is built from the repository root:

```yaml
backup:
  build:
    context: .
    dockerfile: docker/backup/Dockerfile
```

With this build context, Docker `COPY` source paths are relative to the repository root, not relative to the Dockerfile directory. The backup scripts are stored in `docker/backup/`, so the Dockerfile must use:

```dockerfile
COPY docker/backup/backup.sh /usr/local/bin/jengaflow-backup
COPY docker/backup/entrypoint.sh /usr/local/bin/backup-entrypoint
```

Using `COPY backup.sh` and `COPY entrypoint.sh` makes BuildKit search for `/backup.sh` and `/entrypoint.sh` at the repository root and causes the checksum error shown in the deployment log.

## Coolify redeployment checklist

1. Ensure the deployment uses the branch/commit containing the Dockerfile fix.
2. Confirm the repository root is the build context and the Compose file points to `docker/backup/Dockerfile`.
3. Trigger a fresh build without relying on a stale build cache.
4. Confirm the backup image gets past both script-copy steps.
5. Confirm the backup container starts and its health check passes.
6. Keep `BACKUP_ENABLED=false` until database credentials, SeaweedFS access, encryption recipient and restore procedure have been configured and tested.
7. Before enabling scheduled backups, perform a test backup and a restore into an isolated database.

## Important distinction

This fixes the specific missing-file paths in the supplied log. If BuildKit still reports that the scripts are missing after this change, inspect the effective build context and any root or Dockerfile-specific `.dockerignore` rules in the exact commit Coolify checked out. The supplied log reports only a 2-byte backup build context, which is unusually small and may indicate that the context is being excluded. Do not treat a successful image build as proof that backups can be restored.
