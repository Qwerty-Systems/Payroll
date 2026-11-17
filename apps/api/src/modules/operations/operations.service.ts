import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { CreateAttendanceDto, CreateProjectDto, CreateSiteDto, CreateWorkerDto, CreateWorkerContractDto, CreateWorkerOutputDto, CreatePayGradeDto, CreateShiftDto, AssignShiftDto, CreateLeaveRequestDto, SetLeaveEntitlementDto, CreateOvertimeRequestDto, CreateTimesheetDto } from './operations.dto';

@Injectable()
export class OperationsService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  listProjects(tenantId: string) { return this.tenantDb.run(tenantId, (m) => m.query('SELECT id, project_code AS "projectCode", name, client_name AS "clientName", status, start_date AS "startDate", end_date AS "endDate", created_at AS "createdAt" FROM projects WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId])); }
  createProject(tenantId: string, dto: CreateProjectDto) { return this.tenantDb.run(tenantId, async (m) => { const rows = await m.query('INSERT INTO projects (tenant_id, project_code, name, client_name, status, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, project_code AS "projectCode", name, client_name AS "clientName", status, start_date AS "startDate", end_date AS "endDate"', [tenantId,dto.projectCode.trim(),dto.name.trim(),dto.clientName?.trim() ?? null,dto.status ?? 'planning',dto.startDate ?? null,dto.endDate ?? null]); return rows[0]; }); }
  async updateProject(tenantId: string, id: string, status: string) { if (!['planning','active','on_hold','completed','cancelled'].includes(status)) throw new BadRequestException('Invalid project status.'); return this.tenantDb.run(tenantId, async (m) => { const rows = await m.query('UPDATE projects SET status=$3, updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id, project_code AS "projectCode", name, status', [tenantId,id,status]); if (!rows.length) throw new NotFoundException('Project not found.'); return rows[0]; }); }
  listSites(tenantId: string, projectId?: string) { return this.tenantDb.run(tenantId, (m) => m.query('SELECT id, project_id AS "projectId", site_code AS "siteCode", name, address, status, created_at AS "createdAt" FROM sites WHERE tenant_id=$1 AND ($2::uuid IS NULL OR project_id=$2) ORDER BY created_at DESC', [tenantId,projectId ?? null])); }
  createSite(tenantId: string, dto: CreateSiteDto) { return this.tenantDb.run(tenantId, async (m) => { const rows = await m.query('INSERT INTO sites (tenant_id,project_id,site_code,name,address) VALUES ($1,$2,$3,$4,$5) RETURNING id,project_id AS "projectId",site_code AS "siteCode",name,address,status', [tenantId,dto.projectId,dto.siteCode.trim(),dto.name.trim(),dto.address ?? null]); return rows[0]; }); }
  listWorkers(tenantId: string) { return this.tenantDb.run(tenantId, (m) => m.query('SELECT id, worker_number AS "workerNumber", first_name AS "firstName", middle_name AS "middleName", last_name AS "lastName", phone, email, status, created_at AS "createdAt" FROM workers WHERE tenant_id=$1 AND status <> \'archived\' ORDER BY created_at DESC', [tenantId])); }
  createWorker(tenantId: string, dto: CreateWorkerDto) { return this.tenantDb.run(tenantId, async (m) => { const rows = await m.query('INSERT INTO workers (tenant_id,worker_number,first_name,middle_name,last_name,phone,email) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,worker_number AS "workerNumber",first_name AS "firstName",middle_name AS "middleName",last_name AS "lastName",phone,email,status', [tenantId,dto.workerNumber.trim(),dto.firstName.trim(),dto.middleName?.trim() ?? null,dto.lastName.trim(),dto.phone ?? null,dto.email?.toLowerCase() ?? null]); return rows[0]; }); }
  async setWorkerStatus(tenantId: string, id: string, status: string) { if (!['active','inactive','suspended','archived'].includes(status)) throw new BadRequestException('Invalid worker status.'); return this.tenantDb.run(tenantId, async (m) => { const rows = await m.query('UPDATE workers SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,worker_number AS "workerNumber",status', [tenantId,id,status]); if (!rows.length) throw new NotFoundException('Worker not found.'); return rows[0]; }); }
  listAttendance(tenantId: string, workDate?: string) { return this.tenantDb.run(tenantId, (m) => m.query('SELECT id,worker_id AS "workerId",project_id AS "projectId",site_id AS "siteId",work_date AS "workDate",clock_in AS "clockIn",clock_out AS "clockOut",minutes_worked AS "minutesWorked",source,status,created_at AS "createdAt" FROM attendance_records WHERE tenant_id=$1 AND ($2::date IS NULL OR work_date=$2::date) ORDER BY work_date DESC,created_at DESC LIMIT 500', [tenantId,workDate ?? null])); }
  createAttendance(tenantId: string, actorId: string, dto: CreateAttendanceDto) { return this.tenantDb.run(tenantId, async (m) => { if (dto.clockIn && dto.clockOut && new Date(dto.clockOut) < new Date(dto.clockIn)) throw new BadRequestException('Clock-out must be after clock-in.'); const rows = await m.query('INSERT INTO attendance_records (tenant_id,worker_id,project_id,site_id,work_date,clock_in,clock_out,minutes_worked,source,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,worker_id AS "workerId",project_id AS "projectId",site_id AS "siteId",work_date AS "workDate",clock_in AS "clockIn",clock_out AS "clockOut",minutes_worked AS "minutesWorked",source,status', [tenantId,dto.workerId,dto.projectId,dto.siteId,dto.workDate,dto.clockIn ?? null,dto.clockOut ?? null,dto.minutesWorked ?? null,dto.source ?? 'web',actorId]); await m.query("INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'attendance.created','attendance',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({workDate:dto.workDate,source:dto.source ?? 'web'})]); return rows[0]; }); }
  async transitionAttendance(tenantId: string, actorId: string, id: string, action: 'submit'|'approve'|'reject', reason?: string) { return this.tenantDb.run(tenantId, async (m) => { const current = await m.query('SELECT id,created_by,status FROM attendance_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]); if (!current.length) throw new NotFoundException('Attendance record not found.'); const record = current[0] as { id:string; created_by:string|null; status:string }; const target = action === 'submit' ? 'submitted' : action === 'approve' ? 'approved' : 'rejected'; const allowed = action === 'submit' ? ['draft'] : ['submitted']; if (!allowed.includes(record.status)) throw new BadRequestException('Attendance record is not in a state that permits this transition.'); if (action === 'approve' && record.created_by === actorId) throw new BadRequestException('Separation of duties: the person who created attendance cannot approve it.'); if (action === 'reject' && (!reason || reason.trim().length < 3)) throw new BadRequestException('A rejection reason of at least three characters is required.'); const field = action === 'submit' ? 'submitted_by' : action === 'approve' ? 'approved_by' : 'rejected_by'; const rows = await m.query('UPDATE attendance_records SET status=$3,'+field+'=$4,rejection_reason=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status',[tenantId,id,target,actorId,action === 'reject' ? reason!.trim() : null]); await m.query('INSERT INTO audit_events (tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,\'attendance\',$4,$5::jsonb)',[tenantId,actorId,'attendance.'+action,id,JSON.stringify({from:record.status,to:target,reason:action === 'reject' ? reason!.trim() : undefined})]); return rows[0]; }); }

  listWorkerContracts(tenantId: string, workerId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const worker = await m.query('SELECT id FROM workers WHERE tenant_id=$1 AND id=$2', [tenantId, workerId]);
      if (!worker.length) throw new NotFoundException('Worker not found.');
      return m.query('SELECT id,engagement_type AS "engagementType",pay_basis AS "payBasis",rate_amount AS "rateAmount",currency,pay_grade_id AS "payGradeId",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",terms,created_at AS "createdAt" FROM worker_contracts WHERE tenant_id=$1 AND worker_id=$2 ORDER BY effective_from DESC,created_at DESC', [tenantId, workerId]);
    });
  }

  listPayGrades(tenantId: string) {
    return this.tenantDb.run(tenantId, m => m.query(
      'SELECT id,code,name,description,currency,pay_basis AS "payBasis",minimum_rate AS "minimumRate",midpoint_rate AS "midpointRate",maximum_rate AS "maximumRate",status,created_at AS "createdAt" FROM worker_pay_grades WHERE tenant_id=$1 ORDER BY code',
      [tenantId],
    ));
  }

  createPayGrade(tenantId: string, actorId: string, dto: CreatePayGradeDto) {
    const currency=(dto.currency ?? 'KES').toUpperCase();
    if(!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter ISO code.');
    if(dto.minimumRate != null && dto.midpointRate != null && dto.minimumRate > dto.midpointRate) throw new BadRequestException('Minimum rate cannot exceed midpoint rate.');
    if(dto.midpointRate != null && dto.maximumRate != null && dto.midpointRate > dto.maximumRate) throw new BadRequestException('Midpoint rate cannot exceed maximum rate.');
    if(dto.minimumRate != null && dto.maximumRate != null && dto.minimumRate > dto.maximumRate) throw new BadRequestException('Minimum rate cannot exceed maximum rate.');
    return this.tenantDb.run(tenantId, async m => {
      const rows=await m.query(
        'INSERT INTO worker_pay_grades(tenant_id,code,name,description,currency,pay_basis,minimum_rate,midpoint_rate,maximum_rate,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,code,name,description,currency,pay_basis AS "payBasis",minimum_rate AS "minimumRate",midpoint_rate AS "midpointRate",maximum_rate AS "maximumRate",status',
        [tenantId,dto.code.trim().toUpperCase(),dto.name.trim(),dto.description?.trim() ?? null,currency,dto.payBasis,dto.minimumRate ?? null,dto.midpointRate ?? null,dto.maximumRate ?? null,actorId],
      );
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.pay_grade.created','worker_pay_grade',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({code:rows[0].code,payBasis:dto.payBasis})]);
      return rows[0];
    });
  }

  setPayGradeStatus(tenantId: string, id: string, status: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows=await m.query('UPDATE worker_pay_grades SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,code,name,status',[tenantId,id,status]);
      if(!rows.length) throw new NotFoundException('Pay grade not found.');
      return rows[0];
    });
  }

  createWorkerContract(tenantId: string, actorId: string, workerId: string, dto: CreateWorkerContractDto) {
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
      throw new BadRequestException('Contract end date must not precede its start date.');
    }
    const currency = (dto.currency ?? 'KES').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter ISO code.');
    return this.tenantDb.run(tenantId, async m => {
      // Lock the worker row so concurrent contract creation requests cannot
      // both pass the effective-date overlap check.
      const workers = await m.query('SELECT id,status FROM workers WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId, workerId]);
      if (!workers.length) throw new NotFoundException('Worker not found.');
      if (workers[0].status === 'archived') throw new ConflictException('Archived workers cannot receive new contracts.');
      const overlaps = await m.query(
        "SELECT id FROM worker_contracts WHERE tenant_id=$1 AND worker_id=$2 AND effective_from <= COALESCE($4::date,'infinity'::date) AND COALESCE(effective_to,'infinity'::date) >= $3::date LIMIT 1",
        [tenantId, workerId, dto.effectiveFrom, dto.effectiveTo ?? null],
      );
      if (overlaps.length) throw new ConflictException('This contract overlaps an existing contract. End the previous contract before adding a new effective-dated contract.');
      if (dto.payGradeId) {
        const grades=await m.query('SELECT id,pay_basis,minimum_rate,maximum_rate,status FROM worker_pay_grades WHERE tenant_id=$1 AND id=$2',[tenantId,dto.payGradeId]);
        if(!grades.length) throw new NotFoundException('Pay grade not found.');
        const grade=grades[0];
        if(grade.status!=='active') throw new ConflictException('Inactive pay grades cannot be assigned to new contracts.');
        if(grade.pay_basis!==dto.payBasis) throw new BadRequestException('Contract pay basis must match the selected pay grade.');
        if(grade.minimum_rate!=null && dto.rateAmount < Number(grade.minimum_rate)) throw new BadRequestException('Contract rate is below the pay grade minimum.');
        if(grade.maximum_rate!=null && dto.rateAmount > Number(grade.maximum_rate)) throw new BadRequestException('Contract rate exceeds the pay grade maximum.');
      }
      const rows = await m.query(
        'INSERT INTO worker_contracts(tenant_id,worker_id,engagement_type,pay_basis,rate_amount,currency,pay_grade_id,effective_from,effective_to,terms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING id,worker_id AS "workerId",engagement_type AS "engagementType",pay_basis AS "payBasis",rate_amount AS "rateAmount",currency,pay_grade_id AS "payGradeId",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",terms,created_at AS "createdAt"',
        [tenantId,workerId,dto.engagementType,dto.payBasis,dto.rateAmount,currency,dto.payGradeId ?? null,dto.effectiveFrom,dto.effectiveTo ?? null,JSON.stringify(dto.terms ?? {})],
      );
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.contract.created','worker_contract',$3,$4::jsonb)", [tenantId,actorId,rows[0].id,JSON.stringify({workerId,effectiveFrom:dto.effectiveFrom,effectiveTo:dto.effectiveTo ?? null,payBasis:dto.payBasis,engagementType:dto.engagementType})]);
      return rows[0];
    });
  }

  endWorkerContract(tenantId: string, actorId: string, workerId: string, contractId: string, effectiveTo: string) {
    return this.tenantDb.run(tenantId, async m => {
      const workers = await m.query('SELECT id FROM workers WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [tenantId,workerId]);
      if (!workers.length) throw new NotFoundException('Worker not found.');
      const contracts = await m.query('SELECT id,effective_from,effective_to FROM worker_contracts WHERE tenant_id=$1 AND worker_id=$2 AND id=$3 FOR UPDATE', [tenantId,workerId,contractId]);
      if (!contracts.length) throw new NotFoundException('Worker contract not found.');
      const contract = contracts[0];
      if (effectiveTo < String(contract.effective_from).slice(0,10)) throw new BadRequestException('Contract end date must not precede its start date.');
      if (contract.effective_to && effectiveTo > String(contract.effective_to).slice(0,10)) throw new ConflictException('An ended contract cannot be extended. Create a new contract version instead.');
      const overlaps = await m.query(
        "SELECT id FROM worker_contracts WHERE tenant_id=$1 AND worker_id=$2 AND id<>$3 AND effective_from <= $4::date AND COALESCE(effective_to,'infinity'::date) >= $5::date LIMIT 1",
        [tenantId,workerId,contractId,effectiveTo,contract.effective_from],
      );
      if (overlaps.length) throw new ConflictException('The requested end date would overlap another contract.');
      const rows = await m.query('UPDATE worker_contracts SET effective_to=$4 WHERE tenant_id=$1 AND worker_id=$2 AND id=$3 RETURNING id,effective_to AS "effectiveTo"', [tenantId,workerId,contractId,effectiveTo]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.contract.ended','worker_contract',$3,$4::jsonb)", [tenantId,actorId,contractId,JSON.stringify({workerId,effectiveTo})]);
      return rows[0];
    });
  }


  listWorkerOutputs(tenantId: string, workerId?: string) {
    return this.tenantDb.run(tenantId, m => m.query(
      'SELECT id,worker_id AS "workerId",work_date AS "workDate",unit_code AS "unitCode",quantity,description,project_id AS "projectId",site_id AS "siteId",status,rejection_reason AS "rejectionReason",created_at AS "createdAt" FROM worker_output_entries WHERE tenant_id=$1 AND ($2::uuid IS NULL OR worker_id=$2) ORDER BY work_date DESC,created_at DESC LIMIT 1000',
      [tenantId,workerId ?? null],
    ));
  }

  createWorkerOutput(tenantId: string, actorId: string, dto: CreateWorkerOutputDto) {
    return this.tenantDb.run(tenantId, async m => {
      const workers = await m.query("SELECT id,status FROM workers WHERE tenant_id=$1 AND id=$2", [tenantId,dto.workerId]);
      if (!workers.length) throw new NotFoundException('Worker not found.');
      if (workers[0].status !== 'active') throw new ConflictException('Only active workers can submit output for payment.');
      const contracts = await m.query(
        "SELECT id,engagement_type,pay_basis,terms FROM worker_contracts WHERE tenant_id=$1 AND worker_id=$2 AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date)",
        [tenantId,dto.workerId,dto.workDate],
      );
      if (contracts.length !== 1) throw new ConflictException('Exactly one active contract must cover the output date.');
      if (contracts[0].pay_basis !== 'per_unit') throw new BadRequestException('Approved output entries are only valid for per-unit contracts.');
      const configuredUnits = (contracts[0].terms?.unitCodes ?? []) as unknown;
      if (!Array.isArray(configuredUnits) || !configuredUnits.includes(dto.unitCode)) {
        throw new BadRequestException('The unit code must be configured in the worker contract terms before output can be recorded.');
      }
      const rows = await m.query(
        'INSERT INTO worker_output_entries(tenant_id,worker_id,work_date,unit_code,quantity,description,project_id,site_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,worker_id AS "workerId",work_date AS "workDate",unit_code AS "unitCode",quantity,description,project_id AS "projectId",site_id AS "siteId",status',
        [tenantId,dto.workerId,dto.workDate,dto.unitCode,dto.quantity,dto.description?.trim() ?? null,dto.projectId ?? null,dto.siteId ?? null,actorId],
      );
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.output.created','worker_output',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({workerId:dto.workerId,workDate:dto.workDate,unitCode:dto.unitCode,quantity:dto.quantity})]);
      return rows[0];
    });
  }

  transitionWorkerOutput(tenantId: string, actorId: string, id: string, action: 'submit'|'approve'|'reject', reason?: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT id,worker_id,created_by,status FROM worker_output_entries WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);
      if (!rows.length) throw new NotFoundException('Worker output entry not found.');
      const current = rows[0];
      const allowed = action === 'submit' ? ['draft','rejected'] : ['submitted'];
      if (!allowed.includes(current.status)) throw new ConflictException('Worker output entry is not in a state that permits this transition.');
      if (action === 'approve' && current.created_by === actorId) throw new BadRequestException('Separation of duties: the person who recorded output cannot approve it.');
      if (action === 'reject' && (!reason || reason.trim().length < 3)) throw new BadRequestException('A rejection reason of at least three characters is required.');
      const target = action === 'submit' ? 'submitted' : action === 'approve' ? 'approved' : 'rejected';
      const update = action === 'submit'
        ? await m.query("UPDATE worker_output_entries SET status=$3,submitted_by=$4,rejection_reason=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status",[tenantId,id,target,actorId])
        : action === 'approve'
          ? await m.query("UPDATE worker_output_entries SET status=$3,approved_by=$4,approved_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status",[tenantId,id,target,actorId])
          : await m.query("UPDATE worker_output_entries SET status=$3,rejection_reason=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status",[tenantId,id,target,reason!.trim()]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'worker_output',$4,$5::jsonb)",[tenantId,actorId,'worker.output.'+action,id,JSON.stringify({from:current.status,to:target,reason:action==='reject'?reason!.trim():undefined})]);
      return update[0];
    });
  }


  async listAttendanceCorrections(tenantId: string, attendanceId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const record = await m.query('SELECT id FROM attendance_records WHERE tenant_id=$1 AND id=$2', [tenantId, attendanceId]);
      if (!record.length) throw new NotFoundException('Attendance record not found.');
      return m.query(`SELECT id,attendance_id AS "attendanceId",proposed_values AS "proposedValues",reason,status,
        requested_by AS "requestedBy",reviewed_by AS "reviewedBy",review_reason AS "reviewReason",
        created_at AS "createdAt",reviewed_at AS "reviewedAt"
        FROM attendance_correction_requests WHERE tenant_id=$1 AND attendance_id=$2 ORDER BY created_at DESC`,
        [tenantId, attendanceId]);
    });
  }

  async requestAttendanceCorrection(tenantId: string, actorId: string, attendanceId: string,
    input: { clockIn?: string; clockOut?: string; minutesWorked?: number; reason: string }) {
    const proposedValues: Record<string, string | number> = {};
    if (input.clockIn !== undefined) proposedValues.clockIn = input.clockIn;
    if (input.clockOut !== undefined) proposedValues.clockOut = input.clockOut;
    if (input.minutesWorked !== undefined) proposedValues.minutesWorked = input.minutesWorked;
    if (!Object.keys(proposedValues).length) throw new BadRequestException('Provide at least one attendance field to correct.');
    if (!input.reason?.trim() || input.reason.trim().length < 5) throw new BadRequestException('A correction reason of at least five characters is required.');
    if (input.clockIn && input.clockOut && new Date(input.clockOut) <= new Date(input.clockIn)) {
      throw new BadRequestException('Clock-out must be after clock-in.');
    }
    return this.tenantDb.run(tenantId, async m => {
      const records = await m.query('SELECT id,status,created_by,clock_in,clock_out FROM attendance_records WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [tenantId, attendanceId]);
      if (!records.length) throw new NotFoundException('Attendance record not found.');
      if (records[0].status !== 'approved') throw new ConflictException('Corrections can only be requested for approved attendance records.');
      const proposedClockIn = input.clockIn ? new Date(input.clockIn) : (records[0].clock_in ? new Date(records[0].clock_in) : null);
      const proposedClockOut = input.clockOut ? new Date(input.clockOut) : (records[0].clock_out ? new Date(records[0].clock_out) : null);
      if (proposedClockIn && proposedClockOut && proposedClockOut <= proposedClockIn) {
        throw new BadRequestException('The corrected clock-out must be after the effective clock-in.');
      }
      const pending = await m.query("SELECT id FROM attendance_correction_requests WHERE tenant_id=$1 AND attendance_id=$2 AND status='pending' LIMIT 1",
        [tenantId, attendanceId]);
      if (pending.length) throw new ConflictException('A correction request is already pending for this attendance record.');
      const rows = await m.query(`INSERT INTO attendance_correction_requests
        (tenant_id,attendance_id,proposed_values,reason,requested_by)
        VALUES($1,$2,$3::jsonb,$4,$5)
        RETURNING id,attendance_id AS "attendanceId",proposed_values AS "proposedValues",reason,status,created_at AS "createdAt"`,
        [tenantId, attendanceId, JSON.stringify(proposedValues), input.reason.trim(), actorId]);
      await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'attendance.correction.requested','attendance_correction',$3,$4::jsonb)",
        [tenantId, actorId, rows[0].id, JSON.stringify({attendanceId, proposedValues, reason:input.reason.trim()})]);
      return rows[0];
    });
  }

