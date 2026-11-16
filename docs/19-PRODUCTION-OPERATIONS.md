# JengaFlow production operations and hardening

This document records the production foundations added to the repository and the operational controls still required before a real payroll launch.

## 1. Runtime topology

- React/Vite web application served by Nginx.
- NestJS API, with PostgreSQL as the source of truth.
- Redis for queue/cache workloads.
- SeaweedFS S3 endpoint for private object storage.
- A separate scheduled backup container. It creates PostgreSQL custom-format dumps, validates the dump listing, encrypts with age, uploads the encrypted artifact and checksum, and applies a configurable retention window.

Do not expose PostgreSQL or Redis publicly. Prefer private networking between services. The configured PostgreSQL host/port in the current deployment template is the existing external endpoint supplied for this deployment; if the API can join the database private network, use its private hostname and container port instead.

## 2. Database credentials and tenant isolation

**Do not run the API as PostgreSQL superuser.** A superuser bypasses PostgreSQL row-level security, which defeats tenant isolation.

Create a dedicated runtime role and a separate migration/owner role. Adapt the database name and schema if your managed PostgreSQL provider uses a different owner model:

    CREATE ROLE jengaflow_app LOGIN PASSWORD 'GENERATE_A_LONG_UNIQUE_PASSWORD';
    CREATE ROLE jengaflow_migrator LOGIN PASSWORD 'A_DIFFERENT_LONG_UNIQUE_PASSWORD';
    GRANT CONNECT ON DATABASE "JengaFlow" TO jengaflow_app, jengaflow_migrator;

Run migrations with the migrator/owner identity. Grant the runtime role only the required schema/table/sequence privileges after migrations. Do not grant it SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, or ownership of tenant tables. Enable and FORCE RLS on tenant-owned tables and ensure the runtime role is subject to those policies. Keep platform/global reference data access narrowly scoped.


For a fresh database, grant the migrator schema creation rights and make it the owner of the application schema before running migrations:

    GRANT CONNECT ON DATABASE "JengaFlow" TO jengaflow_app, jengaflow_migrator, jengaflow_backup;
    GRANT USAGE, CREATE ON SCHEMA public TO jengaflow_migrator;
    ALTER SCHEMA public OWNER TO jengaflow_migrator;

After migrations, grant the runtime role access to the application tables and sequences. Repeat for any additional application schemas:

    GRANT USAGE ON SCHEMA public TO jengaflow_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jengaflow_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO jengaflow_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE jengaflow_migrator IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jengaflow_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE jengaflow_migrator IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO jengaflow_app;

Review grants against the actual schema before applying them. Do not grant ownership of tenant tables or BYPASSRLS to the runtime role. The migrator is a privileged deployment identity and must never be used by the running API.

The DATABASE_USERNAME template is jengaflow_app. Set DATABASE_PASSWORD to that role password. Do not use the postgres administrative account in the API container.


### Dedicated backup and migration roles

Use a third identity for backups. The backup process only needs to read the database:

    CREATE ROLE jengaflow_backup LOGIN PASSWORD 'GENERATE_ANOTHER_LONG_PASSWORD';
    GRANT CONNECT ON DATABASE "JengaFlow" TO jengaflow_backup;
    GRANT USAGE ON SCHEMA public TO jengaflow_backup;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO jengaflow_backup;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO jengaflow_backup;

Configure default privileges for the role that owns newly created tables, so future migrations remain dumpable:

    ALTER DEFAULT PRIVILEGES FOR ROLE jengaflow_migrator IN SCHEMA public
      GRANT SELECT ON TABLES TO jengaflow_backup;
    ALTER DEFAULT PRIVILEGES FOR ROLE jengaflow_migrator IN SCHEMA public
      GRANT SELECT ON SEQUENCES TO jengaflow_backup;

