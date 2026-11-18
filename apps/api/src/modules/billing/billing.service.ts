import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';import {TenantTransactionService} from '../../database/tenant-transaction.service';import {CreateBillingDocumentDto,RecordBillingPaymentDto,UpdateBillingDocumentStatusDto} from './billing.dto';import {ConvertQuoteDto} from './billing-conversion.dto';import {UpdateBillingDocumentDto} from './billing-update.dto';
@Injectable() export class BillingService{constructor(private db:TenantTransactionService){}
 listDocuments(t:string,type?:'quote'|'invoice',status?:string){return this.db.run(t,m=>m.query(`SELECT id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",customer_email AS "customerEmail",issue_date::text AS "issueDate",due_date::text AS "dueDate",currency,items,subtotal,tax_total AS "taxTotal",total,notes,recurring_interval AS "recurringInterval",recurring_next_date::text AS "recurringNextDate",created_at AS "createdAt",updated_at AS "updatedAt" FROM tenant_billing_documents WHERE tenant_id=$1 AND ($2::text IS NULL OR document_type=$2) AND ($3::text IS NULL OR status=$3) ORDER BY issue_date DESC,created_at DESC LIMIT 1000`,[t,type??null,status??null]));}
 async createDocument(t:string,actor:string,d:CreateBillingDocumentDto){if(!d.items?.length)throw new BadRequestException('At least one line item is required.');if(d.dueDate&&d.issueDate&&d.dueDate<d.issueDate)throw new BadRequestException('Due date cannot precede issue date.');if(d.recurringInterval&&d.documentType!=='invoice')throw new BadRequestException('Recurring quotes are not supported.');const items=d.items.map(i=>{if(!Number.isFinite(i.quantity)||i.quantity<=0||!Number.isFinite(i.unitPrice)||i.unitPrice<0||(i.taxRate??0)<0||(i.taxRate??0)>100)throw new BadRequestException('Line item quantity, price or tax is invalid.');const sub=Math.round(i.quantity*i.unitPrice*100)/100;const tax=Math.round(sub*(i.taxRate??0))/100;return {...i,lineSubtotal:sub,lineTax:tax,lineTotal:Math.round((sub+tax)*100)/100};});const sub=Math.round(items.reduce((a,i)=>a+i.lineSubtotal,0)*100)/100;const tax=Math.round(items.reduce((a,i)=>a+i.lineTax,0)*100)/100;const total=Math.round((sub+tax)*100)/100;return this.db.run(t,async m=>{const rows=await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,recurring_interval,recurring_next_date,created_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7::date,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16) RETURNING id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",currency,subtotal,tax_total AS "taxTotal",total,items`,[t,d.documentType,d.documentNumber.trim(),d.customerName.trim(),d.customerEmail?.trim()||null,d.issueDate??null,d.dueDate??null,(d.currency??'KES').toUpperCase(),JSON.stringify(items),sub,tax,total,d.notes??null,d.recurringInterval??null,d.recurringNextDate??null,actor]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.created','billing_document',rows[0].id,JSON.stringify({documentType:d.documentType,number:d.documentNumber,total,currency:d.currency??'KES'})]);return rows[0]});}
 async updateDocument(t:string,actor:string,id:string,d:UpdateBillingDocumentDto){
  return this.db.run(t,async m=>{
   const current=(await m.query('SELECT id,status,issue_date::text AS "issueDate",due_date::text AS "dueDate" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!current)throw new NotFoundException('Billing document not found.');
   if(current.status!=='draft')throw new BadRequestException('Only draft billing documents can be edited.');
   const issue=d.issueDate??current.issueDate,due=d.dueDate??current.dueDate;
   if(due&&issue&&due<issue)throw new BadRequestException('Due date cannot precede issue date.');
   const fields:Record<string,string>={documentNumber:'document_number',customerName:'customer_name',customerEmail:'customer_email',issueDate:'issue_date',dueDate:'due_date',currency:'currency',notes:'notes'};
   const entries=Object.entries(d).filter(([key,value])=>fields[key]&&value!==undefined);
   const values=entries.map(([key,value])=>key==='currency'?String(value).toUpperCase():key==='documentNumber'||key==='customerName'||key==='customerEmail'?String(value??'').trim():value);
   const set=entries.map(([key],i)=>fields[key]+'=t:string,actor:string,id:string,d:UpdateBillingDocumentStatusDto){return this.db.run(t,async m=>{const current=(await m.query('SELECT id,status FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!current)throw new NotFoundException('Billing document not found.');const map:Record<string,string[]>={draft:['sent','void'],sent:['accepted','rejected','paid','void'],accepted:['paid','void'],rejected:['void'],paid:[],void:[]};if(!map[current.status]?.includes(d.status))throw new BadRequestException(`Invalid document status transition ${current.status} -> ${d.status}`);const row=(await m.query('UPDATE tenant_billing_documents SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,updated_at AS "updatedAt"',[t,id,d.status]))[0];await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.status_changed','billing_document',id,JSON.stringify({before:current.status,after:d.status,reason:d.reason??null})]);return row;});}
 listPayments(t:string,id:string){return this.db.run(t,async m=>{if(!(await m.query('SELECT id FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2',[t,id])).length)throw new NotFoundException('Billing document not found.');return m.query('SELECT id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes,created_at AS "createdAt" FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2 ORDER BY payment_date DESC',[t,id]);});}
 async recordPayment(t:string,actor:string,id:string,d:RecordBillingPaymentDto){return this.db.run(t,async m=>{const doc=(await m.query('SELECT id,document_type AS "documentType",status,total,currency FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!doc)throw new NotFoundException('Billing document not found.');if(doc.documentType!=='invoice'||!['sent','accepted'].includes(doc.status))throw new BadRequestException('Payments can only be recorded against sent or accepted invoices.');const sum=await m.query('SELECT COALESCE(sum(amount),0) AS paid FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2',[t,id]);const outstanding=Math.round((Number(doc.total)-Number(sum[0].paid))*100)/100;if((d.currency??doc.currency).toUpperCase()!==doc.currency)throw new BadRequestException('Payment currency must match invoice currency.');if(d.amount>outstanding)throw new BadRequestException(`Payment exceeds balance ${outstanding.toFixed(2)}.`);const row=(await m.query('INSERT INTO tenant_billing_payments(tenant_id,document_id,payment_reference,amount,currency,payment_date,payment_method,notes,recorded_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes',[t,id,d.paymentReference.trim(),d.amount,(d.currency??doc.currency).toUpperCase(),d.paymentDate??null,d.paymentMethod,d.notes??null,actor]));const newPaid=Number(sum[0].paid)+d.amount;if(newPaid>=Number(doc.total)&&['sent','accepted'].includes(doc.status))await m.query("UPDATE tenant_billing_documents SET status='paid',updated_at=now() WHERE tenant_id=$1 AND id=$2",[t,id]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.payment.recorded','billing_payment',row[0].id,JSON.stringify({documentId:id,amount:d.amount,reference:d.paymentReference})]);return {...row[0],paidToDate:newPaid,outstanding:Math.max(0,Math.round((Number(doc.total)-newPaid)*100)/100)};});}
 async convertQuote(t:string,actor:string,id:string,d:ConvertQuoteDto){
  return this.db.run(t,async m=>{
   const quote=(await m.query('SELECT id,document_type AS "documentType",status,customer_id AS "customerId",customer_name AS "customerName",customer_email AS "customerEmail",currency,items,subtotal,tax_total AS "taxTotal",total,notes,converted_to_document_id AS "convertedToDocumentId" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!quote)throw new NotFoundException('Quotation not found.');
   if(quote.documentType!=='quote')throw new BadRequestException('Only quotations can be converted.');
   if(quote.status!=='accepted')throw new BadRequestException('Only accepted quotations can be converted.');
   if(quote.convertedToDocumentId)throw new BadRequestException('Quotation has already been converted.');
   const invoice=(await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,created_by)
    VALUES($1,'invoice',$2,'draft',$3,$4,$5,CURRENT_DATE,$6::date,$7,$8::jsonb,$9,$10,$11,$12,$13)
    RETURNING id,document_number AS "documentNumber",status,total,currency`,[t,d.invoiceNumber.trim(),quote.customerId,quote.customerName,quote.customerEmail,d.dueDate??null,quote.currency,JSON.stringify(quote.items),quote.subtotal,quote.taxTotal,quote.total,d.notes??quote.notes,actor]))[0];
   await m.query('UPDATE tenant_billing_documents SET converted_to_document_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,id,invoice.id]);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.quote.converted','billing_document',invoice.id,JSON.stringify({quoteId:id,invoiceId:invoice.id,invoiceNumber:d.invoiceNumber})]);
   return invoice;
  });
 }
 async processRecurring(t:string,actor:string){
  return this.db.run(t,async m=>{
   const templates=await m.query(`SELECT id,document_number,customer_id,customer_name,customer_email,currency,items,subtotal,tax_total,total,notes,recurring_interval,recurring_next_date::text AS "nextDate",created_by FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status<>'void' AND recurring_interval IS NOT NULL AND recurring_next_date<=CURRENT_DATE ORDER BY recurring_next_date LIMIT 100 FOR UPDATE`,[t]);
   let generated=0;
   for(const template of templates){
    let nextDate=template.nextDate;
    for(let cycle=0;cycle<12&&nextDate&&nextDate<=new Date().toISOString().slice(0,10);cycle++){
     const number=template.document_number+'-R-'+nextDate.replace(/-/g,'');
     const row=await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,recurring_source_document_id,recurring_generated_for,created_by)
      VALUES($1,'invoice',$2,'draft',$3,$4,$5,$6::date,($6::date+30),$7,$8::jsonb,$9,$10,$11,$12,$13,$6::date,$14)
      ON CONFLICT(tenant_id,recurring_source_document_id,recurring_generated_for) WHERE recurring_source_document_id IS NOT NULL DO NOTHING
      RETURNING id,total`,[t,number,template.customer_id,template.customer_name,template.customer_email,nextDate,template.currency,JSON.stringify(template.items),template.subtotal,template.tax_total,template.total,template.notes,template.id,actor]);
     if(row.length){generated++;await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.recurring.invoice_generated','billing_document',row[0].id,JSON.stringify({sourceId:template.id,generatedFor:nextDate,documentNumber:number})]);}
     const increment=await m.query(`SELECT CASE $2 WHEN 'weekly' THEN ($1::date+7)::text WHEN 'monthly' THEN ($1::date+interval '1 month')::date::text WHEN 'quarterly' THEN ($1::date+interval '3 months')::date::text WHEN 'yearly' THEN ($1::date+interval '1 year')::date::text END AS next_date`,[nextDate,template.recurring_interval]);
     nextDate=increment[0].next_date;
    }
    await m.query('UPDATE tenant_billing_documents SET recurring_next_date=$3::date,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,template.id,nextDate]);
   }
   return {processed:templates.length,generated};
  });
 }
 async reconciliation(t:string){
  return this.db.run(t,async m=>{
   const summary=await m.query(`SELECT currency,count(*) FILTER(WHERE status<>'void')::int AS invoice_count,COALESCE(sum(total) FILTER(WHERE status<>'void'),0) AS billed,COALESCE(sum(total) FILTER(WHERE status='paid'),0) AS marked_paid,COALESCE(sum(total) FILTER(WHERE status IN ('sent','accepted') AND due_date<CURRENT_DATE),0) AS overdue_total FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' GROUP BY currency ORDER BY currency`,[t]);
   const aging=await m.query(`SELECT currency,COALESCE(sum(total),0) AS amount,count(*)::int AS count,CASE WHEN due_date>=CURRENT_DATE THEN 'current' WHEN due_date>=CURRENT_DATE-30 THEN '1-30' WHEN due_date>=CURRENT_DATE-60 THEN '31-60' WHEN due_date>=CURRENT_DATE-90 THEN '61-90' ELSE '90+' END AS bucket FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status IN ('sent','accepted') GROUP BY currency,bucket ORDER BY currency,bucket`,[t]);
   const paymentTotals=await m.query(`SELECT currency,COALESCE(sum(amount),0) AS recorded_payments,count(*)::int AS payment_count FROM tenant_billing_payments WHERE tenant_id=$1 GROUP BY currency ORDER BY currency`,[t]);
   return {summary,aging,paymentTotals};
  });
 }
 async printableDocument(t:string,id:string){
  return this.db.run(t,async m=>{
   const rows=await m.query(`SELECT id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",customer_email AS "customerEmail",issue_date::text AS "issueDate",due_date::text AS "dueDate",currency,items,subtotal,tax_total AS "taxTotal",total,notes FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2`,[t,id]);
   if(!rows[0])throw new NotFoundException('Billing document not found.');
   return rows[0];
  });
 }
}+(i+3)+(key==='issueDate'||key==='dueDate'?'::date':'')).join(',');
   let itemTotals:{items:unknown[];subtotal:number;tax:number;total:number}|undefined;
   if(d.items){
    if(!d.items.length)throw new BadRequestException('At least one line item is required.');
    const items=d.items.map(item=>{if(!Number.isFinite(item.quantity)||item.quantity<=0||!Number.isFinite(item.unitPrice)||item.unitPrice<0||(item.taxRate??0)<0||(item.taxRate??0)>100)throw new BadRequestException('Line item quantity, price or tax is invalid.');const lineSubtotal=Math.round(item.quantity*item.unitPrice*100)/100;const lineTax=Math.round(lineSubtotal*(item.taxRate??0))/100;return {...item,lineSubtotal,lineTax,lineTotal:Math.round((lineSubtotal+lineTax)*100)/100};});
    const subtotal=Math.round(items.reduce((sum,item)=>sum+item.lineSubtotal,0)*100)/100;
    const tax=Math.round(items.reduce((sum,item)=>sum+item.lineTax,0)*100)/100;
    itemTotals={items,subtotal,tax,total:Math.round((subtotal+tax)*100)/100};
   }
   if(!entries.length&&!itemTotals)return current;
   const assignments=[set,itemTotals?'items=t:string,actor:string,id:string,d:UpdateBillingDocumentStatusDto){return this.db.run(t,async m=>{const current=(await m.query('SELECT id,status FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!current)throw new NotFoundException('Billing document not found.');const map:Record<string,string[]>={draft:['sent','void'],sent:['accepted','rejected','paid','void'],accepted:['paid','void'],rejected:['void'],paid:[],void:[]};if(!map[current.status]?.includes(d.status))throw new BadRequestException(`Invalid document status transition ${current.status} -> ${d.status}`);const row=(await m.query('UPDATE tenant_billing_documents SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,updated_at AS "updatedAt"',[t,id,d.status]))[0];await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.status_changed','billing_document',id,JSON.stringify({before:current.status,after:d.status,reason:d.reason??null})]);return row;});}
 listPayments(t:string,id:string){return this.db.run(t,async m=>{if(!(await m.query('SELECT id FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2',[t,id])).length)throw new NotFoundException('Billing document not found.');return m.query('SELECT id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes,created_at AS "createdAt" FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2 ORDER BY payment_date DESC',[t,id]);});}
 async recordPayment(t:string,actor:string,id:string,d:RecordBillingPaymentDto){return this.db.run(t,async m=>{const doc=(await m.query('SELECT id,document_type AS "documentType",status,total,currency FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!doc)throw new NotFoundException('Billing document not found.');if(doc.documentType!=='invoice'||!['sent','accepted'].includes(doc.status))throw new BadRequestException('Payments can only be recorded against sent or accepted invoices.');const sum=await m.query('SELECT COALESCE(sum(amount),0) AS paid FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2',[t,id]);const outstanding=Math.round((Number(doc.total)-Number(sum[0].paid))*100)/100;if((d.currency??doc.currency).toUpperCase()!==doc.currency)throw new BadRequestException('Payment currency must match invoice currency.');if(d.amount>outstanding)throw new BadRequestException(`Payment exceeds balance ${outstanding.toFixed(2)}.`);const row=(await m.query('INSERT INTO tenant_billing_payments(tenant_id,document_id,payment_reference,amount,currency,payment_date,payment_method,notes,recorded_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes',[t,id,d.paymentReference.trim(),d.amount,(d.currency??doc.currency).toUpperCase(),d.paymentDate??null,d.paymentMethod,d.notes??null,actor]));const newPaid=Number(sum[0].paid)+d.amount;if(newPaid>=Number(doc.total)&&['sent','accepted'].includes(doc.status))await m.query("UPDATE tenant_billing_documents SET status='paid',updated_at=now() WHERE tenant_id=$1 AND id=$2",[t,id]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.payment.recorded','billing_payment',row[0].id,JSON.stringify({documentId:id,amount:d.amount,reference:d.paymentReference})]);return {...row[0],paidToDate:newPaid,outstanding:Math.max(0,Math.round((Number(doc.total)-newPaid)*100)/100)};});}
 async convertQuote(t:string,actor:string,id:string,d:ConvertQuoteDto){
  return this.db.run(t,async m=>{
   const quote=(await m.query('SELECT id,document_type AS "documentType",status,customer_id AS "customerId",customer_name AS "customerName",customer_email AS "customerEmail",currency,items,subtotal,tax_total AS "taxTotal",total,notes,converted_to_document_id AS "convertedToDocumentId" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!quote)throw new NotFoundException('Quotation not found.');
   if(quote.documentType!=='quote')throw new BadRequestException('Only quotations can be converted.');
   if(quote.status!=='accepted')throw new BadRequestException('Only accepted quotations can be converted.');
   if(quote.convertedToDocumentId)throw new BadRequestException('Quotation has already been converted.');
   const invoice=(await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,created_by)
    VALUES($1,'invoice',$2,'draft',$3,$4,$5,CURRENT_DATE,$6::date,$7,$8::jsonb,$9,$10,$11,$12,$13)
    RETURNING id,document_number AS "documentNumber",status,total,currency`,[t,d.invoiceNumber.trim(),quote.customerId,quote.customerName,quote.customerEmail,d.dueDate??null,quote.currency,JSON.stringify(quote.items),quote.subtotal,quote.taxTotal,quote.total,d.notes??quote.notes,actor]))[0];
   await m.query('UPDATE tenant_billing_documents SET converted_to_document_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,id,invoice.id]);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.quote.converted','billing_document',invoice.id,JSON.stringify({quoteId:id,invoiceId:invoice.id,invoiceNumber:d.invoiceNumber})]);
   return invoice;
  });
 }
 async processRecurring(t:string,actor:string){
  return this.db.run(t,async m=>{
   const templates=await m.query(`SELECT id,document_number,customer_id,customer_name,customer_email,currency,items,subtotal,tax_total,total,notes,recurring_interval,recurring_next_date::text AS "nextDate",created_by FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status<>'void' AND recurring_interval IS NOT NULL AND recurring_next_date<=CURRENT_DATE ORDER BY recurring_next_date LIMIT 100 FOR UPDATE`,[t]);
   let generated=0;
   for(const template of templates){
    let nextDate=template.nextDate;
    for(let cycle=0;cycle<12&&nextDate&&nextDate<=new Date().toISOString().slice(0,10);cycle++){
     const number=template.document_number+'-R-'+nextDate.replace(/-/g,'');
     const row=await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,recurring_source_document_id,recurring_generated_for,created_by)
      VALUES($1,'invoice',$2,'draft',$3,$4,$5,$6::date,($6::date+30),$7,$8::jsonb,$9,$10,$11,$12,$13,$6::date,$14)
      ON CONFLICT(tenant_id,recurring_source_document_id,recurring_generated_for) WHERE recurring_source_document_id IS NOT NULL DO NOTHING
      RETURNING id,total`,[t,number,template.customer_id,template.customer_name,template.customer_email,nextDate,template.currency,JSON.stringify(template.items),template.subtotal,template.tax_total,template.total,template.notes,template.id,actor]);
     if(row.length){generated++;await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.recurring.invoice_generated','billing_document',row[0].id,JSON.stringify({sourceId:template.id,generatedFor:nextDate,documentNumber:number})]);}
     const increment=await m.query(`SELECT CASE $2 WHEN 'weekly' THEN ($1::date+7)::text WHEN 'monthly' THEN ($1::date+interval '1 month')::date::text WHEN 'quarterly' THEN ($1::date+interval '3 months')::date::text WHEN 'yearly' THEN ($1::date+interval '1 year')::date::text END AS next_date`,[nextDate,template.recurring_interval]);
     nextDate=increment[0].next_date;
    }
    await m.query('UPDATE tenant_billing_documents SET recurring_next_date=$3::date,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,template.id,nextDate]);
   }
   return {processed:templates.length,generated};
  });
 }
 async reconciliation(t:string){
  return this.db.run(t,async m=>{
   const summary=await m.query(`SELECT currency,count(*) FILTER(WHERE status<>'void')::int AS invoice_count,COALESCE(sum(total) FILTER(WHERE status<>'void'),0) AS billed,COALESCE(sum(total) FILTER(WHERE status='paid'),0) AS marked_paid,COALESCE(sum(total) FILTER(WHERE status IN ('sent','accepted') AND due_date<CURRENT_DATE),0) AS overdue_total FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' GROUP BY currency ORDER BY currency`,[t]);
   const aging=await m.query(`SELECT currency,COALESCE(sum(total),0) AS amount,count(*)::int AS count,CASE WHEN due_date>=CURRENT_DATE THEN 'current' WHEN due_date>=CURRENT_DATE-30 THEN '1-30' WHEN due_date>=CURRENT_DATE-60 THEN '31-60' WHEN due_date>=CURRENT_DATE-90 THEN '61-90' ELSE '90+' END AS bucket FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status IN ('sent','accepted') GROUP BY currency,bucket ORDER BY currency,bucket`,[t]);
   const paymentTotals=await m.query(`SELECT currency,COALESCE(sum(amount),0) AS recorded_payments,count(*)::int AS payment_count FROM tenant_billing_payments WHERE tenant_id=$1 GROUP BY currency ORDER BY currency`,[t]);
   return {summary,aging,paymentTotals};
  });
 }
 async printableDocument(t:string,id:string){
  return this.db.run(t,async m=>{
   const rows=await m.query(`SELECT id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",customer_email AS "customerEmail",issue_date::text AS "issueDate",due_date::text AS "dueDate",currency,items,subtotal,tax_total AS "taxTotal",total,notes FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2`,[t,id]);
   if(!rows[0])throw new NotFoundException('Billing document not found.');
   return rows[0];
  });
 }
}+(entries.length+3)+'::jsonb,subtotal=t:string,actor:string,id:string,d:UpdateBillingDocumentStatusDto){return this.db.run(t,async m=>{const current=(await m.query('SELECT id,status FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!current)throw new NotFoundException('Billing document not found.');const map:Record<string,string[]>={draft:['sent','void'],sent:['accepted','rejected','paid','void'],accepted:['paid','void'],rejected:['void'],paid:[],void:[]};if(!map[current.status]?.includes(d.status))throw new BadRequestException(`Invalid document status transition ${current.status} -> ${d.status}`);const row=(await m.query('UPDATE tenant_billing_documents SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,updated_at AS "updatedAt"',[t,id,d.status]))[0];await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.status_changed','billing_document',id,JSON.stringify({before:current.status,after:d.status,reason:d.reason??null})]);return row;});}
 listPayments(t:string,id:string){return this.db.run(t,async m=>{if(!(await m.query('SELECT id FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2',[t,id])).length)throw new NotFoundException('Billing document not found.');return m.query('SELECT id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes,created_at AS "createdAt" FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2 ORDER BY payment_date DESC',[t,id]);});}
 async recordPayment(t:string,actor:string,id:string,d:RecordBillingPaymentDto){return this.db.run(t,async m=>{const doc=(await m.query('SELECT id,document_type AS "documentType",status,total,currency FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!doc)throw new NotFoundException('Billing document not found.');if(doc.documentType!=='invoice'||!['sent','accepted'].includes(doc.status))throw new BadRequestException('Payments can only be recorded against sent or accepted invoices.');const sum=await m.query('SELECT COALESCE(sum(amount),0) AS paid FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2',[t,id]);const outstanding=Math.round((Number(doc.total)-Number(sum[0].paid))*100)/100;if((d.currency??doc.currency).toUpperCase()!==doc.currency)throw new BadRequestException('Payment currency must match invoice currency.');if(d.amount>outstanding)throw new BadRequestException(`Payment exceeds balance ${outstanding.toFixed(2)}.`);const row=(await m.query('INSERT INTO tenant_billing_payments(tenant_id,document_id,payment_reference,amount,currency,payment_date,payment_method,notes,recorded_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes',[t,id,d.paymentReference.trim(),d.amount,(d.currency??doc.currency).toUpperCase(),d.paymentDate??null,d.paymentMethod,d.notes??null,actor]));const newPaid=Number(sum[0].paid)+d.amount;if(newPaid>=Number(doc.total)&&['sent','accepted'].includes(doc.status))await m.query("UPDATE tenant_billing_documents SET status='paid',updated_at=now() WHERE tenant_id=$1 AND id=$2",[t,id]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.payment.recorded','billing_payment',row[0].id,JSON.stringify({documentId:id,amount:d.amount,reference:d.paymentReference})]);return {...row[0],paidToDate:newPaid,outstanding:Math.max(0,Math.round((Number(doc.total)-newPaid)*100)/100)};});}
 async convertQuote(t:string,actor:string,id:string,d:ConvertQuoteDto){
  return this.db.run(t,async m=>{
   const quote=(await m.query('SELECT id,document_type AS "documentType",status,customer_id AS "customerId",customer_name AS "customerName",customer_email AS "customerEmail",currency,items,subtotal,tax_total AS "taxTotal",total,notes,converted_to_document_id AS "convertedToDocumentId" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!quote)throw new NotFoundException('Quotation not found.');
   if(quote.documentType!=='quote')throw new BadRequestException('Only quotations can be converted.');
   if(quote.status!=='accepted')throw new BadRequestException('Only accepted quotations can be converted.');
   if(quote.convertedToDocumentId)throw new BadRequestException('Quotation has already been converted.');
   const invoice=(await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,created_by)
    VALUES($1,'invoice',$2,'draft',$3,$4,$5,CURRENT_DATE,$6::date,$7,$8::jsonb,$9,$10,$11,$12,$13)
    RETURNING id,document_number AS "documentNumber",status,total,currency`,[t,d.invoiceNumber.trim(),quote.customerId,quote.customerName,quote.customerEmail,d.dueDate??null,quote.currency,JSON.stringify(quote.items),quote.subtotal,quote.taxTotal,quote.total,d.notes??quote.notes,actor]))[0];
   await m.query('UPDATE tenant_billing_documents SET converted_to_document_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,id,invoice.id]);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.quote.converted','billing_document',invoice.id,JSON.stringify({quoteId:id,invoiceId:invoice.id,invoiceNumber:d.invoiceNumber})]);
   return invoice;
  });
 }
 async processRecurring(t:string,actor:string){
  return this.db.run(t,async m=>{
   const templates=await m.query(`SELECT id,document_number,customer_id,customer_name,customer_email,currency,items,subtotal,tax_total,total,notes,recurring_interval,recurring_next_date::text AS "nextDate",created_by FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status<>'void' AND recurring_interval IS NOT NULL AND recurring_next_date<=CURRENT_DATE ORDER BY recurring_next_date LIMIT 100 FOR UPDATE`,[t]);
   let generated=0;
   for(const template of templates){
    let nextDate=template.nextDate;
    for(let cycle=0;cycle<12&&nextDate&&nextDate<=new Date().toISOString().slice(0,10);cycle++){
     const number=template.document_number+'-R-'+nextDate.replace(/-/g,'');
     const row=await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,recurring_source_document_id,recurring_generated_for,created_by)
      VALUES($1,'invoice',$2,'draft',$3,$4,$5,$6::date,($6::date+30),$7,$8::jsonb,$9,$10,$11,$12,$13,$6::date,$14)
      ON CONFLICT(tenant_id,recurring_source_document_id,recurring_generated_for) WHERE recurring_source_document_id IS NOT NULL DO NOTHING
      RETURNING id,total`,[t,number,template.customer_id,template.customer_name,template.customer_email,nextDate,template.currency,JSON.stringify(template.items),template.subtotal,template.tax_total,template.total,template.notes,template.id,actor]);
     if(row.length){generated++;await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.recurring.invoice_generated','billing_document',row[0].id,JSON.stringify({sourceId:template.id,generatedFor:nextDate,documentNumber:number})]);}
     const increment=await m.query(`SELECT CASE $2 WHEN 'weekly' THEN ($1::date+7)::text WHEN 'monthly' THEN ($1::date+interval '1 month')::date::text WHEN 'quarterly' THEN ($1::date+interval '3 months')::date::text WHEN 'yearly' THEN ($1::date+interval '1 year')::date::text END AS next_date`,[nextDate,template.recurring_interval]);
     nextDate=increment[0].next_date;
    }
    await m.query('UPDATE tenant_billing_documents SET recurring_next_date=$3::date,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,template.id,nextDate]);
   }
   return {processed:templates.length,generated};
  });
 }
 async reconciliation(t:string){
  return this.db.run(t,async m=>{
   const summary=await m.query(`SELECT currency,count(*) FILTER(WHERE status<>'void')::int AS invoice_count,COALESCE(sum(total) FILTER(WHERE status<>'void'),0) AS billed,COALESCE(sum(total) FILTER(WHERE status='paid'),0) AS marked_paid,COALESCE(sum(total) FILTER(WHERE status IN ('sent','accepted') AND due_date<CURRENT_DATE),0) AS overdue_total FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' GROUP BY currency ORDER BY currency`,[t]);
   const aging=await m.query(`SELECT currency,COALESCE(sum(total),0) AS amount,count(*)::int AS count,CASE WHEN due_date>=CURRENT_DATE THEN 'current' WHEN due_date>=CURRENT_DATE-30 THEN '1-30' WHEN due_date>=CURRENT_DATE-60 THEN '31-60' WHEN due_date>=CURRENT_DATE-90 THEN '61-90' ELSE '90+' END AS bucket FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status IN ('sent','accepted') GROUP BY currency,bucket ORDER BY currency,bucket`,[t]);
   const paymentTotals=await m.query(`SELECT currency,COALESCE(sum(amount),0) AS recorded_payments,count(*)::int AS payment_count FROM tenant_billing_payments WHERE tenant_id=$1 GROUP BY currency ORDER BY currency`,[t]);
   return {summary,aging,paymentTotals};
  });
 }
 async printableDocument(t:string,id:string){
  return this.db.run(t,async m=>{
   const rows=await m.query(`SELECT id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",customer_email AS "customerEmail",issue_date::text AS "issueDate",due_date::text AS "dueDate",currency,items,subtotal,tax_total AS "taxTotal",total,notes FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2`,[t,id]);
   if(!rows[0])throw new NotFoundException('Billing document not found.');
   return rows[0];
  });
 }
}+(entries.length+4)+',tax_total=t:string,actor:string,id:string,d:UpdateBillingDocumentStatusDto){return this.db.run(t,async m=>{const current=(await m.query('SELECT id,status FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!current)throw new NotFoundException('Billing document not found.');const map:Record<string,string[]>={draft:['sent','void'],sent:['accepted','rejected','paid','void'],accepted:['paid','void'],rejected:['void'],paid:[],void:[]};if(!map[current.status]?.includes(d.status))throw new BadRequestException(`Invalid document status transition ${current.status} -> ${d.status}`);const row=(await m.query('UPDATE tenant_billing_documents SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,updated_at AS "updatedAt"',[t,id,d.status]))[0];await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.status_changed','billing_document',id,JSON.stringify({before:current.status,after:d.status,reason:d.reason??null})]);return row;});}
 listPayments(t:string,id:string){return this.db.run(t,async m=>{if(!(await m.query('SELECT id FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2',[t,id])).length)throw new NotFoundException('Billing document not found.');return m.query('SELECT id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes,created_at AS "createdAt" FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2 ORDER BY payment_date DESC',[t,id]);});}
 async recordPayment(t:string,actor:string,id:string,d:RecordBillingPaymentDto){return this.db.run(t,async m=>{const doc=(await m.query('SELECT id,document_type AS "documentType",status,total,currency FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!doc)throw new NotFoundException('Billing document not found.');if(doc.documentType!=='invoice'||!['sent','accepted'].includes(doc.status))throw new BadRequestException('Payments can only be recorded against sent or accepted invoices.');const sum=await m.query('SELECT COALESCE(sum(amount),0) AS paid FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2',[t,id]);const outstanding=Math.round((Number(doc.total)-Number(sum[0].paid))*100)/100;if((d.currency??doc.currency).toUpperCase()!==doc.currency)throw new BadRequestException('Payment currency must match invoice currency.');if(d.amount>outstanding)throw new BadRequestException(`Payment exceeds balance ${outstanding.toFixed(2)}.`);const row=(await m.query('INSERT INTO tenant_billing_payments(tenant_id,document_id,payment_reference,amount,currency,payment_date,payment_method,notes,recorded_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes',[t,id,d.paymentReference.trim(),d.amount,(d.currency??doc.currency).toUpperCase(),d.paymentDate??null,d.paymentMethod,d.notes??null,actor]));const newPaid=Number(sum[0].paid)+d.amount;if(newPaid>=Number(doc.total)&&['sent','accepted'].includes(doc.status))await m.query("UPDATE tenant_billing_documents SET status='paid',updated_at=now() WHERE tenant_id=$1 AND id=$2",[t,id]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.payment.recorded','billing_payment',row[0].id,JSON.stringify({documentId:id,amount:d.amount,reference:d.paymentReference})]);return {...row[0],paidToDate:newPaid,outstanding:Math.max(0,Math.round((Number(doc.total)-newPaid)*100)/100)};});}
 async convertQuote(t:string,actor:string,id:string,d:ConvertQuoteDto){
  return this.db.run(t,async m=>{
   const quote=(await m.query('SELECT id,document_type AS "documentType",status,customer_id AS "customerId",customer_name AS "customerName",customer_email AS "customerEmail",currency,items,subtotal,tax_total AS "taxTotal",total,notes,converted_to_document_id AS "convertedToDocumentId" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!quote)throw new NotFoundException('Quotation not found.');
   if(quote.documentType!=='quote')throw new BadRequestException('Only quotations can be converted.');
   if(quote.status!=='accepted')throw new BadRequestException('Only accepted quotations can be converted.');
   if(quote.convertedToDocumentId)throw new BadRequestException('Quotation has already been converted.');
   const invoice=(await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,created_by)
    VALUES($1,'invoice',$2,'draft',$3,$4,$5,CURRENT_DATE,$6::date,$7,$8::jsonb,$9,$10,$11,$12,$13)
    RETURNING id,document_number AS "documentNumber",status,total,currency`,[t,d.invoiceNumber.trim(),quote.customerId,quote.customerName,quote.customerEmail,d.dueDate??null,quote.currency,JSON.stringify(quote.items),quote.subtotal,quote.taxTotal,quote.total,d.notes??quote.notes,actor]))[0];
   await m.query('UPDATE tenant_billing_documents SET converted_to_document_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,id,invoice.id]);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.quote.converted','billing_document',invoice.id,JSON.stringify({quoteId:id,invoiceId:invoice.id,invoiceNumber:d.invoiceNumber})]);
   return invoice;
  });
 }
 async processRecurring(t:string,actor:string){
  return this.db.run(t,async m=>{
   const templates=await m.query(`SELECT id,document_number,customer_id,customer_name,customer_email,currency,items,subtotal,tax_total,total,notes,recurring_interval,recurring_next_date::text AS "nextDate",created_by FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status<>'void' AND recurring_interval IS NOT NULL AND recurring_next_date<=CURRENT_DATE ORDER BY recurring_next_date LIMIT 100 FOR UPDATE`,[t]);
   let generated=0;
   for(const template of templates){
    let nextDate=template.nextDate;
    for(let cycle=0;cycle<12&&nextDate&&nextDate<=new Date().toISOString().slice(0,10);cycle++){
     const number=template.document_number+'-R-'+nextDate.replace(/-/g,'');
     const row=await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,recurring_source_document_id,recurring_generated_for,created_by)
      VALUES($1,'invoice',$2,'draft',$3,$4,$5,$6::date,($6::date+30),$7,$8::jsonb,$9,$10,$11,$12,$13,$6::date,$14)
      ON CONFLICT(tenant_id,recurring_source_document_id,recurring_generated_for) WHERE recurring_source_document_id IS NOT NULL DO NOTHING
      RETURNING id,total`,[t,number,template.customer_id,template.customer_name,template.customer_email,nextDate,template.currency,JSON.stringify(template.items),template.subtotal,template.tax_total,template.total,template.notes,template.id,actor]);
     if(row.length){generated++;await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.recurring.invoice_generated','billing_document',row[0].id,JSON.stringify({sourceId:template.id,generatedFor:nextDate,documentNumber:number})]);}
     const increment=await m.query(`SELECT CASE $2 WHEN 'weekly' THEN ($1::date+7)::text WHEN 'monthly' THEN ($1::date+interval '1 month')::date::text WHEN 'quarterly' THEN ($1::date+interval '3 months')::date::text WHEN 'yearly' THEN ($1::date+interval '1 year')::date::text END AS next_date`,[nextDate,template.recurring_interval]);
     nextDate=increment[0].next_date;
    }
    await m.query('UPDATE tenant_billing_documents SET recurring_next_date=$3::date,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,template.id,nextDate]);
   }
   return {processed:templates.length,generated};
  });
 }
 async reconciliation(t:string){
  return this.db.run(t,async m=>{
   const summary=await m.query(`SELECT currency,count(*) FILTER(WHERE status<>'void')::int AS invoice_count,COALESCE(sum(total) FILTER(WHERE status<>'void'),0) AS billed,COALESCE(sum(total) FILTER(WHERE status='paid'),0) AS marked_paid,COALESCE(sum(total) FILTER(WHERE status IN ('sent','accepted') AND due_date<CURRENT_DATE),0) AS overdue_total FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' GROUP BY currency ORDER BY currency`,[t]);
   const aging=await m.query(`SELECT currency,COALESCE(sum(total),0) AS amount,count(*)::int AS count,CASE WHEN due_date>=CURRENT_DATE THEN 'current' WHEN due_date>=CURRENT_DATE-30 THEN '1-30' WHEN due_date>=CURRENT_DATE-60 THEN '31-60' WHEN due_date>=CURRENT_DATE-90 THEN '61-90' ELSE '90+' END AS bucket FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status IN ('sent','accepted') GROUP BY currency,bucket ORDER BY currency,bucket`,[t]);
   const paymentTotals=await m.query(`SELECT currency,COALESCE(sum(amount),0) AS recorded_payments,count(*)::int AS payment_count FROM tenant_billing_payments WHERE tenant_id=$1 GROUP BY currency ORDER BY currency`,[t]);
   return {summary,aging,paymentTotals};
  });
 }
 async printableDocument(t:string,id:string){
  return this.db.run(t,async m=>{
   const rows=await m.query(`SELECT id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",customer_email AS "customerEmail",issue_date::text AS "issueDate",due_date::text AS "dueDate",currency,items,subtotal,tax_total AS "taxTotal",total,notes FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2`,[t,id]);
   if(!rows[0])throw new NotFoundException('Billing document not found.');
   return rows[0];
  });
 }
}+(entries.length+5)+',total=t:string,actor:string,id:string,d:UpdateBillingDocumentStatusDto){return this.db.run(t,async m=>{const current=(await m.query('SELECT id,status FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!current)throw new NotFoundException('Billing document not found.');const map:Record<string,string[]>={draft:['sent','void'],sent:['accepted','rejected','paid','void'],accepted:['paid','void'],rejected:['void'],paid:[],void:[]};if(!map[current.status]?.includes(d.status))throw new BadRequestException(`Invalid document status transition ${current.status} -> ${d.status}`);const row=(await m.query('UPDATE tenant_billing_documents SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,updated_at AS "updatedAt"',[t,id,d.status]))[0];await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.status_changed','billing_document',id,JSON.stringify({before:current.status,after:d.status,reason:d.reason??null})]);return row;});}
 listPayments(t:string,id:string){return this.db.run(t,async m=>{if(!(await m.query('SELECT id FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2',[t,id])).length)throw new NotFoundException('Billing document not found.');return m.query('SELECT id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes,created_at AS "createdAt" FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2 ORDER BY payment_date DESC',[t,id]);});}
 async recordPayment(t:string,actor:string,id:string,d:RecordBillingPaymentDto){return this.db.run(t,async m=>{const doc=(await m.query('SELECT id,document_type AS "documentType",status,total,currency FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!doc)throw new NotFoundException('Billing document not found.');if(doc.documentType!=='invoice'||!['sent','accepted'].includes(doc.status))throw new BadRequestException('Payments can only be recorded against sent or accepted invoices.');const sum=await m.query('SELECT COALESCE(sum(amount),0) AS paid FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2',[t,id]);const outstanding=Math.round((Number(doc.total)-Number(sum[0].paid))*100)/100;if((d.currency??doc.currency).toUpperCase()!==doc.currency)throw new BadRequestException('Payment currency must match invoice currency.');if(d.amount>outstanding)throw new BadRequestException(`Payment exceeds balance ${outstanding.toFixed(2)}.`);const row=(await m.query('INSERT INTO tenant_billing_payments(tenant_id,document_id,payment_reference,amount,currency,payment_date,payment_method,notes,recorded_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes',[t,id,d.paymentReference.trim(),d.amount,(d.currency??doc.currency).toUpperCase(),d.paymentDate??null,d.paymentMethod,d.notes??null,actor]));const newPaid=Number(sum[0].paid)+d.amount;if(newPaid>=Number(doc.total)&&['sent','accepted'].includes(doc.status))await m.query("UPDATE tenant_billing_documents SET status='paid',updated_at=now() WHERE tenant_id=$1 AND id=$2",[t,id]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.payment.recorded','billing_payment',row[0].id,JSON.stringify({documentId:id,amount:d.amount,reference:d.paymentReference})]);return {...row[0],paidToDate:newPaid,outstanding:Math.max(0,Math.round((Number(doc.total)-newPaid)*100)/100)};});}
 async convertQuote(t:string,actor:string,id:string,d:ConvertQuoteDto){
  return this.db.run(t,async m=>{
   const quote=(await m.query('SELECT id,document_type AS "documentType",status,customer_id AS "customerId",customer_name AS "customerName",customer_email AS "customerEmail",currency,items,subtotal,tax_total AS "taxTotal",total,notes,converted_to_document_id AS "convertedToDocumentId" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!quote)throw new NotFoundException('Quotation not found.');
   if(quote.documentType!=='quote')throw new BadRequestException('Only quotations can be converted.');
   if(quote.status!=='accepted')throw new BadRequestException('Only accepted quotations can be converted.');
   if(quote.convertedToDocumentId)throw new BadRequestException('Quotation has already been converted.');
   const invoice=(await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,created_by)
    VALUES($1,'invoice',$2,'draft',$3,$4,$5,CURRENT_DATE,$6::date,$7,$8::jsonb,$9,$10,$11,$12,$13)
    RETURNING id,document_number AS "documentNumber",status,total,currency`,[t,d.invoiceNumber.trim(),quote.customerId,quote.customerName,quote.customerEmail,d.dueDate??null,quote.currency,JSON.stringify(quote.items),quote.subtotal,quote.taxTotal,quote.total,d.notes??quote.notes,actor]))[0];
   await m.query('UPDATE tenant_billing_documents SET converted_to_document_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,id,invoice.id]);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.quote.converted','billing_document',invoice.id,JSON.stringify({quoteId:id,invoiceId:invoice.id,invoiceNumber:d.invoiceNumber})]);
   return invoice;
  });
 }
 async processRecurring(t:string,actor:string){
  return this.db.run(t,async m=>{
   const templates=await m.query(`SELECT id,document_number,customer_id,customer_name,customer_email,currency,items,subtotal,tax_total,total,notes,recurring_interval,recurring_next_date::text AS "nextDate",created_by FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status<>'void' AND recurring_interval IS NOT NULL AND recurring_next_date<=CURRENT_DATE ORDER BY recurring_next_date LIMIT 100 FOR UPDATE`,[t]);
   let generated=0;
   for(const template of templates){
    let nextDate=template.nextDate;
    for(let cycle=0;cycle<12&&nextDate&&nextDate<=new Date().toISOString().slice(0,10);cycle++){
     const number=template.document_number+'-R-'+nextDate.replace(/-/g,'');
     const row=await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,recurring_source_document_id,recurring_generated_for,created_by)
      VALUES($1,'invoice',$2,'draft',$3,$4,$5,$6::date,($6::date+30),$7,$8::jsonb,$9,$10,$11,$12,$13,$6::date,$14)
      ON CONFLICT(tenant_id,recurring_source_document_id,recurring_generated_for) WHERE recurring_source_document_id IS NOT NULL DO NOTHING
      RETURNING id,total`,[t,number,template.customer_id,template.customer_name,template.customer_email,nextDate,template.currency,JSON.stringify(template.items),template.subtotal,template.tax_total,template.total,template.notes,template.id,actor]);
     if(row.length){generated++;await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.recurring.invoice_generated','billing_document',row[0].id,JSON.stringify({sourceId:template.id,generatedFor:nextDate,documentNumber:number})]);}
     const increment=await m.query(`SELECT CASE $2 WHEN 'weekly' THEN ($1::date+7)::text WHEN 'monthly' THEN ($1::date+interval '1 month')::date::text WHEN 'quarterly' THEN ($1::date+interval '3 months')::date::text WHEN 'yearly' THEN ($1::date+interval '1 year')::date::text END AS next_date`,[nextDate,template.recurring_interval]);
     nextDate=increment[0].next_date;
    }
    await m.query('UPDATE tenant_billing_documents SET recurring_next_date=$3::date,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,template.id,nextDate]);
   }
   return {processed:templates.length,generated};
  });
 }
 async reconciliation(t:string){
  return this.db.run(t,async m=>{
   const summary=await m.query(`SELECT currency,count(*) FILTER(WHERE status<>'void')::int AS invoice_count,COALESCE(sum(total) FILTER(WHERE status<>'void'),0) AS billed,COALESCE(sum(total) FILTER(WHERE status='paid'),0) AS marked_paid,COALESCE(sum(total) FILTER(WHERE status IN ('sent','accepted') AND due_date<CURRENT_DATE),0) AS overdue_total FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' GROUP BY currency ORDER BY currency`,[t]);
   const aging=await m.query(`SELECT currency,COALESCE(sum(total),0) AS amount,count(*)::int AS count,CASE WHEN due_date>=CURRENT_DATE THEN 'current' WHEN due_date>=CURRENT_DATE-30 THEN '1-30' WHEN due_date>=CURRENT_DATE-60 THEN '31-60' WHEN due_date>=CURRENT_DATE-90 THEN '61-90' ELSE '90+' END AS bucket FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status IN ('sent','accepted') GROUP BY currency,bucket ORDER BY currency,bucket`,[t]);
   const paymentTotals=await m.query(`SELECT currency,COALESCE(sum(amount),0) AS recorded_payments,count(*)::int AS payment_count FROM tenant_billing_payments WHERE tenant_id=$1 GROUP BY currency ORDER BY currency`,[t]);
   return {summary,aging,paymentTotals};
  });
 }
 async printableDocument(t:string,id:string){
  return this.db.run(t,async m=>{
   const rows=await m.query(`SELECT id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",customer_email AS "customerEmail",issue_date::text AS "issueDate",due_date::text AS "dueDate",currency,items,subtotal,tax_total AS "taxTotal",total,notes FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2`,[t,id]);
   if(!rows[0])throw new NotFoundException('Billing document not found.');
   return rows[0];
  });
 }
}+(entries.length+6):''].filter(Boolean).join(',');
   const params=[t,id,...values,...(itemTotals?[JSON.stringify(itemTotals.items),itemTotals.subtotal,itemTotals.tax,itemTotals.total]:[])];
   const rows=await m.query('UPDATE tenant_billing_documents SET '+assignments+',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,document_number AS "documentNumber",customer_name AS "customerName",status,currency,subtotal,tax_total AS "taxTotal",total,updated_at AS "updatedAt"',params);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.updated','billing_document',id,JSON.stringify({fields:entries.map(([key])=>key),itemsUpdated:Boolean(itemTotals)})]);
   return rows[0];
  });
 }
 async deleteDocument(t:string,actor:string,id:string){
  return this.db.run(t,async m=>{
   const current=(await m.query('SELECT id,status,document_type AS "documentType",document_number AS "documentNumber" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!current)throw new NotFoundException('Billing document not found.');
   if(current.status!=='draft')throw new BadRequestException('Only draft billing documents can be deleted.');
   const payments=await m.query('SELECT count(*)::int AS count FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2',[t,id]);
   if(Number(payments[0].count))throw new BadRequestException('A document with payments cannot be deleted.');
   await m.query('DELETE FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2',[t,id]);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.deleted','billing_document',id,JSON.stringify({documentType:current.documentType,documentNumber:current.documentNumber})]);
   return {id,deleted:true};
  });
 }
 async updateStatus(t:string,actor:string,id:string,d:UpdateBillingDocumentStatusDto){return this.db.run(t,async m=>{const current=(await m.query('SELECT id,status FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!current)throw new NotFoundException('Billing document not found.');const map:Record<string,string[]>={draft:['sent','void'],sent:['accepted','rejected','paid','void'],accepted:['paid','void'],rejected:['void'],paid:[],void:[]};if(!map[current.status]?.includes(d.status))throw new BadRequestException(`Invalid document status transition ${current.status} -> ${d.status}`);const row=(await m.query('UPDATE tenant_billing_documents SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,updated_at AS "updatedAt"',[t,id,d.status]))[0];await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.document.status_changed','billing_document',id,JSON.stringify({before:current.status,after:d.status,reason:d.reason??null})]);return row;});}
 listPayments(t:string,id:string){return this.db.run(t,async m=>{if(!(await m.query('SELECT id FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2',[t,id])).length)throw new NotFoundException('Billing document not found.');return m.query('SELECT id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes,created_at AS "createdAt" FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2 ORDER BY payment_date DESC',[t,id]);});}
 async recordPayment(t:string,actor:string,id:string,d:RecordBillingPaymentDto){return this.db.run(t,async m=>{const doc=(await m.query('SELECT id,document_type AS "documentType",status,total,currency FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];if(!doc)throw new NotFoundException('Billing document not found.');if(doc.documentType!=='invoice'||!['sent','accepted'].includes(doc.status))throw new BadRequestException('Payments can only be recorded against sent or accepted invoices.');const sum=await m.query('SELECT COALESCE(sum(amount),0) AS paid FROM tenant_billing_payments WHERE tenant_id=$1 AND document_id=$2',[t,id]);const outstanding=Math.round((Number(doc.total)-Number(sum[0].paid))*100)/100;if((d.currency??doc.currency).toUpperCase()!==doc.currency)throw new BadRequestException('Payment currency must match invoice currency.');if(d.amount>outstanding)throw new BadRequestException(`Payment exceeds balance ${outstanding.toFixed(2)}.`);const row=(await m.query('INSERT INTO tenant_billing_payments(tenant_id,document_id,payment_reference,amount,currency,payment_date,payment_method,notes,recorded_by) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9) RETURNING id,payment_reference AS "paymentReference",amount,currency,payment_date::text AS "paymentDate",payment_method AS "paymentMethod",notes',[t,id,d.paymentReference.trim(),d.amount,(d.currency??doc.currency).toUpperCase(),d.paymentDate??null,d.paymentMethod,d.notes??null,actor]));const newPaid=Number(sum[0].paid)+d.amount;if(newPaid>=Number(doc.total)&&['sent','accepted'].includes(doc.status))await m.query("UPDATE tenant_billing_documents SET status='paid',updated_at=now() WHERE tenant_id=$1 AND id=$2",[t,id]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.payment.recorded','billing_payment',row[0].id,JSON.stringify({documentId:id,amount:d.amount,reference:d.paymentReference})]);return {...row[0],paidToDate:newPaid,outstanding:Math.max(0,Math.round((Number(doc.total)-newPaid)*100)/100)};});}
 async convertQuote(t:string,actor:string,id:string,d:ConvertQuoteDto){
  return this.db.run(t,async m=>{
   const quote=(await m.query('SELECT id,document_type AS "documentType",status,customer_id AS "customerId",customer_name AS "customerName",customer_email AS "customerEmail",currency,items,subtotal,tax_total AS "taxTotal",total,notes,converted_to_document_id AS "convertedToDocumentId" FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[t,id]))[0];
   if(!quote)throw new NotFoundException('Quotation not found.');
   if(quote.documentType!=='quote')throw new BadRequestException('Only quotations can be converted.');
   if(quote.status!=='accepted')throw new BadRequestException('Only accepted quotations can be converted.');
   if(quote.convertedToDocumentId)throw new BadRequestException('Quotation has already been converted.');
   const invoice=(await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,created_by)
    VALUES($1,'invoice',$2,'draft',$3,$4,$5,CURRENT_DATE,$6::date,$7,$8::jsonb,$9,$10,$11,$12,$13)
    RETURNING id,document_number AS "documentNumber",status,total,currency`,[t,d.invoiceNumber.trim(),quote.customerId,quote.customerName,quote.customerEmail,d.dueDate??null,quote.currency,JSON.stringify(quote.items),quote.subtotal,quote.taxTotal,quote.total,d.notes??quote.notes,actor]))[0];
   await m.query('UPDATE tenant_billing_documents SET converted_to_document_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,id,invoice.id]);
   await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.quote.converted','billing_document',invoice.id,JSON.stringify({quoteId:id,invoiceId:invoice.id,invoiceNumber:d.invoiceNumber})]);
   return invoice;
  });
 }
 async processRecurring(t:string,actor:string){
  return this.db.run(t,async m=>{
   const templates=await m.query(`SELECT id,document_number,customer_id,customer_name,customer_email,currency,items,subtotal,tax_total,total,notes,recurring_interval,recurring_next_date::text AS "nextDate",created_by FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status<>'void' AND recurring_interval IS NOT NULL AND recurring_next_date<=CURRENT_DATE ORDER BY recurring_next_date LIMIT 100 FOR UPDATE`,[t]);
   let generated=0;
   for(const template of templates){
    let nextDate=template.nextDate;
    for(let cycle=0;cycle<12&&nextDate&&nextDate<=new Date().toISOString().slice(0,10);cycle++){
     const number=template.document_number+'-R-'+nextDate.replace(/-/g,'');
     const row=await m.query(`INSERT INTO tenant_billing_documents(tenant_id,document_type,document_number,status,customer_id,customer_name,customer_email,issue_date,due_date,currency,items,subtotal,tax_total,total,notes,recurring_source_document_id,recurring_generated_for,created_by)
      VALUES($1,'invoice',$2,'draft',$3,$4,$5,$6::date,($6::date+30),$7,$8::jsonb,$9,$10,$11,$12,$13,$6::date,$14)
      ON CONFLICT(tenant_id,recurring_source_document_id,recurring_generated_for) WHERE recurring_source_document_id IS NOT NULL DO NOTHING
      RETURNING id,total`,[t,number,template.customer_id,template.customer_name,template.customer_email,nextDate,template.currency,JSON.stringify(template.items),template.subtotal,template.tax_total,template.total,template.notes,template.id,actor]);
     if(row.length){generated++;await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[t,actor,'billing.recurring.invoice_generated','billing_document',row[0].id,JSON.stringify({sourceId:template.id,generatedFor:nextDate,documentNumber:number})]);}
     const increment=await m.query(`SELECT CASE $2 WHEN 'weekly' THEN ($1::date+7)::text WHEN 'monthly' THEN ($1::date+interval '1 month')::date::text WHEN 'quarterly' THEN ($1::date+interval '3 months')::date::text WHEN 'yearly' THEN ($1::date+interval '1 year')::date::text END AS next_date`,[nextDate,template.recurring_interval]);
     nextDate=increment[0].next_date;
    }
    await m.query('UPDATE tenant_billing_documents SET recurring_next_date=$3::date,updated_at=now() WHERE tenant_id=$1 AND id=$2',[t,template.id,nextDate]);
   }
   return {processed:templates.length,generated};
  });
 }
 async reconciliation(t:string){
  return this.db.run(t,async m=>{
   const summary=await m.query(`SELECT currency,count(*) FILTER(WHERE status<>'void')::int AS invoice_count,COALESCE(sum(total) FILTER(WHERE status<>'void'),0) AS billed,COALESCE(sum(total) FILTER(WHERE status='paid'),0) AS marked_paid,COALESCE(sum(total) FILTER(WHERE status IN ('sent','accepted') AND due_date<CURRENT_DATE),0) AS overdue_total FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' GROUP BY currency ORDER BY currency`,[t]);
   const aging=await m.query(`SELECT currency,COALESCE(sum(total),0) AS amount,count(*)::int AS count,CASE WHEN due_date>=CURRENT_DATE THEN 'current' WHEN due_date>=CURRENT_DATE-30 THEN '1-30' WHEN due_date>=CURRENT_DATE-60 THEN '31-60' WHEN due_date>=CURRENT_DATE-90 THEN '61-90' ELSE '90+' END AS bucket FROM tenant_billing_documents WHERE tenant_id=$1 AND document_type='invoice' AND status IN ('sent','accepted') GROUP BY currency,bucket ORDER BY currency,bucket`,[t]);
   const paymentTotals=await m.query(`SELECT currency,COALESCE(sum(amount),0) AS recorded_payments,count(*)::int AS payment_count FROM tenant_billing_payments WHERE tenant_id=$1 GROUP BY currency ORDER BY currency`,[t]);
   return {summary,aging,paymentTotals};
  });
 }
 async printableDocument(t:string,id:string){
  return this.db.run(t,async m=>{
   const rows=await m.query(`SELECT id,document_type AS "documentType",document_number AS "documentNumber",status,customer_name AS "customerName",customer_email AS "customerEmail",issue_date::text AS "issueDate",due_date::text AS "dueDate",currency,items,subtotal,tax_total AS "taxTotal",total,notes FROM tenant_billing_documents WHERE tenant_id=$1 AND id=$2`,[t,id]);
   if(!rows[0])throw new NotFoundException('Billing document not found.');
   return rows[0];
  });
 }
}