# Uniken — Project Requirements (PRD)
## JengaFlow workforce, site operations and payroll implementation

**Owner:** Joint Qwerty Systems / Uniken project team  
**Status:** Draft for discovery and validation  
**Version:** 0.1  
**Date:** 16 November 2026

## 1. Purpose

Define the functional and non-functional requirements for onboarding Uniken onto the existing JengaFlow platform. This is a discovery and configuration baseline, not a greenfield product specification. Requirements marked **TBC** require confirmation by Uniken before they become contractual acceptance criteria. Existing platform modules will be demonstrated and mapped to requirements; gaps will be classified as configuration, customization, integration or future-phase work.

## 2. Business objectives

1. Establish a reliable source of truth for worker and employment records.
2. Associate workers and labour activity with the correct project, site and period.
3. Improve the completeness and reviewability of attendance and timesheet inputs.
4. Provide a controlled payroll preparation and approval process.
5. Improve visibility of workforce and labour costs through authorized reports.
6. Preserve traceability for sensitive changes and approvals.

Success measures and numeric targets are **TBC** and should be agreed during discovery.

## 3. Stakeholders and roles

| Role | Proposed responsibilities | Uniken confirmation |
|---|---|---|
| Executive sponsor | Business ownership, budget and escalations | TBC |
| Project manager | Schedule, decisions, risks and coordination | TBC |
| HR/workforce administrator | Worker and contract records | TBC |
| Payroll officer | Pay configuration, payroll preparation and reconciliation | TBC |
| Site supervisor | Site roster, attendance and timesheet review | TBC |
| Finance reviewer | Payroll totals, payment controls and cost reporting | TBC |
| IT/security administrator | Identity, access, devices and technical approvals | TBC |
| Auditor/read-only user | Authorized review and audit access | TBC |

Role names are illustrative. Final permissions must be approved in an access-control matrix.

## 4. Functional requirements

Priority: **Must** = required for agreed initial release; **Should** = desirable; **Later** = future phase. Priorities remain subject to discovery.

### 4.1 Organization and access
- ORG-01 (Must): Maintain the approved Uniken company profile and organizational structure.
- ORG-02 (Must): Support named users and role-based permissions.
- ORG-03 (Must): Restrict each user to explicitly assigned company, project and site scope.
- ORG-04 (Must): Record role changes and privileged administrative actions.
- ORG-05 (Should): Support invitation, deactivation and periodic access review.
- ORG-06 (TBC): Confirm identity provider, MFA policy and any SSO requirement.

### 4.2 Worker and contract records
- WRK-01 (Must): Create, view, update and archive worker records subject to permissions.
- WRK-02 (Must): Assign a unique worker reference within the Uniken workspace.
- WRK-03 (Must): Record engagement type, start/end dates, pay basis and agreed rate.
- WRK-04 (Must): Retain contract and rate history with effective dates.
- WRK-05 (Should): Attach authorized worker documents using private, access-controlled storage.
- WRK-06 (TBC): Confirm required personal data fields, identity checks and retention periods.
- WRK-07 (TBC): Confirm import sources, formats, record volumes and data quality.

### 4.3 Projects, sites and assignments
- SITE-01 (Must): Maintain projects and their associated sites.
- SITE-02 (Must): Assign supervisors and authorized users to sites.
- SITE-03 (Must): Assign workers to projects/sites with effective dates.
- SITE-04 (Should): Maintain work categories, shifts and cost codes.
- SITE-05 (TBC): Confirm site hierarchy, regions, cost centres and reporting dimensions.

### 4.4 Attendance and timesheets
- ATT-01 (Must): Record attendance against worker, date, project/site and shift.
- ATT-02 (Must): Support authorized manual corrections with reason and audit history.
- ATT-03 (Must): Support supervisor review and approval/rejection.
- ATT-04 (Must): Identify incomplete, duplicate or inconsistent attendance records for review.
- ATT-05 (Should): Capture overtime, rest-day, holiday and piece-rate inputs where applicable.
- ATT-06 (TBC): Confirm clock-in/out method, device constraints and location-data policy.
- ATT-07 (Later/TBC): Enable offline capture and synchronization after the conflict and device-security model is approved.

### 4.5 Payroll
- PAY-01 (Must): Configure payroll frequency, pay groups, cut-off and pay periods.
- PAY-02 (Must): Configure approved earnings, allowances and deductions.
- PAY-03 (Must): Calculate payroll from approved worker, contract and attendance inputs.
- PAY-04 (Must): Provide a reviewable payroll preview with calculation breakdowns and exceptions.
- PAY-05 (Must): Restrict approval and finalization to explicitly authorized roles.
- PAY-06 (Must): Preserve finalized payroll records; corrections must use adjustment/reversal records.
- PAY-07 (Must): Produce an agreed payroll register and payslip output.
- PAY-08 (Should): Track payment batch status and reconciliation references.
- PAY-09 (TBC): Confirm statutory rules, exemptions, worker classifications and approval responsibility with Uniken's payroll professionals.
- PAY-10 (TBC): Confirm whether payment provider integration is required; no automatic disbursement is assumed.

