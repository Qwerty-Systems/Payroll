import { CanActivate,ExecutionContext,ForbiddenException,Injectable,UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
type PlatformRequest=Request & {user?:{sub?:string};platformBillingAdmin?:{id:string}};
@Injectable()
export class PlatformBillingGuard implements CanActivate{
 constructor(private readonly dataSource:DataSource){}
 async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest<PlatformRequest>();const sub=req.user?.sub;if(!sub)throw new UnauthorizedException('Authentication is required.');const rows=await this.dataSource.query("SELECT u.id FROM platform_users u JOIN platform_billing_admins a ON a.user_id=u.id AND a.active=true WHERE u.auth0_subject=$1 AND u.status='active' LIMIT 1",[sub]);if(!rows.length)throw new ForbiddenException('Platform billing administrator access is required.');req.platformBillingAdmin={id:rows[0].id};return true;}
}
