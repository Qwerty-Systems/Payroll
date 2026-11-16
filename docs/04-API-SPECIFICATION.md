# 4. API specification

## 4.1 Conventions
Base path /api/v1. Authenticated endpoints require a bearer access token. Tenant context is derived from validated membership and tenant routing context; a supplied tenant slug/header is only a selector and never grants access. Mutating requests accept Idempotency-Key where retries could duplicate work. Responses include requestId.

## 4.2 Endpoint groups

### Authentication and tenancy
- POST /auth/login, /auth/refresh, /auth/logout
- POST /auth/password/forgot, /auth/password/reset
- POST /auth/mfa/challenge, /auth/mfa/verify
- GET /me, GET /me/tenants
- POST /tenant-invitations, POST /tenant-invitations/:token/accept

### Company and organization
- GET/PUT /company
- CRUD /branches, /departments, /cost-centres
- CRUD /users, /roles, /permissions
- PUT /users/:id/roles

### Projects and workforce
- CRUD /projects, /projects/:id/sites
- CRUD /workers, /workers/:id/contracts
- CRUD /workers/:id/assignments
- GET /workers/:id/history
- CRUD /work-categories, /tasks, /shifts

### Attendance and timesheets
- POST /attendance/punches
- GET /attendance
- POST /attendance/manual
- POST /attendance/:id/submit
- POST /attendance/:id/approve and /reject
- CRUD /timesheets and /timesheets/:id/lines
- POST /timesheets/:id/submit, /approve, /reject
- GET /attendance/exceptions

### Payroll
- CRUD /payroll/groups and /payroll/periods
- POST /payroll/runs (create draft)
- POST /payroll/runs/:id/calculate
- GET /payroll/runs/:id/preview
- POST /payroll/runs/:id/submit
- POST /payroll/runs/:id/approve
- POST /payroll/runs/:id/finalize
- POST /payroll/runs/:id/adjustments
- POST /payroll/runs/:id/reverse (authorized correction workflow)
- GET /payroll/runs/:id/payslips
- GET /workers/:id/payslips
- POST /payroll/payment-batches

### SaaS control-plane billing
Platform-only namespace: /platform/v1
- CRUD /plans, /plans/:id/features
- CRUD /tenants, /tenants/:id/subscription
- POST /tenants/:id/charges (one-off charge)
- CRUD /invoices, GET /invoices/:id
- POST /invoices/:id/issue, /void, /credit
- POST /payments, POST /payments/:id/allocations
- GET /billing/aging, /billing/revenue
- POST /subscriptions/:id/pause, /resume, /cancel

### Offline sync
- POST /sync/register-device
- POST /sync/batches
- GET /sync/batches/:id
- GET /sync/pull?cursor=...
- POST /sync/conflicts/:id/resolve
- POST /sync/devices/:id/revoke

### Reporting and audit
- GET /reports/headcount, /attendance, /payroll, /labour-cost
- GET /audit-events (permission-scoped)
- POST /exports (async job); GET /exports/:id

## 4.3 State transitions
Attendance: draft -> submitted -> approved/rejected -> corrected (new version).
Payroll: draft -> calculated -> submitted -> approved -> finalized; rejected returns to draft with audit. Finalized can only be corrected by adjustment/reversal.
Invoice: draft -> issued -> partially_paid -> paid; issued may become void only if no prohibited allocations; corrections use credit notes.
Subscription: trialing -> active -> past_due -> suspended -> cancelled, with policy-driven grace periods.

## 4.4 Error envelope
```json
{
  "statusCode": 409,
  "code": "PAYROLL_PERIOD_ALREADY_FINALIZED",
  "message": "This payroll period has already been finalized.",
  "details": [],
  "requestId": "uuid"
}
```

## 4.5 API security
Validate DTOs at the boundary; reject unknown fields for sensitive commands; enforce authorization in application services; rate-limit authentication and public endpoints; log correlation IDs without logging secrets, full identity documents or bank details. Use cursor pagination and field allowlists for sort/filter.
