# External Payroll Integration Readiness

This document records the implementation boundary between JengaFlow's internal payroll workflows and external providers. Provider credentials must be configured in deployment secrets, not committed to the repository or entered into chat.

## Current platform capabilities

- Payroll runs, immutable finalized snapshots, payment batches, approval/rejection, manual payment confirmation and provider references.
- Payment failure and reversal records, with batch status recalculation.
- Payslip viewing and browser-print/PDF flow.
- General-ledger journal preview/export and remittance schedule export.
- Compliance rule review, filing preparation, approval, submission-reference recording and authority-response tracking.
- Tenant-scoped access and audit events.

## External integrations that remain provider-dependent

| Integration | Ready internally | Required before live operation |
|---|---|---|
| M-Pesa payouts | Payment batches and manual provider-reference recording | Daraja business credentials, provider contract/permissions, sandbox tests, signed callback validation, idempotency and reconciliation |
| Bank payouts | Payment batch workflow and exportable payroll data | Chosen bank/API, bank-specific transfer format, credential provisioning, maker-checker authorization and reconciliation |
| Payslip delivery | Payslip data and printable output | Email provider, verified sender/domain, employee email/contact preferences, delivery queue/retry policy and secure attachment/link policy |
| Accounting | Journal preview/export | Tenant chart-of-accounts mappings, chosen accounting provider, OAuth/credentials, duplicate prevention and reconciliation |
| Statutory filing | Review and filing workflow, submission/acceptance references | Qualified Kenyan payroll professional review of the effective rules and calculations, current authority requirements, and authorized filing credentials/process |

Do not mark a provider connected until an authenticated provider test has succeeded and its result has been recorded.

## Payout integration acceptance checklist

1. Provider secrets are stored in deployment secrets (or a dedicated secrets manager) and are never returned from API responses.
2. Sandbox mode is clearly labeled; sandbox credentials cannot initiate production transactions.
3. A payout requires a finalized payroll run, approved payment batch and a distinct authorized approver.
4. Each provider request has a tenant-scoped idempotency key and immutable transaction reference.
5. Callback endpoints validate the provider signature/secret, timestamp/nonce where supported, transaction identity and amount/currency against the original request.
6. Callback replay and duplicate delivery are harmless; callback processing is idempotent.
7. The application records provider status, safe error codes, request correlation IDs and reconciliation results without logging credentials, PINs, full bank details or sensitive employee data.
8. Retry policy is limited to safe transient failures; ambiguous outcomes must be reconciled before retrying.
9. Provider status is not shown as paid until a confirmed provider result or authorized manual confirmation is recorded.
10. Sandbox end-to-end tests cover success, rejection, timeout/ambiguous result, duplicate callback and reversal.

## Employee payslip delivery acceptance checklist

- Employee email address is verified/confirmed and the employee can opt into/out of delivery where required.
- Only finalized payslips are eligible for delivery.
- Delivery uses an approved email provider and verified sender identity.
- Avoid exposing payslip data in subject lines, logs or public URLs.
- Prefer a short-lived, authenticated link over an attachment if the secure link flow is available; otherwise use encrypted/controlled attachments and document the policy.
- Delivery events track queued, sent, bounced, failed and retrying states without storing message contents.
- Resends are rate-limited and audited; a delivery retry must not change the payroll snapshot.

## Accounting mapping and export acceptance checklist

Map each payroll component and liability to a tenant-specific account, including:
- gross wages and salary expense;
- employer statutory contributions and levies;
- employee statutory deductions and other liabilities;
- allowances, benefits, reimbursements and approved adjustments;
- net-pay clearing / payable account;
- cost-centre, department or project dimensions when available.

Mappings must be effective-dated, validated, and versioned. Exported journals must balance (debits equal credits), contain source payroll-run identifiers and be idempotent on import. An unmapped component must block export or be explicitly flagged—never silently mapped to a generic account.

## Statutory compliance gate

- Rules and calculations are effective-dated and have a reviewed/approved snapshot.
- Changes require documented sources, reviewer identity, review date and effective date.
- Payroll calculations are blocked when a ruleset is not approved for the whole period or a rule changes mid-period without supported proration.
- Filing preparation, review, submission reference and authority acceptance/rejection are separate audited states.
- Before production use, a qualified Kenyan payroll professional must verify the applicable current PAYE, NSSF, SHIF, Affordable Housing Levy, NITA and relief/deduction treatment, and confirm authority filing requirements. This checklist is not legal or tax advice and does not assert that filings are submitted electronically.

## Environment/configuration policy

- Keep credentials in Coolify/deployment secrets; never in source, sample files, tenant-facing UI text, or logs.
- Configuration screens should display provider name, environment (sandbox/production), masked credential presence, last test timestamp/result and connection state.
- Credential rotation should not invalidate finalized payroll snapshots or erase audit history.
- Live payouts, emailing payslips, and external accounting sync must remain disabled until their provider-specific implementation, authorization, security review and acceptance tests are complete.
