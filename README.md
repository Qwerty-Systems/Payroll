# CrewLedger by Qwerty Systems

A mobile-first, multi-tenant construction workforce, site operations, payroll and business management platform for Kenya. Designed for cloud SaaS and standalone PC/site deployments with offline-first workflows and controlled cloud synchronization.

> Current delivery stage: database and API foundation. The application is not yet ready for production payroll.

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
**Working name:** CrewLedger by Qwerty Systems. Customer workspaces are planned at `https://{tenant-slug}.qwerty.co.ke`; Qwerty control-plane and internal sales workspace are planned under reserved subdomains.

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
- [x] Responsive CrewLedger shell, PWA manifest and install guidance.
- [ ] Authentication, tenant provisioning and authorization guards.
- [ ] Worker, project, site and attendance APIs.
- [ ] Payroll and statutory engine.
- [ ] Offline IndexedDB outbox and synchronization protocol.
- [ ] Qwerty sales workspace, subscriptions and billing.
- [ ] Production CI, end-to-end tests and deployment hardening.

## Local development
1. Install Node.js 22+ and pnpm 10+.
2. Copy `.env.example` to `.env` and set a strong local database password and unique development secrets.
3. Run `pnpm install`.
4. Run `docker compose up -d postgres`.
5. Run `pnpm --filter @crewledger/api migration:run`.
6. Run `pnpm --filter @crewledger/api dev` and `pnpm --filter @crewledger/web dev` in separate terminals.

API endpoints:
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- Swagger: `/api/docs`

Migrations are an explicit deployment step; they are not automatically run at application startup. Do not use production personal or payroll data until authentication, authorization, operational workflows and security reviews are complete.

## Legal and operational notice
This software is an administrative tool, not a substitute for professional payroll, tax, employment or legal advice. Before production payroll is run, the operator must verify statutory rules and filing processes against current official Kenyan sources and obtain appropriate review. The system retains the source, effective date, approver and version for every statutory configuration.
