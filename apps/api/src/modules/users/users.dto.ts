import { IsEmail, IsIn, IsString, IsUUID, Length } from 'class-validator';
export class CreateInvitationDto { @IsEmail() email!:string; @IsIn(['admin','hr_manager','payroll_manager','supervisor','worker','accountant','viewer']) role!:string; }
export class AcceptInvitationDto { @IsString() @Length(70,120) token!:string; }
export class UpdateMembershipRoleDto { @IsIn(['admin','hr_manager','payroll_manager','supervisor','worker','accountant','viewer']) role!:string; }
export class MembershipIdDto { @IsUUID() membershipId!:string; }
