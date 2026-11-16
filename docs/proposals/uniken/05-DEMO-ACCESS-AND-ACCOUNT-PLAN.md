# JengaFlow demo access — Uniken

**Owner:** Qwerty Systems  
**Status:** Setup specification — demo accounts are not yet provisioned  
**Purpose:** Prepare a safe, repeatable demonstration for Uniken.

## Demo roles

| Demo account | Role | What the visitor can demonstrate |
|---|---|---|
| Platform Owner | Global platform administration | Create/manage organizations, manage platform-level configuration, view platform health, manage global support access and audit platform administration |
| Uniken Organisation Admin | Uniken-only administration | Manage Uniken users and role assignments, workers, departments, projects/sites, attendance workflows, payroll setup, reports and organization settings |

The Platform Owner must not be used for normal Uniken payroll operations. The Organisation Admin must never have access to another organization's records or platform-wide settings.

## Current implementation status

**The two accounts cannot safely be provisioned yet.** The repository's current demo seed script explicitly stops because the identity and tenant migrations are not implemented. The TypeORM data source currently has no registered entities. Creating users directly in the database or inventing password values would not create working, properly authorized accounts.

The repository also needs a verified role and permission model before these demo roles can be granted. A successful login is not proof of authorization.

## Required implementation before issuing demo credentials

1. Implement and migrate the identity, organization/tenant membership, role and permission schema.
2. Implement server-side authorization guards for every protected API route.
3. Enforce tenant scoping on every organization-owned query and background job.
4. Implement a deterministic, idempotent demo seed command that refuses to run in production.
5. Seed one isolated demo organization named **Uniken Demo** and the two roles above.
6. Create credentials from protected environment variables or a one-time setup flow; hash passwords using a modern password-hashing algorithm.
7. Force password change on first login, expire demo access, and provide a rotation/deletion procedure.
8. Add automated tests proving that the Platform Owner has only intended global permissions and the Organisation Admin cannot access another tenant.
9. Validate the demo using non-production sample data only.

## Proposed environment configuration

These are **proposed names only**. They are not currently consumed by the application and must not be populated until the seeder and authorization implementation exist.

```env
DEMO_SEED_ENABLED=false
DEMO_ORGANIZATION_NAME=Uniken Demo
DEMO_PLATFORM_OWNER_EMAIL=
DEMO_PLATFORM_OWNER_PASSWORD=
DEMO_ORG_ADMIN_EMAIL=
DEMO_ORG_ADMIN_PASSWORD=
DEMO_ACCOUNT_EXPIRES_AT=
```

Do not commit a populated `.env`, passwords, API keys, or production credentials. Add values only to a protected non-production secret store such as Coolify environment variables. Never reuse demo passwords in production.

## Demo walkthrough

1. Sign in as Platform Owner and show platform-level organization and access administration.
2. Switch to the separately issued Uniken Organisation Admin account.
3. Show the Uniken organization dashboard and user/role administration.
4. Walk through sample worker records, projects/sites and attendance approvals.
5. Show payroll preparation and review only if those workflows have passed acceptance tests.
6. Show reports and audit history.
7. Explain which features are live in the demo and which are planned.

## Release gate

Do not distribute credentials or describe the demo as production-ready until the identity schema, tenant authorization, seed command, role tests and demo workflows have been implemented and verified. The demo environment must be isolated from production data and integrations.
