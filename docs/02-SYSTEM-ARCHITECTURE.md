# 2. System architecture

## 2.1 Architecture overview
Use a TypeScript pnpm monorepo with a modular NestJS backend and React PWA frontend. Start as a modular monolith to keep deployment simple; isolate bounded contexts in modules and shared packages. Split workers/services only when load or operational boundaries justify it.

## 2.2 Workspace layout
```
apps/
  api/                 # NestJS REST API and OpenAPI
  web/                 # React + Vite + Material UI PWA
  sync-worker/         # Background synchronization, notifications and exports
packages/
  shared-types/        # DTO contracts and domain types
  validation/          # Shared schemas and input validation
  payroll-engine/      # Pure deterministic calculation functions
  statutory-engine/    # Effective-dated statutory rule evaluation
  offline-engine/      # Outbox protocol, conflict helpers and sync contracts
  permissions/         # Permission names and policy helpers
  ui/                  # Reusable frontend components
  config/              # Shared TypeScript/lint/format configuration
infra/
  docker/
  nginx/
  postgres/
docs/
```

## 2.3 Technology choices
- Node.js LTS supported by selected framework versions; pin through .nvmrc and packageManager metadata.
- pnpm workspaces; lockfile committed.
- React + Vite + TypeScript + Material UI.
- NestJS with REST-first APIs and generated OpenAPI docs.
- PostgreSQL as authoritative server database.
- TypeORM with explicit migrations; synchronize=false outside disposable tests.
- Redis only when needed for distributed queues, rate limits or ephemeral coordination; correctness must not depend on cache availability.
- IndexedDB via a maintained wrapper for PWA offline records.
- Service worker for app-shell caching and installability; do not cache authenticated API responses indiscriminately.
- Docker Compose for local development and single-host deployments.
- Object storage adapter for payslip/document files; local filesystem is development-only.

## 2.4 Backend modules
Identity, Tenants, Authorization, Company, Projects, Workforce, Contracts, Attendance, Timesheets, Leave, Payroll, Statutory, Payments, Reports, Documents, Notifications, Audit, PlatformBilling, PlatformAdmin, Sync and Health.

Each module owns its application services, entities/repositories, DTOs, policies and tests. Cross-module communication uses exported application interfaces/events rather than direct access to another module's repositories.

## 2.5 Data boundaries
- **Control plane:** platform users, tenants, plans, subscriptions, platform invoices, platform payments and platform audit.
- **Tenant plane:** company profile, tenant users/memberships, projects, workers, contracts, attendance, payroll and tenant operational audit.
- A tenant request resolves tenant membership from authenticated identity and validated host/header context. Never accept tenant_id as sufficient authorization.
- Use tenant_id columns on tenant-owned tables, composite unique constraints and tenant-aware foreign keys where practical.
- PostgreSQL Row Level Security (RLS) is defense in depth. Set tenant context transaction-locally and ensure connection-pool state cannot leak between requests.
- Control-plane tables are not exposed to tenant database roles.

## 2.6 Deployment modes
### Cloud SaaS
Browser/PWA -> HTTPS reverse proxy -> API -> PostgreSQL; background worker handles exports, notifications and scheduled billing. Object storage holds private documents. Each request is tenant-authorized.

### Local PC / site deployment
Docker Compose runs reverse proxy, API, PostgreSQL and optional worker on the local machine/network. The PWA connects to the local API. Local database is the durable offline authority for that installation; IndexedDB is a browser cache and command queue, not a replacement for server-side transactional storage.

### Hybrid local-to-cloud
A local installation has a registered installation/device identity and a scoped sync credential. Local operations are recorded in an append-only outbox. Cloud accepts idempotent commands, validates authorization and business rules, returns acknowledgements and server versions. Conflicts enter a review queue; payroll posting and payments are not silently last-write-wins.

## 2.7 API conventions
- Prefix: /api/v1.
- JSON, ISO-8601 timestamps, explicit timezone offsets at boundaries.
- UUID identifiers; decimal money serialized as strings or integer minor units.
- Cursor pagination for large collections; bounded page sizes.
- Idempotency-Key for commands that create financial or attendance records.
- Correlation-Id propagated through API, worker and audit logs.
- Consistent error envelope with code, message, field errors and request ID.
- OpenAPI generated from DTOs and controllers.

## 2.8 Reliability and observability
Expose liveness/readiness endpoints; structured JSON logs; metrics for request latency, sync backlog, payroll calculation duration, job failures and database pool saturation. Use retry with exponential backoff and jitter only for transient operations. Dead-letter failed jobs and provide safe replay tooling.

## 2.9 Architecture constraints
- No floating point arithmetic for money.
- No implicit database schema synchronization in production.
- No cross-tenant query without an explicit platform-level permission and audit record.
- No destructive updates to finalized payroll or settled invoices.
- No secrets in source control, image layers or frontend bundles.
