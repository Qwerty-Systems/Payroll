import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';
import { CreateTenantDto } from './tenant-onboarding.dto';

type AuthenticatedRequest = Request & { user: Record<string, unknown> };

@ApiTags('authentication')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly identities: IdentityService) {}

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated identity and its active tenant memberships' })
  async me(@Req() request: AuthenticatedRequest) {
    return { ...this.auth.getProfile(request.user), ...await this.identities.getMe(request.user) };
  }

  @Post('onboarding/company')
  @ApiOperation({ summary: 'Create a trial company workspace and assign its creator the owner role' })
  createCompany(@Req() request: AuthenticatedRequest, @Body() dto: CreateTenantDto) {
    return this.identities.createTenant(request.user, dto);
  }
}
