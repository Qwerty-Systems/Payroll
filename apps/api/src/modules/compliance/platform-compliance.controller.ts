import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApproveStatutoryRuleSetDto } from './platform-compliance.dto';
import { PlatformComplianceGuard } from './platform-compliance.guard';
import { PlatformComplianceService } from './platform-compliance.service';

type PlatformRequest=Request & {platformUser:{id:string}};
@ApiTags('platform-compliance')
@ApiBearerAuth()
@Controller('platform/compliance')
@UseGuards(PlatformComplianceGuard)
export class PlatformComplianceController{
  constructor(private readonly compliance:PlatformComplianceService){}
  @Get('statutory-rule-sets') listRuleSets(){return this.compliance.listRuleSets();}
  @Post('statutory-rule-sets/:id/approve') approveRuleSet(@Req() req:PlatformRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ApproveStatutoryRuleSetDto){return this.compliance.approveRuleSet(req.platformUser.id,id,dto.reason);}
}
