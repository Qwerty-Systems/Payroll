import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';

type AuthenticatedRequest = Request & { user: Record<string, unknown> };

@ApiTags('authentication')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated Auth0 identity claims' })
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.getProfile(request.user);
  }
}
