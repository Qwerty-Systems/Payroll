# Tenant users, invitations and membership controls

## Identity model

Auth0 remains the identity provider. The API maps the verified Auth0 `sub` to one platform user. An invitation is bound to a normalized email address and can only be accepted by an authenticated Auth0 identity presenting the same verified email. Existing platform accounts are never silently linked to a different Auth0 subject.

## Invitation workflow

1. A tenant member with `users.manage` creates an invitation for an email address and a supported tenant role.
2. The API stores only a SHA-256 token hash, sets a seven-day expiry and returns the invitation token once.
3. The current delivery state is `manual_share_required`: no email provider has been connected yet. The inviter must share the token using an approved out-of-band channel.
4. The invitee signs in through Auth0 and calls `POST /api/v1/users/invitations/accept` with the token.
5. The API verifies token expiry/revocation, exact normalized email match, creates or securely maps the platform user, activates the membership and writes an audit event in one tenant-scoped transaction.

The token embeds the tenant UUID as a routing hint, but the API still verifies the complete token hash against an unexpired invitation under that tenant's RLS context. A tenant ID alone never grants access.

## Endpoints

- `GET /api/v1/tenant/users` — list tenant memberships; requires `users.read`.
- `POST /api/v1/tenant/users/invitations` — create a role invitation; requires `users.manage`.
- `GET /api/v1/tenant/users/invitations` — list invitation state; requires `users.manage`.
- `POST /api/v1/tenant/users/invitations/:id/revoke` — revoke a pending invitation; requires `users.manage`.
- `PATCH /api/v1/tenant/users/memberships/:id/role` — change an existing member's role; requires `users.manage`.
- `POST /api/v1/tenant/users/memberships/:id/suspend` — suspend a membership; requires `users.manage`.
- `POST /api/v1/users/invitations/accept` — accept an invitation with a verified Auth0 identity.

Tenant endpoints require `x-tenant-id` and a valid Auth0 bearer access token. The API checks active membership and permissions server-side.

## Roles and controls

Supported invite roles: admin, HR manager, payroll manager, supervisor, worker, accountant and viewer. Owner is not assignable through ordinary invitations or role updates. Ownership transfer must be a separately audited process. Only the owner may change owner/admin assignments. The final active owner cannot be suspended.

## Outstanding integration

Email delivery, resend workflows, MFA policy, configurable custom roles/permissions, owner transfer and user-facing administration screens are separate follow-up work. Until email delivery is integrated, invitation tokens must be shared carefully and should never be written to application logs or analytics.
