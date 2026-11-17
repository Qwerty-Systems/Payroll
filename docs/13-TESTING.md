# 13. Testing strategy

## 13.1 Unit tests
Test payroll arithmetic, statutory rule evaluation, pay-rate date resolution, permission policies, invoice calculations, payment allocation and sync conflict decisions. Include boundary and rounding cases.

## 13.2 Integration tests
Use ephemeral PostgreSQL to test migrations, constraints, RLS, tenant scoping, transactions, idempotency, payroll posting, invoice generation and webhook deduplication. Verify pooled connections do not retain tenant context.

## 13.3 API tests
Test authentication, permission denials, tenant isolation, validation errors, pagination, rate limits and state transitions. Every tenant resource endpoint needs positive and cross-tenant negative tests.

## 13.4 Frontend and PWA tests
Test accessible forms, role-based navigation, offline shell startup, IndexedDB outbox durability, service-worker update behavior, quota failure, logout cache clearing and reconnection sync. Browser E2E tests should simulate offline/online transitions.

## 13.5 Payroll golden tests
Maintain approved fixtures for each active statutory rule version and pay basis. Verify reproducibility, line item explanation, no floating-point drift and immutable finalized snapshots.

## 13.6 Security tests
Dependency and container scans, secret scanning, upload validation, CSRF/XSS checks, authorization bypass attempts, cross-tenant IDOR tests, replay attacks and webhook signature verification.

## 13.7 Release gates
A release cannot proceed unless lint, typecheck, unit, integration, E2E, migration and build checks pass; critical/high vulnerabilities are triaged; restore procedure is tested; and statutory configuration has documented review approval.

## Payroll integration test against PostgreSQL
`apps/api/src/modules/payroll/payroll.integration.spec.ts` runs the real payroll SQL (period, run, calculation, finalization, payslips, recovery balances) against a migrated database through a non-superuser role, so row-level security is genuinely enforced. It is skipped unless `TEST_DATABASE_URL` (owner, for seeding) and `TEST_APP_DATABASE_URL` (runtime role) are set, and CI sets both. Use a disposable database only. Mocked unit tests cannot catch SQL or driver-type errors: this test found that raw `date` columns arrive as JavaScript `Date` objects, so date columns read by the payroll engine must be selected `::text`. Run it under `TZ=Africa/Nairobi` to match the deployment timezone.