### 4.6 Reporting
- REP-01 (Must): Provide worker and contract summaries.
- REP-02 (Must): Provide attendance and timesheet summaries/exceptions.
- REP-03 (Must): Provide payroll-period register and reconciliation totals.
- REP-04 (Should): Provide labour cost by project/site and period where source data supports it.
- REP-05 (Must): Enforce permissions on reports and exports and record sensitive export events.
- REP-06 (TBC): Confirm exact report layouts, filters, formats and distribution rules.

### 4.7 Notifications and documents
- DOC-01 (TBC): Confirm required email/SMS/WhatsApp notifications and approved providers.
- DOC-02 (TBC): Confirm payslip/document delivery channel and user verification requirements.
- DOC-03 (Must): Store private documents with authorization checks and defined retention.

## 5. Non-functional requirements

- NFR-01 Security: TLS, least privilege, secure identity/session handling, MFA policy and protected secrets.
- NFR-02 Tenant isolation: all tenant data access must be scoped and tested server-side; hostname or client-supplied tenant ID is not authorization.
- NFR-03 Auditability: record actor, action, target, timestamp and relevant before/after metadata for sensitive events.
- NFR-04 Availability: define service hours, maintenance windows, uptime target and escalation path (TBC).
- NFR-05 Performance: define expected concurrent users, record volumes and response-time targets (TBC).
- NFR-06 Recovery: agree recovery point objective (RPO), recovery time objective (RTO), backup retention and restore testing (TBC).
- NFR-07 Privacy: minimize personal data, restrict access, define retention/deletion and redact sensitive logs.
- NFR-08 Usability: responsive interfaces for agreed desktop, tablet and mobile devices.
- NFR-09 Localization: confirm language, currency, timezone and statutory jurisdiction; Kenya/KES/Africa-Nairobi are provisional defaults only.
- NFR-10 Maintainability: reviewed database migrations, automated tests, deployment documentation and controlled releases.

## 6. Data migration requirements

Before migration:
1. Uniken identifies the authoritative source systems and appoints a data owner.
2. Parties agree data fields, formats, lawful purpose, transfer method and retention.
3. Qwerty profiles a representative sample and reports duplicates, missing values and format issues.
4. Parties approve mapping and cleansing responsibilities.
5. A test import is reconciled against source totals.
6. Production migration is scheduled, backed up and signed off.

Historical payroll migration depth, document migration, attachments and source-system extraction are all **TBC**.

## 7. Integration requirements

Potential integrations must be assessed individually. Candidate categories include identity/SSO, accounting, payment providers, email/SMS, document storage and existing HR or attendance systems. No integration is included until the provider, use case, API availability, credentials, sandbox, costs and acceptance tests are agreed.

## 8. Security and compliance requirements

- Establish data-controller/processor responsibilities and contract terms.
- Use role and resource-level authorization.
- Separate development, test and production data.
- Protect backups and document storage with encryption and access control.
- Maintain audit records for payroll approval, access changes and exports.
- Test cross-tenant access denial and privilege boundaries.
- Confirm applicable Kenyan data-protection, employment and payroll requirements with qualified advisors.
- Validate statutory configuration immediately before production payroll; version rules and preserve the rule snapshot used for each finalized run.

## 9. Acceptance framework

A requirement is accepted only when:
- its implementation is available in the agreed test environment;
- the named Uniken reviewer executes the agreed test scenario;
- expected results and exception behavior are recorded;
- defects affecting security, data integrity or payroll correctness are resolved;
- evidence and approval are recorded in the UAT log.

### Initial UAT scenario catalogue

| ID | Scenario | Expected result |
|---|---|---|
| UAT-01 | User with no Uniken membership attempts to access workspace data | Access denied and event logged |
| UAT-02 | HR user creates a worker and effective-dated contract | Record saved with required validation and audit |
| UAT-03 | Supervisor views assigned site roster | Only authorized site records are visible |
| UAT-04 | Supervisor submits and approves attendance | Status transitions and actor/time are recorded |
| UAT-05 | Payroll officer previews an agreed test pay period | Calculation breakdown and exceptions are visible |
| UAT-06 | Unauthorized user attempts payroll finalization | Action denied |
| UAT-07 | Authorized reviewer finalizes approved test payroll | Immutable final result and audit record created |
| UAT-08 | User requests an out-of-scope report/export | Access denied |
| UAT-09 | Backup restore exercise | Data restored to isolated environment and smoke tests pass |

Payroll scenario expected values must be supplied and signed off by Uniken's payroll owner.

## 10. Open decisions

- Registered client entity and project sponsor.
- Number of companies, sites, workers and concurrent users.
- Worker categories and pay arrangements.
- Payroll frequency, cut-off, approval chain and payment process.
- Statutory applicability and rule sign-off owner.
- Source data and migration scope.
- Identity provider, MFA and SSO.
- Required integrations and providers.
- Cloud/local/hybrid deployment and data residency.
- Availability, support hours, RPO/RTO and retention.
- Training audience, languages and UAT representatives.
- Budget, target dates and procurement process.

## 11. Change control

After approval, changes to requirements must be recorded with rationale, priority, impact on cost/timeline/security and approval by designated representatives. A change is not included in the baseline until approved in writing.