Use MIGRATIONS_DATABASE_USERNAME and MIGRATIONS_DATABASE_PASSWORD only for migration commands. Use DATABASE_USERNAME and DATABASE_PASSWORD for the API runtime. Use BACKUP_DATABASE_USERNAME and BACKUP_DATABASE_PASSWORD for the scheduled backup container. The backup identity must not have write privileges.

### Redis connection configuration

The current managed Redis connection is supplied as REDIS_HOST=157.245.160.198 and REDIS_PORT=6399. Set REDIS_PASSWORD only if that Redis instance requires authentication. The application builds a Redis connection URL from these fields and URL-encodes the password. Leave REDIS_URL empty to use the host/port settings. The default is non-TLS; enable REDIS_TLS only after confirming TLS is enabled on the Redis listener. Keep the Redis port restricted to the API server/network and do not expose it publicly.

## 3. Auth0 and Google social sign-in

JengaFlow's current web application uses the Auth0 React SDK. Google is configured as an Auth0 social connection; the browser does not exchange Google ID tokens directly with the JengaFlow API.

Create:
- One Auth0 **Single Page Application** client for the React/Vite frontend.
- One Auth0 API resource whose identifier is exactly the API audience configured in JengaFlow.

Configure the SPA application:
- Allowed Callback URLs: `https://jengaflow.qwerty.co.ke/auth/callback`
- Allowed Logout URLs: `https://jengaflow.qwerty.co.ke`
- Allowed Web Origins: `https://jengaflow.qwerty.co.ke`
- Use the SPA client ID in `VITE_AUTH0_CLIENT_ID`. Do not use the API identifier or a different Auth0 application's client ID.

Configure the Google OAuth client used by the Auth0 Google connection with the callback URI shown by Auth0 for that connection. For a standard Auth0 tenant domain this is `https://<AUTH0_DOMAIN>/login/callback`; if Auth0 displays a custom or regional callback domain, use that exact URI. Google must return to Auth0, not directly to the JengaFlow `/auth/callback` URL.

Set:
- `AUTH0_ISSUER_URL` to the Auth0 issuer including its trailing slash.
- `AUTH0_AUDIENCE` to the API resource identifier.
- `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` to the same Auth0 tenant and SPA application.
- `VITE_AUTH0_AUDIENCE` to the API resource identifier.
- `VITE_AUTH0_REDIRECT_URI=https://jengaflow.qwerty.co.ke/auth/callback`.
- `VITE_API_BASE_URL=https://apijengaflow.qwerty.co.ke`.

The frontend obtains access tokens through `getAccessTokenSilently()`. The API validates Auth0 RS256 access tokens against the tenant JWKS, issuer and audience. Do not put an Auth0 client secret in the browser or frontend build. Vite variables are embedded in static assets unless runtime configuration overrides them; rebuild the web image when build-time values change and verify the deployed `window.__JENGAFLOW_CONFIG__` values after deployment.

After changing Auth0 settings, test a fresh login, callback processing, API `/auth/me`, refresh/silent token renewal, logout and a second login. Never share callback URLs containing `code`, `state` or tokens.

## 4. Secrets and environment

Set real values in Coolify, not in Git:
- independent random values of at least 48 characters for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET;
- Google Web client ID;
- runtime PostgreSQL credentials;
- Redis host (157.245.160.198), port (6399), and password if authentication is enabled. Set REDIS_TLS=true only if the Redis listener on that port is configured for TLS. REDIS_URL, when supplied, takes precedence over the host/port/password fields;
- SeaweedFS S3 access/secret keys and bucket;
- BACKUP_AGE_RECIPIENT generated from an offline age identity.

Do not paste secrets into GitHub issues, commits, screenshots, or chat. Rotate any credential that has been exposed.

For the SeaweedFS S3 API, use the S3 endpoint, TLS port 443, path-style addressing, bucket jenga-flow, and private bucket policy. The application adapter supports private upload, signed download (5-minute default, 15-minute maximum), and delete operations. The adapter is an internal service foundation; tenant-authorized upload/download controllers and file ownership checks still need to be built before end users can upload files.

