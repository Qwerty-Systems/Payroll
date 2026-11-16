# 12. Developer guide

## 12.1 Workspace conventions
Use pnpm workspaces and TypeScript strict mode. Keep domain calculation packages framework-independent. Use per-component Material UI imports. Prefer explicit DTOs, validation and service methods; do not expose ORM entities directly from controllers.

## 12.2 Backend conventions
NestJS modules follow controller -> application service -> repository/domain boundary. Keep transaction boundaries explicit. Use request-scoped tenant context or pass a required TenantContext argument; avoid hidden global tenant state. Use TypeORM migrations and repositories with tenant filters.

## 12.3 Database workflow
Create a migration for every schema change. Review generated SQL before commit. Test migration up/down in disposable environments, and test upgrades from previous release. Production deployments apply migrations as a controlled job. Seeders are deterministic, idempotent and environment-gated.

## 12.4 Payroll engine workflow
Pure functions accept immutable inputs and return typed results. Add golden test fixtures and rule version references for each new statutory or wage calculation. Never update historical rule sets in place; publish a new effective-dated version.

## 12.5 Frontend conventions
Use feature-based routes and components, typed API clients, centralized permission guards and accessible forms. Separate online query cache from IndexedDB offline repository. Clearly display online/offline state and pending sync status.

## 12.6 Git and commits
Use feature branches and conventional commit messages: docs:, feat:, fix:, test:, chore:, refactor:. Keep each stage reviewable. Do not push secrets, local database dumps, generated credentials or production data. Open a pull request for review before merging to main.

## 12.7 Required scripts (target)
- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:e2e
- pnpm build
- pnpm db:migrate
- pnpm db:seed:demo (development only)
