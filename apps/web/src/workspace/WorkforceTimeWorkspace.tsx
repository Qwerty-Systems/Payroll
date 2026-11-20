import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, MenuItem, Stack, Tab, Tabs,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';

type Row = Record<string, unknown> & { id?: string };
type Request = <T,>(path: string, init?: RequestInit) => Promise<T>;
type Props = { workers: Row[]; request: Request };
type TabKey = 'shifts' | 'assignments' | 'leave' | 'overtime' | 'timesheets' | 'corrections';
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const text = (value: unknown) => value == null || value === '' ? '—' : String(value);
const today = () => new Date().toISOString().slice(0, 10);
const json = (method: string, body?: unknown): RequestInit => ({
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export default function WorkforceTimeWorkspace({ workers, request }: Props) {
  const [tab, setTab] = useState<TabKey>('shifts');
  const [shifts, setShifts] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [corrections, setCorrections] = useState<Row[]>([]);
  const [correctionReviewReason, setCorrectionReviewReason] = useState('');
  const [correctionForm, setCorrectionForm] = useState({ attendanceId: '', clockIn: '', clockOut: '', minutesWorked: '', reason: '' });
  const [assignmentDate, setAssignmentDate] = useState(today());
  const [assignmentWorker, setAssignmentWorker] = useState('');
  const [assignmentShift, setAssignmentShift] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [leaveTypes, setLeaveTypes] = useState<Row[]>([]);
  const [balances, setBalances] = useState<Row[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Row[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<Row[]>([]);
  const [timesheets, setTimesheets] = useState<Row[]>([]);
  const [selectedTimesheet, setSelectedTimesheet] = useState('');
  const [timesheetDetail, setTimesheetDetail] = useState<Row | null>(null);
  const [editingTimesheet, setEditingTimesheet] = useState(false);
  const [timesheetHeader, setTimesheetHeader] = useState({ periodStart: '', periodEnd: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shift, setShift] = useState({ code: '', name: '', startTime: '08:00', endTime: '17:00', breakMinutes: '60' });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [leaveType, setLeaveType] = useState({ code: '', name: '', annualEntitlementDays: '21', carryForwardLimitDays: '0', requiresApproval: true, isPaid: true });
  const [editingLeaveType, setEditingLeaveType] = useState<string | null>(null);
  const [balance, setBalance] = useState({ workerId: '', leaveTypeId: '', leaveYear: String(new Date().getFullYear()), openingDays: '0', accruedDays: '0', adjustmentDays: '0' });
  const [leave, setLeave] = useState({ workerId: '', leaveTypeId: '', startDate: today(), endDate: today(), requestedDays: '1', reason: '' });
  const [overtime, setOvertime] = useState({ workerId: '', workDate: today(), requestedMinutes: '60', reason: '', projectId: '', siteId: '' });
  const [editingOvertimeId, setEditingOvertimeId] = useState<string | null>(null);
  const [timesheet, setTimesheet] = useState({ workerId: '', periodStart: today().slice(0, 8) + '01', periodEnd: today(), notes: '' });
  const [line, setLine] = useState({ workDate: today(), minutesWorked: '480', overtimeMinutes: '0', description: '', projectId: '', siteId: '', unitsCompleted: '' });
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const dailyExistingMinutes = rows(timesheetDetail?.lines).filter(r => String(r.workDate).slice(0,10) === line.workDate && String(r.id) !== editingLineId).reduce((sum,r) => sum + Number(r.minutesWorked||0) + Number(r.overtimeMinutes||0), 0);
  const dailyProposedMinutes = dailyExistingMinutes + Number(line.minutesWorked||0) + Number(line.overtimeMinutes||0);
  const dailyMinutesExceeded = dailyProposedMinutes > 1440;

  const refresh = useCallback(async () => {
    setError('');
    const endpoints = [
      ['shifts', 'tenant/shifts'], ['leaveTypes', 'tenant/leave-types'],
      ['balances', 'tenant/leave-balances'], ['leaveRequests', 'tenant/leave-requests'],
      ['overtimeRequests', 'tenant/overtime-requests'], ['timesheets', 'tenant/timesheets'],
      ['assignments', `tenant/shift-assignments?from=${assignmentDate}&to=${assignmentDate}`],
      ['corrections', 'tenant/attendance-corrections?status=pending'],
    ] as const;
    const results = await Promise.all(endpoints.map(async ([key, path]) => {
      try { return [key, rows(await request<unknown>(path))] as const; }
      catch (cause) { return [key, cause instanceof Error ? cause.message : 'Unable to load records.'] as const; }
    }));
    const failures = results.filter(([, value]) => typeof value === 'string');
    setShifts(results.find(x => x[0] === 'shifts')?.[1] instanceof Array ? results.find(x => x[0] === 'shifts')![1] as Row[] : []);
    setLeaveTypes(results.find(x => x[0] === 'leaveTypes')?.[1] instanceof Array ? results.find(x => x[0] === 'leaveTypes')![1] as Row[] : []);
    setBalances(results.find(x => x[0] === 'balances')?.[1] instanceof Array ? results.find(x => x[0] === 'balances')![1] as Row[] : []);
    setLeaveRequests(results.find(x => x[0] === 'leaveRequests')?.[1] instanceof Array ? results.find(x => x[0] === 'leaveRequests')![1] as Row[] : []);
    setOvertimeRequests(results.find(x => x[0] === 'overtimeRequests')?.[1] instanceof Array ? results.find(x => x[0] === 'overtimeRequests')![1] as Row[] : []);
    setTimesheets(results.find(x => x[0] === 'timesheets')?.[1] instanceof Array ? results.find(x => x[0] === 'timesheets')![1] as Row[] : []);
    setAssignments(results.find(x => x[0] === 'assignments')?.[1] instanceof Array ? results.find(x => x[0] === 'assignments')![1] as Row[] : []);
    setCorrections(results.find(x => x[0] === 'corrections')?.[1] instanceof Array ? results.find(x => x[0] === 'corrections')![1] as Row[] : []);
    if (failures.length) setError('Some attendance records could not be loaded. Check your role permissions and try refreshing.');
  }, [request, assignmentDate]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be completed.'); }
    finally { setBusy(false); }
  }

  function beginTimesheetEdit() {
    if (!timesheetDetail) return;
    setTimesheetHeader({periodStart:String(timesheetDetail.periodStart??'').slice(0,10),periodEnd:String(timesheetDetail.periodEnd??'').slice(0,10),notes:String(timesheetDetail.notes??'')});
    setEditingTimesheet(true);
  }

  async function openTimesheet(id: string) {
    setSelectedTimesheet(id);
    try { setTimesheetDetail(await request<Row>(`tenant/timesheets/${id}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load timesheet.'); }
  }

  const employeeOptions = workers.filter(w => typeof w.id === 'string' && w.status !== 'archived');
  const employeeName = (id: string) => {
    const worker = employeeOptions.find(w => w.id === id);
    return worker ? `${text(worker.firstName)} ${text(worker.lastName)} · ${text(worker.workerNumber)}` : '';
  };
  const workerSelect = (value: string, onChange: (value: string) => void, label: string) => (
    <TextField select size="small" label={label} value={value} onChange={e => onChange(e.target.value)} sx={{ minWidth: 220 }}>
      {employeeOptions.map(w => <MenuItem key={String(w.id)} value={String(w.id)}>{employeeName(String(w.id))}</MenuItem>)}
    </TextField>
  );

  return <Stack spacing={2}>
    <Box>
      <Typography variant="h5" fontWeight={800}>Time & attendance management</Typography>
      <Typography color="text.secondary" variant="body2">Configure shifts, administer leave, review overtime and approve timesheets.</Typography>
    </Box>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    <Card variant="outlined">
      <Tabs value={tab} onChange={(_, value: TabKey) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="shifts" label="Shifts" />
        <Tab value="assignments" label="Shift assignments" />
        <Tab value="leave" label="Leave & balances" />
        <Tab value="overtime" label="Overtime" />
        <Tab value="timesheets" label="Timesheets" />
        <Tab value="corrections" label="Attendance corrections" />
      </Tabs>
      <Divider />
      <CardContent>
        {tab === 'shifts' && <Stack spacing={2}>
          <Typography fontWeight={700}>Shift catalogue</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
            <TextField size="small" label="Code" value={shift.code} onChange={e => setShift(v => ({ ...v, code: e.target.value }))} />
            <TextField size="small" label="Shift name" value={shift.name} onChange={e => setShift(v => ({ ...v, name: e.target.value }))} />
            <TextField size="small" type="time" label="Start" value={shift.startTime} onChange={e => setShift(v => ({ ...v, startTime: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="time" label="End" value={shift.endTime} onChange={e => setShift(v => ({ ...v, endTime: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="number" label="Break minutes" value={shift.breakMinutes} onChange={e => setShift(v => ({ ...v, breakMinutes: e.target.value }))} sx={{ width: 130 }} />
            <Button variant="contained" disabled={busy || !shift.code || !shift.name} onClick={() => void perform(async () => {
              const payload = { ...shift, breakMinutes: Number(shift.breakMinutes), crossesMidnight: shift.endTime <= shift.startTime };
              if (editingShiftId) await request(`tenant/shifts/${editingShiftId}`, json('PATCH', payload));
              else await request('tenant/shifts', json('POST', payload));
              setShift({ code: '', name: '', startTime: '08:00', endTime: '17:00', breakMinutes: '60' });
              setEditingShiftId(null);
            }, editingShiftId ? 'Shift updated.' : 'Shift saved.')}>{editingShiftId ? 'Save changes' : 'Add shift'}</Button>
            {editingShiftId && <Button disabled={busy} color="inherit" onClick={() => { setEditingShiftId(null); setShift({ code: '', name: '', startTime: '08:00', endTime: '17:00', breakMinutes: '60' }); }}>Cancel edit</Button>}
          </Stack>
          <Table size="small"><TableHead><TableRow>{['Code','Shift','Start','End','Break','Status',''].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{shifts.map(r => <TableRow key={String(r.id)}><TableCell>{text(r.code)}</TableCell><TableCell>{text(r.name)}</TableCell><TableCell>{text(r.startTime)}</TableCell><TableCell>{text(r.endTime)}</TableCell><TableCell>{text(r.breakMinutes)} min</TableCell><TableCell><Chip size="small" label={text(r.status)} /></TableCell><TableCell><Stack direction="row" spacing={0.5}><Button size="small" disabled={busy || r.status !== 'active'} onClick={() => { setEditingShiftId(String(r.id)); setShift({ code: String(r.code ?? ''), name: String(r.name ?? ''), startTime: String(r.startTime ?? '08:00').slice(0,5), endTime: String(r.endTime ?? '17:00').slice(0,5), breakMinutes: String(r.breakMinutes ?? 0) }); }}>Edit</Button>{r.status === 'active' && <Button size="small" color="inherit" disabled={busy} onClick={() => void perform(() => request(`tenant/shifts/${r.id}`, json('DELETE')), 'Shift deactivated.')}>Deactivate</Button>}</Stack></TableCell></TableRow>)}
              {!shifts.length && <TableRow><TableCell colSpan={7}>No shifts configured.</TableCell></TableRow>}</TableBody>
          </Table>
        </Stack>}

        {tab === 'assignments' && <Stack spacing={2}>
          <Typography fontWeight={700}>Daily shift schedule</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
            <TextField size="small" type="date" label="Schedule date" value={assignmentDate} onChange={e => setAssignmentDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            {workerSelect(assignmentWorker, setAssignmentWorker, 'Employee')}
            <TextField select size="small" label="Shift" value={assignmentShift} onChange={e => setAssignmentShift(e.target.value)} sx={{ minWidth: 180 }}>
              {shifts.filter(s => s.status === 'active').map(s => <MenuItem key={String(s.id)} value={String(s.id)}>{text(s.name)} · {text(s.startTime)}–{text(s.endTime)}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Notes (optional)" value={assignmentNotes} onChange={e => setAssignmentNotes(e.target.value)} />
            <Button variant="contained" disabled={busy || !assignmentWorker || !assignmentShift || !assignmentDate} onClick={() => void perform(async () => {
              await request('tenant/shift-assignments', json('POST', { workerId: assignmentWorker, shiftId: assignmentShift, workDate: assignmentDate, notes: assignmentNotes.trim() || undefined }));
              setAssignmentWorker(''); setAssignmentShift(''); setAssignmentNotes('');
            }, 'Shift assigned.')}>Assign shift</Button>
          </Stack>
          <Table size="small"><TableHead><TableRow>{['Employee','Shift','Hours','Date','Notes','Status','Actions'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{assignments.map(a => <TableRow key={String(a.id)}>
              <TableCell>{text(a.workerName)} · {text(a.workerNumber)}</TableCell><TableCell>{text(a.shiftName)} ({text(a.shiftCode)})</TableCell><TableCell>{text(a.startTime)}–{text(a.endTime)}</TableCell><TableCell>{text(a.workDate)}</TableCell><TableCell>{text(a.notes)}</TableCell><TableCell><Chip size="small" label={text(a.status)} color={a.status === 'scheduled' ? 'success' : 'default'} /></TableCell><TableCell>{a.status === 'scheduled' && <Button size="small" color="error" disabled={busy} onClick={() => void perform(() => request(`tenant/shift-assignments/${a.id}/cancel`, json('POST')), 'Shift assignment cancelled.')}>Cancel</Button>}</TableCell>
            </TableRow>)}
            {!assignments.length && <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>No shift assignments for this date.</TableCell></TableRow>}</TableBody>
          </Table>
        </Stack>}
        {tab === 'leave' && <Stack spacing={2}>
          <Typography fontWeight={700}>Leave types</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField size="small" label="Code" value={leaveType.code} onChange={e => setLeaveType(v => ({ ...v, code: e.target.value }))} />
            <TextField size="small" label="Name" value={leaveType.name} onChange={e => setLeaveType(v => ({ ...v, name: e.target.value }))} />
            <TextField size="small" type="number" label="Annual days" value={leaveType.annualEntitlementDays} onChange={e => setLeaveType(v => ({ ...v, annualEntitlementDays: e.target.value }))} />
            <TextField size="small" type="number" label="Carry-forward cap" value={leaveType.carryForwardLimitDays} onChange={e => setLeaveType(v => ({ ...v, carryForwardLimitDays: e.target.value }))} />
            <TextField select size="small" label="Approval required" value={String(leaveType.requiresApproval)} onChange={e => setLeaveType(v => ({ ...v, requiresApproval: e.target.value === 'true' }))} sx={{ minWidth: 150 }}><MenuItem value="true">Yes</MenuItem><MenuItem value="false">No</MenuItem></TextField>
            <TextField select size="small" label="Paid leave" value={String(leaveType.isPaid)} onChange={e => setLeaveType(v => ({ ...v, isPaid: e.target.value === 'true' }))} sx={{ minWidth: 130 }}><MenuItem value="true">Paid</MenuItem><MenuItem value="false">Unpaid</MenuItem></TextField>
            <Button variant="contained" disabled={busy || !leaveType.name.trim() || !Number.isFinite(Number(leaveType.annualEntitlementDays)) || Number(leaveType.annualEntitlementDays)<0 || Number(leaveType.carryForwardLimitDays)<0} onClick={() => void perform(async () => {
              const payload={name:leaveType.name.trim(),annualEntitlementDays:Number(leaveType.annualEntitlementDays),carryForwardLimitDays:Number(leaveType.carryForwardLimitDays),requiresApproval:leaveType.requiresApproval,isPaid:leaveType.isPaid};
              if(editingLeaveType) await request(`tenant/leave-types/${editingLeaveType}`,json('PATCH',payload));
              else await request('tenant/leave-types',json('POST',{...payload,code:leaveType.code.trim().toUpperCase()}));
              setEditingLeaveType(null);setLeaveType({code:'',name:'',annualEntitlementDays:'21',carryForwardLimitDays:'0',requiresApproval:true,isPaid:true});
            },editingLeaveType?'Leave type updated.':'Leave type created.')}>{editingLeaveType?'Save changes':'Add type'}</Button>
            {editingLeaveType&&<Button color="inherit" disabled={busy} onClick={()=>{setEditingLeaveType(null);setLeaveType({code:'',name:'',annualEntitlementDays:'21',carryForwardLimitDays:'0',requiresApproval:true,isPaid:true});}}>Cancel</Button>}
          </Stack>
          <Table size="small"><TableHead><TableRow>{['Code','Leave type','Annual days','Carry forward','Paid','Approval','Status','Actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
            {leaveTypes.map(t=><TableRow key={String(t.id)}><TableCell>{text(t.code)}</TableCell><TableCell>{text(t.name)}</TableCell><TableCell>{text(t.annualEntitlementDays)}</TableCell><TableCell>{text(t.carryForwardLimitDays)}</TableCell><TableCell>{t.isPaid===false?'Unpaid':'Paid'}</TableCell><TableCell>{t.requiresApproval===false?'No':'Yes'}</TableCell><TableCell><Chip size="small" label={text(t.status)}/></TableCell><TableCell><Stack direction="row" spacing={0.5}>
              <Button size="small" disabled={busy||t.status!=='active'} onClick={()=>{setEditingLeaveType(String(t.id));setLeaveType({code:String(t.code??''),name:String(t.name??''),annualEntitlementDays:String(t.annualEntitlementDays??21),carryForwardLimitDays:String(t.carryForwardLimitDays??0),requiresApproval:t.requiresApproval!==false,isPaid:t.isPaid!==false});}}>Edit</Button>
              <Button size="small" color={t.status==='active'?'warning':'success'} disabled={busy} onClick={()=>void perform(()=>request(`tenant/leave-types/${t.id}`,json('PATCH',{status:t.status==='active'?'inactive':'active'})),t.status==='active'?'Leave type deactivated.':'Leave type reactivated.')}>{t.status==='active'?'Deactivate':'Reactivate'}</Button>
            </Stack></TableCell></TableRow>)}
            {!leaveTypes.length&&<TableRow><TableCell colSpan={8}>No leave types configured.</TableCell></TableRow>}
          </TableBody></Table>
          <Divider />
          <Typography fontWeight={700}>Set employee leave balance</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {workerSelect(balance.workerId, v => setBalance(s => ({ ...s, workerId: v })), 'Employee')}
            <TextField select size="small" label="Leave type" value={balance.leaveTypeId} onChange={e => setBalance(v => ({ ...v, leaveTypeId: e.target.value }))} sx={{ minWidth: 180 }}>
              {leaveTypes.map(t => <MenuItem key={String(t.id)} value={String(t.id)}>{text(t.name)}</MenuItem>)}
            </TextField>
            <TextField size="small" type="number" label="Year" value={balance.leaveYear} onChange={e => setBalance(v => ({ ...v, leaveYear: e.target.value }))} sx={{ width: 100 }} />
            <TextField size="small" type="number" label="Opening" value={balance.openingDays} onChange={e => setBalance(v => ({ ...v, openingDays: e.target.value }))} sx={{ width: 110 }} />
            <TextField size="small" type="number" label="Accrued" value={balance.accruedDays} onChange={e => setBalance(v => ({ ...v, accruedDays: e.target.value }))} sx={{ width: 110 }} />
            <TextField size="small" type="number" label="Adjustment" value={balance.adjustmentDays} onChange={e => setBalance(v => ({ ...v, adjustmentDays: e.target.value }))} sx={{ width: 110 }} />
            <Button variant="outlined" disabled={busy || !balance.workerId || !balance.leaveTypeId} onClick={() => void perform(() => request('tenant/leave-balances', json('PUT', { ...balance, leaveYear: Number(balance.leaveYear), openingDays: Number(balance.openingDays), accruedDays: Number(balance.accruedDays), adjustmentDays: Number(balance.adjustmentDays) })), 'Leave balance updated.')}>Save balance</Button>
          </Stack>
          <Table size="small"><TableHead><TableRow>{['Employee','Leave type','Year','Opening','Accrued','Used','Pending','Available'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{balances.map(r => <TableRow key={String(r.id)}><TableCell>{text(r.workerName)}</TableCell><TableCell>{text(r.leaveType)}</TableCell><TableCell>{text(r.leaveYear)}</TableCell><TableCell>{text(r.openingDays)}</TableCell><TableCell>{text(r.accruedDays)}</TableCell><TableCell>{text(r.usedDays)}</TableCell><TableCell>{text(r.pendingDays)}</TableCell><TableCell><b>{text(r.availableDays)}</b></TableCell></TableRow>)}
              {!balances.length && <TableRow><TableCell colSpan={8}>No balances configured.</TableCell></TableRow>}</TableBody>
          </Table>
          <Divider />
          <Typography fontWeight={700}>Request leave</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {workerSelect(leave.workerId, v => setLeave(s => ({ ...s, workerId: v })), 'Employee')}
            <TextField select size="small" label="Leave type" value={leave.leaveTypeId} onChange={e => setLeave(v => ({ ...v, leaveTypeId: e.target.value }))} sx={{ minWidth: 180 }}>
              {leaveTypes.map(t => <MenuItem key={String(t.id)} value={String(t.id)}>{text(t.name)}</MenuItem>)}
            </TextField>
            <TextField size="small" type="date" label="From" value={leave.startDate} onChange={e => setLeave(v => ({ ...v, startDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label="To" value={leave.endDate} onChange={e => setLeave(v => ({ ...v, endDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="number" label="Days" value={leave.requestedDays} onChange={e => setLeave(v => ({ ...v, requestedDays: e.target.value }))} sx={{ width: 100 }} />
            <TextField size="small" label="Reason" value={leave.reason} onChange={e => setLeave(v => ({ ...v, reason: e.target.value }))} />
            <Button variant="contained" disabled={busy || !leave.workerId || !leave.leaveTypeId || !leave.startDate || !leave.endDate || leave.endDate < leave.startDate || !Number.isFinite(Number(leave.requestedDays)) || Number(leave.requestedDays)<=0} onClick={() => void perform(async () => {
              await request('tenant/leave-requests', json('POST', { ...leave, requestedDays: Number(leave.requestedDays) }));
            }, 'Leave request submitted.')}>Submit</Button>
          </Stack>
          <Table size="small"><TableHead><TableRow>{['Employee','Type','Dates','Days','Status','Review'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{leaveRequests.map(r => <TableRow key={String(r.id)}><TableCell>{text(r.workerName)}</TableCell><TableCell>{text(r.leaveType)}</TableCell><TableCell>{text(r.startDate)} – {text(r.endDate)}</TableCell><TableCell>{text(r.requestedDays)}</TableCell><TableCell><Chip size="small" label={text(r.status)} /></TableCell><TableCell>{r.status === 'pending' && <Stack direction="row" spacing={0.5} flexWrap="wrap"><Button size="small" disabled={busy} onClick={() => void perform(() => request(`tenant/leave-requests/${r.id}/approve`, json('POST', { reason: 'Approved after review.' })), 'Leave approved.')}>Approve</Button><Button size="small" color="error" disabled={busy} onClick={() => void perform(() => request(`tenant/leave-requests/${r.id}/reject`, json('POST', { reason: 'Not approved.' })), 'Leave rejected.')}>Reject</Button><Button size="small" color="inherit" disabled={busy} onClick={() => void perform(() => request(`tenant/leave-requests/${r.id}/cancel`, json('POST')), 'Pending leave request cancelled.')}>Cancel</Button></Stack>}</TableCell></TableRow>)}
              {!leaveRequests.length && <TableRow><TableCell colSpan={6}>No leave requests.</TableCell></TableRow>}</TableBody>
          </Table>
        </Stack>}

        {tab === 'overtime' && <Stack spacing={2}>
          <Typography fontWeight={700}>Submit overtime request</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {workerSelect(overtime.workerId, v => setOvertime(s => ({ ...s, workerId: v })), 'Employee')}
            <TextField size="small" type="date" label="Work date" value={overtime.workDate} onChange={e => setOvertime(v => ({ ...v, workDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="number" label="Minutes" value={overtime.requestedMinutes} onChange={e => setOvertime(v => ({ ...v, requestedMinutes: e.target.value }))} sx={{ width: 110 }} />
            <TextField size="small" label="Reason" value={overtime.reason} onChange={e => setOvertime(v => ({ ...v, reason: e.target.value }))} />
            <Button variant="contained" disabled={busy || !overtime.workerId || !overtime.workDate || !Number.isFinite(Number(overtime.requestedMinutes)) || Number(overtime.requestedMinutes)<1 || Number(overtime.requestedMinutes)>1440 || overtime.reason.trim().length<5} onClick={()=>void perform(async()=>{
              const payload={...overtime,reason:overtime.reason.trim(),requestedMinutes:Number(overtime.requestedMinutes),projectId:overtime.projectId||undefined,siteId:overtime.siteId||undefined};
              await request(editingOvertimeId?`tenant/overtime-requests/${editingOvertimeId}`:'tenant/overtime-requests',json(editingOvertimeId?'PATCH':'POST',payload));
              setEditingOvertimeId(null);setOvertime({workerId:'',workDate:today(),requestedMinutes:'60',reason:'',projectId:'',siteId:''});
            },editingOvertimeId?'Overtime request updated.':'Overtime request submitted.')}>{editingOvertimeId?'Save changes':'Submit'}</Button>
            {editingOvertimeId&&<Button color="inherit" disabled={busy} onClick={()=>{setEditingOvertimeId(null);setOvertime({workerId:'',workDate:today(),requestedMinutes:'60',reason:'',projectId:'',siteId:''});}}>Cancel edit</Button>}
          </Stack>
          <Table size="small"><TableHead><TableRow>{['Employee','Date','Requested','Approved','Reason','Status','Review'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{overtimeRequests.map(r => <TableRow key={String(r.id)}><TableCell>{text(r.workerName)}</TableCell><TableCell>{text(r.workDate)}</TableCell><TableCell>{text(r.requestedMinutes)} min</TableCell><TableCell>{text(r.approvedMinutes)}</TableCell><TableCell>{text(r.reason)}</TableCell><TableCell><Chip size="small" label={text(r.status)} /></TableCell><TableCell>{r.status === 'pending' && <Stack direction="row"><Button size="small" disabled={busy} onClick={()=>{setEditingOvertimeId(String(r.id));setOvertime({workerId:String(r.workerId??''),workDate:String(r.workDate??today()).slice(0,10),requestedMinutes:String(r.requestedMinutes??60),reason:String(r.reason??''),projectId:String(r.projectId??''),siteId:String(r.siteId??'')});}}>Edit</Button><Button size="small" disabled={busy} onClick={() => void perform(() => request(`tenant/overtime-requests/${r.id}/approve`, json('POST', { reason: 'Approved after review.' })), 'Overtime approved.')}>Approve</Button><Button size="small" color="error" disabled={busy} onClick={() => void perform(() => request(`tenant/overtime-requests/${r.id}/reject`, json('POST', { reason: 'Not approved.' })), 'Overtime rejected.')}>Reject</Button><Button size="small" color="warning" disabled={busy} onClick={() => void perform(() => request(`tenant/overtime-requests/${r.id}/cancel`, json('POST')), 'Overtime request cancelled.')}>Cancel</Button></Stack>}</TableCell></TableRow>)}
              {!overtimeRequests.length && <TableRow><TableCell colSpan={7}>No overtime requests.</TableCell></TableRow>}</TableBody>
          </Table>
        </Stack>}

        {tab === 'corrections' && <Stack spacing={2}>
          <Typography fontWeight={700}>Request an attendance correction</Typography>
          <Alert severity="info">Enter the attendance record ID from your attendance record. Only clock-in, clock-out and minutes worked can be corrected. Requests require a separate reviewer.</Alert>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
            <TextField size="small" label="Attendance record ID" value={correctionForm.attendanceId} onChange={e => setCorrectionForm(v => ({ ...v, attendanceId: e.target.value }))} sx={{ minWidth: 260 }} />
            <TextField size="small" type="datetime-local" label="Correct clock-in (optional)" value={correctionForm.clockIn} onChange={e => setCorrectionForm(v => ({ ...v, clockIn: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="datetime-local" label="Correct clock-out (optional)" value={correctionForm.clockOut} onChange={e => setCorrectionForm(v => ({ ...v, clockOut: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="number" label="Minutes worked (optional)" value={correctionForm.minutesWorked} onChange={e => setCorrectionForm(v => ({ ...v, minutesWorked: e.target.value }))} inputProps={{ min: 0 }} sx={{ width: 160 }} />
          </Stack>
          <TextField size="small" label="Reason for correction" value={correctionForm.reason} onChange={e => setCorrectionForm(v => ({ ...v, reason: e.target.value }))} fullWidth multiline minRows={2} />
          <Button variant="contained" disabled={busy || !correctionForm.attendanceId.trim() || correctionForm.reason.trim().length < 3 || (!correctionForm.clockIn && !correctionForm.clockOut && correctionForm.minutesWorked === '') || (correctionForm.minutesWorked !== '' && Number(correctionForm.minutesWorked) < 0)} onClick={() => void perform(async () => {
            const proposedValues: Record<string, string | number | null> = {};
            if (correctionForm.clockIn) proposedValues.clockIn = new Date(correctionForm.clockIn).toISOString();
            if (correctionForm.clockOut) proposedValues.clockOut = new Date(correctionForm.clockOut).toISOString();
            if (correctionForm.minutesWorked !== '') proposedValues.minutesWorked = Number(correctionForm.minutesWorked);
            await request(`tenant/attendance/${correctionForm.attendanceId.trim()}/corrections`, json('POST', { proposedValues, reason: correctionForm.reason.trim() }));
            setCorrectionForm({ attendanceId: '', clockIn: '', clockOut: '', minutesWorked: '', reason: '' });
          }, 'Correction request submitted for review.')}>Submit correction</Button>
          <Divider />
          <Typography fontWeight={700}>Pending correction approvals</Typography>
          <TextField size="small" label="Review note (required for approve/reject)" value={correctionReviewReason} onChange={e => setCorrectionReviewReason(e.target.value)} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} helperText={`${correctionReviewReason.length}/500 characters`} />
          <Table size="small"><TableHead><TableRow>{['Employee','Work date','Original clock-in','Original clock-out','Minutes','Requested changes','Reason','Actions'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{corrections.map(r => <TableRow key={String(r.id)}>
              <TableCell>{text(r.workerName)} · {text(r.workerNumber)}</TableCell><TableCell>{text(r.workDate)}</TableCell><TableCell>{text(r.clockIn)}</TableCell><TableCell>{text(r.clockOut)}</TableCell><TableCell>{text(r.minutesWorked)}</TableCell><TableCell>{JSON.stringify(r.proposedValues)}</TableCell><TableCell>{text(r.reason)}</TableCell><TableCell><Stack direction="row" spacing={0.5}><Button size="small" disabled={busy || correctionReviewReason.trim().length < 3} onClick={() => void perform(async () => { await request(`tenant/attendance-corrections/${r.id}/approve`,json('POST',{reason:correctionReviewReason.trim()})); setCorrectionReviewReason(''); },'Correction approved.')}>Approve</Button><Button size="small" color="error" disabled={busy || correctionReviewReason.trim().length < 3} onClick={() => void perform(async () => { await request(`tenant/attendance-corrections/${r.id}/reject`,json('POST',{reason:correctionReviewReason.trim()})); setCorrectionReviewReason(''); },'Correction rejected.')}>Reject</Button></Stack></TableCell>
            </TableRow>)}
            {!corrections.length && <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 3 }}>No pending correction requests.</TableCell></TableRow>}</TableBody>
          </Table>
        </Stack>}
        {tab === 'timesheets' && <Stack spacing={2}>
          <Typography fontWeight={700}>Create timesheet</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {workerSelect(timesheet.workerId, v => setTimesheet(s => ({ ...s, workerId: v })), 'Employee')}
            <TextField size="small" type="date" label="Period start" value={timesheet.periodStart} onChange={e => setTimesheet(v => ({ ...v, periodStart: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label="Period end" value={timesheet.periodEnd} onChange={e => setTimesheet(v => ({ ...v, periodEnd: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="Notes" value={timesheet.notes} onChange={e => setTimesheet(v => ({ ...v, notes: e.target.value }))} />
            <Button variant="contained" disabled={busy || !timesheet.workerId || !timesheet.periodStart || !timesheet.periodEnd || timesheet.periodEnd < timesheet.periodStart} onClick={() => void perform(async () => {
              const result=await request<Row>('tenant/timesheets',json('POST',timesheet));
              if(result.id) { setSelectedTimesheet(String(result.id)); setTimesheetDetail({...result,lines:[]}); }
            }, 'Timesheet created.')}>Create</Button>
          </Stack>
          <Table size="small"><TableHead><TableRow>{['Employee','Period','Status','Hours','Overtime','Actions'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{timesheets.map(r => <TableRow key={String(r.id)} selected={selectedTimesheet===r.id}><TableCell>{text(r.workerName)}</TableCell><TableCell>{text(r.periodStart)} – {text(r.periodEnd)}</TableCell><TableCell><Chip size="small" label={text(r.status)} /></TableCell><TableCell>{(Number(r.minutesWorked||0)/60).toFixed(1)}</TableCell><TableCell>{(Number(r.overtimeMinutes||0)/60).toFixed(1)}</TableCell><TableCell><Button size="small" onClick={() => void openTimesheet(String(r.id))}>Open</Button>{r.status === 'submitted' && <><Button size="small" disabled={busy} onClick={() => void perform(() => request(`tenant/timesheets/${r.id}/approve`,json('POST',{reason:'Reviewed and approved.'})),'Timesheet approved.')}>Approve</Button><Button size="small" color="error" disabled={busy} onClick={() => void perform(() => request(`tenant/timesheets/${r.id}/reject`,json('POST',{reason:'Please correct the submitted timesheet.'})),'Timesheet rejected.')}>Reject</Button></>}</TableCell></TableRow>)}
              {!timesheets.length && <TableRow><TableCell colSpan={6}>No timesheets.</TableCell></TableRow>}</TableBody>
          </Table>
          {timesheetDetail && <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
              <Box><Typography fontWeight={800}>Timesheet lines</Typography><Typography variant="caption" color="text.secondary">Status: {text(timesheetDetail.status)}</Typography></Box>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {['draft','rejected'].includes(String(timesheetDetail.status)) && <>
                  <Button variant="outlined" disabled={busy} onClick={beginTimesheetEdit}>Edit header</Button>
                  <Button variant="outlined" disabled={busy} onClick={() => void perform(() => request(`tenant/timesheets/${selectedTimesheet}/submit`,json('POST')),'Timesheet submitted for approval.')}>Submit for approval</Button>
                </>}
              </Stack>
            </Stack>
            {editingTimesheet && <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography fontWeight={700}>Edit timesheet details</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField size="small" type="date" label="Period start" value={timesheetHeader.periodStart} onChange={e => setTimesheetHeader(v => ({ ...v, periodStart: e.target.value }))} InputLabelProps={{ shrink: true }} />
                <TextField size="small" type="date" label="Period end" value={timesheetHeader.periodEnd} onChange={e => setTimesheetHeader(v => ({ ...v, periodEnd: e.target.value }))} InputLabelProps={{ shrink: true }} />
                <TextField size="small" label="Notes" value={timesheetHeader.notes} onChange={e => setTimesheetHeader(v => ({ ...v, notes: e.target.value }))} fullWidth />
                <Button variant="contained" disabled={busy || !timesheetHeader.periodStart || !timesheetHeader.periodEnd || timesheetHeader.periodEnd < timesheetHeader.periodStart} onClick={() => void perform(async () => {
                  await request(`tenant/timesheets/${selectedTimesheet}`, json('PATCH', timesheetHeader));
                  setEditingTimesheet(false);
                  await openTimesheet(selectedTimesheet);
                }, 'Timesheet details updated.')}>Save header</Button>
                <Button color="inherit" disabled={busy} onClick={() => setEditingTimesheet(false)}>Cancel</Button>
              </Stack>
            </Stack>}
            {['draft','rejected'].includes(String(timesheetDetail.status)) && <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography fontWeight={700}>{editingLineId ? 'Edit timesheet line' : 'Add timesheet line'}</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField size="small" type="date" label="Work date" value={line.workDate} onChange={e => setLine(v => ({ ...v, workDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                <TextField size="small" type="number" label="Minutes" inputProps={{ min: 0, max: 1440 }} value={line.minutesWorked} onChange={e => setLine(v => ({ ...v, minutesWorked: e.target.value }))} />
                <TextField size="small" type="number" label="Overtime minutes" inputProps={{ min: 0, max: 1440 }} value={line.overtimeMinutes} onChange={e => setLine(v => ({ ...v, overtimeMinutes: e.target.value }))} />
                <TextField size="small" type="number" label="Units completed" inputProps={{ min: 0, step: '0.0001' }} value={line.unitsCompleted} onChange={e => setLine(v => ({ ...v, unitsCompleted: e.target.value }))} />
                <TextField size="small" label="Project ID" value={line.projectId} onChange={e => setLine(v => ({ ...v, projectId: e.target.value }))} />
                <TextField size="small" label="Site ID" value={line.siteId} onChange={e => setLine(v => ({ ...v, siteId: e.target.value }))} />
              </Stack>
              <TextField size="small" label="Description" value={line.description} onChange={e => setLine(v => ({ ...v, description: e.target.value }))} />
              <Alert severity={dailyMinutesExceeded ? 'error' : 'info'}>{`Daily total preview: ${dailyProposedMinutes} / 1,440 minutes (${(dailyProposedMinutes/60).toFixed(2)} hours) including this entry.`}</Alert>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" disabled={busy || dailyMinutesExceeded || !line.workDate || Number(line.minutesWorked)<0 || Number(line.minutesWorked)>1440 || Number(line.overtimeMinutes)<0 || Number(line.overtimeMinutes)>1440} onClick={() => void perform(async () => {
                  const payload={...line,minutesWorked:Number(line.minutesWorked),overtimeMinutes:Number(line.overtimeMinutes),projectId:line.projectId||null,siteId:line.siteId||null,unitsCompleted:line.unitsCompleted===''?null:Number(line.unitsCompleted)};
                  await request(editingLineId ? `tenant/timesheets/${selectedTimesheet}/lines/${editingLineId}` : `tenant/timesheets/${selectedTimesheet}/lines`,json(editingLineId?'PATCH':'POST',payload));
                  setEditingLineId(null);
                  setLine({workDate:today(),minutesWorked:'480',overtimeMinutes:'0',description:'',projectId:'',siteId:'',unitsCompleted:''});
                  await openTimesheet(selectedTimesheet);
                },editingLineId?'Timesheet line updated.':'Timesheet line added.')}>{editingLineId?'Save line':'Add line'}</Button>
                {editingLineId && <Button color="inherit" disabled={busy} onClick={() => {setEditingLineId(null);setLine({workDate:today(),minutesWorked:'480',overtimeMinutes:'0',description:'',projectId:'',siteId:'',unitsCompleted:''});}}>Cancel edit</Button>}
              </Stack>
            </Stack>}
            <Table size="small" sx={{ mt: 2 }}><TableHead><TableRow>{['Date','Minutes','Overtime','Units','Description',''].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
              <TableBody>{rows(timesheetDetail.lines).map(r => <TableRow key={String(r.id)}><TableCell>{text(r.workDate)}</TableCell><TableCell>{text(r.minutesWorked)}</TableCell><TableCell>{text(r.overtimeMinutes)}</TableCell><TableCell>{text(r.unitsCompleted)}</TableCell><TableCell>{text(r.description)}</TableCell><TableCell>{['draft','rejected'].includes(String(timesheetDetail.status)) && <Stack direction="row"><Button size="small" disabled={busy} onClick={() => {setEditingLineId(String(r.id));setLine({workDate:String(r.workDate??today()).slice(0,10),minutesWorked:String(r.minutesWorked??0),overtimeMinutes:String(r.overtimeMinutes??0),description:String(r.description??''),projectId:String(r.projectId??''),siteId:String(r.siteId??''),unitsCompleted:r.unitsCompleted==null?'':String(r.unitsCompleted)});}}>Edit</Button><Button size="small" color="error" disabled={busy} onClick={() => void perform(async () => { await request(`tenant/timesheets/${selectedTimesheet}/lines/${r.id}`,json('DELETE')); await openTimesheet(selectedTimesheet); },'Timesheet line removed.')}>Remove</Button></Stack>}</TableCell></TableRow>)}
                {!rows(timesheetDetail.lines).length && <TableRow><TableCell colSpan={6}>No lines have been added.</TableCell></TableRow>}</TableBody>
            </Table>
          </Box>}
        </Stack>}
      </CardContent>
    </Card>
    <Stack direction="row" justifyContent="flex-end"><Button onClick={() => void refresh()} disabled={busy}>Refresh records</Button></Stack>
  </Stack>;
}
