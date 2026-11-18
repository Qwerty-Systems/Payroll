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
  const [selectedPayslip,setSelectedPayslip]=useState<Row|null>(null);
  const [paymentBatches,setPaymentBatches]=useState<Row[]>([]);
  const [paymentBatch,setPaymentBatch]=useState<Row|null>(null);
  const [paymentMethod,setPaymentMethod]=useState<'manual'|'bank_transfer'|'mpesa'>('manual');
  const [corrections,setCorrections]=useState<Row[]>([]);
  const [correctionReason,setCorrectionReason]=useState('');
  const [correctionType,setCorrectionType]=useState<'adjustment'|'reversal'>('adjustment');
  const [correctionWorker,setCorrectionWorker]=useState('');
  const [correctionCode,setCorrectionCode]=useState('PAYROLL_ADJUSTMENT');
  const [correctionDescription,setCorrectionDescription]=useState('');
  const [correctionEarnings,setCorrectionEarnings]=useState('0');
  const [correctionDeduction,setCorrectionDeduction]=useState('0');
  const [correctionEmployer,setCorrectionEmployer]=useState('0');
  const [remittance,setRemittance]=useState<Row|null>(null);
  const [ledger,setLedger]=useState<Row|null>(null);
  const [providerReferences,setProviderReferences]=useState<Record<string,string>>({});
  const [paymentReasons,setPaymentReasons]=useState<Record<string,string>>({});
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
    try {const detail=await request<Row>('payroll/runs/'+id);setRunDetail(detail);setRunDescription(String(detail.description??''));setPaymentBatch(null);if(detail.status==='finalized'){setPaymentBatches(asRows(await request<unknown>('payroll/runs/'+id+'/payment-batches')));setCorrections(asRows(await request<unknown>('payroll/runs/'+id+'/corrections')));}else{setPaymentBatches([]);setCorrections([]);}}
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


  async function createPayrollCorrection() {
    if(!selectedRun||!correctionReason.trim())return;
    const earnings=Number(correctionEarnings||0),deduction=Number(correctionDeduction||0),employer=Number(correctionEmployer||0);
    const line={workerId:correctionWorker,code:correctionCode,description:correctionDescription,earningsDelta:earnings,employeeDeductionDelta:deduction,employerContributionDelta:employer,netPayDelta:earnings-deduction};
    await perform(async()=>{
      await request('payroll/runs/'+selectedRun+'/corrections',body('POST',{type:correctionType,reason:correctionReason,lines:correctionType==='reversal'?[]:[line]}));
      setCorrections(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/corrections')));
      setCorrectionReason('');setCorrectionDescription('');setCorrectionEarnings('0');setCorrectionDeduction('0');setCorrectionEmployer('0');
    },'Correction record created. Submit it for independent review.');
  }

  async function loadPayrollReports() {
    if(!selectedRun)return;
    await perform(async()=>{
      const [r,l]=await Promise.all([request<Row>('payroll/runs/'+selectedRun+'/remittance-schedule'),request<Row>('payroll/runs/'+selectedRun+'/general-ledger')]);
      setRemittance(r);setLedger(l);
    },'Remittance schedule and ledger preview loaded.');
  }

  async function openPayslipPrint(id:string) {
    const win=window.open('','_blank');
    if(!win)throw new Error('Allow pop-ups to open the printable payslip.');
    try {
      const html=await request<string>('payroll/payslips/'+id+'/print');
      win.document.write(html);win.document.close();
    } catch(error) {
      win.close();
      throw error;
    }
  }

  async function loadPayslips(runId:string) {
    await perform(async()=>{
      const result=await request<unknown>('payroll/runs/'+runId+'/payslips');
      setPayslips(asRows(result));setSelectedRun(runId);setTab('payslips');
    },'Payslips loaded.');
  }


  async function openPaymentBatch(id:string) {
    try {
      const detail=await request<Row>('payroll/payment-batches/'+id);
      setPaymentBatch(detail);
      setProviderReferences({});
    } catch(e) { setError(e instanceof Error?e.message:'Unable to load payment batch.'); }
  }

  async function createPaymentBatch() {
    if(!selectedRun)return;
    await perform(async()=>{
      const result=await request<Row>('payroll/runs/'+selectedRun+'/payment-batches',body('POST',{paymentMethod}));
      setPaymentBatches(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/payment-batches')));
      if(result.id) await openPaymentBatch(result.id);
    },'Payment batch created. It must be independently approved before payment confirmations.');
  }

  async function refreshPaymentBatch(id:string) {
    const detail=await request<Row>('payroll/payment-batches/'+id);
    setPaymentBatch(detail);
    setPaymentBatches(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/payment-batches')));
  }


  function downloadCsv(filename:string, records:unknown[][]) {
    const csv=records.map(record=>record.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\\r\\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportPayrollRegister() {
    const records:unknown[][]=[['Employee number','Employee','Basic earnings','Allowances','Gross pay','Employee statutory deductions','Other deductions','Net pay']];
    for(const item of items) {
      const snapshot=item.snapshot??{},worker=snapshot.worker??{},earnings=snapshot.earnings??{};
      const statutory=snapshot.statutory??{};
      records.push([worker.workerNumber,[worker.firstName,worker.middleName,worker.lastName].filter(Boolean).join(' '),
        earnings.amount,snapshot.allowances?.total,earnings.grossPay,statutory.employeeStatutoryDeductions,
        snapshot.otherDeductions?.total,snapshot.netPay]);
    }
    downloadCsv('jengaflow-payroll-register-'+selectedRun+'.csv',records);
  }

  function exportStatutorySummary() {
    const grouped=new Map<string,{code:string;side:string;amount:number}>();
    for(const item of items) {
      const lines=item.snapshot?.statutory?.lines;
      if(!Array.isArray(lines))continue;
      for(const line of lines) {
        const key=String(line.code)+'|'+String(line.side);
        const current=grouped.get(key)??{code:String(line.code),side:String(line.side),amount:0};
        current.amount+=Number(line.amount??0);grouped.set(key,current);
      }
    }
    const records:unknown[][]=[['Statutory code','Contribution side','Total amount']];
    for(const row of grouped.values())records.push([row.code,row.side,Math.round((row.amount+Number.EPSILON)*100)/100]);
    downloadCsv('jengaflow-statutory-summary-'+selectedRun+'.csv',records);
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
              {[[ 'Employees',totals.workerCount],['Gross earnings',totals.grossEarnings],['Employee deductions',totals.employeeDeductions],['Employer contributions',totals.employerContributions],['Net pay',totals.netPay],['Employer cost',totals.employerCost]].map(([k,v])=><Grid size={{xs:6,md:2}} key={String(k)}><Paper variant="outlined" sx={{p:1.2}}><Typography variant="caption" color="text.secondary">{String(k)}</Typography><Typography fontWeight={800}>{v==null?'—':k==='Employees'?String(v):money(v)}</Typography></Paper></Grid>)}
            </Grid>
            {warnings.length>0&&<Alert severity="warning" sx={{mb:2}}><Typography fontWeight={800}>Review warnings</Typography>{warnings.map((w,i)=><Typography key={i} variant="body2">{w}</Typography>)}</Alert>}
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{mb:1.5}}>
              <Button size="small" variant="outlined" disabled={!items.length} onClick={exportPayrollRegister}>Export payroll register CSV</Button>
              <Button size="small" variant="outlined" disabled={!items.length} onClick={exportStatutorySummary}>Export statutory summary CSV</Button>
            </Stack>
            <TableContainer><Table size="small"><TableHead><TableRow>{['Employee','Earnings','Employee deductions','Employer contributions','Net pay'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
              <TableBody>{items.map(i=>{const s=i.snapshot??{};const w=s.worker??{};return <TableRow key={i.id}><TableCell>{[w.firstName,w.lastName].filter(Boolean).join(' ')||w.workerNumber||i.workerId}</TableCell><TableCell>{money(i.earnings)}</TableCell><TableCell>{money(i.employeeDeductions)}</TableCell><TableCell>{money(i.employerContributions)}</TableCell><TableCell><b>{money(i.netPay)}</b></TableCell></TableRow>})}
              {!items.length&&<TableRow><TableCell colSpan={5} align="center">Calculate this run to populate employee payroll lines.</TableCell></TableRow>}</TableBody>
            </Table></TableContainer>
            <Divider sx={{my:2}}/>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {['draft','rejected'].includes(runStatus)&&<Button variant="contained" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/calculate',body('POST',{}));await openRun(selectedRun);},'Payroll calculation refreshed.')}>Calculate / recalculate</Button>}
              {runStatus==='calculated'&&<Button variant="contained" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/submit',body('POST',{}));setRunDetail(await request<Row>('payroll/runs/'+selectedRun));},'Payroll submitted for independent approval.')}>Submit for approval</Button>}
              {runStatus==='submitted'&&<><Button variant="contained" color="success" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/approve',body('POST',{}));setRunDetail(await request<Row>('payroll/runs/'+selectedRun));},'Payroll approved.')}>Approve</Button><Button variant="outlined" color="error" disabled={busy} onClick={()=>setShowReject(true)}>Reject with reason</Button></>}
              {runStatus==='approved'&&<Button variant="contained" color="success" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/finalize',body('POST',{}));setRunDetail(await request<Row>('payroll/runs/'+selectedRun));setPaymentBatches(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/payment-batches')));},'Payroll finalized and payslips issued.')}>Finalize payroll</Button>}
              {runStatus==='finalized'&&<Button variant="outlined" disabled={busy} onClick={()=>void loadPayslips(selectedRun)}>View issued payslips</Button>}
            </Stack>

            {runStatus==='finalized'&&<Box sx={{mt:3}}>
              <Divider sx={{mb:2}}/>
              <Typography fontWeight={850}>Payment batches & reconciliation</Typography>
              <Typography variant="caption" color="text.secondary">Create a payment batch from finalized net pay, approve it independently, then record provider references as each employee payment is confirmed. No funds are transferred by this screen.</Typography>
              <Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{mt:1.5,mb:2}}>
                <TextField select size="small" label="Payment method" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as 'manual'|'bank_transfer'|'mpesa')} sx={{minWidth:190}}>
                  <MenuItem value="manual">Manual confirmation</MenuItem><MenuItem value="bank_transfer">Bank transfer</MenuItem><MenuItem value="mpesa">M-Pesa</MenuItem>
                </TextField>
                <Button variant="contained" disabled={busy} onClick={()=>void createPaymentBatch()}>Create payment batch</Button>
              </Stack>
              <TableContainer><Table size="small"><TableHead><TableRow>{['Payment batch','Method','Amount','Status','Paid','Actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
                <TableBody>{paymentBatches.map(b=><TableRow key={b.id}><TableCell>{b.id}</TableCell><TableCell>{b.paymentMethod}</TableCell><TableCell>{money(b.totalAmount)}</TableCell><TableCell><Chip size="small" label={b.status}/></TableCell><TableCell>{b.paidCount??0}/{b.itemCount??0}</TableCell><TableCell><Stack direction="row" spacing={.5}><Button size="small" onClick={()=>void openPaymentBatch(b.id)}>Open</Button>{['draft','approved'].includes(String(b.status))&&<Button size="small" color="error" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/payment-batches/'+b.id+'/cancel',body('POST',{}));setPaymentBatches(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/payment-batches')));if(paymentBatch?.id===b.id)setPaymentBatch(null);},'Payment batch cancelled.')}>Cancel</Button>}</Stack></TableCell></TableRow>)}
                  {!paymentBatches.length&&<TableRow><TableCell colSpan={6} align="center">No payment batches created for this payroll run.</TableCell></TableRow>}</TableBody>
              </Table></TableContainer>
              {paymentBatch&&<Paper variant="outlined" sx={{p:2,mt:2,borderRadius:2}}>
                <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" spacing={1}>
                  <Box><Typography fontWeight={800}>Payment batch details</Typography><Typography variant="caption" color="text.secondary">{paymentBatch.id} · {paymentBatch.paymentMethod} · {money(paymentBatch.totalAmount)}</Typography></Box>
                  <Chip size="small" label={paymentBatch.status}/>
                </Stack>
                {paymentBatch.status==='draft'&&<Button sx={{mt:1}} variant="contained" disabled={busy} onClick={()=>void perform(async()=>{await request('payroll/payment-batches/'+paymentBatch.id+'/approve',body('POST',{}));await refreshPaymentBatch(paymentBatch.id);},'Payment batch approved.')}>Approve batch</Button>}
                <TableContainer sx={{mt:1}}><Table size="small"><TableHead><TableRow>{['Employee','Amount','Status','Provider reference','Confirm'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
                  <TableBody>{asRows(paymentBatch.items).map(item=><TableRow key={item.id}><TableCell>{item.workerName} · {item.workerNumber}</TableCell><TableCell>{money(item.amount)}</TableCell><TableCell><Chip size="small" label={item.status}/></TableCell>
                    <TableCell>{item.providerReference??(item.status==='paid'?'—':<TextField size="small" value={providerReferences[item.id]??''} onChange={e=>setProviderReferences(v=>({...v,[item.id]:e.target.value}))} placeholder="Bank/M-Pesa reference"/>)}</TableCell>
                    <TableCell><Stack spacing={.5}>
                      {item.status!=='paid'&&['approved','partially_paid'].includes(String(paymentBatch.status))&&<Button size="small" disabled={busy||(providerReferences[item.id]??'').trim().length<3} onClick={()=>void perform(async()=>{await request('payroll/payment-batches/'+paymentBatch.id+'/items/'+item.id+'/confirm',body('POST',{providerReference:(providerReferences[item.id]??'').trim()}));await refreshPaymentBatch(paymentBatch.id);},'Payment confirmation recorded.')}>Confirm paid</Button>}
                      {['pending','processing'].includes(String(item.status))&&<><TextField size="small" value={paymentReasons[item.id]??''} onChange={e=>setPaymentReasons(v=>({...v,[item.id]:e.target.value}))} placeholder="Failure reason"/><Button size="small" color="error" disabled={busy||(paymentReasons[item.id]??'').trim().length<5} onClick={()=>void perform(async()=>{await request('payroll/payment-batches/'+paymentBatch.id+'/items/'+item.id+'/fail',body('POST',{reason:(paymentReasons[item.id]??'').trim()}));await refreshPaymentBatch(paymentBatch.id);},'Payment marked failed.')}>Mark failed</Button></>}
                      {item.status==='paid'&&<Button size="small" color="error" disabled={busy||(paymentReasons[item.id]??'').trim().length<5} onClick={()=>void perform(async()=>{await request('payroll/payment-batches/'+paymentBatch.id+'/items/'+item.id+'/reverse',body('POST',{reason:paymentReasons[item.id].trim()}));await refreshPaymentBatch(paymentBatch.id);},'Payment reversal recorded.')}>Reverse payment</Button>}
                    </Stack></TableCell>
                  </TableRow>)}
                    {!asRows(paymentBatch.items).length&&<TableRow><TableCell colSpan={5}>No payment items found.</TableCell></TableRow>}
                  </TableBody></Table></TableContainer>
              </Paper>}
            </Box>}
            {runDetail.rejectionReason&&<Alert severity="error" sx={{mt:2}}>Returned for correction: {runDetail.rejectionReason}</Alert>}

            {runStatus==='finalized'&&<Stack spacing={2} sx={{mt:2}}>
              <Alert severity="info">Finalized payroll is immutable. Corrections are separate auditable records and never overwrite the original run or issued payslips.</Alert>
              <Divider/>
              <Typography fontWeight={850}>Post-finalization corrections and reversals</Typography>
              <Typography variant="caption" color="text.secondary">An adjustment must balance: net pay change = earnings change − employee deduction change. A full reversal is generated from the original finalized payroll.</Typography>
              <TextField select size="small" label="Correction type" value={correctionType} onChange={e=>setCorrectionType(e.target.value as 'adjustment'|'reversal')} sx={{maxWidth:320}}>
                <MenuItem value="adjustment">Adjustment</MenuItem><MenuItem value="reversal">Full payroll reversal</MenuItem>
              </TextField>
              <TextField fullWidth multiline minRows={2} label="Reason / supporting explanation" value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)}/>
              {correctionType==='adjustment'&&<Grid container spacing={1}>
                <Grid size={{xs:12,md:4}}><TextField select fullWidth size="small" label="Employee" value={correctionWorker} onChange={e=>setCorrectionWorker(e.target.value)}>
                  {items.map(i=><MenuItem key={i.workerId} value={i.workerId}>{i.snapshot?.worker?.workerNumber??i.workerId} · {[i.snapshot?.worker?.firstName,i.snapshot?.worker?.lastName].filter(Boolean).join(' ')}</MenuItem>)}
                </TextField></Grid>
                <Grid size={{xs:12,md:4}}><TextField fullWidth size="small" label="Adjustment code" value={correctionCode} onChange={e=>setCorrectionCode(e.target.value)}/></Grid>
                <Grid size={{xs:12,md:4}}><TextField fullWidth size="small" label="Description" value={correctionDescription} onChange={e=>setCorrectionDescription(e.target.value)}/></Grid>
                <Grid size={{xs:12,md:4}}><TextField fullWidth size="small" type="number" label="Earnings change (KES)" value={correctionEarnings} onChange={e=>setCorrectionEarnings(e.target.value)}/></Grid>
                <Grid size={{xs:12,md:4}}><TextField fullWidth size="small" type="number" label="Employee deduction change (KES)" value={correctionDeduction} onChange={e=>setCorrectionDeduction(e.target.value)}/></Grid>
                <Grid size={{xs:12,md:4}}><TextField fullWidth size="small" type="number" label="Employer contribution change (KES)" value={correctionEmployer} onChange={e=>setCorrectionEmployer(e.target.value)}/></Grid>
                <Grid size={{xs:12}}><Typography variant="caption">Calculated net pay change: {money(Number(correctionEarnings||0)-Number(correctionDeduction||0))}</Typography></Grid>
              </Grid>}
              <Button variant="contained" disabled={busy||correctionReason.trim().length<8||(correctionType==='adjustment'&&(!correctionWorker||!correctionDescription.trim()||!correctionCode.trim()))||(correctionType==='reversal'&&corrections.some(x=>x.correctionType==='reversal'&&['submitted','approved','applied'].includes(x.status)))} onClick={()=>void createPayrollCorrection()}>
                {correctionType==='reversal'?'Create full reversal':'Create adjustment'}
              </Button>
              <TableContainer><Table size="small"><TableHead><TableRow>{['Correction #','Type','Reason','Status','Created','Actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
                {corrections.map(x=><TableRow key={x.id}><TableCell>{x.correctionNumber}</TableCell><TableCell>{x.correctionType}</TableCell><TableCell>{x.reason}</TableCell><TableCell><Chip size="small" label={x.status}/></TableCell><TableCell>{fmtDate(x.createdAt)}</TableCell><TableCell><Stack direction="row" spacing={.5}>
                  {x.status==='draft'&&<Button size="small" onClick={()=>void perform(async()=>{await request('payroll/corrections/'+x.id+'/submit',body('POST',{}));setCorrections(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/corrections')));},'Correction submitted for review.')}>Submit</Button>}
                  {x.status==='submitted'&&<Button size="small" onClick={()=>void perform(async()=>{await request('payroll/corrections/'+x.id+'/approve',body('POST',{}));setCorrections(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/corrections')));},'Correction approved.')}>Approve</Button>}
                  {x.status==='approved'&&<Button size="small" color="success" onClick={()=>void perform(async()=>{await request('payroll/corrections/'+x.id+'/apply',body('POST',{}));setCorrections(asRows(await request<unknown>('payroll/runs/'+selectedRun+'/corrections')));},'Correction applied to the correction register.')}>Apply</Button>}
                </Stack></TableCell></TableRow>)}
                {!corrections.length&&<TableRow><TableCell colSpan={6}>No post-finalization corrections recorded.</TableCell></TableRow>}
              </TableBody></Table></TableContainer>
              <Divider/>
              <Button variant="outlined" onClick={()=>void loadPayrollReports()} disabled={busy}>Load remittance & accounting reports</Button>
              {remittance&&<Paper variant="outlined" sx={{p:2}}><Typography fontWeight={800}>Statutory remittance schedule · {remittance.periodCode}</Typography><Table size="small"><TableHead><TableRow><TableCell>Code</TableCell><TableCell align="right">Employee</TableCell><TableCell align="right">Employer</TableCell><TableCell align="right">Total</TableCell></TableRow></TableHead><TableBody>{asRows(remittance.items).map(x=><TableRow key={x.code}><TableCell>{x.code}</TableCell><TableCell align="right">{money(x.employee)}</TableCell><TableCell align="right">{money(x.employer)}</TableCell><TableCell align="right">{money(x.total)}</TableCell></TableRow>)}</TableBody></Table></Paper>}
              {ledger&&<Paper variant="outlined" sx={{p:2}}><Typography fontWeight={800}>General ledger journal preview · {ledger.periodCode}</Typography><Table size="small"><TableHead><TableRow><TableCell>Account</TableCell><TableCell align="right">Debit</TableCell><TableCell align="right">Credit</TableCell></TableRow></TableHead><TableBody>{asRows(ledger.journal).map((x,i)=><TableRow key={i}><TableCell>{x.account}</TableCell><TableCell align="right">{money(x.debit)}</TableCell><TableCell align="right">{money(x.credit)}</TableCell></TableRow>)}</TableBody></Table><Typography variant="caption">Debit: {money(ledger.totals?.debit)} · Credit: {money(ledger.totals?.credit)}</Typography></Paper>}
            </Stack>}

          </Paper>}
        </Stack>}

        {tab==='payslips'&&<Stack spacing={2}>
          <Typography fontWeight={800}>Issued payslips</Typography>
          <TextField select size="small" label="Finalized payroll run" value={selectedRun} onChange={e=>void loadPayslips(e.target.value)} sx={{maxWidth:480}}>
            {runs.filter(r=>r.status==='finalized').map(r=><MenuItem key={r.id} value={r.id}>{r.periodCode??r.periodId} · Run {r.runNumber}</MenuItem>)}
          </TextField>
          <TableContainer><Table size="small"><TableHead><TableRow>{['Payslip no.','Employee','Gross','Deductions','Net pay','Issued',''].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
            {payslips.map(p=>{const s=p.snapshot??{};return <TableRow key={p.id}><TableCell>{p.payslipNumber}</TableCell><TableCell>{s.worker?.firstName??p.workerId} {s.worker?.lastName??''}</TableCell><TableCell>{money(s.earnings?.amount)}</TableCell><TableCell>{money(Number(s.statutory?.employeeStatutoryDeductions??0)+Number(s.otherDeductions?.total??0))}</TableCell><TableCell>{money(s.netPay)}</TableCell><TableCell>{fmtDate(p.issuedAt)}</TableCell><TableCell><Stack direction="row" spacing={.5}><Button size="small" onClick={()=>setSelectedPayslip(p)}>View details</Button><Button size="small" onClick={()=>void openPayslipPrint(p.id)}>Print / PDF</Button></Stack></TableCell></TableRow>})}
            {!payslips.length&&<TableRow><TableCell colSpan={7} align="center">Choose a finalized run to load its payslips.</TableCell></TableRow>}
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


    <Dialog open={Boolean(selectedPayslip)} onClose={()=>setSelectedPayslip(null)} fullWidth maxWidth="md">
      <DialogTitle>Employee payslip</DialogTitle>
      <DialogContent>
        {selectedPayslip&&(()=>{
          const s=selectedPayslip.snapshot??{};
          const w=s.worker??{},e=s.earnings??{},a=s.allowances??{},st=s.statutory??{},d=s.otherDeductions??{};
          const lines=Array.isArray(st.lines)?st.lines as Row[]:[];
          return <Stack spacing={2} sx={{pt:1}}>
            <Box><Typography variant="h6" fontWeight={850}>{[w.firstName,w.middleName,w.lastName].filter(Boolean).join(' ')||w.workerNumber}</Typography><Typography variant="body2" color="text.secondary">{w.workerNumber} · {w.email??''}</Typography><Typography variant="caption" color="text.secondary">Period: {fmtDate(s.period?.startDate)} – {fmtDate(s.period?.endDate)} · Payslip {selectedPayslip.payslipNumber}</Typography></Box>
            <Grid container spacing={1}>
              <Grid size={{xs:6,md:3}}><Paper variant="outlined" sx={{p:1.5}}><Typography variant="caption">Basic earnings</Typography><Typography fontWeight={800}>{money(e.amount)}</Typography></Paper></Grid>
              <Grid size={{xs:6,md:3}}><Paper variant="outlined" sx={{p:1.5}}><Typography variant="caption">Allowances</Typography><Typography fontWeight={800}>{money(a.total)}</Typography></Paper></Grid>
              <Grid size={{xs:6,md:3}}><Paper variant="outlined" sx={{p:1.5}}><Typography variant="caption">Gross pay</Typography><Typography fontWeight={800}>{money(e.grossPay)}</Typography></Paper></Grid>
              <Grid size={{xs:6,md:3}}><Paper variant="outlined" sx={{p:1.5}}><Typography variant="caption">Net pay</Typography><Typography fontWeight={900}>{money(s.netPay)}</Typography></Paper></Grid>
            </Grid>
            <Typography fontWeight={800}>Allowances</Typography>
            <Table size="small"><TableHead><TableRow><TableCell>Component</TableCell><TableCell>Tax treatment</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>
              {asRows(a.lines).map((x,i)=><TableRow key={String(x.assignmentId??i)}><TableCell>{x.name??x.code}</TableCell><TableCell>{x.taxTreatment??'—'}</TableCell><TableCell align="right">{money(x.amount)}</TableCell></TableRow>)}
              {!asRows(a.lines).length&&<TableRow><TableCell colSpan={3}>No allowances.</TableCell></TableRow>}
            </TableBody></Table>
            <Typography fontWeight={800}>Statutory deductions and employer contributions</Typography>
            <Table size="small"><TableHead><TableRow><TableCell>Code</TableCell><TableCell>Side</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>
              {lines.map((x,i)=><TableRow key={String(x.code??i)}><TableCell>{String(x.code??'')}</TableCell><TableCell>{String(x.side??'')}</TableCell><TableCell align="right">{money(x.amount)}</TableCell></TableRow>)}
              {!lines.length&&<TableRow><TableCell colSpan={3}>No statutory lines returned.</TableCell></TableRow>}
            </TableBody></Table>
            <Typography fontWeight={800}>Other deductions</Typography>
            <Table size="small"><TableHead><TableRow><TableCell>Component</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>
              {asRows(d.lines).map((x,i)=><TableRow key={String(x.assignmentId??i)}><TableCell>{x.name??x.code}</TableCell><TableCell align="right">{money(x.amount)}</TableCell></TableRow>)}
              {!asRows(d.lines).length&&<TableRow><TableCell colSpan={2}>No other deductions.</TableCell></TableRow>}
            </TableBody></Table>
            <Alert severity="info">This payslip is an issued payroll snapshot. It is read-only and remains unchanged if employee settings are later updated.</Alert>
          </Stack>;
        })()}
      </DialogContent>
      <DialogActions><Button onClick={()=>setSelectedPayslip(null)}>Close</Button>{selectedPayslip&&<Button variant="contained" onClick={()=>void openPayslipPrint(selectedPayslip.id)}>Print / Save PDF</Button>}</DialogActions>
    </Dialog>
    <Dialog open={showReject} onClose={()=>setShowReject(false)} fullWidth maxWidth="sm">
      <DialogTitle>Return payroll for correction</DialogTitle>
      <DialogContent><TextField autoFocus multiline minRows={3} fullWidth label="Reason for rejection" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} sx={{mt:1}} /></DialogContent>
      <DialogActions><Button onClick={()=>setShowReject(false)}>Cancel</Button><Button color="error" variant="contained" disabled={busy||rejectReason.trim().length<5} onClick={()=>void perform(async()=>{await request('payroll/runs/'+selectedRun+'/reject',body('POST',{reason:rejectReason.trim()}));setShowReject(false);setRejectReason('');await openRun(selectedRun);},'Payroll returned for correction.')}>Reject payroll</Button></DialogActions>
    </Dialog>
    <Stack direction="row" justifyContent="flex-end"><Button disabled={busy} onClick={()=>void refresh()}>Refresh payroll data</Button></Stack>
  </Stack>;
}
