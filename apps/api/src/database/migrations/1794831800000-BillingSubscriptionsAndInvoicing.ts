import { MigrationInterface, QueryRunner } from 'typeorm';
export class BillingSubscriptionsAndInvoicing1794831800000 implements MigrationInterface{
 name='BillingSubscriptionsAndInvoicing1794831800000';
 async up(q:QueryRunner):Promise<void>{await q.query(`
  CREATE SEQUENCE billing_invoice_number_seq;
  CREATE SEQUENCE billing_quote_number_seq;
  CREATE TABLE platform_billing_admins(user_id uuid PRIMARY KEY REFERENCES platform_users(id) ON DELETE RESTRICT,active boolean NOT NULL DEFAULT true,provisioned_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE billing_plans(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code varchar(40) NOT NULL UNIQUE,name varchar(120) NOT NULL,
    description varchar(500),price_minor bigint,currency char(3) NOT NULL DEFAULT 'KES',
    billing_interval varchar(16) NOT NULL CHECK(billing_interval IN ('monthly','yearly')),
    features jsonb NOT NULL DEFAULT '{}'::jsonb,seat_limit integer,worker_limit integer,
    status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(price_minor IS NULL OR price_minor>=0)
  );
  CREATE TABLE tenant_subscriptions(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    plan_id uuid NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
    status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','trialing','active','past_due','cancelled','expired')),
    currency char(3) NOT NULL,unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
    current_period_start date,current_period_end date,trial_ends_at timestamptz,next_billing_at timestamptz,
    provider varchar(24),provider_customer_ref varchar(160),provider_subscription_ref varchar(160),
    requested_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK(current_period_end IS NULL OR current_period_start IS NULL OR current_period_end>=current_period_start),
    UNIQUE(tenant_id,id)
  );
  CREATE UNIQUE INDEX tenant_one_open_subscription_idx ON tenant_subscriptions(tenant_id) WHERE status IN ('pending','trialing','active','past_due');
  CREATE TABLE billing_quotes(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    quote_number varchar(40) NOT NULL,customer_name varchar(180) NOT NULL,customer_email varchar(254),
    currency char(3) NOT NULL,subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0),tax_minor bigint NOT NULL CHECK(tax_minor>=0),
    total_minor bigint NOT NULL CHECK(total_minor=subtotal_minor+tax_minor),
    status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted','rejected','expired','converted')),
    issue_date date NOT NULL,valid_until date,notes varchar(2000),created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
    reviewed_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id,id),UNIQUE(tenant_id,quote_number)
  );
  CREATE TABLE billing_quote_lines(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,quote_id uuid NOT NULL,
    description varchar(240) NOT NULL,quantity numeric(14,3) NOT NULL CHECK(quantity>0),
    unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 1),
    line_subtotal_minor bigint NOT NULL CHECK(line_subtotal_minor>=0),line_tax_minor bigint NOT NULL CHECK(line_tax_minor>=0),
    FOREIGN KEY(tenant_id,quote_id) REFERENCES billing_quotes(tenant_id,id) ON DELETE CASCADE
  );
  CREATE TABLE billing_recurring_schedules(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name varchar(160) NOT NULL,customer_name varchar(180) NOT NULL,customer_email varchar(254),
    currency char(3) NOT NULL,frequency varchar(16) NOT NULL CHECK(frequency IN ('monthly','yearly')),
    next_run_date date NOT NULL,due_days integer NOT NULL CHECK(due_days BETWEEN 0 AND 365),lines_snapshot jsonb NOT NULL,status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled')),
    created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,last_generated_date date,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id)
  );
  CREATE TABLE billing_invoices(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    invoice_number varchar(40) NOT NULL,quote_id uuid,recurring_schedule_id uuid,recurring_period_date date,
    customer_name varchar(180) NOT NULL,customer_email varchar(254),currency char(3) NOT NULL,
    subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0),tax_minor bigint NOT NULL CHECK(tax_minor>=0),
    total_minor bigint NOT NULL CHECK(total_minor=subtotal_minor+tax_minor),
    amount_paid_minor bigint NOT NULL DEFAULT 0 CHECK(amount_paid_minor>=0 AND amount_paid_minor<=total_minor),
    status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','partially_paid','paid','overdue','void')),
    issue_date date NOT NULL,due_date date NOT NULL,notes varchar(2000),
    created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(tenant_id,quote_id) REFERENCES billing_quotes(tenant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY(tenant_id,recurring_schedule_id) REFERENCES billing_recurring_schedules(tenant_id,id) ON DELETE RESTRICT,
    UNIQUE(tenant_id,id),UNIQUE(tenant_id,invoice_number),
    CHECK(due_date>=issue_date),
    CHECK((recurring_schedule_id IS NULL AND recurring_period_date IS NULL) OR (recurring_schedule_id IS NOT NULL AND recurring_period_date IS NOT NULL))
  );
  CREATE UNIQUE INDEX billing_recurring_invoice_once_idx ON billing_invoices(tenant_id,recurring_schedule_id,recurring_period_date) WHERE recurring_schedule_id IS NOT NULL;
  CREATE TABLE billing_invoice_lines(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,invoice_id uuid NOT NULL,
    description varchar(240) NOT NULL,quantity numeric(14,3) NOT NULL CHECK(quantity>0),
    unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 1),
    line_subtotal_minor bigint NOT NULL CHECK(line_subtotal_minor>=0),line_tax_minor bigint NOT NULL CHECK(line_tax_minor>=0),
    FOREIGN KEY(tenant_id,invoice_id) REFERENCES billing_invoices(tenant_id,id) ON DELETE CASCADE
  );
  CREATE TABLE billing_payments(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,invoice_id uuid NOT NULL,
    amount_minor bigint NOT NULL CHECK(amount_minor>0),currency char(3) NOT NULL,
    method varchar(24) NOT NULL CHECK(method IN ('bank_transfer','mpesa','card','cash','other')),
    external_reference varchar(160) NOT NULL,status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','reversed')),
    recorded_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,reconciled_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),reconciled_at timestamptz,
    FOREIGN KEY(tenant_id,invoice_id) REFERENCES billing_invoices(tenant_id,id) ON DELETE RESTRICT,
    UNIQUE(tenant_id,id),UNIQUE(tenant_id,external_reference)
  );
  DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['tenant_subscriptions','billing_quotes','billing_quote_lines','billing_recurring_schedules','billing_invoices','billing_invoice_lines','billing_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
  END LOOP;END $$;
  CREATE INDEX billing_invoice_queue_idx ON billing_invoices(tenant_id,status,due_date);
  CREATE INDEX billing_recurring_due_idx ON billing_recurring_schedules(tenant_id,status,next_run_date);
  CREATE INDEX billing_payment_invoice_idx ON billing_payments(tenant_id,invoice_id,status);
 `);}
 async down(q:QueryRunner):Promise<void>{await q.query('DROP TABLE IF EXISTS billing_payments,billing_invoice_lines,billing_invoices,billing_recurring_schedules,billing_quote_lines,billing_quotes,tenant_subscriptions,billing_plans,platform_billing_admins CASCADE; DROP SEQUENCE IF EXISTS billing_invoice_number_seq; DROP SEQUENCE IF EXISTS billing_quote_number_seq;');}
}
