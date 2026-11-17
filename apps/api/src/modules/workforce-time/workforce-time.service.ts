import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { EntityManager } from 'typeorm';
import {
  CreateLeaveRequestDto, CreateLeaveTypeDto, CreateOvertimeRequestDto, CreateShiftDto,
  ReviewLeaveRequestDto, ReviewOvertimeRequestDto, SetLeaveBalanceDto, UpdateShiftDto,
} from './workforce-time.dto';

@Injectable()
export class WorkforceTimeService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  listShifts(tenantId: string) {
    return this.tenantDb.run(tenantId, m => m.query(`
      SELECT id,code,name,start_time::text AS "startTime",end_time::text AS "endTime",
        break_minutes AS "breakMinutes",crosses_midnight AS "crossesMidnight",status,
        created_at AS "createdAt",updated_at AS "updatedAt"
      FROM work_shifts WHERE tenant_id=$1 ORDER BY name
    `,[tenantId]));
  }

  createShift(tenantId: string, actorId: string, dto: CreateShiftDto) {
    if (!/^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$/.test(dto.startTime) ||
        !/^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$/.test(dto.endTime)) {
      throw new BadRequestException('Shift times must use HH:mm or HH:mm:ss.');
    }
    return this.tenantDb.run(tenantId, async m => {
      const rows=await m.query(`
        INSERT INTO work_shifts(tenant_id,code,name,start_time,end_time,break_minutes,crosses_midnight)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        RETURNING id,code,name,start_time::text AS "startTime",end_time::text AS "endTime",
          break_minutes AS "breakMinutes",crosses_midnight AS "crossesMidnight",status
      `,[tenantId,dto.code.trim().toUpperCase(),dto.name.trim(),dto.startTime,dto.endTime,dto.breakMinutes??0,dto.crossesMidnight??false]);
      await this.audit(m,tenantId,actorId,'attendance.shift.created','work_shift',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  updateShift(tenantId: string, actorId: string, id: string, dto: UpdateShiftDto) {
    return this.tenantDb.run(tenantId, async m => {
      const found=await m.query('SELECT * FROM work_shifts WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!found.length) throw new NotFoundException('Shift not found.');
      const before=found[0];
      const startTime=dto.startTime??before.start_time;
      const endTime=dto.endTime??before.end_time;
      if (dto.startTime && !/^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$/.test(dto.startTime)) throw new BadRequestException('Invalid shift start time.');
      if (dto.endTime && !/^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$/.test(dto.endTime)) throw new BadRequestException('Invalid shift end time.');
      const rows=await m.query(`
        UPDATE work_shifts SET name=$3,start_time=$4,end_time=$5,break_minutes=$6,
          crosses_midnight=$7,status=$8,updated_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,code,name,start_time::text AS "startTime",end_time::text AS "endTime",
          break_minutes AS "breakMinutes",crosses_midnight AS "crossesMidnight",status
      `,[tenantId,id,dto.name?.trim()??before.name,startTime,endTime,dto.breakMinutes??before.break_minutes,
        dto.crossesMidnight??before.crosses_midnight,dto.status??before.status]);
      await this.audit(m,tenantId,actorId,'attendance.shift.updated','work_shift',id,{before,after:rows[0]});
      return rows[0];
    });
  }

  listLeaveTypes(tenantId: string) {
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT id,code,name,annual_entitlement_days AS "annualEntitlementDays",
        carry_forward_limit_days AS "carryForwardLimitDays",requires_approval AS "requiresApproval",
        is_paid AS "isPaid",status
      FROM leave_types WHERE tenant_id=$1 ORDER BY name
    `,[tenantId]));
  }

  createLeaveType(tenantId: string, actorId: string, dto: CreateLeaveTypeDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`
        INSERT INTO leave_types(tenant_id,code,name,annual_entitlement_days,carry_forward_limit_days,requires_approval,is_paid)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        RETURNING id,code,name,annual_entitlement_days AS "annualEntitlementDays",
          carry_forward_limit_days AS "carryForwardLimitDays",requires_approval AS "requiresApproval",is_paid AS "isPaid",status
      `,[tenantId,dto.code.trim().toUpperCase(),dto.name.trim(),dto.annualEntitlementDays,dto.carryForwardLimitDays??0,dto.requiresApproval??true,dto.isPaid??true]);
      await this.audit(m,tenantId,actorId,'leave.type.created','leave_type',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  setLeaveBalance(tenantId: string, actorId: string, dto: SetLeaveBalanceDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query(`
        INSERT INTO worker_leave_balances
          (tenant_id,worker_id,leave_type_id,leave_year,opening_days,accrued_days,adjustment_days)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(tenant_id,worker_id,leave_type_id,leave_year)
        DO UPDATE SET opening_days=EXCLUDED.opening_days,accrued_days=EXCLUDED.accrued_days,
          adjustment_days=EXCLUDED.adjustment_days,updated_at=now()
        RETURNING id,worker_id AS "workerId",leave_type_id AS "leaveTypeId",leave_year AS "leaveYear",
          opening_days AS "openingDays",accrued_days AS "accruedDays",adjustment_days AS "adjustmentDays",
          used_days AS "usedDays"
      `,[tenantId,dto.workerId,dto.leaveTypeId,dto.leaveYear,dto.openingDays??0,dto.accruedDays??0,dto.adjustmentDays??0]);
      await this.audit(m,tenantId,actorId,'leave.balance.adjusted','worker_leave_balance',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  listLeaveBalances(tenantId: string, workerId?: string, leaveYear?: number) {
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT b.id,b.worker_id AS "workerId",w.worker_number AS "workerNumber",
        concat_ws(' ',w.first_name,w.last_name) AS "workerName",
        b.leave_type_id AS "leaveTypeId",t.name AS "leaveType",b.leave_year AS "leaveYear",
        b.opening_days AS "openingDays",b.accrued_days AS "accruedDays",
        b.adjustment_days AS "adjustmentDays",b.used_days AS "usedDays",
        COALESCE(p.pending_days,0) AS "pendingDays",
        (b.opening_days+b.accrued_days+b.adjustment_days-b.used_days-COALESCE(p.pending_days,0)) AS "availableDays"
      FROM worker_leave_balances b
      JOIN workers w ON w.tenant_id=b.tenant_id AND w.id=b.worker_id
      JOIN leave_types t ON t.tenant_id=b.tenant_id AND t.id=b.leave_type_id
      LEFT JOIN LATERAL (
        SELECT sum(r.requested_days) AS pending_days FROM leave_requests r
        WHERE r.tenant_id=b.tenant_id AND r.worker_id=b.worker_id
          AND r.leave_type_id=b.leave_type_id AND extract(year from r.start_date)=b.leave_year
          AND r.status='pending'
      ) p ON true
      WHERE b.tenant_id=$1 AND ($2::uuid IS NULL OR b.worker_id=$2)
        AND ($3::int IS NULL OR b.leave_year=$3)
      ORDER BY w.worker_number,t.name,b.leave_year DESC
    `,[tenantId,workerId??null,leaveYear??null]));
  }

  listLeaveRequests(tenantId: string, status?: string) {
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT r.id,r.worker_id AS "workerId",w.worker_number AS "workerNumber",
        concat_ws(' ',w.first_name,w.last_name) AS "workerName",
        r.leave_type_id AS "leaveTypeId",t.name AS "leaveType",
        r.start_date::text AS "startDate",r.end_date::text AS "endDate",
        r.requested_days AS "requestedDays",r.reason,r.status,
        r.requested_by AS "requestedBy",r.reviewed_by AS "reviewedBy",
        r.review_reason AS "reviewReason",r.created_at AS "createdAt",r.reviewed_at AS "reviewedAt"
      FROM leave_requests r JOIN workers w ON w.tenant_id=r.tenant_id AND w.id=r.worker_id
      JOIN leave_types t ON t.tenant_id=r.tenant_id AND t.id=r.leave_type_id
      WHERE r.tenant_id=$1 AND ($2::text IS NULL OR r.status=$2)
      ORDER BY r.start_date DESC,r.created_at DESC
    `,[tenantId,status??null]));
  }

  createLeaveRequest(tenantId: string, actorId: string, dto: CreateLeaveRequestDto) {
    if(dto.endDate<dto.startDate) throw new BadRequestException('Leave end date cannot precede its start date.');
    return this.tenantDb.run(tenantId,async m=>{
      const balance=await m.query(`
        SELECT b.id,b.opening_days+b.accrued_days+b.adjustment_days-b.used_days-
          COALESCE((SELECT sum(r.requested_days) FROM leave_requests r WHERE r.tenant_id=b.tenant_id
            AND r.worker_id=b.worker_id AND r.leave_type_id=b.leave_type_id
            AND extract(year from r.start_date)=b.leave_year AND r.status='pending'),0) AS available
        FROM worker_leave_balances b
        JOIN leave_types t ON t.tenant_id=b.tenant_id AND t.id=b.leave_type_id AND t.status='active'
        WHERE b.tenant_id=$1 AND b.worker_id=$2 AND b.leave_type_id=$3
          AND b.leave_year=extract(year from $4::date)::int FOR UPDATE
      `,[tenantId,dto.workerId,dto.leaveTypeId,dto.startDate]);
      if(!balance.length) throw new ConflictException('No leave balance is configured for this worker, leave type and year.');
      if(Number(balance[0].available)<dto.requestedDays) throw new ConflictException('The requested leave exceeds the available balance.');
      const overlap=await m.query(`
        SELECT id FROM leave_requests WHERE tenant_id=$1 AND worker_id=$2
          AND status IN ('pending','approved') AND daterange(start_date,end_date,'[]') && daterange($3::date,$4::date,'[]')
        LIMIT 1
      `,[tenantId,dto.workerId,dto.startDate,dto.endDate]);
      if(overlap.length) throw new ConflictException('This worker already has a pending or approved leave request overlapping those dates.');
      const rows=await m.query(`
        INSERT INTO leave_requests(tenant_id,worker_id,leave_type_id,start_date,end_date,requested_days,reason,requested_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id,worker_id AS "workerId",leave_type_id AS "leaveTypeId",start_date::text AS "startDate",
          end_date::text AS "endDate",requested_days AS "requestedDays",reason,status,created_at AS "createdAt"
      `,[tenantId,dto.workerId,dto.leaveTypeId,dto.startDate,dto.endDate,dto.requestedDays,dto.reason??null,actorId]);
      await this.audit(m,tenantId,actorId,'leave.request.created','leave_request',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  reviewLeaveRequest(tenantId: string, actorId: string, id: string, decision: 'approve'|'reject', dto: ReviewLeaveRequestDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM leave_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Leave request not found.');
      const request=rows[0];
      if(request.status!=='pending') throw new ConflictException('Only pending leave requests can be reviewed.');
      if(request.requested_by===actorId) throw new BadRequestException('A requester cannot approve or reject their own leave request.');
      if(decision==='approve'){
        const balance=await m.query(`
          SELECT id,opening_days+accrued_days+adjustment_days-used_days AS available
          FROM worker_leave_balances WHERE tenant_id=$1 AND worker_id=$2 AND leave_type_id=$3
            AND leave_year=extract(year from $4::date)::int FOR UPDATE
        `,[tenantId,request.worker_id,request.leave_type_id,request.start_date]);
        if(!balance.length || Number(balance[0].available)<Number(request.requested_days))
          throw new ConflictException('The available leave balance changed; update the balance before approval.');
        await m.query('UPDATE worker_leave_balances SET used_days=used_days+$2,updated_at=now() WHERE tenant_id=$1 AND id=$3',[tenantId,request.requested_days,balance[0].id]);
      }
      const updated=await m.query(`
        UPDATE leave_requests SET status=$3,reviewed_by=$4,review_reason=$5,reviewed_at=now(),updated_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING id,status,review_reason AS "reviewReason",reviewed_at AS "reviewedAt"
      `,[tenantId,id,decision==='approve'?'approved':'rejected',actorId,dto.reason]);
      await this.audit(m,tenantId,actorId,'leave.request.'+decision,'leave_request',id,{reason:dto.reason});
      return updated[0];
    });
  }

  cancelLeaveRequest(tenantId: string, actorId: string, id: string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM leave_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Leave request not found.');
      if(rows[0].status!=='pending' || rows[0].requested_by!==actorId)
        throw new ConflictException('Only the requester can cancel their own pending leave request.');
      const updated=await m.query(`UPDATE leave_requests SET status='cancelled',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status`,[tenantId,id]);
      await this.audit(m,tenantId,actorId,'leave.request.cancelled','leave_request',id,{});
      return updated[0];
    });
  }

  listOvertimeRequests(tenantId: string, status?: string) {
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT o.id,o.worker_id AS "workerId",w.worker_number AS "workerNumber",
        concat_ws(' ',w.first_name,w.last_name) AS "workerName",
        o.project_id AS "projectId",o.site_id AS "siteId",o.work_date::text AS "workDate",
        o.requested_minutes AS "requestedMinutes",o.approved_minutes AS "approvedMinutes",
        o.reason,o.status,o.review_reason AS "reviewReason",o.reviewed_at AS "reviewedAt"
      FROM overtime_requests o JOIN workers w ON w.tenant_id=o.tenant_id AND w.id=o.worker_id
      WHERE o.tenant_id=$1 AND ($2::text IS NULL OR o.status=$2)
      ORDER BY o.work_date DESC,o.created_at DESC
    `,[tenantId,status??null]));
  }

  createOvertimeRequest(tenantId: string, actorId: string, dto: CreateOvertimeRequestDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const worker=await m.query("SELECT id FROM workers WHERE tenant_id=$1 AND id=$2 AND status='active'",[tenantId,dto.workerId]);
      if(!worker.length) throw new NotFoundException('Active worker not found.');
      const rows=await m.query(`
        INSERT INTO overtime_requests(tenant_id,worker_id,project_id,site_id,work_date,requested_minutes,reason,requested_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id,worker_id AS "workerId",project_id AS "projectId",site_id AS "siteId",
          work_date::text AS "workDate",requested_minutes AS "requestedMinutes",status,reason
      `,[tenantId,dto.workerId,dto.projectId??null,dto.siteId??null,dto.workDate,dto.requestedMinutes,dto.reason,actorId]);
      await this.audit(m,tenantId,actorId,'overtime.request.created','overtime_request',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  reviewOvertimeRequest(tenantId: string, actorId: string, id: string, decision: 'approve'|'reject', dto: ReviewOvertimeRequestDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM overtime_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Overtime request not found.');
      const request=rows[0];
      if(request.status!=='pending') throw new ConflictException('Only pending overtime requests can be reviewed.');
      if(request.requested_by===actorId) throw new BadRequestException('A requester cannot review their own overtime request.');
      const approvedMinutes=decision==='approve'?(dto.approvedMinutes??request.requested_minutes):null;
      if(decision==='approve' && (approvedMinutes<0 || approvedMinutes>request.requested_minutes))
        throw new BadRequestException('Approved overtime minutes must be between zero and the requested minutes.');
      const updated=await m.query(`
        UPDATE overtime_requests SET status=$3,approved_minutes=$4,reviewed_by=$5,
          review_reason=$6,reviewed_at=now(),updated_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING id,status,approved_minutes AS "approvedMinutes",
          review_reason AS "reviewReason",reviewed_at AS "reviewedAt"
      `,[tenantId,id,decision==='approve'?'approved':'rejected',approvedMinutes,actorId,dto.reason]);
      await this.audit(m,tenantId,actorId,'overtime.request.'+decision,'overtime_request',id,{approvedMinutes,reason:dto.reason});
      return updated[0];
    });
  }

  private audit(m: EntityManager, tenantId: string,
    actorId: string, action: string, entityType: string, entityId: string, metadata: unknown) {
    return m.query(`
      INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,$4,$5,$6::jsonb)
    `,[tenantId,actorId,action,entityType,entityId,JSON.stringify(metadata)]);
  }
}
