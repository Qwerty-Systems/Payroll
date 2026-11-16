# 6. Multi-tenancy and authorization

## 6.1 Tenant model
A tenant represents a subscribed business/customer. A tenant can contain one or more legal entities, branches, projects and sites. Users may belong to multiple tenants through tenant_users memberships.

## 6.2 Tenant resolution
Resolve tenant from verified custom domain or explicit tenant selector. Confirm authenticated user membership and active subscription policy. Never trust a raw tenant ID from request body, query string or local browser storage. The server creates a request-scoped tenant context only after validation.

## 6.3 Isolation layers
1. Application repositories require tenant context for tenant-owned queries.
2. Every tenant-owned row carries tenant_id.
3. Composite foreign keys/constraints prevent cross-tenant references.
4. PostgreSQL RLS policies enforce tenant_id = current transaction-local tenant setting.
5. Separate DB roles and schemas may be used for stronger isolation in higher-tier deployments.
6. Background jobs include tenant identity and revalidate it before processing.
7. Exports, file access, websocket channels and sync endpoints apply the same policy.

RLS is defense in depth, not a substitute for application authorization. Set the tenant setting with SET LOCAL inside a transaction; never use a session-level setting that can leak across pooled connections.

## 6.4 Platform support access
Platform support users do not automatically receive broad tenant data access. Use time-bound, reason-coded support sessions, least privilege, explicit tenant scope, customer-visible audit and optional approval. Prefer metadata/health support over viewing personal or payroll data.

## 6.5 Authorization
Use permissions such as workers.read, workers.manage, attendance.capture, attendance.approve, payroll.calculate, payroll.approve, payroll.finalize, payroll.payslips.read, billing.platform.manage and audit.read. Bind project/site scopes where relevant. Enforce separation of duties so a user cannot approve their own sensitive changes when policy requires dual control.

## 6.6 Identity
Store global identity separately from tenant membership. Use strong password hashing, refresh token rotation, session/device management, MFA for privileged users and secure invitation acceptance. Avoid embedding tenant-specific permissions in long-lived JWTs; load current membership/permission state or use short-lived claims with revocation strategy.

## 6.7 Tenant lifecycle
Provisioning creates tenant metadata, owner membership, baseline settings and an audit record transactionally. Suspension blocks selected actions while preserving read-only access as configured. Offboarding supports export, retention policy, deletion workflow and evidence of completion.

## 6.8 Security tests
Automated tests must attempt cross-tenant reads/writes through every endpoint, nested relationship, bulk export, report, background job and sync command. Include connection-pool reuse tests for RLS context leakage.
