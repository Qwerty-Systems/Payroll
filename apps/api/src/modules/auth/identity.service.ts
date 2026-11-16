import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateTenantDto } from './tenant-onboarding.dto';

type Claims = { [key: string]: unknown; sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown };
const EMAIL_CLAIM = 'https://jengaflow.qwerty.co.ke/email';
const VERIFIED_CLAIM = 'https://jengaflow.qwerty.co.ke/email_verified';
const NAME_CLAIM = 'https://jengaflow.qwerty.co.ke/name';

@Injectable()
export class IdentityService {
  constructor(private readonly dataSource: DataSource) {}

  private getIdentity(claims: Claims) {
    if (typeof claims.sub !== 'string' || !claims.sub.trim()) throw new UnauthorizedException('A valid identity subject is required.');
    const rawEmail = claims.email ?? claims[EMAIL_CLAIM];
    const verified = claims.email_verified ?? claims[VERIFIED_CLAIM];
    const rawName = claims.name ?? claims[NAME_CLAIM];
    if (typeof rawEmail !== 'string' || !rawEmail.trim()) throw new ForbiddenException('The identity provider did not supply an email address.');
    if (verified !== true) throw new ForbiddenException('Verify your email address before creating a workspace.');
    return { subject: claims.sub, email: rawEmail.trim().toLowerCase(), name: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : rawEmail.trim().split('@')[0] };
  }

  async getMe(claims: Claims) {
    if (typeof claims.sub !== 'string' || !claims.sub.trim()) throw new UnauthorizedException('A valid identity subject is required.');
    const email = claims.email ?? claims[EMAIL_CLAIM] ?? null;
    const name = claims.name ?? claims[NAME_CLAIM] ?? null;
    const rows = await this.dataSource.query(
      "SELECT u.id, u.email, u.full_name, u.status, COALESCE(json_agg(json_build_object('tenantId', t.id, 'slug', t.slug, 'displayName', t.display_name, 'legalName', t.legal_name, 'tenantStatus', t.status, 'membershipId', m.id, 'role', m.role)) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS memberships FROM platform_users u LEFT JOIN tenant_memberships m ON m.user_id = u.id AND m.status = 'active' LEFT JOIN tenants t ON t.id = m.tenant_id AND t.status IN ('trial','active') WHERE u.auth0_subject = $1 GROUP BY u.id",
      [claims.sub],
    );
    if (!rows.length) return { authenticated: true, provisioned: false, identity: { email, name }, memberships: [] };
    return { authenticated: true, provisioned: true, user: { id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name, status: rows[0].status }, memberships: rows[0].memberships };
  }

  async createTenant(claims: Claims, dto: CreateTenantDto) {
    const identity = this.getIdentity(claims);
    const currency = (dto.currency ?? 'KES').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ConflictException('Currency must be a three-letter ISO code.');
    try {
      return await this.dataSource.transaction(async (manager) => {
        const linked = await manager.query('SELECT id, email FROM platform_users WHERE auth0_subject = $1 FOR UPDATE', [identity.subject]);
        let userId: string;
        if (linked.length) {
          userId = linked[0].id;
          if (linked[0].email.toLowerCase() !== identity.email) await manager.query('UPDATE platform_users SET email = $2, updated_at = now() WHERE id = $1', [userId, identity.email]);
        } else {
          const existingEmail = await manager.query('SELECT id FROM platform_users WHERE lower(email) = $1 LIMIT 1', [identity.email]);
          if (existingEmail.length) throw new ConflictException('An account already exists for this email but is not linked to this Auth0 identity. Contact support for secure account linking.');
          const created = await manager.query("INSERT INTO platform_users (email, full_name, status, email_verified_at, auth0_subject) VALUES ($1, $2, 'active', now(), $3) RETURNING id", [identity.email, identity.name, identity.subject]);
          userId = created[0].id;
        }
        const tenantRows = await manager.query("INSERT INTO tenants (slug, legal_name, display_name, status, timezone, currency) VALUES ($1, $2, $3, 'trial', $4, $5) RETURNING id, slug, legal_name, display_name, status, timezone, currency, created_at", [dto.slug.trim().toLowerCase(), dto.legalName.trim(), dto.displayName.trim(), dto.timezone ?? 'Africa/Nairobi', currency]);
        const tenant = tenantRows[0];
        await manager.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
        await manager.query('INSERT INTO tenant_payroll_settings (tenant_id, currency, timezone) VALUES ($1, $2, $3) ON CONFLICT (tenant_id) DO NOTHING', [tenant.id, currency, dto.timezone ?? 'Africa/Nairobi']);
        await manager.query("INSERT INTO tenant_statutory_assignments (tenant_id, rule_set_id, effective_from) SELECT $1, id, CURRENT_DATE FROM statutory_rule_sets WHERE country_code = 'KE' AND status = 'published' ORDER BY published_at DESC NULLS LAST LIMIT 1 ON CONFLICT (tenant_id, rule_set_id, effective_from) DO NOTHING", [tenant.id]);
        const membership = await manager.query("INSERT INTO tenant_memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active') RETURNING id, role, status", [tenant.id, userId]);
        await manager.query("INSERT INTO platform_audit_events (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'tenant.created', 'tenant', $2, $3::jsonb)", [userId, tenant.id, JSON.stringify({ slug: tenant.slug, auth0Subject: identity.subject })]);
        return { provisioned: true, tenant, membership: membership[0] };
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if ((error as { code?: string })?.code === '23505') throw new ConflictException('That workspace slug is already in use.');
      throw error;
    }
  }
}