  async reviewAttendanceCorrection(tenantId: string, actorId: string, correctionId: string,
    action: 'approve' | 'reject', reason: string) {
    return this.tenantDb.run(tenantId, async m => {
      const rows = await m.query(`SELECT c.id,c.attendance_id,c.proposed_values,c.reason,c.status,c.requested_by,
        a.status AS attendance_status FROM attendance_correction_requests c
        JOIN attendance_records a ON a.tenant_id=c.tenant_id AND a.id=c.attendance_id
        WHERE c.tenant_id=$1 AND c.id=$2 FOR UPDATE OF c,a`, [tenantId, correctionId]);
      if (!rows.length) throw new NotFoundException('Attendance correction request not found.');
      const correction = rows[0];
      if (correction.status !== 'pending') throw new ConflictException('This correction request has already been reviewed.');
      if (correction.requested_by === actorId) throw new BadRequestException('Separation of duties: the requester cannot review their own correction.');
      if (correction.attendance_status !== 'approved') throw new ConflictException('The source attendance record is no longer approved.');
      if (!reason.trim()) throw new BadRequestException('A review reason is required.');
      if (action === 'approve') {
        const values = correction.proposed_values as Record<string, unknown>;
        await m.query(`UPDATE attendance_records SET
          clock_in=CASE WHEN $3::jsonb ? 'clockIn' THEN ($3::jsonb->>'clockIn')::timestamptz ELSE clock_in END,
          clock_out=CASE WHEN $3::jsonb ? 'clockOut' THEN ($3::jsonb->>'clockOut')::timestamptz ELSE clock_out END,
          minutes_worked=CASE WHEN $3::jsonb ? 'minutesWorked' THEN ($3::jsonb->>'minutesWorked')::integer ELSE minutes_worked END,
          updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [tenantId, correction.attendance_id, JSON.stringify(values)]);
      }
      const status = action === 'approve' ? 'approved' : 'rejected';
      const updated = await m.query(`UPDATE attendance_correction_requests SET status=$3,reviewed_by=$4,
        review_reason=$5,reviewed_at=now() WHERE tenant_id=$1 AND id=$2
        RETURNING id,status,review_reason AS "reviewReason",reviewed_at AS "reviewedAt"`,
        [tenantId, correctionId, status, actorId, reason.trim()]);
      await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'attendance_correction\',$4,$5::jsonb)',
        [tenantId, actorId, 'attendance.correction.'+action, correctionId,
          JSON.stringify({attendanceId:correction.attendance_id, reason:reason.trim()})]);
      return updated[0];
    });
  }


  listShifts(tenantId:string){return this.tenantDb.run(tenantId,m=>m.query('SELECT id,code,name,start_time AS "startTime",end_time AS "endTime",break_minutes AS "breakMinutes",grace_minutes AS "graceMinutes",status FROM attendance_shifts WHERE tenant_id=$1 ORDER BY code',[tenantId]));}
  createShift(tenantId:string,actorId:string,dto:CreateShiftDto){
    const valid=(v:string)=>/^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$/.test(v);
    if(!valid(dto.startTime)||!valid(dto.endTime))throw new BadRequestException('Shift times must use 24-hour HH:mm format.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('INSERT INTO attendance_shifts(tenant_id,code,name,start_time,end_time,break_minutes,grace_minutes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,code,name,start_time AS "startTime",end_time AS "endTime",break_minutes AS "breakMinutes",grace_minutes AS "graceMinutes",status',[tenantId,dto.code.trim().toUpperCase(),dto.name.trim(),dto.startTime,dto.endTime,dto.breakMinutes??0,dto.graceMinutes??0,actorId]);await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'attendance.shift.created','attendance_shift',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({code:rows[0].code})]);return rows[0];});
  }
  assignShift(tenantId:string,actorId:string,dto:AssignShiftDto){
    if(dto.effectiveTo&&dto.effectiveTo<dto.effectiveFrom)throw new BadRequestException('Shift assignment end date must not precede its start date.');
    return this.tenantDb.run(tenantId,async m=>{const overlap=await m.query("SELECT id FROM worker_shift_assignments WHERE tenant_id=$1 AND worker_id=$2 AND effective_from<=COALESCE($4::date,'infinity'::date) AND COALESCE(effective_to,'infinity'::date)>=$3::date LIMIT 1",[tenantId,dto.workerId,dto.effectiveFrom,dto.effectiveTo??null]);if(overlap.length)throw new ConflictException('Worker already has a shift assignment during these dates.');const rows=await m.query('INSERT INTO worker_shift_assignments(tenant_id,worker_id,shift_id,effective_from,effective_to,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,worker_id AS "workerId",shift_id AS "shiftId",effective_from AS "effectiveFrom",effective_to AS "effectiveTo"',[tenantId,dto.workerId,dto.shiftId,dto.effectiveFrom,dto.effectiveTo??null,actorId]);return rows[0];});
  }
  setLeaveEntitlement(tenantId:string,actorId:string,dto:SetLeaveEntitlementDto){
    if(dto.effectiveTo&&dto.effectiveTo<dto.effectiveFrom)throw new BadRequestException('Entitlement end date must not precede start date.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('INSERT INTO leave_entitlements(tenant_id,leave_type,annual_days,effective_from,effective_to,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,leave_type AS "leaveType",annual_days AS "annualDays",effective_from AS "effectiveFrom",effective_to AS "effectiveTo"',[tenantId,dto.leaveType,dto.annualDays,dto.effectiveFrom,dto.effectiveTo??null,actorId]);await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'leave.entitlement.created','leave_entitlement',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify(dto)]);return rows[0];});
  }
  listLeaveRequests(tenantId:string){return this.tenantDb.run(tenantId,m=>m.query('SELECT l.id,l.worker_id AS "workerId",w.worker_number AS "workerNumber",l.leave_type AS "leaveType",l.start_date AS "startDate",l.end_date AS "endDate",l.requested_days AS "requestedDays",l.reason,l.status,l.review_reason AS "reviewReason" FROM leave_requests l JOIN workers w ON w.tenant_id=l.tenant_id AND w.id=l.worker_id WHERE l.tenant_id=$1 ORDER BY l.created_at DESC LIMIT 500',[tenantId]));}
  createLeaveRequest(tenantId:string,actorId:string,dto:CreateLeaveRequestDto){
    if(dto.endDate<dto.startDate)throw new BadRequestException('Leave end date must not precede its start date.');
    return this.tenantDb.run(tenantId,async m=>{const overlap=await m.query("SELECT id FROM leave_requests WHERE tenant_id=$1 AND worker_id=$2 AND status IN ('pending','approved') AND daterange(start_date,end_date,'[]') && daterange($3::date,$4::date,'[]') LIMIT 1",[tenantId,dto.workerId,dto.startDate,dto.endDate]);if(overlap.length)throw new ConflictException('This leave request overlaps an existing pending or approved request.');const rows=await m.query('INSERT INTO leave_requests(tenant_id,worker_id,leave_type,start_date,end_date,requested_days,reason,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,worker_id AS "workerId",leave_type AS "leaveType",start_date AS "startDate",end_date AS "endDate",requested_days AS "requestedDays",reason,status',[tenantId,dto.workerId,dto.leaveType,dto.startDate,dto.endDate,dto.requestedDays,dto.reason.trim(),actorId]);await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'leave.requested','leave_request',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({workerId:dto.workerId,leaveType:dto.leaveType,requestedDays:dto.requestedDays})]);return rows[0];});
  }
  leaveBalances(tenantId:string,workerId:string,year:number){
    return this.tenantDb.run(tenantId,async m=>{const worker=await m.query('SELECT id FROM workers WHERE tenant_id=$1 AND id=$2',[tenantId,workerId]);if(!worker.length)throw new NotFoundException('Worker not found.');return m.query(`SELECT e.leave_type AS "leaveType",e.annual_days AS "entitledDays",COALESCE(SUM(l.requested_days) FILTER(WHERE l.status='approved' AND l.start_date>=make_date($3,1,1) AND l.start_date<make_date($3+1,1,1)),0) AS "usedDays",GREATEST(0,e.annual_days-COALESCE(SUM(l.requested_days) FILTER(WHERE l.status='approved' AND l.start_date>=make_date($3,1,1) AND l.start_date<make_date($3+1,1,1)),0)) AS "remainingDays" FROM leave_entitlements e LEFT JOIN leave_requests l ON l.tenant_id=e.tenant_id AND l.worker_id=$2 AND l.leave_type=e.leave_type WHERE e.tenant_id=$1 AND e.effective_from<=make_date($3,12,31) AND (e.effective_to IS NULL OR e.effective_to>=make_date($3,1,1)) GROUP BY e.id ORDER BY e.leave_type`,[tenantId,workerId,year]);});
  }
  reviewLeaveRequest(tenantId:string,actorId:string,id:string,action:'approve'|'reject',reason:string){
    if(!reason?.trim()||reason.trim().length<3)throw new BadRequestException('A review reason is required.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('SELECT id,status,requested_by FROM leave_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);if(!rows.length)throw new NotFoundException('Leave request not found.');if(rows[0].status!=='pending')throw new ConflictException('Leave request is no longer pending.');if(rows[0].requested_by===actorId)throw new BadRequestException('The requester cannot review their own leave request.');const status=action==='approve'?'approved':'rejected';const out=await m.query('UPDATE leave_requests SET status=$3,reviewed_by=$4,review_reason=$5,reviewed_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,review_reason AS "reviewReason"',[tenantId,id,status,actorId,reason.trim()]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'leave_request\',$4,$5::jsonb)',[tenantId,actorId,'leave.'+action,id,JSON.stringify({reason:reason.trim()})]);return out[0];});
  }
  createOvertimeRequest(tenantId:string,actorId:string,dto:CreateOvertimeRequestDto){
    return this.tenantDb.run(tenantId,async m=>{const attendance=await m.query("SELECT id,worker_id,work_date,status FROM attendance_records WHERE tenant_id=$1 AND id=$2",[tenantId,dto.attendanceId]);if(!attendance.length)throw new NotFoundException('Attendance record not found.');if(attendance[0].worker_id!==dto.workerId||attendance[0].status!=='approved')throw new ConflictException('Overtime must reference approved attendance for the same worker.');const rows=await m.query('INSERT INTO overtime_requests(tenant_id,worker_id,attendance_id,work_date,minutes_requested,reason,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,worker_id AS "workerId",attendance_id AS "attendanceId",work_date AS "workDate",minutes_requested AS "minutesRequested",reason,status',[tenantId,dto.workerId,dto.attendanceId,attendance[0].work_date,dto.minutesRequested,dto.reason.trim(),actorId]);await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'overtime.requested','overtime_request',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({workerId:dto.workerId,minutes:dto.minutesRequested})]);return rows[0];});
  }
  listOvertimeRequests(tenantId:string){return this.tenantDb.run(tenantId,m=>m.query('SELECT id,worker_id AS "workerId",attendance_id AS "attendanceId",work_date AS "workDate",minutes_requested AS "minutesRequested",reason,status,review_reason AS "reviewReason" FROM overtime_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500',[tenantId]));}
  reviewOvertimeRequest(tenantId:string,actorId:string,id:string,action:'approve'|'reject',reason:string){
    if(!reason?.trim()||reason.trim().length<3)throw new BadRequestException('A review reason is required.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('SELECT id,status,requested_by FROM overtime_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);if(!rows.length)throw new NotFoundException('Overtime request not found.');if(rows[0].status!=='pending')throw new ConflictException('Overtime request is no longer pending.');if(rows[0].requested_by===actorId)throw new BadRequestException('The requester cannot review their own overtime request.');const status=action==='approve'?'approved':'rejected';const out=await m.query('UPDATE overtime_requests SET status=$3,reviewed_by=$4,review_reason=$5,reviewed_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,review_reason AS "reviewReason"',[tenantId,id,status,actorId,reason.trim()]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'overtime_request\',$4,$5::jsonb)',[tenantId,actorId,'overtime.'+action,id,JSON.stringify({reason:reason.trim()})]);return out[0];});
  }
  listTimesheets(tenantId:string){return this.tenantDb.run(tenantId,m=>m.query('SELECT t.id,t.worker_id AS "workerId",w.worker_number AS "workerNumber",t.period_start AS "periodStart",t.period_end AS "periodEnd",t.status,t.total_minutes AS "totalMinutes" FROM timesheets t JOIN workers w ON w.tenant_id=t.tenant_id AND w.id=t.worker_id WHERE t.tenant_id=$1 ORDER BY t.period_start DESC LIMIT 500',[tenantId]));}
  createTimesheet(tenantId:string,actorId:string,dto:CreateTimesheetDto){
    if(dto.periodEnd<dto.periodStart)throw new BadRequestException('Timesheet end date must not precede start date.');
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query("INSERT INTO timesheets(tenant_id,worker_id,period_start,period_end) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,worker_id,period_start,period_end) DO NOTHING RETURNING id,worker_id AS \"workerId\",period_start AS \"periodStart\",period_end AS \"periodEnd\",status",[tenantId,dto.workerId,dto.periodStart,dto.periodEnd]);if(!rows.length)throw new ConflictException('A timesheet already exists for this worker and period.');const attendance=await m.query("SELECT id,minutes_worked FROM attendance_records WHERE tenant_id=$1 AND worker_id=$2 AND status='approved' AND work_date BETWEEN $3::date AND $4::date ORDER BY work_date",[tenantId,dto.workerId,dto.periodStart,dto.periodEnd]);if(!attendance.length)throw new ConflictException('No approved attendance exists in this period.');let total=0;for(const a of attendance){const minutes=Number(a.minutes_worked??0);total+=minutes;await m.query('INSERT INTO timesheet_lines(tenant_id,timesheet_id,attendance_id,minutes_worked) VALUES($1,$2,$3,$4)',[tenantId,rows[0].id,a.id,minutes]);}await m.query('UPDATE timesheets SET total_minutes=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,rows[0].id,total]);await m.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'timesheet.created','timesheet',$3,$4::jsonb)",[tenantId,actorId,rows[0].id,JSON.stringify({workerId:dto.workerId,lines:attendance.length,totalMinutes:total})]);return {...rows[0],totalMinutes:total,lineCount:attendance.length};});
  }
  async transitionTimesheet(tenantId:string,actorId:string,id:string,action:'submit'|'approve'|'reject',reason?:string){
    return this.tenantDb.run(tenantId,async m=>{const rows=await m.query('SELECT id,status,submitted_by FROM timesheets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,id]);if(!rows.length)throw new NotFoundException('Timesheet not found.');const row=rows[0];if(action==='submit'&&row.status!=='draft')throw new ConflictException('Only draft timesheets can be submitted.');if(action!=='submit'&&row.status!=='submitted')throw new ConflictException('Only submitted timesheets can be reviewed.');if(action==='approve'&&row.submitted_by===actorId)throw new BadRequestException('The submitter cannot approve their own timesheet.');if(action==='reject'&&(!reason||reason.trim().length<3))throw new BadRequestException('A rejection reason is required.');const status=action==='submit'?'submitted':action==='approve'?'approved':'rejected';const out=await m.query('UPDATE timesheets SET status=$3,submitted_by=CASE WHEN $3=\'submitted\' THEN $4 ELSE submitted_by END,approved_by=CASE WHEN $3=\'approved\' THEN $4 ELSE approved_by END,rejection_reason=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,status,total_minutes AS "totalMinutes"',[tenantId,id,status,actorId,action==='reject'?reason!.trim():null]);await m.query('INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,\'timesheet\',$4,$5::jsonb)',[tenantId,actorId,'timesheet.'+action,id,JSON.stringify({reason:reason??null})]);return out[0];});
  }

}
