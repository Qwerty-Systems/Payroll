# JengaFlow production readiness gates

This is the release-control checklist for JengaFlow. It is not a promise that features exist. Items are closed only after implementation, tests, review and deployment evidence are recorded. A passing CI pipeline alone is not production approval.

## Release policy

- [ ] No known critical/high security issue without an approved mitigation.
- [ ] All release CI checks pass on the exact release commit.
- [ ] Database migrations are reviewed, exercised against a production-like copy, and have rollback/recovery notes.
- [ ] Tenant isolation, payroll calculation, finalization and payment reconciliation tests pass.
- [ ] Current Kenyan statutory settings have source links, effective dates, independent reviewer and approval recorded.
- [ ] Backup restoration has been demonstrated in an isolated environment; recovery keys are stored separately.
- [ ] Release owner signs the go/no-go record; real payroll requires a parallel/manual reconciliation run first.

## Workstream A — identity, authorization and tenant isolation (release blocker)

- [ ] Verify every tenant API derives tenant scope from trusted authenticated membership, not user-provided tenant IDs alone.
- [ ] Enforce role/permission checks for read, create, update, delete, approval, export, finalization, payment and platform support access.
- [ ] Verify RLS with the restricted runtime role; test cross-tenant reads/writes for every tenant-owned table and nested resource.
- [ ] Review tenant provisioning, invitations, membership changes, role escalation, identity linking and account recovery.
- [ ] Add session revocation, MFA for privileged accounts, CSRF coverage, abuse/rate-limit tests and security event audit.
- [ ] Clear tenant-scoped IndexedDB data on logout, account switch and tenant switch; test stale offline replay.

## Workstream B — payroll calculation and statutory correctness (release blocker)

- [ ] Maintain approved golden fixtures for every supported pay basis, earning, deduction, allowance, overtime, leave, piecework and classification.
- [ ] Verify exact arithmetic, currency precision, rounding order, negative/zero cases, caps, thresholds and effective-date boundaries.
- [ ] Validate statutory rules against current official Kenyan sources (PAYE, reliefs, NSSF, SHIF, Housing Levy, NITA and other applicable items) and record source, version, effective date, reviewer and approval.
- [ ] Ensure unapproved rule changes, unresolved worker classifications and unsupported earning components block finalization.
- [ ] Verify correction and reversal runs, source-worker scope, duplicate prevention, immutable original snapshots and audit trail.
- [ ] Independently reconcile gross, employee deductions, employer contributions, net pay, liabilities and journal lines; verify accounting exports balance.
- [ ] Confirm calculation preview is reproducible and finalized results cannot be silently edited.

## Workstream C — payroll approvals, attendance and time (release blocker)

- [ ] Enforce separation of duties (maker/checker) for payroll, attendance correction, leave, overtime, timesheets, statutory changes and payments.
- [ ] Validate shift assignments, clock rules, timezone, overnight shifts, duplicate punches, missing punches and correction audit.
- [ ] Define and test mapping from approved leave/overtime/timesheets/piecework into payroll; avoid implicit inclusion.
- [ ] Require approval notes where policy requires them and protect reviewer identity/timestamps.
- [ ] Test state-transition rules, concurrent approvals and idempotent retries.

## Workstream D — payments, remittances and reconciliation (release blocker)

- [ ] Payment provider integration is sandbox-tested, then independently reviewed before live credentials are enabled.
- [ ] Idempotency keys and callback signature/verification, replay protection and duplicate callbacks are tested.
- [ ] Payment batches support safe retry, failure, reversal, partial completion and reconciliation against bank/provider settlement.
- [ ] Restrict payment authorization to approved roles and require confirmation for irreversible actions.
- [ ] Remittance exports reconcile to payroll liabilities and statutory schedules; corrections and reversals are handled correctly.
- [ ] Never mark a batch/item paid based only on a client action or unverified callback.

## Workstream E — payslips, documents, privacy and data lifecycle

- [ ] Finalized payslips are immutable, tenant-scoped, reproducible and available only to authorized workers/admins.
- [ ] Email/SMS/WhatsApp delivery is consent/policy-aware, queued, retried, observable and does not leak salary data.
- [ ] File endpoints enforce tenant and resource ownership before signed URL issuance; private buckets and short expiry are verified.
- [ ] Validate MIME/signatures, size, malware scanning strategy and random object names for uploads.
- [ ] Define retention, export, correction, deletion/legal-hold and access logging for personal data.
- [ ] Redact sensitive identifiers, bank data, tokens and payroll payloads from logs/error telemetry.

## Workstream F — frontend and workflow completeness

