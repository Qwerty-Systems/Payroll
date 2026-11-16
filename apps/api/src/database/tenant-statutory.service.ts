import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from './tenant-transaction.service';

export interface StatutoryRuleOverrideInput {
  ruleCode: string;
  label: string;
  category: string;
  calculationMethod: string;
  configuration: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason: string;
  approvedBy: string;
}

export interface EffectiveStatutoryRule {
  code: string;
  label: string;
  category: string;
  calculation_method: string;
  configuration: Record<string, unknown>;
  effective_from: string;
  effective_to: string | null;
  source_title: string;
  source_url: string;
  overridden: boolean;
}

/**
 * Tenant-scoped statutory pack assignment and effective-date resolution.
 * Rule rows are immutable: changes are represented by new dated rows or
 * tenant overrides with an audit reason, never by rewriting prior versions.
 */
@Injectable()
export class TenantStatutoryService {
  constructor(private readonly tenantTransactions: TenantTransactionService) {}

  async assignDefaultKenyaPack(tenantId: string, effectiveFrom = new Date().toISOString().slice(0, 10)): Promise<void> {
    await this.tenantTransactions.run(tenantId, async (manager) => {
      const packs = await manager.query(
        `SELECT id FROM statutory_rule_sets
         WHERE country_code = 'KE' AND status = 'published' AND version = 'KE-2026.11'
         LIMIT 1`,
      );
      if (!packs.length) throw new NotFoundException('The Kenya statutory baseline has not been installed.');
      await manager.query(
        `INSERT INTO tenant_statutory_assignments(tenant_id, rule_set_id, effective_from)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, rule_set_id, effective_from) DO NOTHING`,
        [tenantId, packs[0].id, effectiveFrom],
      );

      await manager.query(
        `INSERT INTO tenant_payroll_settings(tenant_id, currency, timezone)
         VALUES ($1, 'KES', 'Africa/Nairobi')
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId],
      );

      const deductions = [
        ['STAFF_ADVANCE_RECOVERY', 'Salary advance recovery', 'recovery', 'balance_recovery'],
        ['STAFF_LOAN_RECOVERY', 'Staff loan recovery', 'recovery', 'balance_recovery'],
        ['SACCO_CONTRIBUTION', 'SACCO contribution', 'voluntary', 'fixed_amount'],
        ['UNION_DUES', 'Union dues', 'voluntary', 'fixed_amount'],
        ['VOLUNTARY_PENSION', 'Voluntary pension contribution', 'voluntary', 'percentage'],
        ['VOLUNTARY_INSURANCE', 'Voluntary insurance', 'voluntary', 'fixed_amount'],
        ['COURT_ORDER', 'Court-ordered deduction', 'other', 'fixed_amount'],
        ['OTHER_DEDUCTION', 'Other approved deduction', 'other', 'fixed_amount'],
      ];
      for (const [code, name, category, method] of deductions) {
        await manager.query(
          `INSERT INTO tenant_deduction_types(tenant_id,code,name,category,calculation_method,configuration,taxable_treatment,is_system,is_enabled,requires_approval,effective_from)
           VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,'review_required',true,true,true,$6)
           ON CONFLICT(tenant_id,code,effective_from) DO NOTHING`,
          [tenantId, code, name, category, method, effectiveFrom],
        );
      }

      const allowances = [
        ['TRANSPORT', 'Transport allowance', 'fixed_amount'],
        ['HOUSING', 'Housing allowance', 'fixed_amount'],
        ['MEALS', 'Meals allowance', 'per_day'],
        ['SITE_ALLOWANCE', 'Site allowance', 'per_day'],
        ['OVERTIME', 'Overtime', 'per_hour'],
        ['NIGHT_SHIFT', 'Night shift allowance', 'per_hour'],
        ['TRAVEL_PER_DIEM', 'Travel per diem', 'per_day'],
        ['TOOL_ALLOWANCE', 'Tools and equipment allowance', 'fixed_amount'],
      ];
      for (const [code, name, method] of allowances) {
        await manager.query(
          `INSERT INTO tenant_allowance_types(tenant_id,code,name,calculation_method,configuration,tax_treatment,is_enabled,requires_approval,effective_from)
           VALUES ($1,$2,$3,$4,'{}'::jsonb,'review_required',true,true,$5)
           ON CONFLICT(tenant_id,code,effective_from) DO NOTHING`,
          [tenantId, code, name, method, effectiveFrom],
        );
      }
    });
  }

  async createApprovedOverride(tenantId: string, input: StatutoryRuleOverrideInput): Promise<void> {
    if (!input.reason.trim() || !input.approvedBy) {
      throw new Error('A reason and approving user are required for a statutory override.');
    }
    await this.tenantTransactions.run(tenantId, async (manager) => {
      await manager.query(
        `INSERT INTO tenant_statutory_rule_overrides(
          tenant_id, rule_code, label, category, calculation_method,
          configuration, effective_from, effective_to, reason, approved_by
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
        [tenantId, input.ruleCode, input.label, input.category, input.calculationMethod,
          JSON.stringify(input.configuration), input.effectiveFrom, input.effectiveTo ?? null,
          input.reason, input.approvedBy],
      );
    });
  }

  async getEffectiveRules(tenantId: string, asOfDate: string): Promise<EffectiveStatutoryRule[]> {
    return this.tenantTransactions.run(tenantId, async (manager) => {
      const rows = await manager.query(
        `WITH active_pack AS (
           SELECT rule_set_id
           FROM tenant_statutory_assignments
           WHERE tenant_id = $1
             AND effective_from <= $2::date
             AND (effective_to IS NULL OR effective_to >= $2::date)
           ORDER BY effective_from DESC
           LIMIT 1
         ),
         base_rules AS (
           SELECT r.code, r.label, r.category, r.calculation_method,
                  r.configuration, r.effective_from, r.effective_to,
                  r.source_title, r.source_url, false AS overridden
           FROM statutory_rules r
           JOIN active_pack p ON p.rule_set_id = r.rule_set_id
           WHERE r.effective_from <= $2::date
             AND (r.effective_to IS NULL OR r.effective_to >= $2::date)
         ),
         tenant_rules AS (
           SELECT o.rule_code AS code, o.label, o.category, o.calculation_method,
                  o.configuration, o.effective_from, o.effective_to,
                  'Tenant-approved override'::varchar AS source_title,
                  ''::text AS source_url, true AS overridden
           FROM tenant_statutory_rule_overrides o
           WHERE o.tenant_id = $1
             AND o.effective_from <= $2::date
             AND (o.effective_to IS NULL OR o.effective_to >= $2::date)
         )
         SELECT DISTINCT ON (code) *
         FROM (
           SELECT * FROM base_rules
           UNION ALL
           SELECT * FROM tenant_rules
         ) combined
         ORDER BY code, overridden DESC, effective_from DESC`,
        [tenantId, asOfDate],
      );
      return rows as EffectiveStatutoryRule[];
    });
  }
}
