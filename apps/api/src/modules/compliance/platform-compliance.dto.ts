import { IsString, Length } from 'class-validator';
export class ApproveStatutoryRuleSetDto {
  @IsString() @Length(10,2000) reason!:string;
}
