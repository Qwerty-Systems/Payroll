# Integration workflow ledger APIs (sandbox)

This branch adds tenant-scoped workflow records. It is intentionally a ledger/queue foundation, not a provider execution engine.

## Payout intents

- `POST /api/v1/integrations/payout-intents` creates an idempotent Daraja sandbox payout intent.
- Requires Daraja settings enabled and environment `sandbox`.
- Payload: `idempotencyKey`, `recipientReference`, `amount`, optional `currency` (KES), `transactionType`, and metadata.
- `GET /api/v1/integrations/payout-intents` lists tenant intents.
- This does **not** initiate a payment, call Daraja, or transition an intent to submitted/succeeded.

## Delivery jobs

- `POST /api/v1/integrations/delivery-jobs` accepts `payslip_email` or `accounting_sync` and an idempotency key.
- Payslip jobs must reference a private storage key and recipient email; document bytes/base64 are rejected.
- `GET /api/v1/integrations/delivery-jobs` lists jobs without exposing payload contents.
- No sender/worker, retry scheduling, SMTP/provider transport, or bounce processing is included yet. Jobs remain queued until a worker is implemented.

## Reconciliation

- `POST /api/v1/integrations/reconciliation` records an internal/external reference and optional amounts. Basic status is classified as matched, amount_mismatch, unmatched, or missing_external.
- `GET /api/v1/integrations/reconciliation` lists items.
- This is manual record-entry only; no bank/Daraja/accounting source ingestion, automated matching, or resolution workflow is implemented yet.

## Security and release boundaries

Endpoints require existing tenant permission guards. Data is tenant-isolated via RLS. Request operations use idempotency keys and audit events. Keep the deployment sandbox-only until callback authenticity, provider status verification, bank format validation, worker access controls, secure mail delivery, accounting sync, reconciliation automation, E2E coverage, and statutory professional review are complete.
