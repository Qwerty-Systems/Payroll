import { MigrationInterface, QueryRunner } from 'typeorm';
export class OfflineSyncProtocol1794831000000 implements MigrationInterface {
  name = 'OfflineSyncProtocol1794831000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tenant_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
        name varchar(120) NOT NULL, platform varchar(40) NOT NULL,
        last_seen_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(tenant_id,id),
        FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_memberships(tenant_id,user_id) ON DELETE RESTRICT
      );
      CREATE TABLE sync_commands (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        command_id uuid NOT NULL, device_id uuid NOT NULL, actor_user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
        entity_type varchar(40) NOT NULL, operation varchar(20) NOT NULL,
        payload_hash char(64) NOT NULL, payload jsonb NOT NULL,
        state varchar(20) NOT NULL CHECK(state IN ('accepted','conflict','rejected')),
        result jsonb NOT NULL DEFAULT '{}'::jsonb,
        received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
        UNIQUE(tenant_id,command_id),
        FOREIGN KEY(tenant_id,device_id) REFERENCES tenant_devices(tenant_id,id) ON DELETE RESTRICT
      );
      CREATE TABLE sync_conflicts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        command_id uuid NOT NULL, conflict_type varchar(60) NOT NULL,
        client_payload jsonb NOT NULL, server_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        state varchar(20) NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved','discarded')),
        resolution text, resolved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY(tenant_id,command_id) REFERENCES sync_commands(tenant_id,command_id) ON DELETE RESTRICT
      );
      CREATE INDEX tenant_devices_active_idx ON tenant_devices(tenant_id,user_id,last_seen_at) WHERE revoked_at IS NULL;
      CREATE INDEX sync_commands_state_idx ON sync_commands(tenant_id,state,received_at DESC);
      CREATE INDEX sync_conflicts_open_idx ON sync_conflicts(tenant_id,state,created_at DESC);
      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['tenant_devices','sync_commands','sync_conflicts'] LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
          EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',t);
        END LOOP;
      END $$;
    `);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE IF EXISTS sync_conflicts,sync_commands,tenant_devices CASCADE'); }
}
