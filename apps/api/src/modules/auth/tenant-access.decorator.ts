import { SetMetadata } from '@nestjs/common';

export const TENANT_PERMISSIONS_KEY = 'jengaflow:tenant-permissions';
export const TenantPermissions = (...permissions: string[]) => SetMetadata(TENANT_PERMISSIONS_KEY, permissions);
