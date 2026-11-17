import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { AcceptInvitationDto, CreateInvitationDto } from './users.dto';

type Claims = { [key:string]:unknown; sub?:unknown; email?:unknown; email_verified?:unknown; name?:unknown };
const EMAIL='https://jengaflow.qwerty.co.ke/email';
const VERIFIED='https://jengaflow.qwerty.co.ke/email_verified';
const NAME='https://jengaflow.qwerty.co.ke/name';
const ROLES=['admin','hr_manager','payroll_manager','supervisor','worker','accountant','viewer'];

@Injectable()
export class UsersService {
  constructor(private readonly tenantDb:TenantTransactionService){}
  createInvitation(tenantId:string,actorId:string,actorRole:string,dto:CreateInvitationDto){
    if(!ROLES.includes(dto.role))throw new BadRequestException('Unsupported invitation role.');
    if(dto.role==='admin'&&actorRole!=='owner')throw new ForbiddenException('Only the company owner can invite an administrator.');
    const secret=randomBytes(32).toString('hex');
    const token=tenantId+'.'+secret;
    const tokenHash=createHash('sha256').update(token).digest('hex');
    return this.tenantDb.run(tenantId,async m=>{
      const email=dto.email.trim().toLowerCase();
      const existing=await m.query("SELECT tm.id FROM tenant_memberships tm JOIN platform_users u ON u.id=tm.user_id WHERE tm.tenant_id=$1 AND lower(u.email)=$2 AND tm.status='active' LIMIT 1",[tenantId,email]);
      if(existing.length)throw new ConflictException('This person is already an active member of the company.');
      const pending=await m.query("SELECT id FROM tenant_invitations WHERE tenant_id=$1 AND lower(email)=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() LIMIT 1",[tenantId,email]);
      if(pending.length)throw new ConflictException('A pending invitation already exists for this email address.');
      const rows=await m.query("INSERT INTO tenant_invitations(tenant_id,email,role,token_hash,expires_at,invited_by) VALUES($1,$2,$3,$4,now()+interval '7 days',$5) RETURNING id,email,role,expires_at AS \"expiresAt\",created_at AS \"createdAt\"",[tenantId,email,dto.role,tokenHash,actorId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'user.invitation.created','tenant_invitation',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({email,role:dto.role})]);
      return {...rows[0],inviteToken:token,delivery:'manual_share_required'};
    });
  }
  listMembers(tenantId:string){return this.tenantDb.run(tenantId,m=>m.query('SELECT m.id AS "membershipId",m.role,m.status,m.created_at AS "joinedAt",u.id AS "userId",u.email,u.full_name AS "fullName",u.status AS "userStatus" FROM tenant_memberships m JOIN platform_users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.full_name',[tenantId]));}
  listInvitations(tenantId:string){return this.tenantDb.run(tenantId,m=>m.query("SELECT id,email,role,expires_at AS \"expiresAt\",created_at AS \"createdAt\",accepted_at AS \"acceptedAt\",revoked_at AS \"revokedAt\" FROM tenant_invitations WHERE tenant_id=$1 ORDER BY created_at DESC",[tenantId]));}
  acceptInvitation(claims:Claims,dto:AcceptInvitationDto){
    if(typeof claims.sub!=='string'||!claims.sub.trim())throw new ForbiddenException('A valid Auth0 subject is required.');
    const emailValue=claims.email??claims[EMAIL];
    const verified=claims.email_verified??claims[VERIFIED];
    const nameValue=claims.name??claims[NAME];
    if(typeof emailValue!=='string'||!emailValue.trim()||verified!==true)throw new ForbiddenException('A verified email address is required to accept an invitation.');
    const email=emailValue.trim().toLowerCase();
    const name=typeof nameValue==='string'&&nameValue.trim()?nameValue.trim():email.split('@')[0];
    const tenantId=dto.token.split('.')[0];
    if(!tenantId)throw new BadRequestException('Invalid invitation token.');
    const hash=createHash('sha256').update(dto.token).digest('hex');
    return this.tenantDb.run(tenantId,async m=>{
      const invites=await m.query("SELECT id,email,role FROM tenant_invitations WHERE tenant_id=$1 AND token_hash=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",[tenantId,hash]);
      if(!invites.length)throw new NotFoundException('Invitation is invalid, expired, revoked or already accepted.');
      const invite=invites[0];
      if(String(invite.email).toLowerCase()!==email)throw new ForbiddenException('This invitation was issued to a different email address.');
      let userRows=await m.query('SELECT id,email FROM platform_users WHERE auth0_subject=$1 FOR UPDATE',[claims.sub]);
      let userId:string;
      if(userRows.length){userId=userRows[0].id;if(String(userRows[0].email).toLowerCase()!==email)throw new ForbiddenException('Your Auth0 identity email does not match the invitation.');}
      else{
        const byEmail=await m.query('SELECT id FROM platform_users WHERE lower(email)=$1 LIMIT 1',[email]);
        if(byEmail.length)throw new ConflictException('An account already exists for this email but is not linked to this Auth0 identity. Contact support for secure account linking.');
        userRows=await m.query("INSERT INTO platform_users(email,full_name,status,email_verified_at,auth0_subject) VALUES($1,$2,'active',now(),$3) RETURNING id",[email,name,claims.sub]);userId=userRows[0].id;
      }
      const membership=await m.query('SELECT id,status FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',[tenantId,userId]);
      if(membership.length&&membership[0].status==='active')throw new ConflictException('You are already an active member of this workspace.');
      let result;
      if(membership.length)result=await m.query("UPDATE tenant_memberships SET role=$3,status='active' WHERE tenant_id=$1 AND user_id=$2 RETURNING id,role,status",[tenantId,userId,invite.role]);
      else result=await m.query("INSERT INTO tenant_memberships(tenant_id,user_id,role,status) VALUES($1,$2,$3,'active') RETURNING id,role,status",[tenantId,userId,invite.role]);
      await m.query('UPDATE tenant_invitations SET accepted_by=$3,accepted_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,invite.id,userId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'user.invitation.accepted','tenant_membership',$3,$4::jsonb)",[tenantId,userId,result[0].id,JSON.stringify({email,role:invite.role,invitationId:invite.id})]);
      return {tenantId,membership:result[0],accepted:true};
    });
  }
  updateMembershipRole(tenantId:string,actorId:string,actorRole:string,membershipId:string,role:string){
    if(!ROLES.includes(role))throw new BadRequestException('Unsupported membership role.');
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT id,user_id,role FROM tenant_memberships WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,membershipId]);
      if(!rows.length)throw new NotFoundException('Membership not found.');
      if(actorRole!=='owner'&&(rows[0].role==='owner'||role==='admin'))throw new ForbiddenException('Only the company owner can modify owner or administrator assignments.');
      if(rows[0].role==='owner'&&role!=='owner'){
        const owners=await m.query("SELECT count(*)::int AS count FROM tenant_memberships WHERE tenant_id=$1 AND role='owner' AND status='active'",[tenantId]);
        if(Number(owners[0].count)<=1)throw new ConflictException('Transfer company ownership before demoting the last active owner.');
      }
      if(rows[0].user_id===actorId)throw new BadRequestException('You cannot change your own company role.');
      const updated=await m.query('UPDATE tenant_memberships SET role=$3 WHERE tenant_id=$1 AND id=$2 RETURNING id,role,status',[tenantId,membershipId,role]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'user.membership.role_changed','tenant_membership',$3,$4::jsonb)",[tenantId,actorId,membershipId,JSON.stringify({from:rows[0].role,to:role})]);
      return updated[0];
    });
  }
  suspendMembership(tenantId:string,actorId:string,actorRole:string,membershipId:string){
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT id,user_id,role,status FROM tenant_memberships WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,membershipId]);
      if(!rows.length)throw new NotFoundException('Membership not found.');
      if(rows[0].user_id===actorId)throw new BadRequestException('You cannot suspend your own company membership.');
      if(rows[0].role==='owner'&&actorRole!=='owner')throw new ForbiddenException('Only the owner can suspend an owner membership.');
      if(rows[0].role==='owner'){
        const owners=await m.query("SELECT count(*)::int AS count FROM tenant_memberships WHERE tenant_id=$1 AND role='owner' AND status='active'",[tenantId]);
        if(Number(owners[0].count)<=1)throw new ConflictException('Transfer company ownership before suspending the last active owner.');
      }
      const updated=await m.query("UPDATE tenant_memberships SET status='suspended' WHERE tenant_id=$1 AND id=$2 RETURNING id,role,status",[tenantId,membershipId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'user.membership.suspended','tenant_membership',$3)",[tenantId,actorId,membershipId]);
      return updated[0];
    });
  }
  revokeInvitation(tenantId:string,actorId:string,id:string){return this.tenantDb.run(tenantId,async m=>{const rows=await m.query("UPDATE tenant_invitations SET revoked_at=now() WHERE tenant_id=$1 AND id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id,email",[tenantId,id]);if(!rows.length)throw new NotFoundException('Pending invitation not found.');await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'user.invitation.revoked','tenant_invitation',$3)",[tenantId,actorId,id]);return rows[0];});}
}