- [ ] Complete critical company setup, worker lifecycle, contracts, attendance, time management, payroll, approvals, payments, reporting, settings and user management journeys.
- [ ] Role-based navigation and server authorization agree; inaccessible actions are not merely hidden.
- [ ] Validate form feedback, empty/loading/error states, pagination, filters, responsive layouts and accessibility.
- [ ] Add browser E2E tests for core workflows, login/logout, permissions, payroll review/finalize, payment reconciliation and error recovery.
- [ ] PWA install/update and offline behavior are tested on supported mobile/desktop browsers.

## Workstream G — offline sync and standalone sites

- [ ] Document exactly which workflows are offline-capable; block offline finalization/payment.
- [ ] Test command idempotency, payload mismatch, duplicate attendance, conflicts, backoff, replay and device revocation.
- [ ] Add conflict review/resolution and reliable retry/re-queue UX.
- [ ] Ensure cached data is tenant/user-bound, encrypted where required, minimized and cleared when access changes.
- [ ] Test disconnected local deployment, persistence, backup/restore and cloud synchronization failure modes.

## Workstream H — reliability, observability and incident response

- [ ] Structured logs with request/correlation IDs and sensitive-data redaction.
- [ ] Metrics for request rate, latency, errors, DB pool, Redis, storage, queues, sync backlog, payment failures and backup age.
- [ ] Dashboards and actionable alert routing for service degradation, migration failure, storage/disk pressure, queue backlog and backup failure.
- [ ] Define service objectives, support escalation, incident runbooks, containment and customer notification.
- [ ] Verify graceful shutdown, readiness, liveness, dependency timeouts, retry limits and worker dead-letter behavior.
- [ ] Load/stress test realistic tenants, payroll sizes, exports and concurrent approvals.

## Workstream I — infrastructure, CI/CD and supply-chain security

- [ ] Production secrets come from secret management, are unique per environment and have rotation/ownership.
- [ ] Runtime DB role is least-privilege, non-superuser and not BYPASSRLS; migration and backup credentials are separate.
- [ ] PostgreSQL, Redis, object storage, backup endpoints and admin tools are private/network-restricted.
- [ ] TLS, CORS, proxy trust, cookie flags, CSP and ingress configuration are verified against deployed topology.
- [ ] Build immutable images; pin base images/dependencies appropriately; scan dependencies, images and secrets.
- [ ] Verify migrations, backups before risky releases, expand/contract compatibility and documented recovery.
- [ ] CI includes lint, typecheck, unit/integration, migrations, RLS, E2E, build and security scans; protect main and require reviews.

## Workstream J — backup, disaster recovery and launch operations (release blocker)

- [ ] Encrypted backups run and are monitored; checksums are validated.
- [ ] Backup copy is stored in a separate failure domain/provider, not only beside production storage.
- [ ] Restore drill completed with application smoke tests, row counts and reconciliation evidence.
- [ ] Define and publish recovery point objective (RPO) and recovery time objective (RTO); rehearse failover and restore.
- [ ] Document deployment, rollback/recovery, migration failure, credential rotation, tenant containment, payment incident and support runbooks.
- [ ] Verify production DNS, TLS renewal, health/readiness, email delivery, object storage access and alert routing.

## Workstream K — legal, customer onboarding and commercial operations

- [ ] Kenyan payroll and employment compliance review completed by qualified professionals; statutory filing/export obligations confirmed.
- [ ] Privacy/data protection review, processor/controller roles, customer agreements, privacy notice and data-processing terms completed.
- [ ] Terms, support channel, incident notification, service availability, pricing and billing processes are approved.
- [ ] Tenant onboarding, company verification, administrator training, worker communications and exit/export procedures are tested.
- [ ] Pilot with a non-production tenant and parallel payroll; reconcile every payslip and liability before go-live.

## Required evidence for each release

Attach or link:
1. CI run on release SHA.
2. Migration review/test and compatibility notes.
3. Security findings and remediation status.
4. Statutory configuration approval/version.
5. Payroll golden-test and parallel reconciliation results.
6. Payment/provider and remittance reconciliation evidence (or payment execution explicitly disabled).
7. Backup checksum and restore-drill report.
8. E2E smoke-test results and monitoring/alert verification.
9. Signed go/no-go decision, release owner and rollback plan.

## Current release disposition

**NO-GO for processing real payroll.** Repository documentation currently describes a functional foundation but also explicitly identifies incomplete tenant authorization/provisioning, user-facing workflows, payment execution, payslip delivery, tenant-aware file controllers, offline coverage, monitoring/alerting, dependency/security review and restore drills. The release disposition changes only when blockers are closed with evidence—not by changing this label or running a deployment.
