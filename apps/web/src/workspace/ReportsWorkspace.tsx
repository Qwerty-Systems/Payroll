import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';

type Row = Record<string, any> & { id?: string };
type Request = <T,>(path: string, init?: RequestInit) => Promise<T>;
type Props = { request: Request };
const rows = (v: unknown): Row[] => Array.isArray(v) ? v as Row[] : [];
const money = (v: unknown) => 'KES ' + Number(v ?? 0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});

export default function ReportsWorkspace({request}:Props) {
  const [data,setData]=useState<Row[]>([]);
  const [period,setPeriod]=useState('');
  const [runId,setRunId]=useState('');
  const [detail,setDetail]=useState<Row|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try { const result=await request<unknown>('reports/payroll'+(period?'?periodId='+encodeURIComponent(period):'')); setData(rows(result)); }
    catch(e){setError(e instanceof Error?e.message:'Unable to load payroll report.');}
    finally{setLoading(false);}
  },[request,period]);
  useEffect(()=>{void load();},[load]);
  async function openRun(id:string) {
    setRunId(id);setDetail(null);setError('');
    try{setDetail(await request<Row>('reports/payroll/runs/'+id));}
    catch(e){setError(e instanceof Error?e.message:'Unable to load payroll run detail.');}
  }
  function exportSummary() {
    const csv=[['Period','Run','Status','Employees','Earnings','Deductions','Employer contributions','Net pay'],...data.map(r=>[r.periodName??r.periodCode,r.runNumber??'',r.runStatus??'No run',r.workerCount,r.totalEarnings,r.totalDeductions,r.totalEmployerContributions,r.totalNetPay])]
      .map(line=>line.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='jengaflow-payroll-report.csv';a.click();URL.revokeObjectURL(url);
  }
  const total=(key:string)=>data.reduce((sum,r)=>sum+Number(r[key]??0),0);
  return <Stack spacing={2}>
    <Box><Typography variant="h5" fontWeight={850}>Payroll reports</Typography><Typography variant="body2" color="text.secondary">Tenant-scoped payroll totals and run-level employee detail.</Typography></Box>
    {error&&<Alert severity="error">{error}</Alert>}
    <Card variant="outlined"><CardContent><Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}>
      <TextField select size="small" label="Pay period" value={period} onChange={e=>setPeriod(e.target.value)} sx={{minWidth:240}}><MenuItem value="">All periods</MenuItem>{Array.from(new Map(data.map(r=>[r.periodId,r])).values()).map(r=><MenuItem key={r.periodId} value={r.periodId}>{r.periodCode} · {r.periodName}</MenuItem>)}</TextField>
      <Button variant="outlined" onClick={()=>void load()} disabled={loading}>{loading?'Loading…':'Refresh'}</Button><Button variant="contained" onClick={exportSummary} disabled={!data.length}>Export CSV</Button>
    </Stack></CardContent></Card>
    <Grid container spacing={1.5}>{[['Runs',data.filter(r=>r.runId).length],['Employees',total('workerCount')],['Gross earnings',total('totalEarnings')],['Deductions',total('totalDeductions')],['Employer contributions',total('totalEmployerContributions')],['Net pay',total('totalNetPay')]].map(([label,value])=><Grid size={{xs:6,md:4}} key={String(label)}><Paper variant="outlined" sx={{p:2}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" fontWeight={850}>{label==='Runs'||label==='Employees'?Number(value).toLocaleString():money(value)}</Typography></Paper></Grid>)}</Grid>
    <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow>{['Period','Run','Status','Employees','Earnings','Deductions','Employer costs','Net pay',''].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
      {data.map(r=><TableRow key={r.periodId+'-'+r.runId} hover><TableCell>{r.periodName??r.periodCode}<Typography variant="caption" display="block">{r.startDate?.slice?.(0,10)} — {r.endDate?.slice?.(0,10)}</Typography></TableCell><TableCell>{r.runNumber??'—'}</TableCell><TableCell><Chip size="small" label={r.runStatus??'No run'} /></TableCell><TableCell>{Number(r.workerCount??0).toLocaleString()}</TableCell><TableCell>{money(r.totalEarnings)}</TableCell><TableCell>{money(r.totalDeductions)}</TableCell><TableCell>{money(r.totalEmployerContributions)}</TableCell><TableCell>{money(r.totalNetPay)}</TableCell><TableCell>{r.runId&&<Button size="small" onClick={()=>void openRun(r.runId)}>Details</Button>}</TableCell></TableRow>)}
      {!data.length&&<TableRow><TableCell colSpan={9} align="center">{loading?'Loading report…':'No payroll report rows found.'}</TableCell></TableRow>}
    </TableBody></Table></TableContainer>
    {detail&&<Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={850}>Payroll run detail</Typography><Button onClick={()=>{setDetail(null);setRunId('')}}>Close</Button></Stack><Typography variant="caption" color="text.secondary">{detail.run?.periodCode} · {detail.run?.status} · {runId}</Typography>
      <TableContainer sx={{mt:1}}><Table size="small"><TableHead><TableRow>{['Employee no.','Employee','Earnings','Deductions','Employer contributions','Net pay'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{rows(detail.workers).map(w=><TableRow key={w.workerId}><TableCell>{w.workerNumber}</TableCell><TableCell>{w.firstName} {w.lastName}</TableCell><TableCell>{money(w.earnings)}</TableCell><TableCell>{money(w.employeeDeductions)}</TableCell><TableCell>{money(w.employerContributions)}</TableCell><TableCell>{money(w.netPay)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    </CardContent></Card>}
  </Stack>;
}
