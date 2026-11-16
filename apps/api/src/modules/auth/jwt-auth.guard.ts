import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt, { type GetPublicKeyOrSecret, type JwtPayload } from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { IS_PUBLIC_KEY } from './public.decorator';

type AuthenticatedUser = JwtPayload & { sub: string; email?: string };
type AuthenticatedRequest = {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof jwksRsa>;
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
      this.jwks = jwksRsa({
        jwksUri: uri,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      });
      this.jwksUri = uri;
    }

    const client = this.jwks;
    const getKey: GetPublicKeyOrSecret = (header, callback) => {
      if (!header.kid) return callback(new Error('JWT signing key id is missing.'));
      client.getSigningKey(header.kid, (error, key) => {
        if (error) return callback(error);
        if (!key) return callback(new Error('Auth0 signing key was not found.'));
        callback(null, key.getPublicKey());
      });
    };

    return { getKey, issuer: normalizedIssuer, audience };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('A valid Auth0 bearer access token is required.');
    }

    try {
      const { getKey, issuer, audience } = this.getVerifier();
      const payload = await new Promise<string | JwtPayload>((resolve, reject) => {
        jwt.verify(
          header.slice(7),
          getKey,
          { issuer, audience, algorithms: ['RS256'], clockTolerance: 5 },
          (error, decoded) => {
            if (error) return reject(error);
            if (!decoded) return reject(new Error('JWT payload is empty.'));
            resolve(decoded);
          },
        );
      });

      if (typeof payload === 'string' || typeof payload.sub !== 'string' || !payload.sub) {
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
