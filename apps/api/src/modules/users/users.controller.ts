import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { AcceptInvitationDto, CreateInvitationDto, UpdateMembershipRoleDto } from './users.dto';
import { UsersService } from './users.service';

type TenantRequest=Request & { user:Record<string,unknown>; tenant:{id:string;userId:string;role:string} };
type IdentityRequest=Request & { user:Record<string,unknown> };
@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users:UsersService){}
  @Get('tenant/users') @TenantPermissions('users.read') listMembers(@Req() req:TenantRequest){return this.users.listMembers(req.tenant.id);}
  @Post('tenant/users/invitations') @TenantPermissions('users.manage') createInvitation(@Req() req:TenantRequest,@Body() dto:CreateInvitationDto){return this.users.createInvitation(req.tenant.id,req.tenant.userId,req.tenant.role,dto);}
  @Get('tenant/users/invitations') @TenantPermissions('users.manage') listInvitations(@Req() req:TenantRequest){return this.users.listInvitations(req.tenant.id);}
  @Post('tenant/users/invitations/:id/revoke') @TenantPermissions('users.manage') revokeInvitation(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.users.revokeInvitation(req.tenant.id,req.tenant.userId,id);}
  @Patch('tenant/users/memberships/:id/role') @TenantPermissions('users.manage') updateRole(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateMembershipRoleDto){return this.users.updateMembershipRole(req.tenant.id,req.tenant.userId,req.tenant.role,id,dto.role);}
  @Post('tenant/users/memberships/:id/suspend') @TenantPermissions('users.manage') suspend(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string){return this.users.suspendMembership(req.tenant.id,req.tenant.userId,req.tenant.role,id);}
  @Post('users/invitations/accept') acceptInvitation(@Req() req:IdentityRequest,@Body() dto:AcceptInvitationDto){return this.users.acceptInvitation(req.user,dto);}
}
