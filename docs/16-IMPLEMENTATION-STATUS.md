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
- Worker contract classifications include permanent, fixed-term, casual, piece-rate, subcontractor and independent-contractor engagement types, with monthly, weekly, daily, hourly and per-unit pay bases. Effective-dated contracts are overlap-checked.
- Approved piecework/output entries are tenant-scoped, contract-unit-validated, submit/approve/reject controlled, separation-of-duties checked and audited. Payroll derives piecework quantities only from approved output entries.
- Tenant-scoped pay-grade catalogue supports pay basis, currency, minimum/midpoint/maximum rate bands, activation state and assignment to effective-dated worker contracts. Contract assignment validates pay basis and configured rate range.
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
The current implementation is still a limited foundation. The complete worker documents/lifecycle UI and pay-grade management UI, statutory review tooling for allowance/deduction tax treatment, payment provider execution, payslip delivery, tenant-authorized file controllers, complete browser-integrated offline sync, billing, observability/alerting, disaster-recovery restore drill and production browser end-to-end tests remain incomplete. The payroll engine now calculates monthly, weekly, daily, hourly and approved per-unit gross earnings. Subcontractor and independent-contractor classifications emit a statutory-review blocker and do not receive employee statutory deductions by default. Casual and piece-rate workers remain eligible for employee payroll treatment where the engagement is an employment relationship. The existing API payroll flow deliberately blocks finalization when statutory rules are unapproved, worker classification review is unresolved, or unsupported earning components are present. Do not load live payroll data or process real payroll until the release blockers in docs/19-PRODUCTION-OPERATIONS.md are closed. Do not load real personal or payroll data into this foundation.


## Production hardening additions (in progress)

- Google Identity Services ID-token verification and refresh-session rotation foundations added.
- Global default-deny JWT guard and explicit public route metadata added.
- API throttling, Helmet headers, strict DTO validation and production environment checks added.
- SeaweedFS S3 private-object service and dependency readiness check added.
- Scheduled encrypted PostgreSQL backup container, checksum sidecar and retention configuration added.
- PostgreSQL 17 migration validation added to CI.

These additions do not make the application production-ready by themselves. Tenant provisioning/membership authorization, tenant-aware file controllers, payroll workflows, full application UI, offline sync API, observability/alerting, dependency scanning, end-to-end tests and a successful backup restore drill remain release blockers. See docs/19-PRODUCTION-OPERATIONS.md.


## Worker documents
Worker documents are stored in private object storage with tenant-scoped metadata. Uploads are limited to 10 MB and PDF/JPEG/PNG/WebP, with server-side signature checks. Download URLs are issued only after a tenant-scoped metadata lookup and expire after three minutes. The worker detail screen supports document type selection, upload and download.


## Allowances and non-statutory deductions (engine jengaflow-ke-0.2.0)
Payroll runs now calculate tenant allowance and deduction assignments instead of blocking on them.
- Taxable allowances enter the PAYE/SHIF/NSSF/AHL base; non-taxable allowances are paid on top. An allowance whose tax treatment is still `review_required` is treated as taxable provisionally and blocks finalization.
- Supported allowance methods: `fixed_amount` (optional `prorate`), `per_day` (approved days), `percentage` (of basic earnings). `per_hour` is computed only when the type sets `hoursBasis: all_approved_hours`, because approved overtime/night hours are not yet recorded; `quantity_times_rate` has no quantity source yet. Both block finalization otherwise.
- Deductions are applied after tax: `fixed_amount`, `percentage` (of gross, or `base: basic_earnings`) and `balance_recovery`. Pre-tax relief is unsupported and blocks finalization. Unreviewed deduction treatment is assumed post-tax with a non-blocking note.
- Recovery balances are reduced only at finalization, guarded against stale runs. Duplicate active assignments of one allowance type, disabled or non-effective types, and negative net pay block finalization.
- Not implemented: a legal cap on total deductions relative to wages. Confirm the applicable Employment Act limit with a payroll/legal reviewer before enabling production payroll.
