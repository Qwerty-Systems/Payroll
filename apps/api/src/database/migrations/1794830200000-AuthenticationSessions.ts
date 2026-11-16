import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthenticationSessions1794830200000 implements MigrationInterface {
  name = 'AuthenticationSessions1794830200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE auth_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        google_sub varchar(255) NOT NULL UNIQUE,
        email varchar(320) NOT NULL UNIQUE,
        display_name varchar(255),
        avatar_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        refresh_token_hash char(64) NOT NULL UNIQUE,
        replaced_by_hash char(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      );
      CREATE INDEX auth_sessions_user_active_idx ON auth_sessions(user_id, expires_at)
        WHERE revoked_at IS NULL;
      CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS auth_sessions; DROP TABLE IF EXISTS auth_users;');
  }
}
