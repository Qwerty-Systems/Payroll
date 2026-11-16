# Authentication and workspace entry flow

## What this change delivers

- Auth0 callback completion returns the browser to the intended protected route.
- Sign-in stores `/app` as the post-login destination.
- `/app` is protected and initiates Auth0 login when no authenticated session exists.
- The authenticated workspace obtains an access token and calls `GET /api/v1/auth/me`.
- API failures are shown explicitly rather than silently returning users to the public landing page.
- The UI clearly distinguishes successful identity verification from company membership and payroll authorization.

## Current product boundary

This is an authentication integration and diagnostic workspace, not a completed payroll product. The current API identity endpoint returns Auth0 token claims. The repository does not yet implement Auth0-to-platform-user provisioning, company membership management, role/permission administration, or production workforce/payroll workflows. The authenticated page therefore reports these capabilities as pending rather than inventing a tenant or granting permissions.

## Required deployment configuration

Keep these values aligned between the web runtime config and API:

- Web Auth0 domain and SPA client ID.
- Web API audience and API `AUTH0_AUDIENCE`.
- API `AUTH0_ISSUER_URL` (with trailing slash) and the same Auth0 tenant.
- Web `VITE_API_BASE_URL` / runtime `apiBaseUrl`, pointing to the public API origin.
- API `CORS_ALLOWED_ORIGINS`, including the exact web origin.

The Auth0 SPA application must allow the callback URL `https://jengaflow.qwerty.co.ke/auth/callback`, logout URL `https://jengaflow.qwerty.co.ke`, and web origin `https://jengaflow.qwerty.co.ke`.

## Verification

1. Sign in at `/signin`.
2. Confirm Auth0 returns to `/auth/callback` and the app navigates to `/app`.
3. Confirm the authenticated page shows the API profile result.
4. Confirm a rejected API request is displayed as an error with its HTTP status.
5. Confirm opening `/app` in a signed-out browser starts the Auth0 login flow.
6. Confirm sign-out returns to the public site.

Do not treat this change as approval to process live payroll. The remaining product and security work is tracked in the implementation status documentation.
