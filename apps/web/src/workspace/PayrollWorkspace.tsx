import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';

type Row = Record<string, any> & { id: string };
type Request = <T,>(path: string, init?: RequestInit) => Promise<T>;
type Props = { request: Request; onRefresh?: () => Promise<void> };
const asRows = (v: unknown): Row[] => Array.isArray(v) ? v as Row[] : [];
const today = () => new Date().toISOString().slice(0,10);
const money = (v: unknown) => 'KES ' + Number(v ?? 0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const body = (method: string, value?: unknown): RequestInit => ({method,...(value===undefined?{}:{body:JSON.stringify(value)})});

export default function PayrollWorkspace({request,onRefresh}:Props) {
  const [periods,setPeriods]=useState<Row[]>([]);
  const [runs,setRuns]=useState<Row[]>([]);
  const [selectedPeriod,setSelectedPeriod]=useState('');
  const [selectedRun,setSelectedRun]=useState('');
  const [runDetail,setRunDetail]=useState<Row|null>(null);
  const [payslips,setPayslips]=useState<Row[]>([]);
  const [periodDialog,setPeriodDialog]=useState(false);
  const [periodEditing,setPeriodEditing]=useState('');
  const [periodForm,setPeriodForm]=useState({code:'',name:'',startDate:today().slice(0,8)+'01',endDate:today(),paymentDate:''});
  const [runDescription,setRunDescription]=useState('');
  const [rejectReason,setRejectReason]=useState('');
  const [showReject,setShowReject]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [tab,setTab]=useState<'periods'|'runs'|'payslips'>('periods');

  const refresh=useCallback(async()=>{
    setError('');
    const [p,r]=await Promise.all([
      request<unknown>('payroll/periods'),
      request<unknown>('payroll/runs'),
    ]);
    setPeriods(asRows(p));setRuns(asRows(r));
  },[request]);

  useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Unable to load payroll records.'));},[refresh]);

  async function perform(fn:()=>Promise<unknown>,message:string) {
    setBusy(true);setError('');setNotice('');
    try {await fn();await refresh();if(onRefresh)await onRefresh();setNotice(message);}
    catch(e){setError(e instanceof Error?e.message:'The payroll operation failed.');}
    finally{setBusy(false);}
  }

  async function openRun(id:string) {
    setSelectedRun(id);setTab('runs');setPayslips([]);
    try {const detail=await request<Row>('payroll/runs/'+id);setRunDetail(detail);setRunDescription(String(detail.description??''));}
    catch(e){setError(e instanceof Error?e.message:'Unable to load payroll run.');}
  }

  function newPeriod() {
    setPeriodEditing('');
    setPeriodForm({code:'',name:'',startDate:today().slice(0,8)+'01',endDate:today(),paymentDate:''});
    setPeriodDialog(true);
  }
  function editPeriod(row:Row) {
    setPeriodEditing(row.id);
    setPeriodForm({code:String(row.code??''),name:String(row.name??''),startDate:String(row.startDate??'').slice(0,10),endDate:String(row.endDate??'').slice(0,10),paymentDate:String(row.paymentDate??'').slice(0,10)});
    setPeriodDialog(true);
  }
  async function savePeriod() {
    await perform(async()=>{
      const payload={...periodForm,paymentDate:periodForm.paymentDate||null};
      if(periodEditing) await request('payroll/periods/'+periodEditing,body('PATCH',payload));
      else await request('payroll/periods',body('POST',payload));
      setPeriodDialog(false);
    },periodEditing?'Payroll period updated.':'Payroll period created.');
  }

  async function createRun() {
    if(!selectedPeriod)return;
    await perform(async()=>{
      const result=await request<Row>('payroll/runs',body('POST',{periodId:selectedPeriod,description:runDescription.trim()||undefined}));
      setRunDescription('');
      if(result.id)await openRun(result.id);
    },'Payroll run created. Calculate it to prepare employee payroll results.');
  }

  async function saveRunDescription() {
    if(!selectedRun)return;
    await perform(async()=>{
      await request('payroll/runs/'+selectedRun,body('PATCH',{description:runDescription}));
      await openRun(selectedRun);
    },'Payroll run details updated.');
  }

  async function loadPayslips(runId:string) {
    await perform(async()=>{
      const result=await request<unknown>('payroll/runs/'+runId+'/payslips');
      setPayslips(asRows(result));setSelectedRun(runId);setTab('payslips');
    },'Payslips loaded.');
  }

  const selectedPeriodRow=periods.find(p=>p.id===selectedPeriod);
  const totals=(runDetail?.totals??{}) as Record<string,unknown>;
  const items=asRows(runDetail?.items);
  const warnings=Array.isArray(runDetail?.warnings)?runDetail!.warnings.map(String):[];
  const runStatus=String(runDetail?.status??'');
  const editableRun=['draft','rejected','calculated'].includes(runStatus);
  const fmtDate=(v:unknown)=>v?String(v).slice(0,10):'—';

  return <Stack spacing={2}>
    <Box>
      <Typography variant="h5" fontWeight={850}>Payroll management</Typography>
      <Typography color="text.secondary" variant="body2">Create payroll periods and runs, review calculations, approve payroll and issue payslips. Every change is tenant-scoped and audited.</Typography>
    </Box>
    {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
    {notice&&<Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    <Card variant="outlined">
      <Stack direction="row" spacing={1} sx={{px:2,pt:1.5}}>
        <Button variant={tab==='periods'?'contained':'text'} onClick={()=>setTab('periods')}>Pay periods</Button>
        <Button variant={tab==='runs'?'contained':'text'} onClick={()=>setTab('runs')}>Payroll runs</Button>
        <Button variant={tab==='payslips'?'contained':'text'} onClick={()=>setTab('payslips')}>Payslips</Button>
      </Stack>
      <Divider sx={{mt:1}}/>
      <CardContent>
        {tab==='periods'&&<Stack spacing={2}>
          <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}}>
            <Box><Typography fontWeight={800}>Payroll periods</Typography><Typography variant="caption" color="text.secondary">Periods are one calendar month. Edit/delete is available before payroll runs are created.</Typography></Box>
            <Button variant="contained" onClick={newPeriod} disabled={busy}>Create period</Button>
          </Stack>
          <TableContainer><Table size="small"><TableHead><TableRow>{['Code','Period','Start','End','Pay date','Status','Actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{periods.map(p=><TableRow key={p.id} hover selected={selectedPeriod===p.id}>
              <TableCell>{p.code}</TableCell><TableCell>{p.name}</TableCell><TableCell>{fmtDate(p.startDate)}</TableCell><TableCell>{fmtDate(p.endDate)}</TableCell><TableCell>{fmtDate(p.paymentDate)}</TableCell>
              <TableCell><Chip size="small" label={p.status}/></TableCell>
              <TableCell><Stack direction="row" spacing={.5} flexWrap="wrap">
                <Button size="small" onClick={()=>{setSelectedPeriod(p.id);setTab('runs');}} disabled={busy}>Runs</Button>
                {p.status==='open'&&<><Button size="small" onClick={()=>editPeriod(p)} disabled={busy}>Edit</Button><Button size="small" color="error" onClick={()=>void perform(()=>request('payroll/periods/'+p.id,body('DELETE')),'Payroll period deleted.')} disabled={busy}>Delete</Button><Button size="small" onClick={()=>void perform(()=>request('payroll/periods/'+p.id+'/status',body('PATCH',{status:'locked'})),'Payroll period locked.')} disabled={busy}>Lock</Button></>}
                {p.status==='locked'&&<><Button size="small" onClick={()=>void perform(()=>request('payroll/periods/'+p.id+'/status',body('PATCH',{status:'open'})),'Payroll period reopened.')} disabled={busy}>Reopen</Button><Button size="small" onClick={()=>void perform(()=>request('payroll/periods/'+p.id+'/status',body('PATCH',{status:'closed'})),'Payroll period closed.')} disabled={busy}>Close</Button></>}
              </Stack></TableCell>
            </TableRow>)}
            {!periods.length&&<TableRow><TableCell colSpan={7} align="center">No payroll periods have been created.</TableCell></TableRow>}</TableBody>
          </Table></TableContainer>
        </Stack>}

        {tab==='runs'&&<Stack spacing={2}>
          <Box><Typography fontWeight={800}>Payroll runs</Typography><Typography variant="caption" color="text.secondary">Create a run for an open period. Rejected or draft runs can be recalculated; submitted and finalized runs are protected.</Typography></Box>
          <Grid container spacing={1.5} alignItems="center">
            <Grid size={{xs:12,md:4}}><TextField select fullWidth size="small" label="Payroll period" value={selectedPeriod} onChange={e=>setSelectedPeriod(e.target.value)}>
              {periods.map(p=><MenuItem key={p.id} value={p.id}>{p.code} · {p.name} ({p.status})</MenuItem>)}
            </TextField></Grid>
            <Grid size={{xs:12,md:5}}><TextField fullWidth size="small" label="Run description (optional)" value={runDescription} onChange={e=>setRunDescription(e.target.value)} /></Grid>
            <Grid size={{xs:12,md:3}}><Button fullWidth variant="contained" disabled={busy||!selectedPeriod||selectedPeriodRow?.status!=='open'} onClick={()=>void createRun()}>Create payroll run</Button></Grid>
          </Grid>
          <TableContainer><Table size="small"><TableHead><TableRow>{['Period','Run #','Description','Status','Employees','Net pay','Created','Actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>{runs.map(r=><TableRow key={r.id} hover selected={selectedRun===r.id}>
              <TableCell>{r.periodCode??periods.find(p=>p.id===r.periodId)?.code??'—'}</TableCell><TableCell>{r.runNumber}</TableCell><TableCell>{r.description||'—'}</TableCell><TableCell><Chip size="small" label={r.status}/></TableCell><TableCell>{r.totals?.workerCount??'—'}</TableCell><TableCell>{r.totals?.netPay==null?'—':money(r.totals.netPay)}</TableCell><TableCell>{fmtDate(r.createdAt)}</TableCell>
              <TableCell><Stack direction="row" spacing={.5}><Button size="small" onClick={()=>void openRun(r.id)}>Open</Button>{r.status==='finalized'&&<Button size="small" onClick={()=>void loadPayslips(r.id)}>Payslips</Button>}{['draft','rejected','calculated'].includes(String(r.status))&&<Button size="small" color="error" disabled={busy} onClick={()=>void perform(()=>request('payroll/runs/'+r.id,body('DELETE')),'Draft payroll run deleted.')}>Delete</Button>}</Stack></TableCell>
            </TableRow>)}
            {!runs.length&&<TableRow><TableCell colSpan={8} align="center">No payroll runs created yet.</TableCell></TableRow>}</TableBody>
          </Table></TableContainer>
          {runDetail&&<Paper variant="outlined" sx={{p:2,borderRadius:2}}>
            <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" spacing={1}>
              <Box><Typography fontWeight={850}>Payroll run #{runDetail.runNumber}</Typography><Typography variant="caption" color="text.secondary">{runDetail.id} · {runStatus}</Typography></Box>
              <Chip label={runStatus} color={runStatus==='finalized'?'success':runStatus==='rejected'?'error':'default'}/>
            </Stack>
            {editableRun&&<Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{mt:2}}>
              <TextField fullWidth size="small" label="Run description" value={runDescription} onChange={e=>setRunDescription(e.target.value)}/>
              <Button variant="outlined" disabled={busy} onClick={()=>void saveRunDescription()}>Save details</Button>
            </Stack>}
            <Grid container spacing={1} sx={{mt:1,mb:2}}>
              {[[ 'Employees',totals.workerCount],['Gross earnings',totals.grossEarnings],['Employee deductions',totals.employeeDeductions],['Employer contributions',totals.employerContributions],['Net pay',totals.netPay],['Employer cost',totals.employerCost]].map(([k,v])=><Grid size={{xs:6,md:2}} key={String(k)}><Paper variant="outlined" sx={{p:1.2}}><Typography variant="caption" color="text.secondary">{k}</Typography><Typography fontWeight={800}>{v==null?'—':k==='Employees'?String(v):money(v)}</Typography></Paper></Grid>)}
            </Grid>
            {warnings.length>0&&<Alert severity="warning" sx={{mb:2}}><Typography fontWeight={800}>Review warnings</Typography>{warnings.map((w,i)=><Typography key={i} variant="body2">{w}</Typography>)}</Alert>}
            <TableContainer><Table size="small"><TableHead><TableRow>{['Employee','Earnings','Employee deductions','Employer contributions','Net pay'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
              <TableBody>{items.map(i=>{const s=i.snapshot??{};const w=s.worker??{};return <TableRow key={i.id}><TableCell>{[w.firstName,w.lastName].filter(Boolean).join(' ')||w.workerNumber||i.workerId}</TableCell><TableCell>{money(i.earnings)}</TableCell><TableCell>{money(i.employeeDeductions)}</TableCell><TableCell>{money(i.employerContributions)}</TableCell><TableCell><b>{money(i.netPay)}</b></TableCell></TableRow>})}
              {!items.length&&<TableRow><TableCell colSpan={5} align="center">Calculate this run to populate employee payroll lines.</TableCell></TableRow>}</TableBody>
            </Table></TableContainer>
            <Divider sx={{my:2}}/>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {['draft','rejected'].includes(runStatus)&&<Button variant="contained" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/calculate',body('POST',{}));await openRun(selectedRun);},'Payroll calculation refreshed.')}>Calculate / recalculate</Button>}
              {runStatus==='calculated'&&<Button variant="contained" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/submit',body('POST',{}));setRunDetail(await request<Row>('payroll/runs/'+selectedRun));},'Payroll submitted for independent approval.')}>Submit for approval</Button>}
              {runStatus==='submitted'&&<><Button variant="contained" color="success" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/approve',body('POST',{}));setRunDetail(await request<Row>('payroll/runs/'+selectedRun));},'Payroll approved.')}>Approve</Button><Button variant="outlined" color="error" disabled={busy} onClick={()=>setShowReject(true)}>Reject with reason</Button></>}
              {runStatus==='approved'&&<Button variant="contained" color="success" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/finalize',body('POST',{}));setRunDetail(await request<Row>('payroll/runs/'+selectedRun));},'Payroll finalized and payslips issued.')}>Finalize payroll</Button>}
              {runStatus==='finalized'&&<><Button variant="outlined" disabled={busy} onClick={()=>void loadPayslips(selectedRun)}>View issued payslips</Button><Button variant="outlined" disabled={busy} onClick={()=>void perform(()=>request('payroll/runs/'+selectedRun+'/payment-batches',body('POST',{paymentMethod:'manual'})),'Manual payment batch created. Review and approve it in payment operations.')}>Create manual payment batch</Button></>}
            </Stack>
            {runDetail.rejectionReason&&<Alert severity="error" sx={{mt:2}}>Returned for correction: {runDetail.rejectionReason}</Alert>}
            {runStatus==='finalized'&&<Alert severity="info" sx={{mt:2}}>Finalized payroll is read-only. Corrections must be handled through an auditable adjustment or reversal workflow; this screen will not overwrite issued payslips.</Alert>}
          </Paper>}
        </Stack>}

        {tab==='payslips'&&<Stack spacing={2}>
          <Typography fontWeight={800}>Issued payslips</Typography>
          <TextField select size="small" label="Finalized payroll run" value={selectedRun} onChange={e=>void loadPayslips(e.target.value)} sx={{maxWidth:480}}>
            {runs.filter(r=>r.status==='finalized').map(r=><MenuItem key={r.id} value={r.id}>{r.periodCode??r.periodId} · Run {r.runNumber}</MenuItem>)}
          </TextField>
          <TableContainer><Table size="small"><TableHead><TableRow>{['Payslip no.','Employee','Gross','Deductions','Net pay','Issued'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
            {payslips.map(p=>{const s=p.snapshot??{};return <TableRow key={p.id}><TableCell>{p.payslipNumber}</TableCell><TableCell>{s.worker?.firstName??p.workerId} {s.worker?.lastName??''}</TableCell><TableCell>{money(s.earnings?.amount)}</TableCell><TableCell>{money(Number(s.statutory?.employeeStatutoryDeductions??0)+Number(s.otherDeductions?.total??0))}</TableCell><TableCell>{money(s.netPay)}</TableCell><TableCell>{fmtDate(p.issuedAt)}</TableCell></TableRow>})}
            {!payslips.length&&<TableRow><TableCell colSpan={6} align="center">Choose a finalized run to load its payslips.</TableCell></TableRow>}
          </TableBody></Table></TableContainer>
        </Stack>}
      </CardContent>
    </Card>

    <Dialog open={periodDialog} onClose={()=>setPeriodDialog(false)} fullWidth maxWidth="sm">
      <DialogTitle>{periodEditing?'Edit payroll period':'Create payroll period'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{pt:1}}>
        <TextField label="Period code" value={periodForm.code} onChange={e=>setPeriodForm(v=>({...v,code:e.target.value}))} />
        <TextField label="Period name" value={periodForm.name} onChange={e=>setPeriodForm(v=>({...v,name:e.target.value}))} />
        <TextField type="date" label="Start date" value={periodForm.startDate} onChange={e=>setPeriodForm(v=>({...v,startDate:e.target.value}))} InputLabelProps={{shrink:true}} />
        <TextField type="date" label="End date" value={periodForm.endDate} onChange={e=>setPeriodForm(v=>({...v,endDate:e.target.value}))} InputLabelProps={{shrink:true}} />
        <TextField type="date" label="Payment date (optional)" value={periodForm.paymentDate} onChange={e=>setPeriodForm(v=>({...v,paymentDate:e.target.value}))} InputLabelProps={{shrink:true}} />
        <Typography variant="caption" color="text.secondary">The payroll engine currently supports one calendar month per payroll period. A period with payroll runs cannot be edited or deleted.</Typography>
      </Stack></DialogContent>
      <DialogActions><Button onClick={()=>setPeriodDialog(false)}>Cancel</Button><Button variant="contained" disabled={busy||!periodForm.code.trim()||!periodForm.name.trim()||!periodForm.startDate||!periodForm.endDate} onClick={()=>void savePeriod()}>Save period</Button></DialogActions>
    </Dialog>

    <Dialog open={showReject} onClose={()=>setShowReject(false)} fullWidth maxWidth="sm">
      <DialogTitle>Return payroll for correction</DialogTitle>
      <DialogContent><TextField autoFocus multiline minRows={3} fullWidth label="Reason for rejection" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} sx={{mt:1}} /></DialogContent>
      <DialogActions><Button onClick={()=>setShowReject(false)}>Cancel</Button><Button color="error" variant="contained" disabled={busy||rejectReason.trim().length<5} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/reject',body('POST',{reason:rejectReason.trim()}));setShowReject(false);setRejectReason('');await openRun(selectedRun);},'Payroll returned for correction.')}>Reject payroll</Button></DialogActions>
    </Dialog>
    <Stack direction="row" justifyContent="flex-end"><Button disabled={busy} onClick={()=>void refresh()}>Refresh payroll data</Button></Stack>
  </Stack>;
}
