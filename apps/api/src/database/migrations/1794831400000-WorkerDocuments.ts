import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkerDocuments1794831400000 implements MigrationInterface {
  name = 'WorkerDocuments1794831400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE worker_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        worker_id uuid NOT NULL,
        document_type varchar(32) NOT NULL CHECK (document_type IN ('identity','contract','tax','bank','qualification','other')),
        original_name varchar(180) NOT NULL,
        content_type varchar(100) NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
        object_key text NOT NULL UNIQUE,
        size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
        uploaded_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE (tenant_id,id)
      );
      CREATE INDEX worker_documents_worker_idx ON worker_documents(tenant_id,worker_id,created_at DESC);
      ALTER TABLE worker_documents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE worker_documents FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON worker_documents
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS worker_documents');
  }
}
