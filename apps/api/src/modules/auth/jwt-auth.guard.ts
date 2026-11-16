import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { IS_PUBLIC_KEY } from './public.decorator';

type AuthenticatedUser = JWTPayload & { sub: string; email?: string };
type AuthenticatedRequest = { headers: { authorization?: string }; user?: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private jwksUri?: string;

  constructor(private readonly reflector: Reflector) {}

  private getVerifier() {
    const issuer = process.env.AUTH0_ISSUER_URL;
    const audience = process.env.AUTH0_AUDIENCE;
    if (!issuer || !audience) {
      throw new ServiceUnavailableException('Auth0 API authentication is not configured.');
    }
    const normalizedIssuer = issuer.endsWith('/') ? issuer : `${issuer}/`;
    const uri = new URL('.well-known/jwks.json', normalizedIssuer).toString();
    if (!this.jwks || this.jwksUri !== uri) {
      this.jwks = createRemoteJWKSet(new URL(uri));
      this.jwksUri = uri;
    }
    return { jwks: this.jwks, issuer: normalizedIssuer, audience };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('A valid Auth0 bearer access token is required.');
    }

    try {
      const { jwks, issuer, audience } = this.getVerifier();
      const { payload, protectedHeader } = await jwtVerify(header.slice(7), jwks, {
        issuer,
        audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      if (protectedHeader.alg !== 'RS256' || typeof payload.sub !== 'string' || !payload.sub) {
        throw new Error('Required Auth0 token claims are missing.');
      }
      request.user = payload as AuthenticatedUser;
      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException('Auth0 access token is invalid, expired, or has the wrong audience.');
    }
  }
}
