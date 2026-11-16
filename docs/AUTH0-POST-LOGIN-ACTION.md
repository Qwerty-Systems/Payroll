# Auth0 Post-Login Action for JengaFlow

The API requires a verified email address to create the first company workspace.
Auth0's SPA profile can contain an email even when the custom-API access token does
not. This Action copies the Auth0 profile fields into namespaced access-token
claims. The API already verifies the access-token signature, issuer and audience
and only accepts these claims after JWT verification.

## Configure Auth0

1. Open **Auth0 Dashboard → Actions → Library**.
2. Create a **Custom** Action named **JengaFlow access-token identity claims**.
3. Select the **Login / Post Login** trigger.
4. Paste the source from `auth0/actions/jengaflow-access-token.js`.
5. Save and **Deploy** the Action.
6. Open **Actions → Flows → Login**.
7. Drag the deployed Action into the Login flow, connect it between **Start** and **Complete**, then **Apply**.
8. Sign out of JengaFlow and sign in again so Auth0 issues a fresh access token.

## Claims produced

- `https://jengaflow.qwerty.co.ke/email`
- `https://jengaflow.qwerty.co.ke/email_verified`
- `https://jengaflow.qwerty.co.ke/name`

The email claim is normalized to lowercase. The verification claim preserves
Auth0's boolean `email_verified` value. JengaFlow refuses workspace creation
unless the verified token contains an email and `email_verified === true`.

## Security notes

- Do not accept the email submitted by the browser as identity proof.
- Do not place an Auth0 client secret in the frontend.
- Do not log access tokens or copy them into support tickets.
- The API must keep validating the JWT signature, issuer and API audience.
- If Google sign-in reports an unverified email, resolve that at the identity
  provider; do not bypass the API verification check.
