# 1. Product requirements

## 1.1 Vision
Provide construction businesses with a dependable system for workforce administration, site-level time capture, payroll calculation, statutory reporting preparation and operational cost visibility. The product is multi-tenant SaaS, with an optional locally hosted deployment for sites with unreliable connectivity.

## 1.2 Users and roles
- **Platform owner:** manages SaaS tenants, plans, platform invoices, global configuration and support access.
- **Tenant owner/admin:** configures company profile, branches, users, roles, projects and payroll settings.
- **HR/payroll officer:** maintains worker records, contracts, rates, attendance approvals and payroll.
- **Project/site manager:** manages assigned sites, worker rosters, daily attendance and timesheet approvals.
- **Finance officer:** reviews payroll totals, payment batches, expenses and project labour costs.
- **Auditor/read-only:** views authorized records, reports and audit trails.
- **Worker (optional portal):** views own profile, attendance summaries and issued payslips.

Permissions are capability-based and scoped by tenant, project and site. Roles are bundles of permissions, not hard-coded authorization checks.

## 1.3 Functional scope

### Company and workforce
- Company profile, branches, departments, cost centres, job categories and pay grades.
- Worker profile with unique tenant worker number, legal names, contact details, emergency contact and configurable identity/document metadata.
- Employment/engagement type: permanent, fixed-term, casual, daily-rated, hourly, piece-rate or subcontractor. Classification is configurable and must not automatically infer legal treatment.
- Contract history with start/end dates, pay basis, agreed rate, allowances, deductions, leave terms and attached documents.
- Worker status: invited, active, suspended, exited and archived.
- Duplicate detection for tenant-scoped identity/contact fields with explicit override and audit.

### Projects and sites
- Project, client, site, region, supervisor, budget/cost code, planned dates and status.
- Assign workers to projects/sites with effective dates and project-specific rates where authorized.
- Project work categories, tasks, shifts and overtime policies.
- Transfer and temporary assignment history.

### Attendance and timesheets
- Daily attendance by worker, project, site and shift.
- Clock-in/out, manual entry, absence, leave, public holiday, rest day and approved overtime.
- Daily work records may capture units completed for piece-rate work.
- Optional location/device metadata with privacy notice and configurable retention.
- Supervisor approval, rejection with reason, correction request and immutable approval history.
- Offline capture with device-generated UUIDs, timestamps and queued synchronization.
- Duplicate punch detection and exception reporting.

### Payroll
- Pay periods, payroll groups and calendars.
- Draft calculation, validation, review, approval, posting/finalization and payment tracking.
- Earnings: base wages, ordinary hours/days, overtime, allowances, bonuses, piece-rate and arrears.
- Deductions: statutory, approved advances/loans, benefits and other lawful configured deductions.
- Employer contributions/costs kept separate from employee deductions.
- Reconciliation of attendance totals, gross pay, deductions, net pay and project cost allocation.
- Payslip generation and controlled reissue.
- Reversal/adjustment runs for corrections; finalized payroll is never silently rewritten.
- Payment batch export and per-worker payment status; actual gateway execution requires provider credentials and explicit authorization.

### Platform SaaS billing
- Plans with monthly/annual billing cadence, included seats/features/usage limits and trial settings.
- Tenant subscriptions, billing contacts, billing periods and renewal dates.
- Recurring maintenance/service fees and tenant-specific negotiated pricing.
- One-off setup, migration, support, training and custom-service charges.
- Tax configuration, invoices, invoice lines, credit notes, payments, allocations and receipts.
- Partial payments, overpayments, due dates, grace periods, suspension policies and manual reconciliation.
- Billing access is isolated from employee payroll and tenant finance records.

### Reports
- Headcount, contract expiry, attendance, overtime, absenteeism and timesheet exceptions.
- Payroll register, payslips, statutory summaries, payment status and payroll variance.
- Labour cost by project, site, task, worker and period.
- SaaS subscriptions, recurring revenue, outstanding invoices and payment aging (platform control plane).
- CSV/XLSX/PDF exports with permission checks and export audit events.

### Administration
- Tenant-scoped users, invitations, MFA policy, roles and permissions.
- Configurable approval workflows and segregation of duties.
- Audit log for sensitive changes and all payroll state transitions.
- Import templates, validation previews and error reports.
- Notification templates and delivery provider adapters.

## 1.4 Non-functional requirements
- **Security:** TLS in transit, strong password hashing, short-lived access tokens, refresh-token rotation, MFA support, least privilege and tenant isolation.
- **Availability:** health checks, graceful shutdown, structured logs, metrics and documented recovery procedures.
- **Performance:** paginated APIs; indexes for tenant/date/project/worker filters; asynchronous large exports.
- **Data integrity:** database transactions for payroll posting, invoice allocation and synchronization batches.
- **Accessibility:** responsive layouts, keyboard navigation, clear validation and accessible status indicators.
- **Localization:** English initially; currency and timezone are tenant-configurable; Kenya defaults are KES and Africa/Nairobi.
- **Auditability:** store actor, tenant, action, target, timestamp, correlation ID and before/after metadata where appropriate.
- **Maintainability:** strict TypeScript, linting, formatting, automated tests, migration discipline and OpenAPI.

## 1.5 MVP acceptance criteria
1. A platform admin can create two tenants and cannot access tenant operational records without an audited support workflow.
2. Tenant A users cannot read or mutate Tenant B data, including through guessed IDs, exports, background jobs or offline sync.
3. A tenant admin can configure a project, site, worker, contract and pay rate.
4. A supervisor can capture and approve attendance for assigned sites.
5. Payroll can be calculated reproducibly from approved time and effective-dated pay rules.
6. Payroll preview exposes calculation inputs and line-by-line explanation; approval/finalization is permission-gated and audited.
7. An adjustment can correct a finalized run without mutating its original payslips or ledger entries.
8. Platform recurring and one-off invoices can be created, partially paid, allocated and reconciled independently of employee payroll.
9. An installed PWA can capture supported attendance actions while disconnected and later sync them without duplicates.
10. Docker Compose starts the required local services from documented environment variables; health checks and persistent volumes work.
11. Demo seeds are deterministic and blocked in production.
12. A fresh database can be built entirely from TypeORM migrations; production startup never auto-synchronizes schema.

## 1.6 Out of scope for initial MVP
- Automated legal interpretation of worker classification.
- Autonomous filing to statutory portals without approved official integrations.
- Unattended payroll disbursement.
- Full accounting general ledger, procurement and inventory (design integration boundaries first).
- Biometric hardware integration and continuous worker tracking.
- Native mobile apps; responsive PWA is first target.

## 1.7 Product decisions requiring configuration
- Payroll calendar and cut-off rules.
- Overtime, rest day and public holiday treatment.
- Allowance and deduction categories and tax treatment.
- Approval thresholds and dual-control requirements.
- Retention periods and worker self-service availability.
- Local-only mode policy and permitted offline actions.
