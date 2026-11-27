import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TenantAccessGuard, ROLE_PERMISSIONS } from './tenant-access.guard';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT = 'auth0|test-user';

function makeContext(request: Record<string, any>) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function makeGuard(required: string[] | undefined, rows: any[] = [{ membership_id: 'membership-1', role: 'owner', tenant_id: TENANT_ID, user_id: 'user-1' }]) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as any;
  const manager = { query: jest.fn().mockResolvedValue(rows) };
  const tenantDb = {
    run: jest.fn(async (_tenantId: string, callback: (manager: any) => Promise<any>) => callback(manager)),
  } as any;
  return { guard: new TenantAccessGuard(reflector, tenantDb), tenantDb };
}

describe('TenantAccessGuard', () => {
  it('requires authentication for routes with tenant permissions', async () => {
    const { guard } = makeGuard(['payroll.read']);
    await expect(guard.canActivate(makeContext({ headers: { 'x-tenant-id': TENANT_ID } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires a valid tenant UUID', async () => {
    const { guard } = makeGuard(['payroll.read']);
    const request = { user: { sub: SUBJECT }, headers: { 'x-tenant-id': 'not-a-uuid' } };
    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects identities without active membership', async () => {
    const { guard } = makeGuard(['payroll.read'], []);
    const request = { user: { sub: SUBJECT }, headers: { 'x-tenant-id': TENANT_ID } };
    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assigns verified tenant membership to the request on successful authorization', async () => {
    const { guard, tenantDb } = makeGuard(['payroll.read']);
    const request: any = { user: { sub: SUBJECT }, headers: { 'x-tenant-id': TENANT_ID } };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.tenant).toEqual({ id: TENANT_ID, membershipId: 'membership-1', role: 'owner', userId: 'user-1' });
    expect(tenantDb.run).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
  });

  it('denies a worker access to payroll read permissions', async () => {
    const { guard } = makeGuard(['payroll.read'], [{ membership_id: 'm-1', role: 'worker', tenant_id: TENANT_ID, user_id: 'u-1' }]);
    const request = { user: { sub: SUBJECT }, headers: { 'x-tenant-id': TENANT_ID } };
    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies unknown roles rather than granting access', async () => {
    const { guard } = makeGuard(['workers.manage'], [{ membership_id: 'm-1', role: 'unexpected_role', tenant_id: TENANT_ID, user_id: 'u-1' }]);
    const request = { user: { sub: SUBJECT }, headers: { 'x-tenant-id': TENANT_ID } };
    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows owners the wildcard permission', async () => {
    expect(ROLE_PERMISSIONS.owner).toContain('*');
    const { guard } = makeGuard(['payroll.finalize']);
    const request = { user: { sub: SUBJECT }, headers: { 'x-tenant-id': TENANT_ID } };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('defines a permission for every permission used by tenant controllers', () => {
    const controllerPermissions = [
      'attendance.approve', 'attendance.capture', 'attendance.read',
      'company.manage', 'company.read', 'compliance.manage', 'compliance.read',
      'compliance.review', 'compliance.submit', 'payroll.approve', 'payroll.calculate',
      'payroll.finalize', 'payroll.read', 'payslips.read', 'projects.manage',
      'projects.read', 'users.manage', 'users.read', 'workers.documents.manage',
      'workers.documents.read', 'workers.manage', 'workers.read',
    ];
    expect(ROLE_PERMISSIONS.admin).toEqual(expect.arrayContaining(controllerPermissions));
    expect(ROLE_PERMISSIONS.owner).toContain('*');
    for (const role of ['hr_manager', 'payroll_manager', 'supervisor', 'worker', 'accountant', 'viewer']) {
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    }
  });
});
