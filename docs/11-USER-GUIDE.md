# 11. User guide (planned workflows)

## 11.1 Tenant setup
Platform operator provisions a tenant and plan. Tenant owner accepts invitation, confirms company details, configures branches, departments, payroll calendar, approval policies and user roles.

## 11.2 Project setup
Create a project with code, client, dates and cost centre. Add one or more sites, supervisors, work categories and shifts. Assign workers with effective dates and approved rates.

## 11.3 Worker onboarding
Create worker record, capture only necessary personal data, record engagement classification and contract terms, upload permitted documents and assign project/site. Review duplicate warnings before activation.

## 11.4 Attendance
Supervisor selects site and work date, captures attendance or reviews offline punches. Exceptions (missing punch, overlapping shift, duplicate entry) are resolved before submission. Approver checks and approves/rejects with reason.

## 11.5 Payroll
Payroll officer selects pay group and period, imports/collects approved timesheets, runs calculation, reviews warnings and variance, submits for approval. Approver reviews totals and sample line calculations. Authorized user finalizes and generates payslips/payment batch.

## 11.6 Corrections and payments
Do not edit finalized payroll. Create an adjustment/reversal with reason and approval. Track payment batch and per-worker payment status separately from payroll calculation.

## 11.7 Platform subscription billing
Platform billing admin configures plan/subscription, generates recurring invoice, adds approved one-off charges, issues invoice and records/reconciles payments. Tenant users see their own subscription status and invoices only if that portal feature is enabled.

## 11.8 Offline work
Before leaving connectivity, sync project/worker reference data. Capture approved offline actions and monitor pending count. When connected, sync and resolve conflicts. Do not clear browser data or uninstall before pending commands are acknowledged. Use local Docker deployment for durable local database operation.
