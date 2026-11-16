# QWERTY SYSTEMS
## JengaFlow — Workforce, Site Operations & Payroll Platform
### Solution proposal for Uniken

**Prepared:** 16 November 2026  
**Prepared by:** Qwerty Systems  
**Prepared for:** Uniken  
**Status:** Discussion draft — subject to discovery, technical validation and commercial approval

---

## 1. Executive summary

Qwerty Systems proposes onboarding Uniken onto JengaFlow, its existing workforce, site-operations and payroll platform. JengaFlow is already in operational use across organizations and projects including Dominion Outdoor, Nifunze, SakaTaka and View Academy. The Uniken engagement is therefore an implementation of an established platform: configure Uniken's workspace, adapt agreed workflows, migrate approved data, train users and validate the required processes. The exact modules and capabilities enabled for Uniken will be confirmed during discovery.

The intended outcome is a more consistent operating process: workforce information is maintained centrally; attendance and work records are captured against the correct site and period; payroll inputs are reviewed before calculation; and authorized users can trace approvals and changes.

The engagement will begin with discovery and process mapping. This is important because Uniken's actual workforce structure, payroll calendar, pay arrangements, approval chain, statutory treatment, integrations, reporting needs and deployment constraints have not yet been confirmed.

**Existing platform and scope note:** JengaFlow is an existing platform in operational use. The fact that the platform is in use does not mean every module, integration or workflow is automatically included or enabled for every customer. Uniken's subscribed scope, configuration, data migration, access controls, payroll rules, integrations and acceptance tests will be agreed explicitly. Any workflow that is not yet available in the agreed release will be identified as a configuration, customization or separately scheduled enhancement before commitment.

## 2. Understanding of the opportunity

The proposed project is intended to help Uniken establish a controlled digital process for:
- maintaining worker and employment records;
- organizing business units, projects, sites and supervisors;
- recording and approving attendance, shifts, overtime and timesheets;
- preparing payroll from approved inputs and configured pay rules;
- reviewing payroll totals and producing authorized reports;
- maintaining a traceable record of approvals and sensitive changes.

The following are discovery items, not assumed facts: Uniken's industry and operating model, number of employees, number of active sites, worker categories, payroll frequency, existing systems, data quality, current approval processes and preferred deployment model.

## 3. Proposed solution

JengaFlow is designed as a responsive web application with an installable Progressive Web App (PWA). The target architecture uses a React frontend, NestJS API, PostgreSQL database and controlled background processing. The platform is intended to support cloud hosting and, where justified, a local site deployment with a separately designed synchronization process.

### 3.1 Workforce and company administration
- Company profile, organizational units, departments and cost centres.
- Worker profiles and tenant-specific worker identifiers.
- Employment/engagement records, contract history, pay basis and effective dates.
- Worker status and controlled document metadata.
- Role-based access for administrators, HR/payroll, supervisors, finance and read-only reviewers.

### 3.2 Projects and site operations
- Projects, sites, supervisors, work categories and cost codes.
- Worker assignments to projects/sites with effective dates.
- Site rosters, shift definitions and assignment history.
- Labour-cost reporting dimensions.

### 3.3 Attendance and timesheets
- Daily attendance and shift records.
- Clock-in/out or authorized manual attendance entry.
- Absence, leave, rest-day and overtime records as configured.
- Supervisor review, approval, rejection and correction history.
- Offline attendance capture is a planned capability; the exact workflows and synchronization rules must be validated before it is enabled for Uniken.

### 3.4 Payroll preparation and control
- Payroll groups, pay periods and cut-off configuration.
- Earnings, allowances, overtime and approved deductions.
- Configurable statutory rule versions and effective dates.
- Draft calculation, exception review, approval and finalization workflow.
- Payroll register, payslip outputs and payment-status tracking.
- Adjustment/reversal records for post-finalization corrections.

Payroll capabilities will be demonstrated and validated against Uniken's actual pay rules, worker categories and approval process. Before live payroll use, Qwerty and Uniken will complete agreed test cases and parallel-result reconciliation, with Uniken's payroll owner approving statutory treatment and expected results. Automated disbursement or statutory filing is not included unless separately specified, technically validated and approved.

### 3.5 Reporting and audit
- Workforce headcount and contract summaries.
- Attendance and timesheet exception reports.
- Payroll register and period comparison.
- Labour-cost summaries by project/site where data is available.
- Permission-controlled exports and audit events for sensitive operations.

### 3.6 Security and data management
The target design includes authenticated access, tenant-scoped authorization, least-privilege roles, audit logging, encrypted transport, protected document storage, backups and monitored service health. These controls must be implemented and tested as release criteria. A successful login alone is not sufficient: every user must also be authorized for the relevant Uniken company, site and action.

## 4. Delivery approach

