# 10. Deployment and operations

## 10.1 Local development
Prerequisites: supported Node.js LTS, pnpm, Docker Engine/Desktop and Git. Copy .env.example to .env, set local-only secrets, then use documented workspace scripts to start PostgreSQL and the application. Never use production secrets in development.

## 10.2 Docker Compose services
Expected services: web/reverse-proxy, api, PostgreSQL, sync-worker and optional Redis. Use named persistent volumes for PostgreSQL and local object storage. Expose only the reverse proxy to host; database/cache remain on private Docker networks. Provide health checks and dependency readiness rather than relying only on startup order.

## 10.3 Environment configuration
Document DATABASE_URL, JWT/session secrets, app origins, tenant domain settings, object storage endpoint/bucket/credentials, mail provider, queue configuration, payment provider sandbox settings, encryption key references, logging level and feature flags. Validate required variables at startup and fail closed.

## 10.4 Migrations and release
Build immutable images, run migration job once, deploy API/worker/web, verify readiness and smoke tests. Do not run TypeORM synchronize in production. Take a verified backup before risky migrations. Use backward-compatible expand/migrate/contract changes for zero/low downtime.

## 10.5 Local PC installation
Provide a guided .env setup, docker compose up -d, initial platform/tenant bootstrap command, local URL and health check. Persist database data outside ephemeral containers. Document supported Windows/macOS/Linux host prerequisites and firewall access for LAN devices.

## 10.6 Backups
Automated PostgreSQL logical or physical backups, encrypted off-host copies, object storage versioning and retention policy. Include restore drills, RPO/RTO targets and verification of backup integrity. Local installations need a visible backup status and export procedure.

## 10.7 Monitoring
Health endpoints, structured logs, request IDs, database/queue metrics, disk usage, backup age, sync backlog and failed jobs. Alert on repeated migration failures, storage pressure, backup failure, queue growth and abnormal authentication activity.

## 10.8 Production hardening checklist
- Unique secrets per environment and rotation process.
- TLS and secure headers.
- No public database/cache ports.
- Non-root containers and pinned image versions.
- Migrations reviewed and tested.
- Demo seeds disabled.
- Backup restore tested.
- Admin MFA enabled.
- Rate limits and upload limits configured.
- Error reporting excludes personal/payroll secrets.
