import {
  Injectable, UnauthorizedException, ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { DataSource } from 'typeorm';
import { createHmac, randomBytes } from 'node:crypto';

type GoogleIdentity = { sub: string; email: string; name?: string; picture?: string };
type SessionResult = { accessToken: string; expiresIn: number; user: { id: string; email: string; name: string | null; avatarUrl: string | null } };

@Injectable()
export class AuthService {
  private readonly google = new OAuth2Client();

  constructor(private readonly dataSource: DataSource, private readonly jwt: JwtService) {}

  private hash(value: string): string {
    return createHmac('sha256', process.env.JWT_REFRESH_SECRET ?? '').update(value).digest('hex');
  }

  private accessTtlSeconds(): number {
    const raw = process.env.JWT_ACCESS_TTL ?? '15m';
    const match = /^(\d+)(s|m|h|d)$/.exec(raw);
    if (!match) return 900;
    const amount = Number(match[1]);
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
    return Math.min(Math.max(amount * multiplier, 60), 3600);
  }

  async signInWithGoogle(credential: string): Promise<{ result: SessionResult; refreshToken: string }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not configured.');
    let identity: GoogleIdentity;
    try {
      const ticket = await this.google.verifyIdToken({ idToken: credential, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true) throw new Error('Unverified Google identity');
      identity = { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name, picture: payload.picture };
    } catch {
      throw new UnauthorizedException('Google identity could not be verified.');
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const rows = await runner.query(
        `INSERT INTO auth_users (google_sub, email, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_sub) DO UPDATE SET
           email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url, updated_at = now()
         RETURNING id, email, display_name, avatar_url`,
        [identity.sub, identity.email, identity.name ?? null, identity.picture ?? null],
      );
      const user = rows[0] as { id: string; email: string; display_name: string | null; avatar_url: string | null };
      const refreshToken = randomBytes(48).toString('base64url');
      await runner.query(
        `INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [user.id, this.hash(refreshToken)],
      );
      await runner.commitTransaction();
      const accessToken = await this.jwt.signAsync(
        { sub: user.id, email: user.email },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: this.accessTtlSeconds(), issuer: 'jengaflow-api', audience: 'jengaflow-web' },
      );
      return {
        result: {
          accessToken, expiresIn: this.accessTtlSeconds(),
          user: { id: user.id, email: user.email, name: user.display_name, avatarUrl: user.avatar_url },
        },
        refreshToken,
      };
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async rotateRefreshToken(token: string): Promise<{ result: SessionResult; refreshToken: string }> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const rows = await runner.query(
        `SELECT s.id AS session_id, u.id, u.email, u.display_name, u.avatar_url
         FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
         WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL
           AND s.expires_at > now() FOR UPDATE OF s`,
        [this.hash(token)],
      );
      if (!rows.length) throw new UnauthorizedException('Refresh session is invalid or expired.');
      const user = rows[0];
      const next = randomBytes(48).toString('base64url');
      await runner.query(
        `UPDATE auth_sessions SET revoked_at = now(), replaced_by_hash = $2 WHERE id = $1`,
        [user.session_id, this.hash(next)],
      );
      await runner.query(
        `INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [user.id, this.hash(next)],
      );
      await runner.commitTransaction();
      const accessToken = await this.jwt.signAsync(
        { sub: user.id, email: user.email },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m', issuer: 'jengaflow-api', audience: 'jengaflow-web' },
      );
      return {
        result: { accessToken, expiresIn: this.accessTtlSeconds(), user: { id: user.id, email: user.email, name: user.display_name, avatarUrl: user.avatar_url } },
        refreshToken: next,
      };
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.dataSource.query(
      'UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL',
      [this.hash(token)],
    );
  }
}
