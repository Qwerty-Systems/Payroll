# 3. Database design

## 3.1 Conventions
PostgreSQL is authoritative. Use UUID primary keys, timestamptz for instants, date for business dates, numeric(19,4) or integer minor units for money, explicit currency codes, created_at/updated_at and optional deleted_at only where soft deletion is appropriate. Financial and audit records should be immutable rather than soft-deleted.

Tenant-owned tables include tenant_id NOT NULL. Unique constraints should generally include tenant_id, for example (tenant_id, worker_number). Use foreign keys and composite tenant-aware references to prevent cross-tenant relationships.

## 3.2 Control-plane tables
- platform_users, platform_roles, platform_user_roles
- tenants (slug, legal_name, status, timezone, default_currency)
- tenant_domains, tenant_installations
- plans, plan_features, subscriptions, subscription_items
- platform_invoices, platform_invoice_lines, platform_credit_notes
- platform_payments, payment_allocations, billing_events
- platform_audit_events

## 3.3 Tenant identity and organization
- tenant_users (tenant_id, user_id, status, invited_at, joined_at)
- roles, permissions, role_permissions, user_roles (scope metadata)
- companies, branches, departments, cost_centres
- approval_workflows, approval_steps, approval_instances, approval_decisions

## 3.4 Construction operations
- projects (tenant_id, project_code, client, status, dates, budget metadata)
- sites (tenant_id, project_id, site_code, address/geo metadata, status)
- work_categories, tasks, shifts
- workers (tenant_id, worker_number, names, contacts, status)
- worker_documents (private object key, type, expiry, metadata)
- contracts (worker_id, engagement_type, pay_basis, effective dates, terms)
- worker_assignments (worker_id, project_id, site_id, effective dates, rate override)
- pay_rates (worker/grade/category, amount, unit, effective dates)
- attendance_records (worker, project, site, shift, work_date, clock times, source, status)
- timesheets, timesheet_lines, timesheet_approvals
- leave_types, leave_requests, leave_balances
- work_units for approved piece-rate quantities

## 3.5 Payroll
- payroll_groups, pay_periods, payroll_runs
- payroll_run_workers (snapshot of worker, contract and rate inputs)
- payroll_items (earning/deduction/employer-cost lines, code, quantity, rate, amount)
- statutory_rule_sets, statutory_rules, statutory_brackets, statutory_reliefs
- worker_tax_profiles and configurable statutory identifiers
- salary_advances, advance_repayments
- payroll_approvals, payroll_adjustments, payroll_reversals
- payslips, payment_batches, worker_payments
- project_cost_allocations
- payroll_audit_events

A finalized payroll run stores the exact rule-set version, calculation-engine version, input snapshot and approval evidence. Re-running later must not change the historical result.

## 3.6 SaaS billing
Control-plane billing tables are distinct from tenant employee payroll:
- plans and plan_features
- subscriptions and subscription_items
- billing_accounts and billing_contacts
- billing_cycles
- platform_invoices and platform_invoice_lines
- platform_payments and payment_allocations
- credit_notes, refunds, tax_rates and billing_adjustments
- dunning_events and subscription_events

Invoice line supports recurring maintenance, one-off setup, support, custom work and usage charges. Store service period, quantity, unit price, tax code, tax amount, discount and total as exact numeric values. A payment can be allocated across invoices; allocation totals may not exceed unapplied payment amount.

## 3.7 Offline synchronization
- sync_devices (tenant_id, installation_id, device_id, public key/status/last_seen)
- sync_batches (batch_id, device_id, submitted_at, status)
- sync_commands (command_id, device_id, entity_type, entity_id, operation, base_version, payload_hash, result)
- entity_versions or version columns on mutable entities
- sync_conflicts (command_id, entity reference, reason, resolution state)
- sync_checkpoints (device, stream, cursor)

Every client command carries globally unique command_id and device_id. Server stores processed command IDs with result to guarantee idempotent retries.

## 3.8 Audit and security
- audit_events: tenant_id nullable only for platform events, actor_id, action, entity_type/id, occurred_at, request_id, source, before/after JSON with sensitive fields redacted.
- auth_sessions, refresh_tokens (hashed token identifiers), password_reset_tokens (hashed), mfa_credentials.
- notification_outbox and job_execution records.

## 3.9 Important constraints and indexes
- Unique (tenant_id, worker_number), (tenant_id, project_code), (tenant_id, site_code).
- Foreign keys must preserve tenant ownership; avoid a tenant A child pointing to tenant B parent.
- Index (tenant_id, work_date), (tenant_id, worker_id, work_date), (tenant_id, project_id, work_date), (tenant_id, status, created_at).
- Payroll run uniqueness per tenant/payroll group/period unless explicitly marked as adjustment.
- Unique command_id globally or scoped by installation; idempotency key uniqueness per tenant and endpoint.
- Prevent negative invoice/payment allocations and enforce valid state transitions in service layer plus database constraints where feasible.
- Exclusion/overlap constraints for effective-dated rates/contracts where applicable.

## 3.10 Migration policy
All schema changes are TypeORM migrations committed with the code. Migrations must be forward-only in production, reviewed, tested against a copy of representative data, and run as a deployment step with a backup. Seed data is separate from migrations. Never run synchronize=true in production.
