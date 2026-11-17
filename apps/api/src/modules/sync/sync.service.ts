import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { CreateAttendanceDto } from '../operations/operations.dto';
import { RegisterDeviceDto, SyncBatchDto, SyncCommandDto } from './sync.dto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SyncService {
  constructor(private readonly tenantDb: TenantTransactionService) {}

  registerDevice(tenantId: string, userId: string, dto: RegisterDeviceDto) {
    return this.tenantDb.run(tenantId, async (m) => {
      const rows = await m.query(
        'INSERT INTO tenant_devices(tenant_id,user_id,name,platform) VALUES($1,$2,$3,$4) RETURNING id,name,platform,last_seen_at AS "lastSeenAt",created_at AS "createdAt"',
        [tenantId, userId, dto.name.trim(), dto.platform],
      );
      return rows[0];
    });
  }

  listDevices(tenantId: string, userId: string) {
    return this.tenantDb.run(tenantId, (m) => m.query(
      'SELECT id,name,platform,last_seen_at AS "lastSeenAt",revoked_at AS "revokedAt",created_at AS "createdAt" FROM tenant_devices WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC',
      [tenantId, userId],
    ));
  }

  revokeDevice(tenantId: string, userId: string, id: string) {
    return this.tenantDb.run(tenantId, async (m) => {
      const rows = await m.query(
        'UPDATE tenant_devices SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND id=$3 AND revoked_at IS NULL RETURNING id,revoked_at AS "revokedAt"',
        [tenantId, userId, id],
      );
      if (!rows.length) throw new NotFoundException('Active device not found.');
      return rows[0];
    });
  }

  async processBatch(tenantId: string, actorId: string, dto: SyncBatchDto) {
    const outcomes = [];
    for (const command of dto.commands) outcomes.push(await this.processCommand(tenantId, actorId, command));
    return { count: outcomes.length, outcomes };
  }

  private async processCommand(tenantId: string, actorId: string, command: SyncCommandDto) {
    return this.tenantDb.run(tenantId, async (m) => {
      const devices = await m.query(
        'SELECT id FROM tenant_devices WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND revoked_at IS NULL FOR UPDATE',
        [tenantId, command.deviceId, actorId],
      );
      if (!devices.length) throw new ForbiddenException('This device is not registered to your account in the selected workspace.');

      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [tenantId + ':' + command.commandId]);
      await m.query('UPDATE tenant_devices SET last_seen_at=now() WHERE tenant_id=$1 AND id=$2', [tenantId, command.deviceId]);

      const payloadHash = createHash('sha256').update(JSON.stringify(command.payload)).digest('hex');
      const existing = await m.query(
        'SELECT payload_hash,state,result,payload FROM sync_commands WHERE tenant_id=$1 AND command_id=$2 FOR UPDATE',
        [tenantId, command.commandId],
      );
      if (existing.length) {
        if (existing[0].payload_hash === payloadHash) {
          return { commandId: command.commandId, status: existing[0].state, result: existing[0].result, idempotentReplay: true };
        }
        const priorConflict = await m.query(
          "SELECT id FROM sync_conflicts WHERE tenant_id=$1 AND command_id=$2 AND state='open' AND client_payload=$3::jsonb LIMIT 1",
          [tenantId, command.commandId, JSON.stringify(command.payload)],
        );
        const conflict = priorConflict.length ? priorConflict : await m.query(
          "INSERT INTO sync_conflicts(tenant_id,command_id,conflict_type,client_payload,server_payload) VALUES($1,$2,'COMMAND_ID_REUSED_WITH_DIFFERENT_PAYLOAD',$3::jsonb,$4::jsonb) RETURNING id",
          [tenantId, command.commandId, JSON.stringify(command.payload), JSON.stringify(existing[0].payload)],
        );
        await m.query("UPDATE sync_commands SET state='conflict' WHERE tenant_id=$1 AND command_id=$2", [tenantId, command.commandId]);
        return { commandId: command.commandId, status: 'conflict', conflictId: conflict[0].id, message: 'This command ID was already used with a different payload.' };
      }

      const attendance = plainToInstance(CreateAttendanceDto, command.payload);
      const errors = await validate(attendance, { whitelist: true, forbidNonWhitelisted: true });
      let rejection: Record<string, unknown> | undefined;
      if (errors.length) {
        rejection = { message: 'Attendance payload validation failed.', fields: errors.map(e => ({ field: e.property, constraints: e.constraints ?? {} })) };
      } else if (attendance.clockIn && attendance.clockOut && new Date(attendance.clockOut) < new Date(attendance.clockIn)) {
        rejection = { message: 'Clock-out must be after clock-in.' };
      } else {
        const references = await m.query(
          "SELECT w.id FROM workers w JOIN sites s ON s.tenant_id=w.tenant_id AND s.id=$4 AND s.project_id=$3 AND s.status='active' WHERE w.tenant_id=$1 AND w.id=$2 AND w.status='active'",
          [tenantId, attendance.workerId, attendance.projectId, attendance.siteId],
        );
        if (!references.length) rejection = { message: 'The worker, project or active site is invalid for this workspace.' };
      }

      if (rejection) {
        const result = rejection;
        await m.query(
          "INSERT INTO sync_commands(tenant_id,command_id,device_id,actor_user_id,entity_type,operation,payload_hash,payload,state,result,processed_at) VALUES($1,$2,$3,$4,'attendance','create',$5,$6::jsonb,'rejected',$7::jsonb,now())",
          [tenantId, command.commandId, command.deviceId, actorId, payloadHash, JSON.stringify(command.payload), JSON.stringify(result)],
        );
        return { commandId: command.commandId, status: 'rejected', result };
      }

      const records = await m.query(
        "INSERT INTO attendance_records(tenant_id,worker_id,project_id,site_id,work_date,clock_in,clock_out,minutes_worked,source,client_command_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'offline_sync',$9,$10) RETURNING id,worker_id AS \"workerId\",project_id AS \"projectId\",site_id AS \"siteId\",work_date AS \"workDate\",clock_in AS \"clockIn\",clock_out AS \"clockOut\",minutes_worked AS \"minutesWorked\",status,created_at AS \"createdAt\"",
        [tenantId, attendance.workerId, attendance.projectId, attendance.siteId, attendance.workDate, attendance.clockIn ?? null, attendance.clockOut ?? null, attendance.minutesWorked ?? null, command.commandId, actorId],
      );
      const result = records[0];
      await m.query(
        "INSERT INTO sync_commands(tenant_id,command_id,device_id,actor_user_id,entity_type,operation,payload_hash,payload,state,result,processed_at) VALUES($1,$2,$3,$4,'attendance','create',$5,$6::jsonb,'accepted',$7::jsonb,now())",
        [tenantId, command.commandId, command.deviceId, actorId, payloadHash, JSON.stringify(command.payload), JSON.stringify(result)],
      );
      await m.query(
        "INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'attendance.synced_offline','attendance',$3,$4::jsonb)",
        [tenantId, actorId, result.id, JSON.stringify({ commandId: command.commandId, deviceId: command.deviceId })],
      );
      return { commandId: command.commandId, status: 'accepted', result };
    });
  }

  pullAttendance(tenantId: string, cursor?: string) {
    let updatedAt = '1970-01-01T00:00:00.000Z';
    let id = '00000000-0000-0000-0000-000000000000';
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { updatedAt?: string; id?: string };
        if (!decoded.updatedAt || Number.isNaN(Date.parse(decoded.updatedAt)) || !decoded.id || !UUID_PATTERN.test(decoded.id)) throw new Error('invalid');
        updatedAt = new Date(decoded.updatedAt).toISOString();
        id = decoded.id;
      } catch {
        throw new BadRequestException('Invalid sync cursor.');
      }
    }
    return this.tenantDb.run(tenantId, async (m) => {
      const rows = await m.query(
        'SELECT id,worker_id AS "workerId",project_id AS "projectId",site_id AS "siteId",work_date AS "workDate",clock_in AS "clockIn",clock_out AS "clockOut",minutes_worked AS "minutesWorked",source,status,updated_at AS "updatedAt" FROM attendance_records WHERE tenant_id=$1 AND (updated_at,id)>($2::timestamptz,$3::uuid) ORDER BY updated_at,id LIMIT 500',
        [tenantId, updatedAt, id],
      );
      const last = rows.length ? rows[rows.length - 1] : null;
      const nextCursor = last
        ? Buffer.from(JSON.stringify({ updatedAt: new Date(last.updatedAt).toISOString(), id: last.id })).toString('base64url')
        : cursor ?? Buffer.from(JSON.stringify({ updatedAt, id })).toString('base64url');
      return { records: rows, nextCursor, hasMore: rows.length === 500 };
    });
  }


  pullReferenceData(tenantId:string){
    return this.tenantDb.run(tenantId,async m=>{
      const [workers,projects,sites,shifts,payGrades,leaveEntitlements]=await Promise.all([
        m.query("SELECT id,worker_number AS \"workerNumber\",first_name AS \"firstName\",last_name AS \"lastName\",status FROM workers WHERE tenant_id=$1 AND status='active' ORDER BY worker_number LIMIT 2000",[tenantId]),
        m.query("SELECT id,project_code AS \"projectCode\",name,status FROM projects WHERE tenant_id=$1 AND status='active' ORDER BY project_code LIMIT 1000",[tenantId]),
        m.query("SELECT id,project_id AS \"projectId\",site_code AS \"siteCode\",name,status FROM sites WHERE tenant_id=$1 AND status='active' ORDER BY site_code LIMIT 2000",[tenantId]),
        m.query("SELECT id,code,name,start_time AS \"startTime\",end_time AS \"endTime\",break_minutes AS \"breakMinutes\",grace_minutes AS \"graceMinutes\" FROM attendance_shifts WHERE tenant_id=$1 AND status='active' ORDER BY code",[tenantId]),
        m.query("SELECT id,code,name,pay_basis AS \"payBasis\",currency FROM worker_pay_grades WHERE tenant_id=$1 AND status='active' ORDER BY code",[tenantId]),
        m.query("SELECT leave_type AS \"leaveType\",annual_days AS \"annualDays\",effective_from AS \"effectiveFrom\",effective_to AS \"effectiveTo\" FROM leave_entitlements WHERE tenant_id=$1 AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) ORDER BY leave_type,effective_from DESC",[tenantId]),
      ]);
      return {generatedAt:new Date().toISOString(),workers,projects,sites,shifts,payGrades,leaveEntitlements};
    });
  }


  listConflicts(tenantId: string) {
    return this.tenantDb.run(tenantId, (m) => m.query(
      "SELECT id,command_id AS \"commandId\",conflict_type AS \"conflictType\",client_payload AS \"clientPayload\",server_payload AS \"serverPayload\",state,resolution,created_at AS \"createdAt\" FROM sync_conflicts WHERE tenant_id=$1 AND state='open' ORDER BY created_at DESC",
      [tenantId],
    ));
  }

  resolveConflict(tenantId: string, actorId: string, id: string, resolution: string) {
    return this.tenantDb.run(tenantId, async (m) => {
      const rows = await m.query(
        "UPDATE sync_conflicts SET state='discarded',resolution=$3,resolved_by=$4,resolved_at=now() WHERE tenant_id=$1 AND id=$2 AND state='open' RETURNING id,command_id AS \"commandId\",state,resolution",
        [tenantId, id, resolution.trim(), actorId],
      );
      if (!rows.length) throw new NotFoundException('Open sync conflict not found.');
      await m.query(
        "UPDATE sync_commands SET state='rejected',result=jsonb_set(result,'{resolution}',to_jsonb($3::text),true),processed_at=now() WHERE tenant_id=$1 AND command_id=$2",
        [tenantId, rows[0].commandId, resolution.trim()],
      );
      await m.query(
        "INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'sync.conflict.discarded','sync_conflict',$3,$4::jsonb)",
        [tenantId, actorId, id, JSON.stringify({ resolution: resolution.trim(), commandId: rows[0].commandId })],
      );
      return rows[0];
    });
  }
}
