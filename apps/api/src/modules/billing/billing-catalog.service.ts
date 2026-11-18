import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import {
  CreateBillingCustomerDto, CreateBillingPlanDto, CreateBillingSubscriptionDto,
  UpdateBillingCustomerDto, UpdateBillingPlanDto, UpdateBillingSubscriptionDto,
} from './billing-customer.dto';

@Injectable()
export class BillingCatalogService {
  constructor(private readonly db: TenantTransactionService) {}

  listCustomers(tenantId: string, status?: string) {
    return this.db.run(tenantId, manager => manager.query(`
      SELECT id,name,email,phone,tax_number AS "taxNumber",billing_address AS "billingAddress",
        notes,status,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM tenant_billing_customers WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2)
      ORDER BY name LIMIT 1000`, [tenantId,status ?? null]));
  }
  createCustomer(tenantId: string, actor: string, dto: CreateBillingCustomerDto) {
    return this.db.run(tenantId, async manager => {
      const rows = await manager.query(`INSERT INTO tenant_billing_customers
        (tenant_id,name,email,phone,tax_number,billing_address,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
        RETURNING id,name,email,phone,tax_number AS "taxNumber",billing_address AS "billingAddress",notes,status`,
        [tenantId,dto.name.trim(),dto.email?.trim()||null,dto.phone?.trim()||null,dto.taxNumber?.trim()||null,JSON.stringify(dto.billingAddress??{}),dto.notes??null,actor]);
      await this.audit(manager,tenantId,actor,'billing.customer.created','billing_customer',rows[0].id,{name:dto.name});
      return rows[0];
    });
  }
  updateCustomer(tenantId: string, actor: string, id: string, dto: UpdateBillingCustomerDto) {
    const fields: Record<string,string> = {name:'name',email:'email',phone:'phone',taxNumber:'tax_number',billingAddress:'billing_address',notes:'notes',status:'status'};
    return this.db.run(tenantId, async manager => {
      const current=(await manager.query('SELECT id FROM tenant_billing_customers WHERE tenant_id=$1 AND id=$2',[tenantId,id]))[0];
      if(!current) throw new NotFoundException('Billing customer not found.');
      const entries=Object.entries(dto).filter(([key,value])=>fields[key]&&value!==undefined);
      if(!entries.length) return current;
      const set=entries.map(([key],i)=>`${fields[key]}=$${i+3}`).join(',');
      const values=entries.map(([key,value])=>key==='billingAddress'?JSON.stringify(value):key==='name'||key==='email'||key==='phone'||key==='taxNumber'?String(value??'').trim():value);
      const rows=await manager.query(`UPDATE tenant_billing_customers SET ${set},updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,email,phone,tax_number AS "taxNumber",billing_address AS "billingAddress",notes,status`,[tenantId,id,...values]);
      await this.audit(manager,tenantId,actor,'billing.customer.updated','billing_customer',id,{fields:entries.map(([key])=>key)});
      return rows[0];
    });
  }

  listPlans(tenantId: string, status?: string) {
    return this.db.run(tenantId,manager=>manager.query(`SELECT id,name,description,currency,amount,interval,trial_days AS "trialDays",features,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM tenant_billing_plans WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY name LIMIT 1000`,[tenantId,status??null]));
  }
  createPlan(tenantId:string,actor:string,dto:CreateBillingPlanDto) {
    return this.db.run(tenantId,async manager=>{
      const rows=await manager.query(`INSERT INTO tenant_billing_plans(tenant_id,name,description,currency,amount,interval,trial_days,features,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
        RETURNING id,name,description,currency,amount,interval,trial_days AS "trialDays",features,status`,
        [tenantId,dto.name.trim(),dto.description??null,(dto.currency??'KES').toUpperCase(),dto.amount,dto.interval,dto.trialDays??0,JSON.stringify(dto.features??[]),actor]);
      await this.audit(manager,tenantId,actor,'billing.plan.created','billing_plan',rows[0].id,{name:dto.name,amount:dto.amount,currency:dto.currency??'KES'});
      return rows[0];
    });
  }
  updatePlan(tenantId:string,actor:string,id:string,dto:UpdateBillingPlanDto) {
    const fields:Record<string,string>={name:'name',description:'description',currency:'currency',amount:'amount',interval:'interval',trialDays:'trial_days',features:'features',status:'status'};
    return this.db.run(tenantId,async manager=>{
      const current=(await manager.query('SELECT id FROM tenant_billing_plans WHERE tenant_id=$1 AND id=$2',[tenantId,id]))[0];
      if(!current) throw new NotFoundException('Billing plan not found.');
      const entries=Object.entries(dto).filter(([key,value])=>fields[key]&&value!==undefined);
      if(!entries.length)return current;
      const set=entries.map(([key],i)=>`${fields[key]}=$${i+3}${key==='features'?'::jsonb':''}`).join(',');
      const values=entries.map(([key,value])=>key==='features'?JSON.stringify(value):key==='currency'?String(value).toUpperCase():value);
      const rows=await manager.query(`UPDATE tenant_billing_plans SET ${set},updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,description,currency,amount,interval,trial_days AS "trialDays",features,status`,[tenantId,id,...values]);
      await this.audit(manager,tenantId,actor,'billing.plan.updated','billing_plan',id,{fields:entries.map(([key])=>key)});
      return rows[0];
    });
  }

