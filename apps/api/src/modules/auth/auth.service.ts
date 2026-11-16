import { Injectable } from '@nestjs/common';

/**
 * Auth0 is the identity provider. The API validates its access tokens in
 * JwtAuthGuard; this service intentionally does not mint a second JWT.
 */
@Injectable()
export class AuthService {
  getProfile(claims: Record<string, unknown>) {
    return {
      auth0Subject: claims.sub,
      email: claims.email ?? null,
      emailVerified: claims.email_verified ?? false,
      name: claims.name ?? null,
      picture: claims.picture ?? null,
    };
  }
}
