import { Body, Controller, ForbiddenException, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { GoogleSignInDto } from './auth.dto';

@ApiTags('authentication')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private assertSameOrigin(request: Request) {
    const origin = request.headers.origin;
    const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? process.env.APP_URL ?? '').split(',').map((v) => v.trim());
    if (!origin || !allowed.includes(origin)) throw new ForbiddenException('Request origin is not allowed.');
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify Google Identity Services credential and create a session' })
  async google(@Body() dto: GoogleSignInDto, @Res({ passthrough: true }) response: Response) {
    const { result, refreshToken } = await this.auth.signInWithGoogle(dto.credential);
    response.cookie('jengaflow_refresh', refreshToken, this.cookieOptions());
    return result;
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertSameOrigin(request);
    const token = request.cookies?.jengaflow_refresh;
    if (typeof token !== 'string') throw new UnauthorizedException('Refresh session is missing.');
    const { result, refreshToken } = await this.auth.rotateRefreshToken(token);
    response.cookie('jengaflow_refresh', refreshToken, this.cookieOptions());
    return result;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertSameOrigin(request);
    const token = request.cookies?.jengaflow_refresh;
    if (typeof token === 'string') await this.auth.revokeRefreshToken(token);
    response.clearCookie('jengaflow_refresh', { ...this.cookieOptions(), maxAge: undefined });
  }
}
