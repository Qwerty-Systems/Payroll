# Compliance workflows

JengaFlow compliance is tenant-scoped. Each company reviews the published statutory ruleset independently before payroll can be calculated.

## Statutory rule review

1. Open Compliance → Statutory rules and approvals.
2. Inspect the ruleset, effective dates, calculation methods, configuration and source references.
3. Submit the ruleset for company review. The submitted snapshot is SHA-256 hashed.
4. A different authorised reviewer approves or rejects the review with notes. A submitter cannot approve their own review.
5. Approval creates an effective-dated assignment for that company. Payroll checks that the approval covers the complete payroll period and that the reviewed rule snapshot has not changed.

## Effective-dated changes

1. Propose a change against an existing rule in the selected ruleset.
2. Supply the configuration, effective dates, official source URL, verification date and reason.
3. Submit the proposal for independent review.
4. Approval writes a tenant-specific statutory override. Rejected proposals can be edited and resubmitted.
5. Payroll uses only approved overrides. If a statutory rule boundary falls inside a payroll period, calculation is blocked rather than silently applying one rate to the entire period. The current monthly payroll engine does not prorate mid-period statutory changes.

Changing a calculation method or statutory category is deliberately blocked until the payroll engine has a reviewed implementation. Configuration-only changes retain the existing calculation method.

## Filing preparation and submission tracking

1. Prepare a filing from an approved or finalised payroll run and its period.
2. JengaFlow creates a frozen report snapshot with employee-level statutory lines and authority totals.
3. Request filing review. A different reviewer approves or rejects it with notes.
4. After approval, record the reference and evidence returned by the external authority portal.
5. Record the authority's acceptance or rejection. These records are status tracking; the application does not currently transmit filings to KRA, NSSF, SHA or NITA.

The filing detail view provides an employee-level report and JSON export. Existing filing snapshots are not overwritten; corrections should be recorded as a new filing record with an appropriate filing type and reason.

## Audit and permissions

- Compliance events are written to the audit event log and protected against update/delete.
- Tenant row-level security applies to reviews, changes, overrides and filing records.
- compliance.read, compliance.manage, compliance.submit and compliance.review are separately permissioned.
- Owners and administrators can review; HR/payroll managers can prepare and submit. The submitter cannot approve their own review or filing.

## Database deployment

The Compose deployment runs a one-shot migration container before starting the API. Configure MIGRATIONS_DATABASE_URL (or the corresponding MIGRATIONS_DATABASE_* values) with a database role allowed to run schema migrations. Keep DATABASE_URL / DATABASE_* on the restricted runtime role. If migration execution fails, the API service is not started.
