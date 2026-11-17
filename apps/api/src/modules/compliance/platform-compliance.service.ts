import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PlatformComplianceService{
  constructor(private readonly dataSource:DataSource){}
  listRuleSets(){
    return this.dataSource.query(`SELECT s.id,s.country_code AS "countryCode",s.name,s.version,s.status,s.published_at AS "publishedAt",s.compliance_approved_at AS "complianceApprovedAt",s.compliance_approved_by AS "complianceApprovedBy",s.compliance_review_notes AS "complianceReviewNotes",COUNT(r.id)::int AS "ruleCount",MIN(r.effective_from) AS "effectiveFrom",MAX(r.effective_to) AS "latestEffectiveTo" FROM statutory_rule_sets s LEFT JOIN statutory_rules r ON r.rule_set_id=s.id GROUP BY s.id ORDER BY s.country_code,s.published_at DESC NULLS LAST`);
  }
  async approveRuleSet(actorId:string,id:string,reason:string){
    if(!reason?.trim()||reason.trim().length<10)throw new BadRequestException('A compliance approval rationale of at least ten characters is required.');
    return this.dataSource.transaction(async manager=>{
      const rows=await manager.query('SELECT id,country_code,version,status,compliance_approved_at FROM statutory_rule_sets WHERE id=$1 FOR UPDATE',[id]);
      if(!rows.length)throw new NotFoundException('Statutory ruleset not found.');
      if(rows[0].status!=='published')throw new ConflictException('Only a published statutory ruleset can be approved.');
      if(rows[0].compliance_approved_at)throw new ConflictException('This statutory ruleset already has a compliance approval. Publish a new version for changes.');
      const updated=await manager.query('UPDATE statutory_rule_sets SET compliance_approved_at=now(),compliance_approved_by=$2,compliance_review_notes=$3 WHERE id=$1 RETURNING id,country_code AS "countryCode",version,compliance_approved_at AS "complianceApprovedAt",compliance_approved_by AS "complianceApprovedBy",compliance_review_notes AS "complianceReviewNotes"',[id,actorId,reason.trim()]);
      await manager.query(`INSERT INTO platform_audit_events(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'statutory.ruleset.compliance_approved','statutory_rule_set',$2,$3::jsonb)`,[actorId,id,JSON.stringify({countryCode:rows[0].country_code,version:rows[0].version,reason:reason.trim()})]);
      return updated[0];
    });
  }
}
