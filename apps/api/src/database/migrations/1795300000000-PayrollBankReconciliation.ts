import { MigrationInterface, QueryRunner } from 'typeorm';
export class PayrollBankReconciliation1795300000000 implements MigrationInterface {
 name='PayrollBankReconciliation1795300000000';
 async up(q:QueryRunner):Promise<void>{
  await q.query('ALTER TABLE payroll_payment_batch_items ADD CONSTRAINT payroll_payment_items_tenant_id_unique UNIQUE(tenant_id,id)');
  await q.query(`CREATE TABLE payroll_bank_transactions(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
   transaction_reference varchar(180) NOT NULL,
   transaction_date date NOT NULL,
   amount numeric(19,2) NOT NULL CHECK(amount>0),
   currency char(3) NOT NULL DEFAULT 'KES',
   description varchar(500),
   match_status varchar(20) NOT NULL DEFAULT 'unmatched' CHECK(match_status IN ('unmatched','matched')),
   matched_payment_item_id uuid,
   matched_at timestamptz,
   matched_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
   created_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
   created_at timestamptz NOT NULL DEFAULT now(),
   UNIQUE(tenant_id,id),
   UNIQUE(tenant_id,transaction_reference),
   FOREIGN KEY(tenant_id,matched_payment_item_id) REFERENCES payroll_payment_batch_items(tenant_id,id) ON DELETE RESTRICT,
   CHECK((match_status='unmatched' AND matched_payment_item_id IS NULL AND matched_at IS NULL) OR (match_status='matched' AND matched_payment_item_id IS NOT NULL AND matched_at IS NOT NULL))
  )`);
  await q.query('CREATE UNIQUE INDEX payroll_bank_match_payment_unique_idx ON payroll_bank_transactions(tenant_id,matched_payment_item_id) WHERE matched_payment_item_id IS NOT NULL');
  await q.query('CREATE INDEX payroll_bank_transactions_lookup_idx ON payroll_bank_transactions(tenant_id,transaction_date DESC,match_status)');
  await q.query('ALTER TABLE payroll_bank_transactions ENABLE ROW LEVEL SECURITY');
  await q.query('ALTER TABLE payroll_bank_transactions FORCE ROW LEVEL SECURITY');
  await q.query(`CREATE POLICY tenant_isolation ON payroll_bank_transactions USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)`);
  await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jengaflow_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON payroll_bank_transactions,payroll_payment_batch_items TO jengaflow_app; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jf_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON payroll_bank_transactions,payroll_payment_batch_items TO jf_app; END IF; END; $$;`);
 }
 async down(q:QueryRunner):Promise<void>{
  await q.query('DROP TABLE IF EXISTS payroll_bank_transactions CASCADE');
  await q.query('ALTER TABLE payroll_payment_batch_items DROP CONSTRAINT IF EXISTS payroll_payment_items_tenant_id_unique');
 }
}
