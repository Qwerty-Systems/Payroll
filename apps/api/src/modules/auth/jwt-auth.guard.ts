import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
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

export function auth0TokenFailureCode(error: unknown): string {
  if (error instanceof jwt.TokenExpiredError) return 'TOKEN_EXPIRED';
  if (error instanceof jwt.NotBeforeError) return 'TOKEN_NOT_ACTIVE';
  if (error instanceof jwt.JsonWebTokenError) {
    const message = error.message.toLowerCase();
    if (message.includes('audience')) return 'AUDIENCE_MISMATCH';
    if (message.includes('issuer')) return 'ISSUER_MISMATCH';
    if (message.includes('signature')) return 'INVALID_SIGNATURE';
    if (message.includes('algorithm')) return 'INVALID_ALGORITHM';
    return 'MALFORMED_OR_INVALID_TOKEN';
  }
  return 'JWKS_OR_VERIFICATION_FAILURE';
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
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
      const failureCode = auth0TokenFailureCode(error);
      // Never log the bearer token or decoded claims. The failure category is
      // enough to distinguish configuration errors from expiry/signature/JWKS faults.
      this.logger.warn(`Auth0 bearer validation rejected a request: ${failureCode}`);
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: failureCode,
        message: `Auth0 access token validation failed: ${failureCode}.`,
      });
    }
  }
}
