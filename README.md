# JengaFlow by Qwerty Systems

A mobile-first, multi-tenant construction workforce, site operations, payroll and business management platform for Kenya. Designed for cloud SaaS and standalone PC/site deployments with offline-first workflows and controlled cloud synchronization.

> Current delivery stage: functional foundation. Authentication, tenant provisioning and membership, worker/project/site/attendance operations, payroll calculation with guarded finalization, and an offline attendance outbox are implemented. Payment execution, payslip delivery, billing, full offline coverage and production hardening remain under development. See `docs/16-IMPLEMENTATION-STATUS.md`. Do not use it for production payroll yet.

## Product goals
- Manage construction companies, projects, sites, workers and employment arrangements.
- Capture daily attendance, timesheets, overtime and task-based work.
- Calculate daily, hourly, weekly and monthly earnings with auditable payroll runs.
- Apply configurable, effective-dated Kenyan statutory rules.
- Separate employee payroll from Qwerty platform subscription and service billing.
- Support recurring maintenance fees and one-off implementation/service invoices.
- Provide an installable mobile and desktop PWA with approved offline workflows.
- Synchronize local work to a cloud tenant safely and idempotently.
- Ship reproducible Docker-based development and production deployments.

## Product identity
**Working name:** JengaFlow by Qwerty Systems. Customer workspaces are planned at `https://{tenant-slug}.qwerty.co.ke`; Qwerty control-plane and internal sales workspace are planned under reserved subdomains.

## Documentation
See [docs/README.md](docs/README.md) for the complete requirements, architecture, database, API, payroll, multi-tenancy, offline sync, SaaS billing, security, deployment, user and developer guides, plus product branding and PWA requirements.

## Intended technology
- TypeScript and pnpm workspaces.
- React, Vite, Material UI and PWA service worker.
- NestJS REST API and Swagger/OpenAPI.
- PostgreSQL and TypeORM migrations.
- IndexedDB for browser-side offline cache and command outbox.
- Docker Compose for cloud and standalone local deployment.
- Automated unit, integration and browser tests.

## Important implementation principles
1. Tenant isolation is mandatory. Every tenant-owned row is scoped to a tenant. Server-side authorization, PostgreSQL RLS and database constraints enforce isolation.
2. Money is exact. Store monetary amounts as integer minor units or PostgreSQL numeric, never binary floating point.
3. Payroll is immutable after finalization. Corrections use adjustment runs and reversal records.
4. Statutory rules are effective-dated and must be reviewed against current official Kenyan sources before production activation.
5. Offline commands are idempotent and reconciled by the server. Payroll finalization and payment authorization require online authority.
6. SaaS billing is not employee payroll. Platform invoices and tenant subscription payments live in a separate control-plane bounded context.
7. Demo credentials are development-only. Seeds must refuse to create known demo passwords in production.

## Current implementation
- [x] Product requirements and technical documentation.
- [x] pnpm workspace, NestJS API and React PWA shell.
- [x] PostgreSQL TypeORM integration and initial tenant/workforce schema migration.
- [x] Tenant-row RLS policies and transaction-scoped tenant context helper.
- [x] Liveness and database readiness endpoints.
- [x] Responsive JengaFlow shell, PWA manifest and install guidance.
- [x] Auth0 SPA sign-in, protected workspace entry and authenticated API identity check.
- [x] Auth0-to-platform-user provisioning, tenant invitations, membership and permission-guarded APIs.
- [x] Worker, contract, pay-grade, project, site, organization and attendance APIs, with attendance correction workflow and worker documents.
- [x] Effective-dated Kenya statutory starter pack and tenant deduction/allowance defaults.
- [ ] Payroll calculation and finalization engine (calculation implemented with exact-cent arithmetic; finalization is guarded and blocked on unapproved statutory rules or unresolved classification; payment execution and payslip delivery pending).
- [x] IndexedDB local record cache and idempotent command outbox foundation.
- [x] Authenticated sync API, offline attendance capture through the outbox, automatic retry with backoff, and sync review for conflicts and rejections.
- [ ] Offline reference-data bootstrap, offline workflows beyond attendance, and end-to-end offline browser tests.
- [ ] Qwerty sales workspace, subscriptions and billing.
- [ ] Production CI, end-to-end tests and deployment hardening.

## Local development
1. Install Node.js 22+ and pnpm 10+.
2. Copy `.env.example` to `.env` and set a strong local database password and unique development secrets.
3. Run `pnpm install`.
4. Configure `DATABASE_URL` and `REDIS_URL` for your existing managed services (the main Compose file does not create databases). For an isolated local site install, use `docker-compose.local.yml`.
5. Run `pnpm --filter @jengaflow/api migration:run`.
6. Run `pnpm --filter @jengaflow/api dev` and `pnpm --filter @jengaflow/web dev` in separate terminals.

API endpoints:
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- Swagger: `/api/docs`

Migrations are an explicit deployment step; they are not automatically run at application startup. Do not use production personal or payroll data until authentication, authorization, operational workflows and security reviews are complete.

## Legal and operational notice
This software is an administrative tool, not a substitute for professional payroll, tax, employment or legal advice. Before production payroll is run, the operator must verify statutory rules and filing processes against current official Kenyan sources and obtain appropriate review. The system retains the source, effective date, approver and version for every statutory configuration.
