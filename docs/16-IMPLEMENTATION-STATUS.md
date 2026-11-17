# 16. Implementation status and operational notes

## Implemented foundation
- pnpm TypeScript monorepo branded JengaFlow by Qwerty Systems.
- NestJS API with Swagger, validation and health checks.
- PostgreSQL TypeORM integration with schema synchronization disabled and managed PostgreSQL SSL/pool configuration.
- Tenant/workforce schema for tenants, memberships, projects, sites, workers, contracts, attendance and audit streams.
- Tenant-row PostgreSQL RLS policies and transaction-scoped tenant context helper.
- Managed Redis connection through REDIS_URL and dependency readiness check.
- Effective-dated Kenya statutory rule pack seeded by migration: PAYE bands and relief, SHIF, NSSF Year 4 2026, Affordable Housing Levy, NITA employer levy, PAYE allowable deductions and insurance relief.
- Tenant payroll settings, default allowance/deduction catalogue and worker assignment tables.
- Tenant statutory pack assignment and date-based rule resolution service, plus approved tenant override service.
- Responsive JengaFlow marketing website, PWA manifest, service-worker shell caching and app install metadata.
- IndexedDB record store and durable command outbox foundation; authenticated tenant sync API for device registration/revocation, idempotent attendance command ingestion, cursor-based attendance pull and audited conflict discard. The React workspace now exposes an authenticated outbox sync action, reuses a registered browser device ID from IndexedDB metadata, submits attendance-create commands, and records server conflicts/rejections locally. Reference-data bootstrap, offline attendance capture UI, conflict review/resolution UI, retry scheduling, and end-to-end offline tests remain incomplete.
- Coolify Compose stack using existing managed PostgreSQL/Redis environment variables; separate local Compose overlay for disconnected site deployments.

## Current API health endpoints
- GET /api/v1/health/live — process liveness.
- GET /api/v1/health/ready — checks PostgreSQL, Redis and SeaweedFS object storage.
- GET /api/docs — Swagger UI in development; disabled in production unless explicitly enabled.

## Coolify configuration
Set DATABASE_URL and REDIS_URL in Coolify. Set DATABASE_SSL=true when the managed PostgreSQL service requires TLS. Use rediss:// for Redis TLS. Do not commit real .env files or secrets. The main docker-compose.yml intentionally does not create PostgreSQL or Redis.

## Migrations
After configuring environment variables and ensuring the managed database is reachable:
```bash
pnpm install
pnpm --filter @jengaflow/api migration:show
pnpm --filter @jengaflow/api migration:run
```

Migrations are a controlled deployment step and are not run automatically by the API on startup.

## Offline deployment
The browser-side IndexedDB store and command outbox are foundations. The API supports registered-device attendance command ingestion, idempotent replay detection, attendance pull cursors and audited conflict discard. The browser client now submits queued attendance-create commands through the authenticated API and records outcomes in IndexedDB. It does not yet provide reference-data bootstrap, offline attendance capture UI, a conflict review/resolution interface, automatic retry scheduling, duplicate-punch review, or end-to-end offline tests. For a fully disconnected site, the local Compose overlay provides local PostgreSQL and Redis volumes; site-to-cloud replication is a separate follow-on component.

## Tenant isolation rule
All tenant-owned repository access must run through TenantTransactionService after authenticating the actor and verifying tenant membership. The service sets PostgreSQL tenant context only for the lifetime of the transaction. Do not use session-level SET for tenant context with pooled connections.

## Not yet production-ready
The current implementation is still a limited foundation. The full workforce/contract management UI, complete statutory payroll support (including allowances, deductions and all pay bases), statutory review tooling, payment provider execution, payslip delivery, tenant-authorized file controllers, complete browser-integrated offline sync, billing, observability/alerting, disaster-recovery restore drill and production browser end-to-end tests remain incomplete. The existing API payroll flow deliberately blocks finalization when statutory rules are unapproved or unsupported earning components are present. Do not load live payroll data or process real payroll until the release blockers in docs/19-PRODUCTION-OPERATIONS.md are closed. Do not load real personal or payroll data into this foundation.


## Production hardening additions (in progress)

- Google Identity Services ID-token verification and refresh-session rotation foundations added.
- Global default-deny JWT guard and explicit public route metadata added.
- API throttling, Helmet headers, strict DTO validation and production environment checks added.
- SeaweedFS S3 private-object service and dependency readiness check added.
- Scheduled encrypted PostgreSQL backup container, checksum sidecar and retention configuration added.
- PostgreSQL 17 migration validation added to CI.

These additions do not make the application production-ready by themselves. Tenant provisioning/membership authorization, tenant-aware file controllers, payroll workflows, full application UI, offline sync API, observability/alerting, dependency scanning, end-to-end tests and a successful backup restore drill remain release blockers. See docs/19-PRODUCTION-OPERATIONS.md.
