# JengaFlow by Qwerty

A mobile-first, multi-tenant construction workforce, site operations, payroll and business management platform for Kenya. Designed for cloud SaaS and standalone PC/site deployments with offline-first workflows and controlled cloud synchronization.

> Current delivery stage: Product and technical specification. Application implementation follows after architecture and acceptance criteria are established.

## Product goals

- Manage construction companies, projects, sites, workers and employment arrangements.
- Capture daily attendance, timesheets, overtime and task-based work.
- Calculate daily, hourly, weekly and monthly earnings with auditable payroll runs.
- Apply configurable, effective-dated Kenyan statutory rules.
- Separate employee payroll from Qwerty platform subscription and service billing.
- Support recurring maintenance fees and one-off implementation/service invoices.
- Provide an installable desktop PWA with approved offline workflows.
- Synchronize local work to a cloud tenant safely and idempotently.
- Ship reproducible Docker-based development and production deployments.

## Product identity

**Working name:** JengaFlow by Qwerty (pending Qwerty approval and trademark/domain checks). Customer workspaces are planned at `https://{tenant-slug}.qwerty.co.ke`; Qwerty control-plane and internal sales workspace are planned under reserved subdomains.

## Documentation

| Document | Description |
|---|---|
| [Product requirements](docs/01-PRODUCT-REQUIREMENTS.md) | Scope, personas, functional requirements and acceptance criteria |
| [System architecture](docs/02-SYSTEM-ARCHITECTURE.md) | Monorepo, services, deployment modes and technology choices |
| [Database design](docs/03-DATABASE-DESIGN.md) | PostgreSQL entities, tenancy, constraints and indexes |
| [API specification](docs/04-API-SPECIFICATION.md) | API conventions and endpoint catalogue |
| [Payroll engine](docs/05-PAYROLL-ENGINE.md) | Earnings, deductions, statutory rules and approvals |
| [Multi-tenancy](docs/06-MULTITENANCY.md) | Tenant isolation, identity and authorization |
| [Offline and synchronization](docs/07-OFFLINE-SYNC.md) | PWA, local storage, outbox, conflicts and sync protocol |
| [SaaS billing](docs/08-SAAS-BILLING.md) | Plans, maintenance fees, one-off charges and payments |
| [Security](docs/09-SECURITY.md) | Threat model, privacy, audit and operational controls |
| [Deployment](docs/10-DEPLOYMENT.md) | Docker, Compose, environment and backup strategy |
| [User guide](docs/11-USER-GUIDE.md) | Workflows for administrators, supervisors, finance and workers |
| [Developer guide](docs/12-DEVELOPER-GUIDE.md) | Workspace conventions, migrations, seeds and development |
| [Testing strategy](docs/13-TESTING.md) | Unit, integration, E2E, offline and security testing |
| [Branding and naming](docs/14-BRANDING-AND-PRODUCT-NAMING.md) | Working name, brand architecture and subdomain plan |
| [Responsive PWA and commercial workspace](docs/15-RESPONSIVE-PWA-AND-COMMERCIAL-WORKSPACE.md) | Mobile-first PWA and Qwerty proposals, quotations and CRM scope |

## Intended technology

- TypeScript across frontend, backend and shared packages.
- pnpm workspaces.
- React, Vite, Material UI and PWA service worker.
- NestJS REST API.
- PostgreSQL and TypeORM migrations.
- IndexedDB for browser-side offline cache and command outbox.
- Optional local Docker stack with local PostgreSQL for standalone PC mode.
- Docker Compose for development and production.
- OpenAPI/Swagger for API documentation.
- Automated unit, integration and browser tests.

## Important implementation principles

1. Tenant isolation is mandatory. Every tenant-owned row is scoped to a tenant. Server-side authorization and database constraints enforce isolation; client-provided tenant identifiers are never trusted.
2. Money is exact. Store monetary amounts as integer minor units or PostgreSQL numeric, never binary floating point.
3. Payroll is immutable after finalization. Corrections use adjustment runs and reversal records rather than silently editing paid payroll.
4. Statutory rules are effective-dated. Rates, bands, thresholds, reliefs and filing parameters are configuration data reviewed against current official guidance before production use.
5. Offline does not mean conflict-free. Offline commands are idempotent, versioned and reconciled by the server. Payroll finalization and payment authorization require online authority or an explicitly configured local-only mode.
6. SaaS billing is not employee payroll. Platform invoices and tenant subscription payments live in a separate control-plane bounded context.
7. Demo credentials are development-only. Seeds must refuse to create known demo passwords in production.

## Delivery stages

1. Documentation and architecture.
2. Monorepo foundation, Docker and database.
3. Identity, tenancy and permissions.
4. Construction workforce and attendance.
5. Payroll and statutory engine.
6. Offline PWA and synchronization.
7. SaaS billing and payment integrations.
8. Reporting, hardening, testing and deployment.

## Legal and operational notice

This software is an administrative tool, not a substitute for professional payroll, tax, employment or legal advice. Before production payroll is run, the operator must verify statutory rules and filing processes against current official Kenyan sources and obtain appropriate review. The system must retain the source, effective date, approver and version for every statutory configuration.

## Status

The repository was empty when work began. This first documentation commit establishes the specification baseline. Subsequent commits should implement each milestone on a dedicated development branch and preserve a reviewable history.undefined