## 5. Encrypted PostgreSQL backups

Generate an age key pair on a trusted offline workstation:

    age-keygen -o jengaflow-backup-identity.txt

Keep jengaflow-backup-identity.txt offline in a protected recovery location. Copy only the public recipient string (the age1... value) into Coolify as BACKUP_AGE_RECIPIENT.

Set:
- BACKUP_ENABLED=true
- BACKUP_CRON=0 2 * * * (02:00 Africa/Nairobi)
- BACKUP_RETENTION_DAYS=35
- database connection values and SeaweedFS access keys.

The backup service uploads encrypted .dump.age files and SHA-256 sidecars to s3://jenga-flow/backups/postgres/. Review the backup container logs after the first scheduled run. A running scheduler is not proof that a backup succeeded.

### Restore drill

1. Download the encrypted dump and its .sha256 file from the backup prefix.
2. Verify the checksum.
3. Decrypt using the offline identity: age --decrypt -i jengaflow-backup-identity.txt -o restore.dump backup.dump.age.
4. Inspect the dump: pg_restore --list restore.dump.
5. Restore into a new, isolated PostgreSQL database first: pg_restore --clean --if-exists --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" restore.dump.
6. Run application smoke tests and reconcile row counts before considering a production restore.

The backup bucket is currently on the same SeaweedFS service configured for application files. For disaster recovery, replicate encrypted backups to a separate account/provider or a physically independent site. Do not rely on a backup stored only on the same host/storage failure domain as production. Perform and record restore drills at least quarterly.

## 6. Health endpoints

- GET /api/v1/health/live: process liveness; does not require dependencies.
- GET /api/v1/health/ready: checks PostgreSQL, Redis and SeaweedFS S3 bucket access. It returns 503 if a configured dependency is unhealthy.

Configure Coolify API health check against /api/v1/health/live. Use readiness for traffic gating and external monitoring. Avoid exposing dependency credentials or detailed exception text in health responses.

## 7. Security baseline

The API now has:
- global request throttling and tighter limits on Google sign-in/refresh;
- Helmet security headers;
- strict DTO validation (whitelist and reject unknown properties);
- explicit public-route metadata, with JWT authentication required by default;
- HS256 access-token verification and a same-origin check for cookie refresh/logout;
- production startup checks for secrets, Google, Redis, PostgreSQL and SeaweedFS configuration;
- Swagger disabled in production unless explicitly enabled.

Before production, additionally:
- add tenant-membership/role guards to every tenant endpoint and verify membership from the database on every request;
- use a non-superuser runtime DB role and test RLS using that role;
- add CSRF coverage and automated auth/session abuse tests;
- implement account recovery, identity linking and session-management UI;
- add security review, dependency scanning, secret scanning and penetration testing;
- restrict API and database ingress to expected origins/network peers.

## 8. Deployment sequence

1. Configure Coolify variables, the Auth0 SPA callback/origin allowlists, and the Google OAuth callback URI shown by Auth0.
2. Provision least-privilege database roles; run migrations with the migrator role.
3. Build and deploy API/web/backup services.
4. Confirm liveness and readiness, Auth0/Google sign-in, silent token renewal, API identity loading and logout.
5. Trigger a manual backup, verify the encrypted object and checksum, and perform an isolated restore.
6. Check application logs and monitor 5xx rate, latency, database connections, Redis availability, object storage failures, queue depth and backup age.
7. Deploy only after CI, migrations, security review and restore drill pass.

## 9. Known production blockers

This repository is not yet a complete production payroll service. Remaining work includes tenant provisioning and membership authorization, full worker/site/attendance/payroll endpoints and workflows, payroll calculation approval and immutable payslips, tenant-aware storage controllers, offline command synchronization, background queues, audit-event coverage, alert delivery, metrics/tracing dashboards, frontend application shell and end-to-end tests. Do not process live payroll until these are implemented, tested and independently reviewed.
