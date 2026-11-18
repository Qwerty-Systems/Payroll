# Tenant Integration Settings (Sandbox Foundation)

This module adds tenant-scoped configuration metadata for Daraja, bank transfer exports, email delivery, and accounting. It intentionally does not initiate payouts, send payslips, or synchronize accounting records.

## API

- `GET /api/v1/integrations/settings`: read current tenant settings and connection status.
- `POST /api/v1/integrations/settings`: upsert sandbox-only provider settings. Only allowlisted non-secret fields are stored. The endpoint rejects production environment configuration.
- `POST /api/v1/integrations/daraja/test-sandbox`: perform a sandbox OAuth credential test. No payment is initiated.

These endpoints require tenant authentication and the existing `compliance.read` / `compliance.manage` permissions.

## Daraja sandbox secrets

Provision credentials through Coolify/deployment environment variables:

- `DARAJA_SANDBOX_CONSUMER_KEY`
- `DARAJA_SANDBOX_CONSUMER_SECRET`

Never commit values or put secrets into the tenant settings form. The OAuth test is sandbox-only and stores a generic success/failure state, not an access token.

## Supported non-secret provider fields

- Daraja: short code, initiator display name, callback base URL, account-reference prefix.
- Bank: bank name, transfer format, account display name, currency, export delivery method.
- Email: provider name, sender display name/address, delivery mode.
- Accounting: provider name, export format, currency, external company reference.

## Security boundaries

- Credentials are not persisted in this table and are not returned by the API.
- Tenant data is isolated by PostgreSQL RLS and transaction-local tenant context.
- Provider configurations default to disabled and sandbox.
- Production configuration is rejected by this API.
- Sandbox OAuth validation does not prove payout permissions, callback authenticity, or settlement.
- Safaricom callbacks are not authenticated by a generic signed webhook contract; callback verification must be provider-specific and use documented security controls plus transaction reconciliation before live activation.

## Remaining implementation work

1. Implement a provider-specific Daraja payout adapter with sandbox transaction tests, callback validation, idempotency and reconciliation. Keep live mode behind a feature flag and separate authorization review.
2. Implement bank transfer file formats for selected bank(s), export approval and reconciliation. A bank API cannot be completed until the target bank is selected.
3. Implement payslip email provider adapter, queue/retry/bounce tracking, employee preferences, secure delivery and tests.
4. Implement accounting mappings, balanced journal validation, idempotent export/sync and reconciliation.
5. Add integration UI permissions finer than compliance-management permissions and audit events for changes.
6. Have a qualified Kenyan payroll professional verify current statutory calculations and filing obligations before release.

## Sandbox acceptance

- Settings API returns only non-secret fields.
- Unknown or secret-looking fields are dropped.
- Production configuration is rejected.
- Daraja test fails closed when secrets are absent and reports only OAuth success/failure.
- No test endpoint sends money or sends a payslip.
