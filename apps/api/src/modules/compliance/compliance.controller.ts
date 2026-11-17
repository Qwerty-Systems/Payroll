import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import {
  CreateFilingDto, CreateRuleChangeDto, FilingAuthorityResponseDto, FilingRejectionDto,
  ReviewDecisionDto, SubmitFilingDto, SubmitRuleReviewDto, UpdateRuleChangeDto,
} from './compliance.dto';
import { ComplianceService } from './compliance.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };
@ApiTags('compliance')
@ApiBearerAuth()
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('setup')
  @TenantPermissions('compliance.read')
  getTenantSetup(@Req() req:TenantRequest) { return this.compliance.getTenantSetup(req.tenant.id); }

  @Post('setup/initialize')
  @TenantPermissions('compliance.manage')
  initializeTenantSetup(@Req() req:TenantRequest) {
    return this.compliance.initializeTenantSetup(req.tenant.id,req.tenant.userId);
  }

  @Get('rulesets')
  @TenantPermissions('compliance.read')
  listRuleSets(@Req() req:TenantRequest) { return this.compliance.listRuleSets(req.tenant.id); }

  @Get('rulesets/:id')
  @TenantPermissions('compliance.read')
  getRuleSet(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.compliance.getRuleSet(req.tenant.id,id); }

  @Post('rulesets/:id/reviews')
  @TenantPermissions('compliance.submit')
  submitRuleReview(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:SubmitRuleReviewDto) {
    return this.compliance.submitRuleReview(req.tenant.id,req.tenant.userId,id,dto);
  }

  @Post('rule-reviews/:id/approve')
  @TenantPermissions('compliance.review')
  approveRuleReview(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReviewDecisionDto) {
    return this.compliance.decideRuleReview(req.tenant.id,req.tenant.userId,id,'approve',dto);
  }

  @Post('rule-reviews/:id/reject')
  @TenantPermissions('compliance.review')
  rejectRuleReview(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReviewDecisionDto) {
    return this.compliance.decideRuleReview(req.tenant.id,req.tenant.userId,id,'reject',dto);
  }

  @Get('rule-changes')
  @TenantPermissions('compliance.read')
  listRuleChanges(@Req() req:TenantRequest) { return this.compliance.listRuleChanges(req.tenant.id); }

  @Post('rulesets/:id/changes')
  @TenantPermissions('compliance.manage')
  createRuleChange(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CreateRuleChangeDto) {
    return this.compliance.createRuleChange(req.tenant.id,req.tenant.userId,id,dto);
  }

  @Patch('rule-changes/:id')
  @TenantPermissions('compliance.manage')
  updateRuleChange(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateRuleChangeDto) {
    return this.compliance.updateRuleChange(req.tenant.id,req.tenant.userId,id,dto);
  }

  @Post('rule-changes/:id/submit')
  @TenantPermissions('compliance.submit')
  submitRuleChange(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReviewDecisionDto) {
    return this.compliance.submitRuleChange(req.tenant.id,req.tenant.userId,id,dto.notes);
  }

  @Post('rule-changes/:id/approve')
  @TenantPermissions('compliance.review')
  approveRuleChange(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReviewDecisionDto) {
    return this.compliance.decideRuleChange(req.tenant.id,req.tenant.userId,id,'approve',dto);
  }

  @Post('rule-changes/:id/reject')
  @TenantPermissions('compliance.review')
  rejectRuleChange(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ReviewDecisionDto) {
    return this.compliance.decideRuleChange(req.tenant.id,req.tenant.userId,id,'reject',dto);
  }

  @Get('filings')
  @TenantPermissions('compliance.read')
  listFilings(@Req() req:TenantRequest) { return this.compliance.listFilings(req.tenant.id); }

  @Post('filings/prepare')
  @TenantPermissions('compliance.manage')
  prepareFiling(@Req() req:TenantRequest,@Body() dto:CreateFilingDto) {
    return this.compliance.prepareFiling(req.tenant.id,req.tenant.userId,dto);
  }

  @Get('filings/:id')
  @TenantPermissions('compliance.read')
  getFiling(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) { return this.compliance.getFiling(req.tenant.id,id); }

  @Post('filings/:id/request-review')
  @TenantPermissions('compliance.submit')
  requestFilingReview(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string) {
    return this.compliance.requestFilingReview(req.tenant.id,req.tenant.userId,id);
  }

  @Post('filings/:id/approve')
  @TenantPermissions('compliance.review')
  approveFiling(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:FilingRejectionDto) {
    return this.compliance.decideFiling(req.tenant.id,req.tenant.userId,id,'approve',dto);
  }

  @Post('filings/:id/reject')
  @TenantPermissions('compliance.review')
  rejectFiling(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:FilingRejectionDto) {
    return this.compliance.decideFiling(req.tenant.id,req.tenant.userId,id,'reject',dto);
  }

  @Post('filings/:id/record-submission')
  @TenantPermissions('compliance.submit')
  recordFilingSubmission(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:SubmitFilingDto) {
    return this.compliance.recordFilingSubmission(req.tenant.id,req.tenant.userId,id,dto);
  }

  @Post('filings/:id/authority-response')
  @TenantPermissions('compliance.manage')
  recordFilingAuthorityResponse(@Req() req:TenantRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:FilingAuthorityResponseDto) {
    return this.compliance.recordFilingAcceptance(req.tenant.id,req.tenant.userId,id,dto.accepted,dto.reason);
  }

  @Get('audit')
  @TenantPermissions('compliance.read')
  audit(@Req() req:TenantRequest,@Query('limit') limit?:string) { return this.compliance.listAudit(req.tenant.id,Number(limit??100)); }
}