  listSubscriptions(tenantId:string,status?:string) {
    return this.db.run(tenantId,manager=>manager.query(`SELECT s.id,s.customer_id AS "customerId",c.name AS "customerName",s.plan_id AS "planId",p.name AS "planName",p.amount,p.currency,p.interval,s.status,s.start_date::text AS "startDate",s.trial_end_date::text AS "trialEndDate",s.current_period_start::text AS "currentPeriodStart",s.current_period_end::text AS "currentPeriodEnd",s.next_billing_date::text AS "nextBillingDate",s.cancel_at_period_end AS "cancelAtPeriodEnd",s.cancelled_at AS "cancelledAt",s.notes,s.created_at AS "createdAt" FROM tenant_billing_subscriptions s JOIN tenant_billing_customers c ON c.tenant_id=s.tenant_id AND c.id=s.customer_id JOIN tenant_billing_plans p ON p.tenant_id=s.tenant_id AND p.id=s.plan_id WHERE s.tenant_id=$1 AND ($2::text IS NULL OR s.status=$2) ORDER BY s.created_at DESC LIMIT 1000`,[tenantId,status??null]));
  }
  createSubscription(tenantId:string,actor:string,dto:CreateBillingSubscriptionDto) {
    if(dto.currentPeriodEnd<= (dto.currentPeriodStart??dto.startDate??new Date().toISOString().slice(0,10))) throw new BadRequestException('Current billing period end must be after its start.');
    return this.db.run(tenantId,async manager=>{
      const customer=(await manager.query('SELECT id,status FROM tenant_billing_customers WHERE tenant_id=$1 AND id=$2',[tenantId,dto.customerId]))[0];
      if(!customer||customer.status!=='active')throw new BadRequestException('An active billing customer is required.');
      const plan=(await manager.query('SELECT id,status,trial_days FROM tenant_billing_plans WHERE tenant_id=$1 AND id=$2',[tenantId,dto.planId]))[0];
      if(!plan||plan.status!=='active')throw new BadRequestException('An active billing plan is required.');
      const start=dto.startDate??new Date().toISOString().slice(0,10);
      const trialDays=Number(plan.trial_days??0);
      const rows=await manager.query(`INSERT INTO tenant_billing_subscriptions(tenant_id,customer_id,plan_id,status,start_date,trial_end_date,current_period_start,current_period_end,next_billing_date,notes,created_by)
        VALUES($1,$2,$3,$4,$5::date,CASE WHEN $6>0 THEN ($5::date+$6)::date ELSE NULL END,$7::date,$8::date,$9::date,$10,$11)
        RETURNING id,customer_id AS "customerId",plan_id AS "planId",status,start_date::text AS "startDate",trial_end_date::text AS "trialEndDate",current_period_start::text AS "currentPeriodStart",current_period_end::text AS "currentPeriodEnd",next_billing_date::text AS "nextBillingDate",notes`,
        [tenantId,dto.customerId,dto.planId,trialDays>0?'trialing':'active',start,trialDays,dto.currentPeriodStart??start,dto.currentPeriodEnd,dto.nextBillingDate??dto.currentPeriodEnd,dto.notes??null,actor]);
      await this.audit(manager,tenantId,actor,'billing.subscription.created','billing_subscription',rows[0].id,{customerId:dto.customerId,planId:dto.planId});
      return rows[0];
    });
  }
  updateSubscription(tenantId:string,actor:string,id:string,dto:UpdateBillingSubscriptionDto) {
    return this.db.run(tenantId,async manager=>{
      const current=(await manager.query('SELECT id,status FROM tenant_billing_subscriptions WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]))[0];
      if(!current)throw new NotFoundException('Subscription not found.');
      const allowed:Record<string,string[]>={trialing:['active','paused','cancelled','expired'],active:['past_due','paused','cancelled'],past_due:['active','paused','cancelled'],paused:['active','cancelled'],cancelled:[],expired:[]};
      if(dto.status&& !allowed[current.status]?.includes(dto.status))throw new BadRequestException(`Invalid subscription transition ${current.status} -> ${dto.status}`);
      if(dto.currentPeriodStart&&dto.currentPeriodEnd&&dto.currentPeriodEnd<=dto.currentPeriodStart)throw new BadRequestException('Billing period end must be after start.');
      const fields:Record<string,string>={status:'status',currentPeriodStart:'current_period_start',currentPeriodEnd:'current_period_end',nextBillingDate:'next_billing_date',cancelAtPeriodEnd:'cancel_at_period_end',notes:'notes'};
      const entries=Object.entries(dto).filter(([key,value])=>fields[key]&&value!==undefined);
      if(!entries.length)return current;
      const set=entries.map(([key],i)=>`${fields[key]}=$${i+3}${['currentPeriodStart','currentPeriodEnd','nextBillingDate'].includes(key)?'::date':''}`).join(',');
      const values=entries.map(([,value])=>value);
      const rows=await manager.query(`UPDATE tenant_billing_subscriptions SET ${set},cancelled_at=CASE WHEN ${dto.status==='cancelled'?'true':'false'} THEN now() ELSE cancelled_at END,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,current_period_start::text AS "currentPeriodStart",current_period_end::text AS "currentPeriodEnd",next_billing_date::text AS "nextBillingDate",cancel_at_period_end AS "cancelAtPeriodEnd",cancelled_at AS "cancelledAt",notes`,[tenantId,id,...values]);
      await this.audit(manager,tenantId,actor,'billing.subscription.updated','billing_subscription',id,{before:current.status,after:dto.status??current.status,fields:entries.map(([key])=>key)});
      return rows[0];
    });
  }
  private audit(manager:any,tenantId:string,actor:string,action:string,type:string,id:string,metadata:Record<string,unknown>) {
    return manager.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[tenantId,actor,action,type,id,JSON.stringify(metadata)]);
  }
}
