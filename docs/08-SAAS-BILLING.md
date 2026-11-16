# 8. SaaS subscriptions, maintenance and one-off billing

## 8.1 Boundary
Platform billing charges customers for using the payroll SaaS. It is separate from employee wages, statutory deductions and tenant operational accounting. Platform billing lives in the control plane and is accessible only to platform billing roles.

## 8.2 Plans
A plan defines code, name, currency, cadence, base price, trial length, grace period, included users/seats, project/site limits, storage/usage allowances and feature flags. Version plans rather than mutating terms on existing invoices. Subscription items snapshot the agreed price and feature entitlement.

## 8.3 Recurring maintenance fees
Subscriptions generate invoices for a defined service period (monthly or annual). Support negotiated tenant pricing, discounts and proration through explicit invoice lines. Generate invoices idempotently using tenant/subscription/period keys. Failed billing jobs can be safely retried.

## 8.4 One-off charges
Authorized platform staff can add setup, data migration, training, custom development, extra support or other one-off services. Require description, quantity, unit price, currency, tax treatment, service date/period, customer reference and creator. Optional customer approval/quote acceptance precedes invoice issue.

## 8.5 Invoice lifecycle
Draft -> issued -> partially_paid -> paid. Credit notes and voids are controlled operations with reasons and audit. Invoice numbering is tenant-independent platform numbering, unique and non-reusable. Issued invoice lines are immutable; corrections use credit/debit documents.

## 8.6 Payments and allocation
Record payment provider/reference, amount, currency, received date, payer and status. Support manual bank reconciliation and provider webhooks. Verify webhook signatures, deduplicate provider event IDs and never trust client-supplied payment success. Allocate payments to invoices transactionally; partial and multiple-invoice allocations are supported. Refunds and unapplied balances remain explicit.

## 8.7 Subscription state
Trialing, active, past_due, suspended and cancelled. Grace period and suspension effects are configurable and communicated. Avoid deleting tenant data on suspension. Provide read-only/export access where policy and law require it.

## 8.8 Tax and compliance
Tax rates are effective-dated and configurable. Invoice stores a snapshot of tax basis/rate/amount and legal customer details at issue time. Confirm applicable Kenyan tax/VAT invoicing obligations and eTIMS integration requirements with qualified finance/tax review before production.

## 8.9 Provider adapters
Define PaymentProvider interface for create payment request, verify callback/webhook, query transaction and refund where supported. M-Pesa Daraja and bank integrations are adapters, not embedded assumptions. Sandbox credentials and callback URLs are environment configuration; never commit secrets. Initial MVP may use manual payment recording and reconciliation.

## 8.10 Controls
- Platform billing role required for plan/price/credit changes.
- Separate maker/checker approval for refunds, write-offs and large adjustments.
- Idempotency for invoice generation, webhook handling and payment allocation.
- Immutable invoice/payment audit trail.
- Daily reconciliation report and aging dashboard.
