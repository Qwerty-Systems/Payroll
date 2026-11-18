import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import type { IntegrationProvider, UpdateIntegrationSettingsDto } from './integrations.dto';

const SETTINGS_ALLOWLIST: Record<IntegrationProvider, string[]> = {
  daraja: ['shortCode','initiatorName','callbackBaseUrl','accountReferencePrefix'],
  bank_transfer: ['bankName','transferFormat','accountDisplayName','currency','exportDelivery'],
  email: ['provider','fromName','fromEmail','deliveryMode'],
  accounting: ['provider','exportFormat','defaultCurrency','externalCompanyReference'],
};

const cleanSettings = (provider: IntegrationProvider, input: Record<string, unknown>) => {
  const allowed = new Set(SETTINGS_ALLOWLIST[provider]);
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!allowed.has(key)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 500) throw new BadRequestException(`Integration setting ${key} is too long.`);
    cleaned[key] = trimmed;
  }
  return cleaned;
};

@Injectable()
export class IntegrationsService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  async list(tenantId: string) {
    return this.tenantDb.run(tenantId, async manager => {
      const rows = await manager.query(`
        SELECT provider,enabled,environment,settings,connection_status AS "connectionStatus",
          last_tested_at AS "lastTestedAt",last_test_message AS "lastTestMessage",
          updated_at AS "updatedAt"
        FROM tenant_integration_settings WHERE tenant_id=$1 ORDER BY provider
      `, [tenantId]);
      return rows.map((row: Record<string, unknown>) => ({
        ...row,
        settings: row.settings ?? {},
        // Credentials are intentionally not stored or returned by this API.
        secretsConfigured: row.provider === 'daraja'
          ? Boolean(process.env.DARAJA_SANDBOX_CONSUMER_KEY && process.env.DARAJA_SANDBOX_CONSUMER_SECRET)
          : false,
      }));
    });
  }

  async save(tenantId: string, actorId: string, dto: UpdateIntegrationSettingsDto) {
    const settings = cleanSettings(dto.provider, dto.settings);
    if (dto.environment === 'production') {
      throw new BadRequestException('Production integration activation is not available from this configuration endpoint. Complete provider security review and sandbox acceptance first.');
    }
    return this.tenantDb.run(tenantId, async manager => {
      const rows = await manager.query(`
        INSERT INTO tenant_integration_settings
          (tenant_id,provider,enabled,environment,settings,connection_status,last_test_message,updated_at)
        VALUES($1,$2,$3,$4,$5::jsonb,'not_tested',NULL,now())
        ON CONFLICT(tenant_id,provider) DO UPDATE SET
          enabled=EXCLUDED.enabled, environment=EXCLUDED.environment,
          settings=EXCLUDED.settings, connection_status='not_tested',
          last_tested_at=NULL,last_test_message=NULL,updated_at=now()
        RETURNING provider,enabled,environment,settings,connection_status AS "connectionStatus",updated_at AS "updatedAt"
      `, [tenantId,dto.provider,dto.enabled,dto.environment,JSON.stringify(settings)]);
      await manager.query('INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [tenantId,actorId,'integration.settings.updated','integration',dto.provider,JSON.stringify({provider:dto.provider,enabled:dto.enabled,environment:dto.environment,settingKeys:Object.keys(settings)})]);
      return rows[0];
    });
  }

  listAccountMappings(tenantId: string) {
    return this.tenantDb.run(tenantId, manager => manager.query(`
      SELECT id,component_code AS "componentCode",component_label AS "componentLabel",
        debit_account_code AS "debitAccountCode",credit_account_code AS "creditAccountCode",
        cost_center_code AS "costCenterCode",effective_from::text AS "effectiveFrom",
        effective_to::text AS "effectiveTo",created_at AS "createdAt",updated_at AS "updatedAt"
      FROM tenant_account_mappings WHERE tenant_id=$1 ORDER BY component_code,effective_from DESC
    `,[tenantId]));
  }

  saveAccountMapping(tenantId: string, actorId: string, dto: {
    componentCode: string; componentLabel: string; debitAccountCode: string;
    creditAccountCode: string; costCenterCode?: string; effectiveFrom: string; effectiveTo?: string;
  }) {
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
      throw new BadRequestException('Mapping end date must not be before its effective start date.');
    }
    return this.tenantDb.run(tenantId, async manager => {
      const rows=await manager.query(`
        INSERT INTO tenant_account_mappings
          (tenant_id,component_code,component_label,debit_account_code,credit_account_code,
           cost_center_code,effective_from,effective_to,created_by,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,now())
        ON CONFLICT(tenant_id,component_code,effective_from) DO UPDATE SET
          component_label=EXCLUDED.component_label,
          debit_account_code=EXCLUDED.debit_account_code,
          credit_account_code=EXCLUDED.credit_account_code,
          cost_center_code=EXCLUDED.cost_center_code,
          effective_to=EXCLUDED.effective_to,updated_at=now()
        RETURNING id,component_code AS "componentCode",component_label AS "componentLabel",
          debit_account_code AS "debitAccountCode",credit_account_code AS "creditAccountCode",
          cost_center_code AS "costCenterCode",effective_from::text AS "effectiveFrom",
          effective_to::text AS "effectiveTo",updated_at AS "updatedAt"
      `,[tenantId,dto.componentCode,dto.componentLabel,dto.debitAccountCode,dto.creditAccountCode,dto.costCenterCode||null,dto.effectiveFrom,dto.effectiveTo||null,actorId]);
      await manager.query('INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [tenantId,actorId,'accounting.mapping.saved','account_mapping',rows[0].id,JSON.stringify({componentCode:dto.componentCode,effectiveFrom:dto.effectiveFrom})]);
      return rows[0];
    });
  }

  async createPayoutIntent(tenantId: string, actorId: string, dto: { idempotencyKey: string; recipientReference: string; amount: number; currency?: string; transactionType?: string; metadata?: Record<string, unknown> }) {
    if (!dto.idempotencyKey.trim() || !dto.recipientReference.trim()) throw new BadRequestException('Idempotency key and recipient reference are required.');
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new BadRequestException('Payout amount must be positive.');
    return this.tenantDb.run(tenantId, async manager => {
      const config = await manager.query('SELECT enabled,environment FROM tenant_integration_settings WHERE tenant_id=$1 AND provider=$2',[tenantId,'daraja']);
      if (!config.length || !config[0].enabled || config[0].environment !== 'sandbox') throw new BadRequestException('Daraja must be enabled in sandbox before creating payout intents.');
      const rows = await manager.query(`
        INSERT INTO integration_transactions (tenant_id,provider,idempotency_key,transaction_type,status,amount,currency,recipient_reference,request_metadata,created_by)
        VALUES($1,'daraja',$2,$3,'created',$4,$5,$6,$7::jsonb,$8)
        ON CONFLICT(tenant_id,provider,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
        RETURNING id,provider,idempotency_key AS "idempotencyKey",transaction_type AS "transactionType",status,amount,currency,recipient_reference AS "recipientReference",provider_reference AS "providerReference",created_at AS "createdAt"
      `,[tenantId,dto.idempotencyKey,dto.transactionType||'payroll_payout',dto.amount,dto.currency||'KES',dto.recipientReference,JSON.stringify(dto.metadata||{}),actorId]);
      return rows[0];
    });
  }

  async listPayoutIntents(tenantId: string) {
    return this.tenantDb.run(tenantId, manager => manager.query(`
      SELECT id,provider,idempotency_key AS "idempotencyKey",transaction_type AS "transactionType",status,amount,currency,recipient_reference AS "recipientReference",provider_reference AS "providerReference",created_at AS "createdAt",updated_at AS "updatedAt"
      FROM integration_transactions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 250
    `,[tenantId]));
  }

  async queueDelivery(tenantId: string, dto: { jobType: 'payslip_email'|'accounting_sync'; idempotencyKey: string; payload: Record<string, unknown> }) {
    if (!dto.idempotencyKey.trim()) throw new BadRequestException('Idempotency key is required.');
    if (dto.jobType === 'payslip_email') {
      if (typeof dto.payload.storageKey !== 'string' || !dto.payload.storageKey.trim() || typeof dto.payload.email !== 'string' || !dto.payload.email.includes('@')) {
        throw new BadRequestException('Payslip delivery requires a private storageKey and valid recipient email. Do not submit document bytes.');
      }
      if (Object.keys(dto.payload).some(key => ['pdf','document','fileBytes','base64'].includes(key.toLowerCase()))) throw new BadRequestException('Document content must remain in private storage; queue only its storage key.');
    }
    const rows = await this.tenantDb.run(tenantId, manager => manager.query(`
      INSERT INTO integration_delivery_jobs (tenant_id,job_type,idempotency_key,payload,status)
      VALUES($1,$2,$3,$4::jsonb,'queued')
      ON CONFLICT(tenant_id,job_type,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
      RETURNING id,job_type AS "jobType",status,attempts,available_at AS "availableAt",created_at AS "createdAt"
    `,[tenantId,dto.jobType,dto.idempotencyKey,JSON.stringify(dto.payload)]));
    return rows[0];
  }

  async listDeliveryJobs(tenantId: string) {
    return this.tenantDb.run(tenantId, manager => manager.query(`
      SELECT id,job_type AS "jobType",status,attempts,max_attempts AS "maxAttempts",available_at AS "availableAt",last_error AS "lastError",provider_reference AS "providerReference",created_at AS "createdAt",updated_at AS "updatedAt"
      FROM integration_delivery_jobs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 250
    ,[tenantId]));
  }

  async createReconciliationItem(tenantId: string, dto: { reconciliationType: 'payout'|'accounting'; internalReference: string; externalReference?: string; internalAmount?: number; externalAmount?: number; details?: Record<string, unknown> }) {
    const status = dto.internalAmount !== undefined && dto.externalAmount !== undefined
      ? (Math.round(dto.internalAmount*100) === Math.round(dto.externalAmount*100) ? 'matched' : 'amount_mismatch')
      : dto.externalReference ? 'unmatched' : 'missing_external';
    const rows = await this.tenantDb.run(tenantId, manager => manager.query(`
      INSERT INTO integration_reconciliation_items (tenant_id,reconciliation_type,internal_reference,external_reference,status,internal_amount,external_amount,details)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      ON CONFLICT(tenant_id,reconciliation_type,internal_reference,external_reference) DO UPDATE SET status=EXCLUDED.status,internal_amount=EXCLUDED.internal_amount,external_amount=EXCLUDED.external_amount,details=EXCLUDED.details
      RETURNING id,reconciliation_type AS "reconciliationType",internal_reference AS "internalReference",external_reference AS "externalReference",status,internal_amount AS "internalAmount",external_amount AS "externalAmount",details,created_at AS "createdAt"
    `,[tenantId,dto.reconciliationType,dto.internalReference,dto.externalReference||null,status,dto.internalAmount??null,dto.externalAmount??null,JSON.stringify(dto.details||{})]));
    return rows[0];
  }

  listReconciliationItems(tenantId: string) {
    return this.tenantDb.run(tenantId, manager => manager.query(`
      SELECT id,reconciliation_type AS "reconciliationType",internal_reference AS "internalReference",external_reference AS "externalReference",status,internal_amount AS "internalAmount",external_amount AS "externalAmount",details,created_at AS "createdAt"
      FROM integration_reconciliation_items WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500
    ,[tenantId]));
  }

  async testDarajaSandbox(tenantId: string) {
    const key = process.env.DARAJA_SANDBOX_CONSUMER_KEY;
    const secret = process.env.DARAJA_SANDBOX_CONSUMER_SECRET;
    if (!key || !secret) throw new BadRequestException('Sandbox credentials are not configured in deployment secrets.');
    await this.tenantDb.run(tenantId, async manager => {
      const rows = await manager.query('SELECT enabled,environment FROM tenant_integration_settings WHERE tenant_id=$1 AND provider=$2',[tenantId,'daraja']);
      if (!rows.length) throw new NotFoundException('Configure Daraja sandbox settings before testing.');
      if (rows[0].environment !== 'sandbox') throw new BadRequestException('Only sandbox connection tests are supported.');
      if (!rows[0].enabled) throw new BadRequestException('Enable the sandbox configuration before testing.');
      return rows[0];
    });
    const response = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      method: 'GET',
      headers: { Authorization: 'Basic ' + Buffer.from(key + ':' + secret).toString('base64'), Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const ok = response.ok;
    await this.tenantDb.run(tenantId, async manager => {
      await manager.query(`
        UPDATE tenant_integration_settings SET connection_status=$3,
          last_tested_at=now(),last_test_message=$4,updated_at=now()
        WHERE tenant_id=$1 AND provider=$2
      `, [tenantId,'daraja',ok?'connected':'failed',ok?'Sandbox OAuth authentication succeeded. No payment was initiated.':'Sandbox OAuth authentication failed. Check deployment secrets and provider app status.']);
    });
    if (!ok) throw new BadRequestException('Daraja sandbox OAuth test failed. No payment was initiated.');
    return { provider:'daraja',environment:'sandbox',status:'connected',testedAt:new Date().toISOString(),message:'Sandbox OAuth authentication succeeded. No payment was initiated.' };
  }
}
