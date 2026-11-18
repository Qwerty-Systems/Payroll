import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingCustomersSubscriptions1795100000000 implements MigrationInterface {
  name = 'BillingCustomersSubscriptions1795100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS tenant_billing_customers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      name varchar(180) NOT NULL,
      email varchar(254),
      phone varchar(40),
      tax_number varchar(80),
      billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
      notes text,
      status varchar(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,id)
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS billing_customers_lookup_idx ON tenant_billing_customers(tenant_id,status,name)');
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS tenant_billing_plans (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      name varchar(140) NOT NULL,
      description text,
      currency char(3) NOT NULL DEFAULT 'KES',
      amount numeric(14,2) NOT NULL CHECK(amount>=0),
      interval varchar(20) NOT NULL CHECK(interval IN ('weekly','monthly','quarterly','yearly')),
      trial_days integer NOT NULL DEFAULT 0 CHECK(trial_days BETWEEN 0 AND 365),
      features jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(features)='array'),
      status varchar(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,id)
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS billing_plans_lookup_idx ON tenant_billing_plans(tenant_id,status,name)');
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS tenant_billing_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      customer_id uuid NOT NULL,
      plan_id uuid NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'trialing' CHECK(status IN ('trialing','active','past_due','paused','cancelled','expired')),
      start_date date NOT NULL DEFAULT CURRENT_DATE,
      trial_end_date date,
      current_period_start date NOT NULL DEFAULT CURRENT_DATE,
      current_period_end date NOT NULL,
      next_billing_date date,
      cancelled_at timestamptz,
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      notes text,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT billing_subscription_customer_fk FOREIGN KEY(tenant_id,customer_id) REFERENCES tenant_billing_customers(tenant_id,id) ON DELETE RESTRICT,
      CONSTRAINT billing_subscription_plan_fk FOREIGN KEY(tenant_id,plan_id) REFERENCES tenant_billing_plans(tenant_id,id) ON DELETE RESTRICT,
      CHECK(current_period_end>current_period_start)
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS billing_subscriptions_lookup_idx ON tenant_billing_subscriptions(tenant_id,status,next_billing_date)');
    await queryRunner.query('ALTER TABLE tenant_billing_documents ADD COLUMN IF NOT EXISTS customer_id uuid');
    await queryRunner.query('ALTER TABLE tenant_billing_documents ADD CONSTRAINT billing_document_customer_fk FOREIGN KEY(tenant_id,customer_id) REFERENCES tenant_billing_customers(tenant_id,id) ON DELETE RESTRICT');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS billing_documents_customer_idx ON tenant_billing_documents(tenant_id,customer_id,issue_date DESC)');
    for (const table of ['tenant_billing_customers','tenant_billing_plans','tenant_billing_subscriptions']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`CREATE POLICY tenant_isolation ON ${table} USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)`);
      await queryRunner.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jengaflow_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO jengaflow_app; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jf_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO jf_app; END IF; END $$`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tenant_billing_documents DROP CONSTRAINT IF EXISTS billing_document_customer_fk');
    await queryRunner.query('ALTER TABLE tenant_billing_documents DROP COLUMN IF EXISTS customer_id');
    await queryRunner.query('DROP TABLE IF EXISTS tenant_billing_subscriptions, tenant_billing_plans, tenant_billing_customers CASCADE');
  }
}
