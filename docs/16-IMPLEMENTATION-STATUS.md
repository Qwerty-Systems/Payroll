# 16. Implementation status and operational notes

## Implemented foundation
- pnpm TypeScript monorepo.
- NestJS API with Swagger and global validation.
- PostgreSQL TypeORM integration configured with schema synchronization disabled.
- Initial TypeORM migration for platform users, tenants, memberships, projects, sites, workers, worker contracts, attendance and audit events.
- Tenant-row PostgreSQL RLS policies on tenant-owned tables.
- Transaction-scoped tenant context helper using PostgreSQL set_config(..., true).
- Liveness and database readiness endpoints.
- React + Material UI responsive application shell.
- PWA manifest, service worker shell caching and install prompt handling where supported.
- Docker Compose PostgreSQL and API service definitions.

## Current API health endpoints
- GET /api/v1/health/live — process liveness.
- GET /api/v1/health/ready — checks PostgreSQL connectivity.
- GET /api/docs — Swagger UI.

## Database migration
After configuring .env and starting PostgreSQL:
```bash
pnpm install
pnpm --filter @payroll/api migration:run
```

The migration is not automatically run on API startup. This is intentional: production schema changes should be a controlled deployment step.

## Tenant isolation rule
All future tenant-owned repository access must run through TenantTransactionService after the request has been authenticated and tenant membership has been verified. The service sets the PostgreSQL tenant context only for the lifetime of the transaction. Do not use session-level SET for tenant context with a pooled connection.

## Not yet production-ready
Authentication endpoints, tenant provisioning workflows, authorization guards, worker CRUD, attendance workflows, payroll calculations, statutory rule packs, payment integrations, sync protocol and Qwerty sales workspace are not yet complete. Do not load real personal or payroll data into this foundation.
