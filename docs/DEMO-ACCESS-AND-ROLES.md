# JengaFlow demo access and roles

**Status: preparation guide — demo identities are not provisioned yet.**

The API currently authenticates users through Auth0 and returns verified identity claims from `GET /api/v1/auth/me`. The existing demo seed intentionally refuses to create users because tenant and identity migrations are not yet implemented. Do not distribute working demo credentials until that foundation is complete.

## Recommended roles

| Role | Access |
|---|---|
| Platform Owner | Global platform settings, organisation lifecycle, subscriptions, audit and service health |
| Organisation Admin | One organisation's users, departments and settings |
| HR / Payroll | Employee records, payroll preparation, approvals and reports |
| Manager | Assigned teams, attendance review and approvals |
| Employee | Own profile, attendance and released payslips |

Permissions must be enforced by API guards and tenant scoping. Frontend menu visibility is not authorization. Platform Owner is a separate global role and must never be assignable through public sign-up.

## Auth0 demo setup

1. Use the JengaFlow Auth0 SPA application and API resource.
2. Enable Google Universal Login for the SPA.
3. Create dedicated demo identities in Auth0.
4. Keep demo data in a designated demo organisation and use synthetic records only.
5. Assign roles only after API-side identity mapping and tenant membership controls are implemented.

## Coolify environment placeholders

Set values in Coolify's secret environment configuration, not Git:

```dotenv
DEMO_ACCESS_ENABLED=false
DEMO_ORGANISATION_NAME=Uniken Demo
DEMO_PLATFORM_OWNER_EMAIL=
DEMO_ORG_ADMIN_EMAIL=
DEMO_HR_EMAIL=
DEMO_MANAGER_EMAIL=
DEMO_EMPLOYEE_EMAIL=
```

Do not commit passwords, client secrets, access tokens or employee data. Provision passwords through Auth0 invitation/reset flows. If temporary credentials are approved for a controlled demo, generate them outside Git, require reset at first login and revoke accounts after the demo.

## Go-live gate

Before enabling demo access, implement and test Auth0 subject-to-user mapping, tenant membership, global platform-owner authorization, role audit events, an idempotent non-production seed and a demo-account expiry process. Keep `DEMO_ACCESS_ENABLED=false` until then.
