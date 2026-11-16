# Offline-first operation and deployment

## Browser PWA mode
- Cache the application shell and versioned static assets with a service worker.
- Keep permitted tenant records in IndexedDB, partitioned by tenant ID.
- Store user changes as immutable commands with client-generated UUIDs.
- Do not store access tokens or refresh tokens in IndexedDB.
- A synchronization sender must attach current authentication credentials and the API must independently verify the authenticated user's membership in the tenant.
- The server must deduplicate each command ID, validate the tenant and permissions, and return either an acknowledgement or a conflict result.
- Never queue payroll finalization, payment approval, role changes, tenant billing or other privileged operations for offline execution.
- Show online/offline state, queued count, last successful sync, failed commands and conflicts in the UI.
- Clear local tenant data on logout and tenant switch, subject to a deliberate unsynced-work warning.
- Request persistent browser storage where supported, but explain that browsers and operating systems may evict data. Browser-only storage is not a guaranteed durable database.

## Fully disconnected site mode
A browser installed from a remote cloud host cannot reach that host when the internet is unavailable. For sites that need local operation independent of internet, deploy the same JengaFlow stack on a local PC/server using Docker Compose with a local PostgreSQL and Redis instance. The local site database becomes the durable source for that site while disconnected. A separate, authenticated site-to-cloud replication process is required to reconcile local and cloud records when connectivity returns. This replication must use stable IDs, idempotency keys, conflict review and audit history; it must not blindly overwrite cloud payroll records.

## Deployment environment
The main Coolify Compose stack expects managed PostgreSQL and Redis and does not create replacement database services. Configure DATABASE_URL and REDIS_URL in Coolify. Use rediss:// for Redis TLS and DATABASE_SSL=true for managed PostgreSQL requiring TLS. URL-encode special characters in connection-string usernames and passwords.

A separate local compose profile/file will be provided for self-contained offline site installations. Do not point two independently writable sites at the same local database volume.
