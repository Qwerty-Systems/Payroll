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


## Attendance correction workflow (in review)
- Approved attendance records can receive tenant-scoped correction requests with a reason and proposed clock-in, clock-out and/or minutes-worked values.
- A single pending correction is allowed per attendance record. The requester cannot approve their own correction; approval/rejection requires a review reason and is audited.
- The correction request table enforces tenant RLS and a composite tenant/attendance foreign key. This does not yet replace the remaining shift, leave, overtime and timesheet workflows.

## Offline sync hardening and payroll rounding (in review)
- Payroll statutory arithmetic uses exact integer cents and scaled rates with a single half-up rounding per figure. The previous float rounding was off by KES 0.01 on roughly 1 in 10,000 salaries for SHIF and 1 in 1,000 for the Affordable Housing Levy (for example KES 341,070.00 SHIF is 9,379.43, not 9,379.42).
- Sync server: a reused command ID with a different payload now records a conflict without overwriting the original command's outcome, and resolving a conflict no longer rewrites that original command. A command ID can only be replayed by the user who first submitted it.
- Browser outbox: attendance capture now always goes through the on-device outbox (the direct attendance endpoint is not idempotent, so a lost response could duplicate records). Commands orphaned in `syncing` by a closed tab are recovered; failed commands retry with exponential backoff (30s to 15 min); runs are single-flight per tenant; a network outage stops the run without consuming attempts on queued commands; sync runs automatically on reconnect, tab focus and a one-minute interval. The workspace no longer blanks tables when a refresh fails offline.
- A sync review dialog lists conflicts, rejections and retrying commands and lets a user discard or re-queue them (re-queueing issues a new command ID).
- Reference-data bootstrap: every successful workspace refresh caches workers, projects and sites in IndexedDB (replace-on-refresh, per tenant); the cache seeds the UI on load so attendance capture works with no connection. An endpoint that fails keeps its previous cache.
- Duplicate-punch review: the sync API records a `DUPLICATE_ATTENDANCE` conflict (command state `conflict`, no attendance row inserted) when a worker already has a non-rejected record that overlaps in clock time on any site, or has no clock times on the same site and day. Conflicts appear in the sync review dialog and can be discarded or re-queued. Verified against PostgreSQL 16.
- Tooling: shared ESLint flat config (`eslint.base.mjs`, per-app configs) replaces the placeholder lint scripts and runs in CI; API and web Dockerfiles install with `--frozen-lockfile`.
- Still open: offline workflows beyond attendance, end-to-end offline browser tests, conflict *resolution* that keeps both records (only discard/re-queue exists), and the remaining items in "Not yet production-ready" above (payments, payslips, billing, observability, restore drill).



## Attendance management workflows (in progress)
- Tenant-scoped shift catalogue with create, update and deactivate operations.
- Leave types and per-worker annual balances with opening, accrued, adjustment, used, pending and available day totals. Leave requests enforce available balances and date-overlap checks; approval/rejection is audited and prevents self-approval.
- Overtime requests support supervisor approval/rejection and approved-minute caps.
- Timesheets support draft creation, line create/update/delete, date-range validation, submission, rejection/resubmission and maker-checker approval.
- The tenant workspace includes a Time Management area for shifts, leave, overtime and timesheet operations.
- Leave balances are intentionally tenant-maintained; the system does not infer legal accrual rules. Approved overtime and timesheet values are not automatically added to payroll until the applicable pay policy and approval mapping are configured and reviewed.
- Remaining: worker-to-shift roster assignments, shift-based attendance calculations, payroll integration for approved overtime/timesheets, leave-type edit/deactivation UI, richer timesheet editing UI, and browser end-to-end coverage.


## Overtime in payroll (engine jengaflow-ke-0.4.0)
- Approved overtime requests inside a worker's contract window are paid as a separate earning, added to gross pay and to the statutory base (overtime is ordinary taxable income).
- The multiplier is tenant policy and is never assumed. Set it with `PATCH /api/v1/compliance/overtime-policy` (`{ "multiplier": 1.5 }`, allowed range 1 to 4; requires `compliance.manage`); read it with `GET` (requires `compliance.read`). Updates merge into `tenant_payroll_settings.overtime_policy`, preserve other keys and write an audit event.
- Base hourly rate: hourly contracts use the rate; daily contracts divide by `standard_hours_per_day`; monthly contracts divide by `standard_days_per_month x standard_hours_per_day`. Weekly and per-unit contracts have no unambiguous hourly equivalent and are not paid.
- `attendanceIncludesOvertime: true` (hourly workers only) pays just the premium (`multiplier - 1`), for tenants whose approved attendance minutes already contain the overtime hours.
- Blocking warnings (finalization refused): `OVERTIME_POLICY_MULTIPLIER_NOT_CONFIGURED`, `OVERTIME_BASE_RATE_UNSUPPORTED_FOR_PAY_BASIS`. Approved overtime in those cases is unpaid rather than guessed.
- Approved timesheet `overtime_minutes` are not paid. If a timesheet claims more overtime on a date than approved requests allow, the run gets the review warning `TIMESHEET_OVERTIME_EXCEEDS_APPROVED_REQUESTS`.
- Recalculating a draft or rejected run now also stamps the current `engine_version` on the run.
- Still open: leave/shift roster assignment, weekly-rate overtime divisors, different multipliers for rest days and public holidays, and a web UI for the overtime policy.
