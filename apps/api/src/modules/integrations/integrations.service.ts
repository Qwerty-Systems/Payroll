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
      return rows[0];
    });
  }

  async testDarajaSandbox(tenantId: string) {
    const key = process.env.DARAJA_SANDBOX_CONSUMER_KEY;
    const secret = process.env.DARAJA_SANDBOX_CONSUMER_SECRET;
    if (!key || !secret) throw new BadRequestException('Sandbox credentials are not configured in deployment secrets.');
    const result = await this.tenantDb.run(tenantId, async manager => {
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
