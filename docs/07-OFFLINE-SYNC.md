# 7. Offline-first PWA and synchronization

## 7.1 Offline model
The installable PWA caches its application shell and stores a bounded working set in IndexedDB. It queues supported commands in an outbox. For robust site operation, deploy the local Docker stack with local PostgreSQL; browser storage alone can be evicted and is not a durable payroll database.

## 7.2 Offline-supported actions
Initial supported actions: view previously synchronized project/site/worker roster; capture attendance punches; create draft daily timesheet entries; attach small queued notes and metadata. Configure whether manual corrections are allowed offline. Payroll approval/finalization, subscription billing, payment execution, user/role changes and statutory rule updates require online authorization.

## 7.3 Command envelope
Each command includes command_id UUID, device_id, tenant_id hint, actor identity reference, entity type/id, operation, base_version, client_created_at, schema_version, payload and payload hash. Server derives tenant and actor from device/user credentials; client values are consistency hints only.

## 7.4 Idempotency
Server stores every processed command ID and its outcome. Replayed command IDs return the original outcome and never duplicate attendance or payments. Commands are processed transactionally with domain writes and acknowledgement records.

## 7.5 Conflict policy
- Append-only punches: preserve both records and flag suspicious duplicates for review.
- Draft notes/timesheet edits: compare base version; return conflict if server changed since base.
- Worker/project reference data: server wins; client refreshes.
- Approved attendance: corrections create a new version and approval event.
- Payroll/financial state: no automatic last-write-wins; reject stale mutation and require authorized online workflow.

## 7.6 Sync protocol
1. Register device and bind to tenant installation.
2. Download authorized reference data and server cursor.
3. Record offline commands in IndexedDB transactionally.
4. When online, submit ordered bounded batches.
5. Server authenticates, validates, deduplicates and processes each command.
6. Server returns accepted/rejected/conflict outcomes with canonical versions.
7. Client marks acknowledgements and retains failed commands for retry or review.
8. Pull changed server records using opaque cursor; apply updates atomically.
9. Reconcile conflicts through an explicit user workflow.

## 7.7 Security and privacy
Use HTTPS, device-scoped credentials, revocation, short-lived tokens and encryption at rest where available. Do not store passwords, refresh tokens in plaintext or unnecessary identity documents in IndexedDB. Clear tenant cache on logout, membership revocation or device removal. Service worker must not cache sensitive API responses by default.

## 7.8 Storage limits and recovery
Request persistent browser storage where supported, monitor quota and handle quota errors. Provide sync status, pending count, last successful sync and export/recovery guidance. Local PostgreSQL backups are required for local server mode. A device lost before synchronization may lose its unsynced browser-only work; communicate this clearly.

## 7.9 Local/cloud authority
A local installation has its own database and installation identity. Cloud synchronization is a replication workflow, not direct database replication. Cloud must validate schema versions, business rules, subscription state and authorization. Define whether local mode is a licensed standalone tenant or a managed site node before production.
