import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Request } from 'express';

type PlatformRequest=Request & {user?:{sub?:string};platformUser?:{id:string}};
@Injectable()
export class PlatformComplianceGuard implements CanActivate{
  constructor(private readonly dataSource:DataSource){}
  async canActivate(context:ExecutionContext):Promise<boolean>{
    const req=context.switchToHttp().getRequest<PlatformRequest>();
    const subject=req.user?.sub;
    if(!subject)throw new UnauthorizedException('Authentication is required.');
    const rows=await this.dataSource.query(`SELECT u.id FROM platform_users u JOIN platform_compliance_reviewers r ON r.user_id=u.id AND r.active=true WHERE u.auth0_subject=$1 AND u.status='active' LIMIT 1`,[subject]);
    if(!rows.length)throw new ForbiddenException('Platform compliance reviewer access is required.');
    req.platformUser={id:rows[0].id};
    return true;
  }
}
