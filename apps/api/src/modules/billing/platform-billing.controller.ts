import { Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Req,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CreateBillingPlanDto,UpdateBillingPlanStatusDto } from './billing.dto';
import { PlatformBillingGuard } from './platform-billing.guard';
import { PlatformBillingService } from './platform-billing.service';
type PlatformRequest=Request & {platformBillingAdmin:{id:string}};
@ApiTags('platform-billing') @ApiBearerAuth() @Controller('platform/billing') @UseGuards(PlatformBillingGuard)
export class PlatformBillingController{
 constructor(private readonly billing:PlatformBillingService){}
 @Get('plans') listPlans(){return this.billing.listPlans();}
 @Post('plans') createPlan(@Req() req:PlatformRequest,@Body() dto:CreateBillingPlanDto){return this.billing.createPlan(req.platformBillingAdmin.id,dto);}
 @Patch('plans/:id/status') setPlanStatus(@Req() req:PlatformRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateBillingPlanStatusDto){return this.billing.setPlanStatus(req.platformBillingAdmin.id,id,dto.status as 'active'|'inactive');}
}
