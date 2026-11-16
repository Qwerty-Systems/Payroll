# Tenant onboarding implementation tranche

This tranche introduces the first explicit company-provisioning path for Auth0-authenticated users.

## API

- `GET /api/v1/auth/me` returns the Auth0 identity profile, whether the identity has a JengaFlow platform account, and its active tenant memberships.
- `POST /api/v1/auth/onboarding/company` creates a trial tenant and assigns the authenticated creator the `owner` membership role.

Example request:

```json
{
  "legalName": "Example Construction Limited",
  "displayName": "Example Construction",
  "slug": "example-construction",
  "timezone": "Africa/Nairobi",
  "currency": "KES"
}
```

The endpoint requires a valid Auth0 access token with a stable `sub`, `email`, and `email_verified: true` claim. It deliberately refuses to silently link an existing password account to a different Auth0 subject. Existing accounts require a separately verified account-linking process.

## Database migration

Run `1794830300000-Auth0TenantIdentity` using the migration database identity before deploying this API version. The migration makes the legacy password hash nullable for externally authenticated accounts and adds a unique Auth0 subject mapping. It does not run automatically at API startup.

## Important remaining work

This tranche is not a complete authorization implementation. Tenant selection, membership verification on every tenant request, permission/role guards, invitations, user administration, and tenant-aware CRUD modules are still required. Do not expose tenant-owned endpoints until the membership/permission guard is implemented and tested against the non-superuser PostgreSQL runtime role with RLS enabled.

The Auth0 API access token must include email and email_verified claims. Configure an Auth0 Post-Login Action to add only namespaced claims, for example `https://jengaflow.qwerty.co.ke/email` and `https://jengaflow.qwerty.co.ke/email_verified`, and map those claims into the API's verified identity contract before enabling onboarding in production. Never trust browser-submitted email or tenant identifiers as proof of identity or membership.

## Rollout

1. Configure and test the Auth0 claims in a non-production tenant.
2. Run the migration using the migrator role.
3. Deploy the API and verify `/auth/me` returns `provisioned: false` for a new identity.
4. Create a test company through the onboarding endpoint.
5. Verify one tenant and one active owner membership were created, plus a platform audit event.
6. Verify a duplicate slug returns HTTP 409 and an existing unlinked email cannot be auto-linked.
7. Do not load live employee or payroll data until authorization and tenant-scoped modules are complete.
