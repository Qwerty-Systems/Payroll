import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';

describe('ReportsService',()=>{
 const tenant='123e4567-e89b-42d3-a456-426614174000';
 function service(query:jest.Mock){const manager={query};const db={run:jest.fn(async(_id:string,work:(m:{query:jest.Mock})=>Promise<unknown>)=>work(manager))};return new ReportsService(db as never);}
 it('rejects malformed report ranges before querying tenant data',async()=>{const q=jest.fn();await expect(service(q).attendanceCsv(tenant,'2026-12-31','2026-01-01')).rejects.toBeInstanceOf(BadRequestException);expect(q).not.toHaveBeenCalled();});
 it('neutralizes spreadsheet formula injection in attendance exports',async()=>{const q=jest.fn().mockResolvedValue([{work_date:'2026-11-01',worker_number:'W-1',first_name:'=HYPERLINK("https://invalid")',last_name:'Worker',project_code:'P-1',project_name:'Site work',site_code:'S-1',site_name:'Main',minutes_worked:480,status:'approved',source:'web',created_at:'2026-11-01T08:00:00Z'}]);const csv=await service(q).attendanceCsv(tenant,'2026-11-01','2026-11-30');expect(csv).toContain("'=HYPERLINK");expect(q).toHaveBeenCalledWith(expect.any(String),[tenant,'2026-11-01','2026-11-30']);});
});