| Phase | Activities | Exit criteria |
|---|---|---|
| 1. Discovery and solution design | Workshops, process mapping, user roles, data inventory, integration review, deployment assessment and signed scope | Approved requirements, assumptions, data plan and delivery estimate |
| 2. Foundation and tenant setup | Environment configuration, identity and access model, company structure, roles, security baseline and audit design | Access model and tenant boundaries tested |
| 3. Workforce and site workflows | Worker records, contracts, projects, sites, assignments and imports | Agreed user-acceptance scenarios pass |
| 4. Attendance and approvals | Attendance, timesheets, exceptions, supervisor approvals and any approved offline scope | Reconciled attendance scenarios pass |
| 5. Payroll and reporting | Pay configuration, calculation rules, payroll review/finalization, reports and payslip validation | Parallel payroll comparison and sign-off |
| 6. Pilot, training and launch | Pilot, issue resolution, training, cutover, operational handover and support transition | Client acceptance and go-live checklist signed |

The sequence may be adjusted after discovery. No phase is considered accepted solely because software has been deployed; the agreed acceptance scenarios must pass.

## 5. Deliverables

Subject to the final statement of work, expected deliverables are:
1. Discovery report and approved requirements baseline.
2. Solution architecture, access matrix and deployment plan.
3. Configured Uniken workspace and agreed organizational structure.
4. Implemented and tested in-scope workforce, site and attendance workflows.
5. Payroll configuration and calculation workflow within the agreed scope.
6. Agreed reports and export templates.
7. Data-import templates and a migration/reconciliation report, if migration is included.
8. User and administrator guides.
9. Training sessions for nominated administrators and end users.
10. UAT record, go-live checklist and handover notes.

## 6. Data migration and integrations

Data migration is subject to a sample-data assessment. Uniken should provide authorized, structured source data and confirm the legal basis and permitted purpose for processing it. Qwerty will agree field mapping, cleansing responsibilities, validation totals, exception handling and sign-off before importing production records.

Third-party integrations—including accounting, banking, mobile-money, identity providers, messaging, biometric devices or existing HR systems—are excluded unless named in the signed scope. Availability of APIs, provider approvals, credentials, transaction fees and third-party service limits may affect cost and schedule.

## 7. Security, privacy and governance

The implementation will use a least-privilege access model and tenant isolation. Sensitive actions such as payroll approvals, role changes, worker-data exports and support access should be auditable. Production data should not be used in development or test environments unless appropriately minimized and protected.

Before go-live, the parties should agree:
- controller/processor roles and a data-processing agreement where applicable;
- permitted data categories and purposes;
- retention, deletion, export and access-request procedures;
- hosting region, backup location and recovery objectives;
- incident escalation and notification responsibilities;
- user access reviews and privileged-access controls.

Qwerty will not claim legal or statutory compliance solely because a rule is configurable in the software. Uniken should have payroll and legal specialists validate the applicable rules and operational treatment before the first live payroll.

## 8. Responsibilities

### Qwerty Systems
- Lead technical discovery and document the agreed solution.
- Implement and configure the agreed scope.
- Maintain development, test and deployment controls.
- Provide migration templates and support agreed validation.
- Conduct agreed training and handover.
- Report risks, dependencies, scope changes and delivery status.

### Uniken
- Appoint a project sponsor and operational decision-makers.
- Provide timely access to process owners and authorized sample data.
- Confirm worker categories, payroll policies, statutory treatment and approval rules.
- Nominate users for UAT and training.
- Review deliverables and provide consolidated feedback within agreed review windows.
- Obtain required internal approvals and third-party permissions.

## 9. Indicative project governance

A joint working group should meet at an agreed cadence, with a nominated decision-maker on each side. Requirements, decisions, risks, change requests and acceptance evidence should be recorded. Any material scope change should be assessed for cost, timeline, security and operational impact before work proceeds.

## 10. Commercial framework

The detailed quotation is provided separately in [03 — Commercial quotation](03-QUOTATION.md). The final price and delivery schedule will be confirmed after discovery and approval of the scope. Hosting, third-party subscriptions, migration effort, integrations, training beyond the agreed allowance and ongoing support must be explicitly identified in the final commercial schedule.

## 11. Assumptions, exclusions and dependencies

- Uniken's legal entity, operating locations, user counts and workforce volumes are to be confirmed.
- The initial jurisdiction is assumed to be Kenya for discovery planning only; all applicable payroll rules require client-side professional validation.
- No third-party integration is included unless expressly listed in the signed scope.
- No automated bank/mobile-money disbursement or statutory filing is included by default.
- No biometric hardware, continuous location tracking or native mobile application is included by default.
- Data migration scope depends on source quality and agreed record volumes.
- Hosting, data residency and disaster-recovery requirements require approval before production deployment.
- Delivery dates depend on timely access to stakeholders, data, credentials and decisions.

## 12. Acceptance and next steps

The proposed next step is a discovery workshop with Uniken's operational, HR/payroll, finance and IT representatives. The workshop will confirm the operating model, requirements, data sources, integrations, security expectations, pilot scope and success measures.

Following discovery, Qwerty will issue a final statement of work and priced quotation for approval. Work will begin only after the parties approve the scope, commercial terms, responsibilities and applicable agreements.

---

**QWERTY SYSTEMS**  
Nairobi, Kenya  
https://qwerty.co.ke | contact@qwerty.co.ke | +254 743 414 034

*Confidential discussion draft for Uniken. This document is not a binding offer or contract.*
