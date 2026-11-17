import { BadRequestException, ConflictException } from '@nestjs/common';
import { OperationsService } from './operations.service';

describe('Attendance leave, overtime and timesheet workflows',()=>{
 const tenant='123e4567-e89b-42d3-a456-426614174000';
 const actor='123e4567-e89b-42d3-a456-426614174001';
 const worker='123e4567-e89b-42d3-a456-426614174002';
 function service(query:jest.Mock){const manager={query};const db={run:jest.fn(async(_id:string,fn:(m:{query:jest.Mock})=>Promise<unknown>)=>fn(manager))};return new OperationsService(db as never);}
 it('rejects invalid shift time formats before writing',async()=>{const q=jest.fn();await expect(service(q).createShift(tenant,actor,{code:'DAY',name:'Day Shift',startTime:'25:00',endTime:'17:00'})).rejects.toBeInstanceOf(BadRequestException);expect(q).not.toHaveBeenCalled();});
 it('prevents overlapping leave requests',async()=>{const q=jest.fn().mockResolvedValueOnce([{id:worker}]);q.mockResolvedValueOnce([{id:'existing'}]);await expect(service(q).createLeaveRequest(tenant,actor,{workerId:worker,leaveType:'annual',startDate:'2026-12-01',endDate:'2026-12-05',requestedDays:5,reason:'Annual leave'})).rejects.toBeInstanceOf(ConflictException);});
 it('requires approved attendance before requesting overtime',async()=>{const q=jest.fn().mockResolvedValueOnce([{id:'a',worker_id:worker,work_date:'2026-11-01',status:'submitted'}]);await expect(service(q).createOvertimeRequest(tenant,actor,{workerId:worker,attendanceId:'a',minutesRequested:60,reason:'Urgent approved work'})).rejects.toBeInstanceOf(ConflictException);});
 it('requires separation of duties for leave review',async()=>{const q=jest.fn().mockResolvedValueOnce([{id:'l',status:'pending',requested_by:actor}]);await expect(service(q).reviewLeaveRequest(tenant,actor,'l','approve','Reviewed')).rejects.toBeInstanceOf(BadRequestException);});
});
