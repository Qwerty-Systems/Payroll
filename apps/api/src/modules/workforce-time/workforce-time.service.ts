import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { EntityManager } from 'typeorm';
import {
  CreateLeaveRequestDto, CreateLeaveTypeDto, UpdateLeaveTypeDto, CreateOvertimeRequestDto, CreateShiftDto,
  ReviewLeaveRequestDto, ReviewOvertimeRequestDto, SetLeaveBalanceDto, UpdateShiftDto,
  CreateTimesheetDto, UpdateTimesheetDto, CreateTimesheetLineDto, UpdateTimesheetLineDto, ReviewTimesheetDto, CreateShiftAssignmentDto, CreateAttendanceCorrectionDto, ReviewAttendanceCorrectionDto,
} from './workforce-time.dto';

@Injectable()
export class WorkforceTimeService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  private validateShift(startTime: string, endTime: string, breakMinutes: number, crossesMidnight?: boolean) {
    const validTime = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
    if (!validTime.test(startTime) || !validTime.test(endTime)) {
      throw new BadRequestException('Shift times must use HH:mm or HH:mm:ss.');
    }
    if (startTime === endTime) throw new BadRequestException('Shift start and end times cannot be identical.');
    const toMinutes = (value: string) => {
      const [h, m] = value.split(':').map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const start = toMinutes(startTime), end = toMinutes(endTime);
    const overnight = end <= start;
    const duration = overnight ? 1440 - start + end : end - start;
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes >= duration) {
      throw new BadRequestException('Break minutes must be non-negative and shorter than the shift duration.');
    }
    if (crossesMidnight !== undefined && crossesMidnight !== overnight) {
      throw new BadRequestException('Crosses-midnight must match the shift start and end times.');
    }
    return overnight;
  }

  listShifts(tenantId: string) {
    return this.tenantDb.run(tenantId, m => m.query(`
      SELECT id,code,name,start_time::text AS "startTime",end_time::text AS "endTime",
        break_minutes AS "breakMinutes",crosses_midnight AS "crossesMidnight",status,
        created_at AS "createdAt",updated_at AS "updatedAt"
      FROM work_shifts WHERE tenant_id=$1 ORDER BY name
    `,[tenantId]));
  }

  createShift(tenantId: string, actorId: string, dto: CreateShiftDto) {
    const crossesMidnight = this.validateShift(dto.startTime, dto.endTime, dto.breakMinutes ?? 0, dto.crossesMidnight);
    return this.tenantDb.run(tenantId, async m => {
      const rows=await m.query(`
        INSERT INTO work_shifts(tenant_id,code,name,start_time,end_time,break_minutes,crosses_midnight)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        RETURNING id,code,name,start_time::text AS "startTime",end_time::text AS "endTime",
          break_minutes AS "breakMinutes",crosses_midnight AS "crossesMidnight",status
      `,[tenantId,dto.code.trim().toUpperCase(),dto.name.trim(),dto.startTime,dto.endTime,dto.breakMinutes??0,crossesMidnight]);
      await this.audit(m,tenantId,actorId,'attendance.shift.created','work_shift',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  updateShift(tenantId: string, actorId: string, id: string, dto: UpdateShiftDto) {
    return this.tenantDb.run(tenantId, async m => {
      const found=await m.query('SELECT * FROM work_shifts WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!found.length) throw new NotFoundException('Shift not found.');
      const before=found[0];
      const startTime=dto.startTime??String(before.start_time).slice(0,8);
      const endTime=dto.endTime??String(before.end_time).slice(0,8);
      const breakMinutes=dto.breakMinutes??before.break_minutes;
      const crossesMidnight=this.validateShift(startTime,endTime,breakMinutes,dto.crossesMidnight);
      const rows=await m.query(`
        UPDATE work_shifts SET name=$3,start_time=$4,end_time=$5,break_minutes=$6,
          crosses_midnight=$7,status=$8,updated_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,code,name,start_time::text AS "startTime",end_time::text AS "endTime",
          break_minutes AS "breakMinutes",crosses_midnight AS "crossesMidnight",status
      `,[tenantId,id,dto.name?.trim()??before.name,startTime,endTime,breakMinutes,
        crossesMidnight,dto.status??before.status]);
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

  updateLeaveType(tenantId: string, actorId: string, id: string, dto: UpdateLeaveTypeDto) {
    return this.tenantDb.run(tenantId, async m => {
      const found = await m.query('SELECT * FROM leave_types WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, id]);
      if (!found.length) throw new NotFoundException('Leave type not found.');
      const before = found[0];
      const rows = await m.query(`
        UPDATE leave_types SET name=$3,annual_entitlement_days=$4,carry_forward_limit_days=$5,
          requires_approval=$6,is_paid=$7,status=$8,updated_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,code,name,annual_entitlement_days AS "annualEntitlementDays",
          carry_forward_limit_days AS "carryForwardLimitDays",requires_approval AS "requiresApproval",
          is_paid AS "isPaid",status
      `, [tenantId,id,dto.name?.trim()??before.name,dto.annualEntitlementDays??before.annual_entitlement_days,
        dto.carryForwardLimitDays??before.carry_forward_limit_days,dto.requiresApproval??before.requires_approval,
        dto.isPaid??before.is_paid,dto.status??before.status]);
      await this.audit(m,tenantId,actorId,'leave.type.updated','leave_type',id,{before,after:rows[0]});
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
        o.reason,o.status,o.requested_by AS "requestedBy",o.review_reason AS "reviewReason",o.reviewed_at AS "reviewedAt"
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

  cancelOvertimeRequest(tenantId: string, actorId: string, id: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT * FROM overtime_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId,id]);
      if (!rows.length) throw new NotFoundException('Overtime request not found.');
      const request = rows[0];
      if (request.requested_by !== actorId) throw new BadRequestException('Only the requester can cancel this overtime request.');
      if (request.status !== 'pending') throw new ConflictException('Only pending overtime requests can be cancelled.');
      const result = await m.query(`UPDATE overtime_requests SET status='cancelled',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status`, [tenantId,id]);
      await this.audit(m,tenantId,actorId,'overtime.request.cancelled','overtime_request',id,{previousStatus:request.status});
      return result[0];
    });
  }

  updateOvertimeRequest(tenantId: string, actorId: string, id: string, dto: CreateOvertimeRequestDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const found=await m.query('SELECT * FROM overtime_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!found.length) throw new NotFoundException('Overtime request not found.');
      const before=found[0];
      if(before.requested_by!==actorId) throw new BadRequestException('Only the original requester can edit this overtime request.');
      if(before.status!=='pending') throw new ConflictException('Only pending overtime requests can be edited.');
      if(dto.workerId!==before.worker_id) throw new BadRequestException('The employee on an overtime request cannot be changed.');
      const worker=await m.query("SELECT id FROM workers WHERE tenant_id=$1 AND id=$2 AND status='active'",[tenantId,before.worker_id]);
      if(!worker.length) throw new NotFoundException('Active worker not found.');
      const rows=await m.query(`
        UPDATE overtime_requests SET project_id=$3,site_id=$4,work_date=$5,
          requested_minutes=$6,reason=$7,updated_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,worker_id AS "workerId",project_id AS "projectId",site_id AS "siteId",
          work_date::text AS "workDate",requested_minutes AS "requestedMinutes",
          approved_minutes AS "approvedMinutes",status,reason
      `,[tenantId,id,dto.projectId??null,dto.siteId??null,dto.workDate,dto.requestedMinutes,dto.reason.trim()]);
      await this.audit(m,tenantId,actorId,'overtime.request.updated','overtime_request',id,{before,after:rows[0]});
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


  listTimesheets(tenantId: string, status?: string, workerId?: string) {
    return this.tenantDb.run(tenantId,m=>m.query(`
      SELECT t.id,t.worker_id AS "workerId",w.worker_number AS "workerNumber",
        concat_ws(' ',w.first_name,w.last_name) AS "workerName",
        t.period_start::text AS "periodStart",t.period_end::text AS "periodEnd",
        t.status,t.notes,t.submitted_at AS "submittedAt",t.reviewed_at AS "reviewedAt",
        t.review_reason AS "reviewReason",count(l.id)::int AS "lineCount",
        COALESCE(sum(l.minutes_worked),0)::int AS "minutesWorked",
        COALESCE(sum(l.overtime_minutes),0)::int AS "overtimeMinutes"
      FROM timesheets t JOIN workers w ON w.tenant_id=t.tenant_id AND w.id=t.worker_id
      LEFT JOIN timesheet_lines l ON l.tenant_id=t.tenant_id AND l.timesheet_id=t.id
      WHERE t.tenant_id=$1 AND ($2::text IS NULL OR t.status=$2)
        AND ($3::uuid IS NULL OR t.worker_id=$3)
      GROUP BY t.id,w.worker_number,w.first_name,w.last_name
      ORDER BY t.period_start DESC,t.created_at DESC
    `,[tenantId,status??null,workerId??null]));
  }

  async getTimesheet(tenantId: string, id: string) {
    return this.tenantDb.run(tenantId,async m=>{
      const headers=await m.query(`
        SELECT id,worker_id AS "workerId",period_start::text AS "periodStart",
          period_end::text AS "periodEnd",status,notes,submitted_at AS "submittedAt",
          reviewed_at AS "reviewedAt",review_reason AS "reviewReason"
        FROM timesheets WHERE tenant_id=$1 AND id=$2
      `,[tenantId,id]);
      if(!headers.length) throw new NotFoundException('Timesheet not found.');
      const lines=await m.query(`
        SELECT id,work_date::text AS "workDate",project_id AS "projectId",site_id AS "siteId",
          minutes_worked AS "minutesWorked",overtime_minutes AS "overtimeMinutes",
          units_completed AS "unitsCompleted",description
        FROM timesheet_lines WHERE tenant_id=$1 AND timesheet_id=$2 ORDER BY work_date,id
      `,[tenantId,id]);
      return {...headers[0],lines};
    });
  }

  createTimesheet(tenantId: string, actorId: string, dto: CreateTimesheetDto) {
    if(dto.periodEnd<dto.periodStart) throw new BadRequestException('Timesheet period end cannot precede its start date.');
    return this.tenantDb.run(tenantId,async m=>{
      const worker=await m.query("SELECT id FROM workers WHERE tenant_id=$1 AND id=$2 AND status='active'",[tenantId,dto.workerId]);
      if(!worker.length) throw new NotFoundException('Active worker not found.');
      const rows=await m.query(`
        INSERT INTO timesheets(tenant_id,worker_id,period_start,period_end,notes)
        VALUES($1,$2,$3,$4,$5)
        RETURNING id,worker_id AS "workerId",period_start::text AS "periodStart",
          period_end::text AS "periodEnd",status,notes
      `,[tenantId,dto.workerId,dto.periodStart,dto.periodEnd,dto.notes??null]);
      await this.audit(m,tenantId,actorId,'timesheet.created','timesheet',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  updateTimesheet(tenantId: string, actorId: string, id: string, dto: UpdateTimesheetDto) {
    return this.tenantDb.run(tenantId, async m => {
      const found = await m.query('SELECT * FROM timesheets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if (!found.length) throw new NotFoundException('Timesheet not found.');
      const before=found[0];
      if (!['draft','rejected'].includes(before.status)) throw new ConflictException('Only draft or rejected timesheets can be edited.');
      const periodStart=dto.periodStart??String(before.period_start).slice(0,10);
      const periodEnd=dto.periodEnd??String(before.period_end).slice(0,10);
      if (periodEnd<periodStart) throw new BadRequestException('Timesheet period end cannot precede its start date.');
      const outOfRange=await m.query('SELECT id FROM timesheet_lines WHERE tenant_id=$1 AND timesheet_id=$2 AND (work_date<$3 OR work_date>$4) LIMIT 1',[tenantId,id,periodStart,periodEnd]);
      if(outOfRange.length) throw new ConflictException('The new period excludes existing timesheet lines. Move or remove those lines first.');
      const updated=await m.query(`
        UPDATE timesheets SET period_start=$3,period_end=$4,notes=$5,updated_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,worker_id AS "workerId",period_start::text AS "periodStart",period_end::text AS "periodEnd",status,notes
      `,[tenantId,id,periodStart,periodEnd,dto.notes===undefined?before.notes:dto.notes]);
      await this.audit(m,tenantId,actorId,'timesheet.updated','timesheet',id,{before,after:updated[0]});
      return updated[0];
    });
  }

  createTimesheetLine(tenantId: string, actorId: string, timesheetId: string, dto: CreateTimesheetLineDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const headers=await m.query('SELECT period_start,period_end,status FROM timesheets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,timesheetId]);
      if(!headers.length) throw new NotFoundException('Timesheet not found.');
      if(!['draft','rejected'].includes(headers[0].status)) throw new ConflictException('Only draft or rejected timesheets can be edited.');
      const from=String(headers[0].period_start).slice(0,10),to=String(headers[0].period_end).slice(0,10);
      if(dto.workDate<from || dto.workDate>to) throw new BadRequestException('Work date is outside the timesheet period.');
      const rows=await m.query(`
        INSERT INTO timesheet_lines(tenant_id,timesheet_id,work_date,project_id,site_id,minutes_worked,overtime_minutes,units_completed,description)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id,work_date::text AS "workDate",project_id AS "projectId",site_id AS "siteId",
          minutes_worked AS "minutesWorked",overtime_minutes AS "overtimeMinutes",
          units_completed AS "unitsCompleted",description
      `,[tenantId,timesheetId,dto.workDate,dto.projectId??null,dto.siteId??null,dto.minutesWorked,dto.overtimeMinutes??0,dto.unitsCompleted??null,dto.description??null]);
      await this.audit(m,tenantId,actorId,'timesheet.line.created','timesheet_line',rows[0].id,{timesheetId,line:rows[0]});
      return rows[0];
    });
  }

  updateTimesheetLine(tenantId: string, actorId: string, timesheetId: string, lineId: string, dto: UpdateTimesheetLineDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const headers=await m.query('SELECT period_start,period_end,status FROM timesheets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,timesheetId]);
      if(!headers.length) throw new NotFoundException('Timesheet not found.');
      if(!['draft','rejected'].includes(headers[0].status)) throw new ConflictException('Only draft or rejected timesheets can be edited.');
      const found=await m.query('SELECT * FROM timesheet_lines WHERE tenant_id=$1 AND timesheet_id=$2 AND id=$3 FOR UPDATE',[tenantId,timesheetId,lineId]);
      if(!found.length) throw new NotFoundException('Timesheet line not found.');
      const before=found[0],workDate=dto.workDate??String(before.work_date).slice(0,10);
      const from=String(headers[0].period_start).slice(0,10),to=String(headers[0].period_end).slice(0,10);
      if(workDate<from || workDate>to) throw new BadRequestException('Work date is outside the timesheet period.');
      const rows=await m.query(`
        UPDATE timesheet_lines SET work_date=$4,project_id=$5,site_id=$6,minutes_worked=$7,
          overtime_minutes=$8,units_completed=$9,description=$10,updated_at=now()
        WHERE tenant_id=$1 AND timesheet_id=$2 AND id=$3
        RETURNING id,work_date::text AS "workDate",project_id AS "projectId",site_id AS "siteId",
          minutes_worked AS "minutesWorked",overtime_minutes AS "overtimeMinutes",
          units_completed AS "unitsCompleted",description
      `,[tenantId,timesheetId,lineId,workDate,dto.projectId===undefined?before.project_id:dto.projectId,
        dto.siteId===undefined?before.site_id:dto.siteId,dto.minutesWorked??before.minutes_worked,
        dto.overtimeMinutes??before.overtime_minutes,dto.unitsCompleted===undefined?before.units_completed:dto.unitsCompleted,
        dto.description===undefined?before.description:dto.description]);
      await this.audit(m,tenantId,actorId,'timesheet.line.updated','timesheet_line',lineId,{before,after:rows[0]});
      return rows[0];
    });
  }

  deleteTimesheetLine(tenantId: string, actorId: string, timesheetId: string, lineId: string) {
    return this.tenantDb.run(tenantId,async m=>{
      const header=await m.query('SELECT status FROM timesheets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,timesheetId]);
      if(!header.length) throw new NotFoundException('Timesheet not found.');
      if(!['draft','rejected'].includes(header[0].status)) throw new ConflictException('Only draft or rejected timesheets can be edited.');
      const rows=await m.query('DELETE FROM timesheet_lines WHERE tenant_id=$1 AND timesheet_id=$2 AND id=$3 RETURNING id',[tenantId,timesheetId,lineId]);
      if(!rows.length) throw new NotFoundException('Timesheet line not found.');
      await this.audit(m,tenantId,actorId,'timesheet.line.deleted','timesheet_line',lineId,{timesheetId});
      return {id:lineId,deleted:true};
    });
  }

  submitTimesheet(tenantId: string, actorId: string, id: string) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT status FROM timesheets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Timesheet not found.');
      if(!['draft','rejected'].includes(rows[0].status)) throw new ConflictException('Only draft or rejected timesheets can be submitted.');
      const count=await m.query('SELECT count(*)::int AS count FROM timesheet_lines WHERE tenant_id=$1 AND timesheet_id=$2',[tenantId,id]);
      if(Number(count[0].count)===0) throw new BadRequestException('Add at least one timesheet line before submitting.');
      const updated=await m.query(`
        UPDATE timesheets SET status='submitted',submitted_by=$3,submitted_at=now(),
          reviewed_by=NULL,reviewed_at=NULL,review_reason=NULL,updated_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING id,status,submitted_at AS "submittedAt"
      `,[tenantId,id,actorId]);
      await this.audit(m,tenantId,actorId,'timesheet.submitted','timesheet',id,{});
      return updated[0];
    });
  }

  reviewTimesheet(tenantId: string, actorId: string, id: string, decision: 'approve'|'reject', dto: ReviewTimesheetDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM timesheets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Timesheet not found.');
      if(rows[0].status!=='submitted') throw new ConflictException('Only submitted timesheets can be reviewed.');
      if(rows[0].submitted_by===actorId) throw new BadRequestException('The submitter cannot review their own timesheet.');
      const updated=await m.query(`
        UPDATE timesheets SET status=$3,reviewed_by=$4,reviewed_at=now(),review_reason=$5,updated_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING id,status,review_reason AS "reviewReason",reviewed_at AS "reviewedAt"
      `,[tenantId,id,decision==='approve'?'approved':'rejected',actorId,dto.reason]);
      await this.audit(m,tenantId,actorId,'timesheet.'+decision,'timesheet',id,{reason:dto.reason});
      return updated[0];
    });
  }

  listShiftAssignments(tenantId: string, from?: string, to?: string, workerId?: string) {
    return this.tenantDb.run(tenantId, m => m.query(`
      SELECT a.id,a.worker_id AS "workerId",w.worker_number AS "workerNumber",
        concat_ws(' ',w.first_name,w.last_name) AS "workerName",
        a.shift_id AS "shiftId",s.code AS "shiftCode",s.name AS "shiftName",
        s.start_time::text AS "startTime",s.end_time::text AS "endTime",
        a.work_date::text AS "workDate",a.notes,a.status,a.assigned_by AS "assignedBy",
        a.created_at AS "createdAt"
      FROM worker_shift_assignments a
      JOIN workers w ON w.tenant_id=a.tenant_id AND w.id=a.worker_id
      JOIN work_shifts s ON s.tenant_id=a.tenant_id AND s.id=a.shift_id
      WHERE a.tenant_id=$1 AND ($2::date IS NULL OR a.work_date >= $2)
        AND ($3::date IS NULL OR a.work_date <= $3)
        AND ($4::uuid IS NULL OR a.worker_id=$4)
      ORDER BY a.work_date,s.start_time,w.worker_number
    `,[tenantId,from??null,to??null,workerId??null]));
  }

  createShiftAssignment(tenantId: string, actorId: string, dto: CreateShiftAssignmentDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const worker=await m.query(`SELECT id FROM workers WHERE tenant_id=$1 AND id=$2 AND status='active'`,[tenantId,dto.workerId]);
      if(!worker.length) throw new NotFoundException('Active worker not found.');
      const shift=await m.query(`SELECT id FROM work_shifts WHERE tenant_id=$1 AND id=$2 AND status='active'`,[tenantId,dto.shiftId]);
      if(!shift.length) throw new NotFoundException('Active shift not found.');
      const overlap=await m.query(`
        SELECT id FROM worker_shift_assignments
        WHERE tenant_id=$1 AND worker_id=$2 AND work_date=$3 AND status='scheduled'
        LIMIT 1
      `,[tenantId,dto.workerId,dto.workDate]);
      if(overlap.length) throw new ConflictException('Worker already has a scheduled shift on this date.');
      const rows=await m.query(`
        INSERT INTO worker_shift_assignments(tenant_id,worker_id,shift_id,work_date,notes,assigned_by)
        VALUES($1,$2,$3,$4,$5,$6)
        RETURNING id,worker_id AS "workerId",shift_id AS "shiftId",work_date::text AS "workDate",notes,status
      `,[tenantId,dto.workerId,dto.shiftId,dto.workDate,dto.notes??null,actorId]);
      await this.audit(m,tenantId,actorId,'attendance.shift.assigned','worker_shift_assignment',rows[0].id,rows[0]);
      return rows[0];
    });
  }

  cancelShiftAssignment(tenantId: string, actorId: string, id: string) {
    return this.tenantDb.run(tenantId,async m=>{
      const found=await m.query('SELECT * FROM worker_shift_assignments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!found.length) throw new NotFoundException('Shift assignment not found.');
      if(found[0].status!=='scheduled') throw new ConflictException('Only scheduled assignments can be cancelled.');
      const rows=await m.query(`UPDATE worker_shift_assignments SET status='cancelled',updated_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING id,status`,[tenantId,id]);
      await this.audit(m,tenantId,actorId,'attendance.shift.assignment.cancelled','worker_shift_assignment',id,{previousStatus:found[0].status});
      return rows[0];
    });
  }

  listAttendanceCorrections(tenantId: string, status?: string, attendanceId?: string) {
    return this.tenantDb.run(tenantId, m => m.query(`
      SELECT c.id,c.attendance_id AS "attendanceId",c.proposed_values AS "proposedValues",
        c.reason,c.status,c.requested_by AS "requestedBy",c.review_reason AS "reviewReason",
        c.reviewed_by AS "reviewedBy",c.created_at AS "createdAt",c.reviewed_at AS "reviewedAt",
        a.worker_id AS "workerId",w.worker_number AS "workerNumber",
        concat_ws(' ',w.first_name,w.last_name) AS "workerName",a.work_date::text AS "workDate",
        a.clock_in AS "clockIn",a.clock_out AS "clockOut",a.minutes_worked AS "minutesWorked"
      FROM attendance_correction_requests c
      JOIN attendance_records a ON a.tenant_id=c.tenant_id AND a.id=c.attendance_id
      JOIN workers w ON w.tenant_id=a.tenant_id AND w.id=a.worker_id
      WHERE c.tenant_id=$1 AND ($2::text IS NULL OR c.status=$2)
        AND ($3::uuid IS NULL OR c.attendance_id=$3)
      ORDER BY c.created_at DESC
    `,[tenantId,status??null,attendanceId??null]));
  }

  createAttendanceCorrection(tenantId: string, actorId: string, attendanceId: string, dto: CreateAttendanceCorrectionDto) {
    const allowed=['clockIn','clockOut','minutesWorked'];
    const keys=Object.keys(dto.proposedValues ?? {});
    if(!keys.length || keys.some(key=>!allowed.includes(key)))
      throw new BadRequestException('Corrections may only include clockIn, clockOut or minutesWorked.');
    if('minutesWorked' in dto.proposedValues && dto.proposedValues.minutesWorked!==null &&
      (!Number.isInteger(dto.proposedValues.minutesWorked) || Number(dto.proposedValues.minutesWorked)<0 || Number(dto.proposedValues.minutesWorked)>1440))
      throw new BadRequestException('minutesWorked must be an integer between 0 and 1440, or null.');
    for(const key of ['clockIn','clockOut']) {
      if(key in dto.proposedValues && dto.proposedValues[key]!==null &&
        (typeof dto.proposedValues[key]!=='string' || !Number.isFinite(Date.parse(String(dto.proposedValues[key])))))
        throw new BadRequestException(key+' must be a valid date-time string or null.');
    }
    const proposed=dto.proposedValues;
    if(proposed.clockIn && proposed.clockOut && Date.parse(String(proposed.clockOut))<Date.parse(String(proposed.clockIn)))
      throw new BadRequestException('Clock-out cannot precede clock-in.');
    return this.tenantDb.run(tenantId,async m=>{
      const record=await m.query('SELECT id,clock_in,clock_out,minutes_worked,status FROM attendance_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,attendanceId]);
      if(!record.length) throw new NotFoundException('Attendance record not found.');
      const pending=await m.query(`SELECT id FROM attendance_correction_requests WHERE tenant_id=$1 AND attendance_id=$2 AND status='pending'`,[tenantId,attendanceId]);
      if(pending.length) throw new ConflictException('An attendance correction is already pending review.');
      const rows=await m.query(`
        INSERT INTO attendance_correction_requests(tenant_id,attendance_id,proposed_values,reason,requested_by)
        VALUES($1,$2,$3::jsonb,$4,$5)
        RETURNING id,attendance_id AS "attendanceId",proposed_values AS "proposedValues",reason,status,created_at AS "createdAt"
      `,[tenantId,attendanceId,JSON.stringify(proposed),dto.reason.trim(),actorId]);
      await this.audit(m,tenantId,actorId,'attendance.correction.requested','attendance_correction_request',rows[0].id,{attendanceId,proposedValues:proposed,reason:dto.reason});
      return rows[0];
    });
  }

  reviewAttendanceCorrection(tenantId: string, actorId: string, id: string, decision: 'approve'|'reject', dto: ReviewAttendanceCorrectionDto) {
    return this.tenantDb.run(tenantId,async m=>{
      const rows=await m.query('SELECT * FROM attendance_correction_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if(!rows.length) throw new NotFoundException('Attendance correction request not found.');
      const request=rows[0];
      if(request.status!=='pending') throw new ConflictException('Only pending attendance corrections can be reviewed.');
      if(request.requested_by===actorId) throw new BadRequestException('The requester cannot review their own attendance correction.');
      if(decision==='approve') {
        const attendance=await m.query('SELECT * FROM attendance_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,request.attendance_id]);
        if(!attendance.length) throw new NotFoundException('Attendance record not found.');
        const p=request.proposed_values as Record<string,unknown>,a=attendance[0];
        const clockIn='clockIn' in p ? p.clockIn : a.clock_in;
        const clockOut='clockOut' in p ? p.clockOut : a.clock_out;
        if(clockIn && clockOut && Date.parse(String(clockOut))<Date.parse(String(clockIn)))
          throw new BadRequestException('Clock-out cannot precede clock-in.');
        if('minutesWorked' in p && p.minutesWorked!==null && (!Number.isInteger(p.minutesWorked) || Number(p.minutesWorked)<0 || Number(p.minutesWorked)>1440))
          throw new BadRequestException('minutesWorked must be a non-negative integer or null.');
        const updates:string[]=[],values:unknown[]=[tenantId,request.attendance_id];
        const mapping:{key:string;column:string}[]=[{key:'clockIn',column:'clock_in'},{key:'clockOut',column:'clock_out'},{key:'minutesWorked',column:'minutes_worked'}];
        for(const item of mapping) {
          if(item.key in p) {
            values.push(p[item.key]);
            updates.push(item.column+'=$'+values.length);
          }
        }
        if(updates.length) await m.query('UPDATE attendance_records SET '+updates.join(',')+',updated_at=now() WHERE tenant_id=$1 AND id=$2',values);
      }
      const updated=await m.query(`
        UPDATE attendance_correction_requests SET status=$3,reviewed_by=$4,review_reason=$5,reviewed_at=now()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id,status,review_reason AS "reviewReason",reviewed_at AS "reviewedAt"
      `,[tenantId,id,decision==='approve'?'approved':'rejected',actorId,dto.reason.trim()]);
      await this.audit(m,tenantId,actorId,'attendance.correction.'+decision,'attendance_correction_request',id,{attendanceId:request.attendance_id,reason:dto.reason,proposedValues:request.proposed_values});
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
