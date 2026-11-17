import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { TENANT_PERMISSIONS_KEY } from './tenant-access.decorator';

type RequestWithIdentity = { headers: Record<string, string | string[] | undefined>; user?: { sub?: string }; tenant?: { id: string; membershipId: string; role: string; userId: string } };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  admin: ['company.read','company.manage','users.read','users.manage','projects.read','projects.manage','workers.read','workers.manage','workers.documents.read','workers.documents.manage','attendance.read','attendance.capture','attendance.approve','payroll.read','payroll.calculate','payroll.approve','payroll.finalize','payslips.read','reports.read','audit.read','compliance.read','compliance.manage','compliance.submit','compliance.review'],
  hr_manager: ['company.read','users.read','workers.read','workers.manage','workers.documents.read','workers.documents.manage','attendance.read','attendance.approve','payroll.read','payroll.calculate','payslips.read','reports.read','audit.read','compliance.read','compliance.manage','compliance.submit'],
  payroll_manager: ['company.read','workers.read','attendance.read','payroll.read','payroll.calculate','payroll.approve','payslips.read','reports.read','audit.read','compliance.read','compliance.manage','compliance.submit','compliance.review'],
  supervisor: ['projects.read','workers.read','attendance.read','attendance.capture','attendance.approve','reports.read'],
  worker: ['attendance.capture','payslips.read'],
  accountant: ['company.read','payroll.read','payslips.read','reports.read','audit.read','compliance.read','compliance.manage','compliance.submit','compliance.review'],
  viewer: ['company.read','projects.read','workers.read','attendance.read','payroll.read','reports.read','compliance.read','audit.read'],
};

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenantDb: TenantTransactionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(TENANT_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    if (!request.user?.sub) throw new UnauthorizedException('Authentication is required.');
    const rawTenant = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
    if (!tenantId || !UUID_PATTERN.test(tenantId)) throw new ForbiddenException('A valid company workspace must be selected using x-tenant-id.');
    const rows = await this.tenantDb.run(tenantId, (manager) => manager.query("SELECT m.id AS membership_id, m.role, t.id AS tenant_id, u.id AS user_id FROM tenant_memberships m JOIN platform_users u ON u.id = m.user_id JOIN tenants t ON t.id = m.tenant_id WHERE u.auth0_subject = $1 AND t.id = $2 AND m.status = 'active' AND t.status IN ('trial','active') AND u.status = 'active' LIMIT 1", [request.user!.sub, tenantId]));
    if (!rows.length) throw new ForbiddenException('You do not have an active membership in this company.');
    const membership = rows[0] as { membership_id: string; role: string; tenant_id: string; user_id: string };
    const granted = ROLE_PERMISSIONS[membership.role] ?? [];
    if (!granted.includes('*') && required.some((permission) => !granted.includes(permission))) throw new ForbiddenException('Your company role does not grant the required permission.');
    request.tenant = { id: membership.tenant_id, membershipId: membership.membership_id, role: membership.role, userId: membership.user_id };
    return true;
  }
}
