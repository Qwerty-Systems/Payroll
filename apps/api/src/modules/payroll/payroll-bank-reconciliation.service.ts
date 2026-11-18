import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {TenantTransactionService} from '../../database/tenant-transaction.service';
import {BankStatementTransactionDto} from './bank-reconciliation.dto';
@Injectable()
export class PayrollBankReconciliationService{
 constructor(private readonly db:TenantTransactionService){}
 list(tenantId:string,status?:string){
  return this.db.run(tenantId,m=>m.query(`SELECT id,transaction_reference AS "reference",transaction_date::text AS "date",amount,currency,description,match_status AS "matchStatus",matched_payment_item_id AS "matchedPaymentItemId",matched_at AS "matchedAt" FROM payroll_bank_transactions WHERE tenant_id=$1 AND ($2::text IS NULL OR match_status=$2) ORDER BY transaction_date DESC,created_at DESC LIMIT 1000`,[tenantId,status??null]));
 }
 async importTransactions(tenantId:string,actorId:string,transactions:BankStatementTransactionDto[]){
  if(!Array.isArray(transactions)||!transactions.length)throw new BadRequestException('Provide at least one bank statement transaction.');
  return this.db.run(tenantId,async m=>{
   let imported=0,duplicates=0;
   for(const t of transactions){
    if(!Number.isFinite(t.amount)||t.amount<=0)throw new BadRequestException('Bank transaction amounts must be greater than zero.');
    if(!t.reference?.trim()||!t.date)throw new BadRequestException('Each bank transaction requires a reference and date.');
    const currency=(t.currency??'KES').toUpperCase();
    const rows=await m.query(`INSERT INTO payroll_bank_transactions(tenant_id,transaction_reference,transaction_date,amount,currency,description,created_by)
      VALUES($1,$2,$3::date,$4,$5,$6,$7) ON CONFLICT(tenant_id,transaction_reference) DO NOTHING RETURNING id`,
      [tenantId,t.reference.trim(),t.date,t.amount,currency,t.description?.trim()||null,actorId]);
    if(rows.length)imported++;else duplicates++;
   }
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',[tenantId,actorId,'payroll.bank_statement.imported','bank_statement',JSON.stringify({transactionCount:transactions.length,imported,duplicates})]);
   return {received:transactions.length,imported,duplicates};
  });
 }
 async match(tenantId:string,actorId:string,transactionId:string,paymentItemId:string){
  return this.db.run(tenantId,async m=>{
   const tx=(await m.query('SELECT id,transaction_reference AS reference,amount,currency,match_status AS "matchStatus" FROM payroll_bank_transactions WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,transactionId]))[0];
   if(!tx)throw new NotFoundException('Bank statement transaction not found.');
   if(tx.matchStatus!=='unmatched')throw new ConflictException('Bank statement transaction is already matched.');
   const payment=(await m.query(`SELECT i.id,i.batch_id AS "batchId",i.worker_id AS "workerId",i.amount,i.status,i.provider_reference AS "providerReference",b.currency,b.status AS "batchStatus" FROM payroll_payment_batch_items i JOIN payroll_payment_batches b ON b.tenant_id=i.tenant_id AND b.id=i.batch_id WHERE i.tenant_id=$1 AND i.id=$2 FOR UPDATE OF i`,[tenantId,paymentItemId]))[0];
   if(!payment)throw new NotFoundException('Payroll payment item not found.');
   if(payment.status!=='paid')throw new BadRequestException('Only confirmed paid payroll items can be reconciled.');
   if(Number(payment.amount)!==Number(tx.amount))throw new BadRequestException('Bank transaction amount does not match payroll payment amount.');
   if(String(payment.currency).trim().toUpperCase()!==String(tx.currency).trim().toUpperCase())throw new BadRequestException('Bank transaction currency does not match payroll batch currency.');
   const already=await m.query('SELECT id FROM payroll_bank_transactions WHERE tenant_id=$1 AND matched_payment_item_id=$2',[tenantId,paymentItemId]);
   if(already.length)throw new ConflictException('Payroll payment item is already matched to a bank transaction.');
   const updated=(await m.query(`UPDATE payroll_bank_transactions SET match_status='matched',matched_payment_item_id=$3,matched_at=now(),matched_by=$4 WHERE tenant_id=$1 AND id=$2 RETURNING id,transaction_reference AS "reference",match_status AS "matchStatus",matched_payment_item_id AS "matchedPaymentItemId",matched_at AS "matchedAt"`,[tenantId,transactionId,paymentItemId,actorId]))[0];
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,actorId,'payroll.bank_transaction.matched','bank_transaction',transactionId,JSON.stringify({paymentItemId,batchId:payment.batchId,amount:tx.amount,currency:tx.currency})]);
   return updated;
  });
 }
}
