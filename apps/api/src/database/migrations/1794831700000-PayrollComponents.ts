import { MigrationInterface, QueryRunner } from 'typeorm';
export class PayrollComponents1794831700000 implements MigrationInterface {
  name='PayrollComponents1794831700000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`
      CREATE TABLE worker_pay_components(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,worker_id uuid NOT NULL,
        code varchar(40) NOT NULL,name varchar(120) NOT NULL,
        component_type varchar(20) NOT NULL CHECK(component_type IN ('allowance','deduction','benefit')),
        calculation_method varchar(24) NOT NULL CHECK(calculation_method IN ('fixed','percentage_of_base')),
        amount numeric(19,4) NOT NULL CHECK(amount>=0),
        taxable boolean NOT NULL DEFAULT false,
        effective_from date NOT NULL,effective_to date,
        status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
        created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(effective_to IS NULL OR effective_to>=effective_from),
        CHECK(component_type='allowance' OR taxable=false),
        FOREIGN KEY(tenant_id,worker_id) REFERENCES workers(tenant_id,id) ON DELETE RESTRICT,
        UNIQUE(tenant_id,id),UNIQUE(tenant_id,worker_id,code,effective_from)
      );
      CREATE INDEX worker_pay_components_effective_idx ON worker_pay_components(tenant_id,worker_id,status,effective_from,effective_to);
      ALTER TABLE worker_pay_components ENABLE ROW LEVEL SECURITY;
      ALTER TABLE worker_pay_components FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON worker_pay_components
        USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
        WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
    `);
  }
  async down(q:QueryRunner):Promise<void>{await q.query('DROP TABLE IF EXISTS worker_pay_components CASCADE');}
}
