import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';

type Row = Record<string, any> & { id: string };
type Props = { request: <T,>(path: string, init?: RequestInit) => Promise<T>; workers: Row[]; projects: Row[]; sites: Row[] };

type Kind = 'branch' | 'department' | 'cost-centre' | 'assignment';
const blank = { code:'', name:'', address:'', branchId:'', workerId:'', departmentId:'', costCentreId:'', projectId:'', siteId:'', effectiveFrom:new Date().toISOString().slice(0,10), effectiveTo:'' };

export default function OrganizationWorkspace({ request, workers, projects, sites }: Props) {
  const [branches,setBranches]=useState<Row[]>([]);
  const [departments,setDepartments]=useState<Row[]>([]);
  const [costCentres,setCostCentres]=useState<Row[]>([]);
  const [assignments,setAssignments]=useState<Row[]>([]);
  const [kind,setKind]=useState<Kind>('branch');
  const [editing,setEditing]=useState<Row|null>(null);
  const [form,setForm]=useState(blank);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=useCallback(async()=>{
    const [b,d,c,a]=await Promise.all([
      request<unknown>('tenant/organization/branches'), request<unknown>('tenant/organization/departments'),
      request<unknown>('tenant/organization/cost-centres'), request<unknown>('tenant/organization/worker-assignments'),
    ]);
    setBranches(Array.isArray(b)?b as Row[]:[]);
    setDepartments(Array.isArray(d)?d as Row[]:[]);
    setCostCentres(Array.isArray(c)?c as Row[]:[]);
    setAssignments(Array.isArray(a)?a as Row[]:[]);
  },[request]);
  useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Could not load organization data.'));},[refresh]);

  const start=(nextKind:Kind,row?:Row)=>{
    setKind(nextKind);setEditing(row??null);
    setForm({...blank,...(row?{
      code:row.code??'',name:row.name??'',address:row.address??'',
      branchId:row.branchId??'',workerId:row.workerId??'',departmentId:row.departmentId??'',
      costCentreId:row.costCentreId??'',projectId:row.projectId??'',siteId:row.siteId??'',
      effectiveFrom:String(row.effectiveFrom??blank.effectiveFrom).slice(0,10),
      effectiveTo:row.effectiveTo?String(row.effectiveTo).slice(0,10):'',
    }:{})});
    setError('');setOpen(true);
  };
  const set=(key:keyof typeof blank,value:string)=>setForm(old=>({...old,[key]:value}));

  async function save(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      const base=kind==='cost-centre'?'cost-centres':kind==='assignment'?'worker-assignments':kind==='branch'?'branches':'departments';
      let payload:Record<string,unknown>;
      if(kind==='branch') payload={code:form.code.trim(),name:form.name.trim(),address:form.address.trim()||null};
      else if(kind==='department') payload={code:form.code.trim(),name:form.name.trim(),branchId:form.branchId||null};
      else if(kind==='cost-centre') payload={code:form.code.trim(),name:form.name.trim()};
      else payload={workerId:form.workerId,branchId:form.branchId||null,departmentId:form.departmentId||null,costCentreId:form.costCentreId||null,projectId:form.projectId||null,siteId:form.siteId||null,effectiveFrom:form.effectiveFrom,effectiveTo:form.effectiveTo||undefined};
      const path='tenant/organization/'+base+(editing?'/'+editing.id:'');
      await request(path,{method:editing?'PATCH':'POST',body:JSON.stringify(payload)});
      setOpen(false);setNotice(editing?'Organization record updated.':'Organization record created.');
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Could not save organization record.');}
    finally{setBusy(false);}
  }

  async function archive(type:'branches'|'departments'|'cost-centres',row:Row){
    if(!window.confirm(`Archive "${row.name}"? Existing historical records will be retained.`))return;
    setBusy(true);setError('');setNotice('');
    try{await request(`tenant/organization/${type}/${row.id}`,{method:'DELETE'});setNotice('Record archived (inactive).');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not archive record. Check active dependencies first.');}
    finally{setBusy(false);}
  }

  async function endAssignment(row:Row){
    const effectiveTo=window.prompt('Enter the assignment end date (YYYY-MM-DD):',new Date().toISOString().slice(0,10));
    if(!effectiveTo)return;
    setBusy(true);setError('');setNotice('');
    try{await request(`tenant/organization/worker-assignments/${row.id}/end`,{method:'PATCH',body:JSON.stringify({effectiveTo})});setNotice('Assignment ended; its history is retained.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not end assignment.');}
    finally{setBusy(false);}
  }

  async function deleteAssignment(row:Row){
    if(!window.confirm('Permanently delete this assignment? Use this only for an incorrect record. If payroll or another record depends on it, deletion will be blocked; end the assignment instead.'))return;
    setBusy(true);setError('');setNotice('');
    try{await request(`tenant/organization/worker-assignments/${row.id}`,{method:'DELETE'});setNotice('Incorrect assignment deleted and deletion audited.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not delete assignment. If it is referenced by payroll history, end it instead.');}
    finally{setBusy(false);}
  }
  const workerName=(id:string)=>{const w=workers.find(x=>x.id===id);return w?[w.firstName,w.lastName].filter(Boolean).join(' ')||w.workerNumber:id;};
  const branchName=(id:string)=>branches.find(x=>x.id===id)?.name??'—';
  const departmentName=(id:string)=>departments.find(x=>x.id===id)?.name??'—';
  const costName=(id:string)=>costCentres.find(x=>x.id===id)?.name??'—';
  const projectName=(id:string)=>projects.find(x=>x.id===id)?.name??'—';
  const siteName=(id:string)=>sites.find(x=>x.id===id)?.name??'—';
  const TableBlock=({title,rows,entity}:{title:string;rows:Row[];entity:'branches'|'departments'|'cost-centres'})=><Paper variant="outlined" sx={{borderColor:'#E5EBE5',borderRadius:3,overflow:'hidden',bgcolor:'#fff'}}>
    <Box sx={{p:2,borderBottom:'1px solid #E9EEE9',display:'flex',alignItems:'center',justifyContent:'space-between',gap:1}}>
      <Box><Typography fontWeight={850}>{title}</Typography><Typography variant="caption" color="text.secondary">{rows.length} records</Typography></Box>
      <Button size="small" startIcon={<AddRounded/>} onClick={()=>start(entity==='branches'?'branch':entity==='departments'?'department':'cost-centre')}>Add</Button>
    </Box>
    <TableContainer><Table size="small"><TableHead><TableRow>{['Code','Name',...(entity==='branches'?['Address']:entity==='departments'?['Branch']:[]),'Status','Actions'].map(x=><TableCell key={x} sx={{fontWeight:800,color:'#68766B',bgcolor:'#FAFBFA'}}>{x}</TableCell>)}</TableRow></TableHead>
      <TableBody>{rows.map(row=><TableRow key={row.id} hover><TableCell>{row.code}</TableCell><TableCell><Typography fontWeight={700}>{row.name}</Typography></TableCell>
        {entity==='branches'&&<TableCell>{row.address||'—'}</TableCell>}{entity==='departments'&&<TableCell>{branchName(row.branchId)}</TableCell>}
        <TableCell><Chip size="small" label={row.status} color={row.status==='active'?'success':'default'}/></TableCell>
        <TableCell><Stack direction="row" spacing={.5}><Button size="small" onClick={()=>start(entity==='branches'?'branch':entity==='departments'?'department':'cost-centre',row)}>Edit</Button>
          {row.status==='active'?<Button size="small" color="warning" disabled={busy} onClick={()=>void archive(entity,row)}>Archive</Button>:<Button size="small" disabled={busy} onClick={async()=>{setBusy(true);try{await request('tenant/organization/'+entity+'/'+row.id,{method:'PATCH',body:JSON.stringify({status:'active'})});setNotice('Record reactivated.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Could not reactivate record.');}finally{setBusy(false);}}}>Reactivate</Button>}</Stack></TableCell></TableRow>)}
        {!rows.length&&<TableRow><TableCell colSpan={entity==='branches'?5:entity==='departments'?5:4} sx={{py:3,textAlign:'center',color:'text.secondary'}}>No records yet. Add your first {title.toLowerCase().replace(/s$/,'')}.</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
  </Paper>;

  return <Stack spacing={2.5}>
    {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
    {notice&&<Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    <Stack direction={{xs:'column',sm:'row'}} alignItems={{sm:'center'}} justifyContent="space-between">
      <Box><Typography variant="overline" sx={{fontWeight:850,color:'#2F6B4F',letterSpacing:'.12em'}}>ORGANIZATION STRUCTURE</Typography><Typography color="text.secondary" variant="body2">Manage branches, departments, cost centres and workforce placement.</Typography></Box>
      <Button variant="outlined" color="inherit" startIcon={<RefreshRounded/>} onClick={()=>void refresh()} disabled={busy}>Refresh records</Button>
    </Stack>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',lg:'repeat(3,minmax(0,1fr))'},gap:2}}>
      <TableBlock title="Branches" rows={branches} entity="branches"/>
      <TableBlock title="Departments" rows={departments} entity="departments"/>
      <TableBlock title="Cost centres" rows={costCentres} entity="cost-centres"/>
    </Box>
    <Paper variant="outlined" sx={{borderColor:'#E5EBE5',borderRadius:3,overflow:'hidden',bgcolor:'#fff'}}>
      <Box sx={{p:2.5,borderBottom:'1px solid #E9EEE9',display:'flex',alignItems:'center',justifyContent:'space-between',gap:1,flexWrap:'wrap'}}>
        <Box><Typography fontWeight={850}>Worker assignments</Typography><Typography variant="body2" color="text.secondary">Effective-dated team, project and site placement. Ended records remain available as history.</Typography></Box>
        <Button variant="contained" startIcon={<AddRounded/>} onClick={()=>start('assignment')}>Assign worker</Button>
      </Box>
      <TableContainer><Table size="small"><TableHead><TableRow>{['Worker','Branch','Department','Cost centre','Project','Site','From','To','Status','Actions'].map(x=><TableCell key={x} sx={{fontWeight:800,color:'#68766B',bgcolor:'#FAFBFA',whiteSpace:'nowrap'}}>{x}</TableCell>)}</TableRow></TableHead>
        <TableBody>{assignments.map(row=><TableRow key={row.id} hover><TableCell><Typography fontWeight={700}>{workerName(row.workerId)}</Typography><Typography variant="caption" color="text.secondary">{row.workerId}</Typography></TableCell>
          <TableCell>{branchName(row.branchId)}</TableCell><TableCell>{departmentName(row.departmentId)}</TableCell><TableCell>{costName(row.costCentreId)}</TableCell><TableCell>{projectName(row.projectId)}</TableCell><TableCell>{siteName(row.siteId)}</TableCell>
          <TableCell sx={{whiteSpace:'nowrap'}}>{String(row.effectiveFrom).slice(0,10)}</TableCell><TableCell>{row.effectiveTo?String(row.effectiveTo).slice(0,10):'—'}</TableCell>
          <TableCell><Chip size="small" label={row.status} color={row.status==='active'?'success':'default'}/></TableCell>
          <TableCell><Stack direction="row" spacing={.5}>{row.status==='active'&&<><Button size="small" onClick={()=>start('assignment',row)}>Edit</Button><Button size="small" color="warning" disabled={busy} onClick={()=>void endAssignment(row)}>End</Button></>}<Button size="small" color="error" disabled={busy} onClick={()=>void deleteAssignment(row)}>Delete</Button></Stack></TableCell>
        </TableRow>)}
        {!assignments.length&&<TableRow><TableCell colSpan={10} sx={{py:4,textAlign:'center',color:'text.secondary'}}>No worker assignments yet.</TableCell></TableRow>}
        </TableBody></Table></TableContainer>
    </Paper>
    <Dialog open={open} onClose={()=>!busy&&setOpen(false)} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={save}><DialogTitle>{editing?'Edit':'Create'} {kind==='cost-centre'?'cost centre':kind==='assignment'?'worker assignment':kind}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{pt:1}}>
          {kind!=='assignment'?<>
            <TextField label="Code" required value={form.code} onChange={e=>set('code',e.target.value)} inputProps={{maxLength:40}}/>
            <TextField label="Name" required value={form.name} onChange={e=>set('name',e.target.value)} inputProps={{maxLength:160}}/>
            {kind==='branch'&&<TextField label="Address" multiline minRows={2} value={form.address} onChange={e=>set('address',e.target.value)}/>}
            {kind==='department'&&<TextField select label="Branch" value={form.branchId} onChange={e=>set('branchId',e.target.value)}><MenuItem value="">No branch</MenuItem>{branches.filter(x=>x.status==='active').map(x=><MenuItem key={x.id} value={x.id}>{x.code} · {x.name}</MenuItem>)}</TextField>}
          </>:<>
            <TextField select label="Worker" required value={form.workerId} onChange={e=>set('workerId',e.target.value)}>{workers.filter(x=>x.status==='active').map(x=><MenuItem key={x.id} value={x.id}>{workerName(x.id)}</MenuItem>)}</TextField>
            <TextField select label="Branch" value={form.branchId} onChange={e=>set('branchId',e.target.value)}><MenuItem value="">Not assigned</MenuItem>{branches.filter(x=>x.status==='active').map(x=><MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}</TextField>
            <TextField select label="Department" value={form.departmentId} onChange={e=>set('departmentId',e.target.value)}><MenuItem value="">Not assigned</MenuItem>{departments.filter(x=>x.status==='active').map(x=><MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}</TextField>
            <TextField select label="Cost centre" value={form.costCentreId} onChange={e=>set('costCentreId',e.target.value)}><MenuItem value="">Not assigned</MenuItem>{costCentres.filter(x=>x.status==='active').map(x=><MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}</TextField>
            <TextField select label="Project" value={form.projectId} onChange={e=>set('projectId',e.target.value)}><MenuItem value="">Not assigned</MenuItem>{projects.filter(x=>x.status==='active').map(x=><MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}</TextField>
            <TextField select label="Site" value={form.siteId} onChange={e=>set('siteId',e.target.value)}><MenuItem value="">Not assigned</MenuItem>{sites.filter(x=>x.status==='active').map(x=><MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}</TextField>
            <TextField label="Effective from" type="date" required InputLabelProps={{shrink:true}} value={form.effectiveFrom} onChange={e=>set('effectiveFrom',e.target.value)}/>
            <TextField label="Effective to" type="date" InputLabelProps={{shrink:true}} value={form.effectiveTo} onChange={e=>set('effectiveTo',e.target.value)} helperText="Leave blank for an ongoing assignment. Setting an end date ends this assignment."/>
          </>}
        </Stack></DialogContent>
        <DialogActions sx={{p:2.5}}><Button onClick={()=>setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy?'Saving…':'Save changes'}</Button></DialogActions>
      </Box>
    </Dialog>
  </Stack>;
}
