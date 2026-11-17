import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';

type RowData = Record<string, unknown> & { id?: string };
type Section = 'organization' | 'people';
type Props = {
  section: Section;
  role: string;
  data: Record<string, RowData[]>;
  request: <T,>(path: string, init?: RequestInit) => Promise<T>;
  refresh: () => Promise<void>;
};
const rows = (value: unknown): RowData[] => Array.isArray(value) ? value as RowData[] : [];
const value = (item: unknown) => item == null || item === '' ? '—' : String(item);
const roles = ['admin','hr_manager','payroll_manager','supervisor','worker','accountant','viewer'];

export default function TenantAdministration({ section, role, data, request, refresh }: Props) {
  const [invitations, setInvitations] = useState<RowData[]>([]);
  const [dialog, setDialog] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issuedToken, setIssuedToken] = useState('');
  const [fields, setFields] = useState<Record<string,string>>({
    email:'', role:'viewer', code:'', name:'', address:'', branchId:'',
    workerId:'', departmentId:'', costCentreId:'', projectId:'', siteId:'',
    effectiveFrom:new Date().toISOString().slice(0,10), effectiveTo:'',
  });
  const set = (key:string, next:string) => setFields(current => ({...current,[key]:next}));
  const loadInvitations = useCallback(async () => {
    if (section !== 'people') return;
    try { setInvitations(rows(await request<unknown>('tenant/users/invitations'))); }
    catch { setInvitations([]); }
  }, [request, section]);
  useEffect(() => { void loadInvitations(); }, [loadInvitations]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setIssuedToken('');
    try {
      if (dialog === 'invite') {
        const result = await request<RowData>('tenant/users/invitations', {method:'POST',body:JSON.stringify({email:fields.email,role:fields.role})});
        setIssuedToken(String(result.inviteToken ?? ''));
        setNotice('Invitation created. Share the token securely with the invited person; email delivery is not configured.');
      } else if (dialog === 'branch') {
        await request('tenant/organization/branches',{method:'POST',body:JSON.stringify({code:fields.code,name:fields.name,address:fields.address || undefined})});
        setNotice('Branch created.');
      } else if (dialog === 'department') {
        await request('tenant/organization/departments',{method:'POST',body:JSON.stringify({code:fields.code,name:fields.name,branchId:fields.branchId || undefined})});
        setNotice('Department created.');
      } else if (dialog === 'costCentre') {
        await request('tenant/organization/cost-centres',{method:'POST',body:JSON.stringify({code:fields.code,name:fields.name})});
        setNotice('Cost centre created.');
      } else if (dialog === 'assignment') {
        await request('tenant/organization/worker-assignments',{method:'POST',body:JSON.stringify({
          workerId:fields.workerId,branchId:fields.branchId || undefined,
          departmentId:fields.departmentId || undefined,costCentreId:fields.costCentreId || undefined,
          projectId:fields.projectId || undefined,siteId:fields.siteId || undefined,
          effectiveFrom:fields.effectiveFrom,effectiveTo:fields.effectiveTo || undefined,
        })});
        setNotice('Worker assignment created.');
      }
      if (dialog !== 'invite') setDialog('');
      await refresh(); await loadInvitations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation could not be completed.'); }
    finally { setBusy(false); }
  }

  async function updateRole(id:string, nextRole:string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`tenant/users/memberships/${id}/role`,{method:'PATCH',body:JSON.stringify({role:nextRole})});
      setNotice('Membership role updated.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Role could not be updated.'); }
    finally { setBusy(false); }
  }
  async function suspend(id:string) {
    if (!window.confirm('Suspend this company membership? The person will lose access to this workspace.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`tenant/users/memberships/${id}/suspend`,{method:'POST',body:'{}'});
      setNotice('Membership suspended.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Membership could not be suspended.'); }
    finally { setBusy(false); }
  }
  async function revoke(id:string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`tenant/users/invitations/${id}/revoke`,{method:'POST',body:'{}'});
      setNotice('Invitation revoked.'); await loadInvitations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation could not be revoked.'); }
    finally { setBusy(false); }
  }

  const members = data.members ?? [];
  const assignments = data.assignments ?? [];
  const branches = data.branches ?? [];
  const departments = data.departments ?? [];
  const costCentres = data.costCentres ?? [];
  const canManage = ['owner','admin'].includes(role);
  const assignableRoles = role === 'owner' ? roles : roles.filter(item => item !== 'admin');
  return <Stack spacing={2}>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}{issuedToken && <TextField fullWidth multiline minRows={2} label="Invitation token — copy and share securely" value={issuedToken} InputProps={{readOnly:true}} sx={{mt:1}} />}</Alert>}
    {section === 'people' && <>
      <Paper variant="outlined" sx={{p:2,borderColor:'#E3E0D6'}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1}>
          <Box><Typography variant="h6" fontWeight={900}>Team access</Typography><Typography variant="body2" color="text.secondary">Manage workspace memberships and invitations. API permissions remain authoritative.</Typography></Box>
          <Button variant="contained" disabled={!canManage} onClick={()=>{setIssuedToken('');setDialog('invite');}}>Invite member</Button>
        </Stack>
        {!canManage && <Alert severity="info" sx={{mt:2}}>Your role can view team access but cannot manage invitations or memberships.</Alert>}
        <Table size="small" sx={{mt:2}}><TableHead><TableRow>{['Name','Email','Role','Status','Actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
          {members.map(member=><TableRow key={String(member.membershipId ?? member.id)}>
            <TableCell>{value(member.fullName)}</TableCell><TableCell>{value(member.email)}</TableCell>
            <TableCell><TextField select size="small" value={String(member.role ?? 'viewer')} disabled={!canManage || busy || member.role==='owner'} onChange={e=>void updateRole(String(member.membershipId),e.target.value)} sx={{minWidth:150}}>{assignableRoles.map(item=><MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></TableCell>
            <TableCell><Chip size="small" label={value(member.status)} color={member.status==='active'?'success':'default'}/></TableCell>
            <TableCell><Button size="small" color="error" disabled={!canManage || busy || member.role==='owner'} onClick={()=>void suspend(String(member.membershipId))}>Suspend</Button></TableCell>
          </TableRow>)}
          {!members.length && <TableRow><TableCell colSpan={5}>No workspace members found.</TableCell></TableRow>}
        </TableBody></Table>
      </Paper>
      <Paper variant="outlined" sx={{p:2,borderColor:'#E3E0D6'}}>
        <Typography variant="h6" fontWeight={900}>Invitations</Typography>
        <Table size="small" sx={{mt:1}}><TableHead><TableRow>{['Email','Role','Expires','Status','Action'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
          {invitations.map(invite=><TableRow key={String(invite.id)}><TableCell>{value(invite.email)}</TableCell><TableCell>{value(invite.role)}</TableCell><TableCell>{value(invite.expiresAt)}</TableCell><TableCell>{invite.acceptedAt?'Accepted':invite.revokedAt?'Revoked':'Pending'}</TableCell><TableCell><Button size="small" color="error" disabled={!canManage || busy || Boolean(invite.acceptedAt || invite.revokedAt)} onClick={()=>void revoke(String(invite.id))}>Revoke</Button></TableCell></TableRow>)}
          {!invitations.length && <TableRow><TableCell colSpan={5}>No invitations found.</TableCell></TableRow>}
        </TableBody></Table>
      </Paper>
    </>}
    {section === 'organization' && <>
      <Paper variant="outlined" sx={{p:2,borderColor:'#E3E0D6'}}>
        <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1}>
          <Box><Typography variant="h6" fontWeight={900}>Organization structure</Typography><Typography variant="body2" color="text.secondary">Branches, departments, cost centres and effective-dated worker assignments.</Typography></Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button variant="outlined" disabled={!canManage} onClick={()=>setDialog('branch')}>Add branch</Button>
            <Button variant="outlined" disabled={!canManage} onClick={()=>setDialog('department')}>Add department</Button>
            <Button variant="outlined" disabled={!canManage} onClick={()=>setDialog('costCentre')}>Add cost centre</Button>
            <Button variant="contained" disabled={!['owner','admin','hr_manager'].includes(role)} onClick={()=>setDialog('assignment')}>Assign worker</Button>
          </Stack>
        </Stack>
        <Typography fontWeight={800} sx={{mt:2}}>Branches</Typography>
        <Table size="small"><TableHead><TableRow>{['Code','Name','Address','Status'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{branches.map(row=><TableRow key={String(row.id)}><TableCell>{value(row.code)}</TableCell><TableCell>{value(row.name)}</TableCell><TableCell>{value(row.address)}</TableCell><TableCell>{value(row.status)}</TableCell></TableRow>)}{!branches.length&&<TableRow><TableCell colSpan={4}>No branches configured.</TableCell></TableRow>}</TableBody></Table>
        <Typography fontWeight={800} sx={{mt:2}}>Departments</Typography>
        <Table size="small"><TableHead><TableRow>{['Code','Name','Branch','Status'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{departments.map(row=><TableRow key={String(row.id)}><TableCell>{value(row.code)}</TableCell><TableCell>{value(row.name)}</TableCell><TableCell>{value(row.branchId)}</TableCell><TableCell>{value(row.status)}</TableCell></TableRow>)}{!departments.length&&<TableRow><TableCell colSpan={4}>No departments configured.</TableCell></TableRow>}</TableBody></Table>
        <Typography fontWeight={800} sx={{mt:2}}>Cost centres</Typography>
        <Table size="small"><TableHead><TableRow>{['Code','Name','Status'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{costCentres.map(row=><TableRow key={String(row.id)}><TableCell>{value(row.code)}</TableCell><TableCell>{value(row.name)}</TableCell><TableCell>{value(row.status)}</TableCell></TableRow>)}{!costCentres.length&&<TableRow><TableCell colSpan={3}>No cost centres configured.</TableCell></TableRow>}</TableBody></Table>
      </Paper>
      <Paper variant="outlined" sx={{p:2,borderColor:'#E3E0D6'}}>
        <Typography variant="h6" fontWeight={900}>Worker assignments</Typography>
        <Table size="small" sx={{mt:1}}><TableHead><TableRow>{['Worker','Branch','Department','Cost centre','Project','Site','From','To','Status'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{assignments.map(row=><TableRow key={String(row.id)}>{['workerId','branchId','departmentId','costCentreId','projectId','siteId','effectiveFrom','effectiveTo','status'].map(key=><TableCell key={key}>{value(row[key])}</TableCell>)}</TableRow>)}{!assignments.length&&<TableRow><TableCell colSpan={9}>No worker assignments recorded.</TableCell></TableRow>}</TableBody></Table>
      </Paper>
    </>}
    <Dialog open={Boolean(dialog)} onClose={()=>setDialog('')} fullWidth maxWidth="sm"><Box component="form" onSubmit={submit}>
      <DialogTitle>{dialog==='invite'?'Invite team member':dialog==='branch'?'Add branch':dialog==='department'?'Add department':dialog==='costCentre'?'Add cost centre':'Create worker assignment'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{pt:1}}>
        {dialog==='invite'&&<><TextField label="Email address" type="email" required value={fields.email} onChange={e=>set('email',e.target.value)}/><TextField select label="Workspace role" value={fields.role} onChange={e=>set('role',e.target.value)}>{assignableRoles.map(item=><MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField><Alert severity="info">The API returns a one-time invitation token. No email is sent by this workflow yet.</Alert></>}
        {['branch','department','costCentre'].includes(dialog)&&<><TextField label="Code" required value={fields.code} onChange={e=>set('code',e.target.value)}/><TextField label="Name" required value={fields.name} onChange={e=>set('name',e.target.value)}/>{dialog==='branch'&&<TextField label="Address" value={fields.address} onChange={e=>set('address',e.target.value)}/ >}{dialog==='department'&&<TextField select label="Branch (optional)" value={fields.branchId} onChange={e=>set('branchId',e.target.value)}><MenuItem value="">No branch</MenuItem>{branches.map(row=><MenuItem key={String(row.id)} value={String(row.id)}>{value(row.name)}</MenuItem>)}</TextField>}</>}
        {dialog==='assignment'&&<><TextField select label="Worker" required value={fields.workerId} onChange={e=>set('workerId',e.target.value)}>{(data.workers??[]).map(row=><MenuItem key={String(row.id)} value={String(row.id)}>{value(row.workerNumber)} · {value(row.firstName)} {value(row.lastName)}</MenuItem>)}</TextField><TextField select label="Branch" value={fields.branchId} onChange={e=>set('branchId',e.target.value)}><MenuItem value="">None</MenuItem>{branches.map(row=><MenuItem key={String(row.id)} value={String(row.id)}>{value(row.name)}</MenuItem>)}</TextField><TextField select label="Department" value={fields.departmentId} onChange={e=>set('departmentId',e.target.value)}><MenuItem value="">None</MenuItem>{departments.map(row=><MenuItem key={String(row.id)} value={String(row.id)}>{value(row.name)}</MenuItem>)}</TextField><TextField select label="Cost centre" value={fields.costCentreId} onChange={e=>set('costCentreId',e.target.value)}><MenuItem value="">None</MenuItem>{costCentres.map(row=><MenuItem key={String(row.id)} value={String(row.id)}>{value(row.name)}</MenuItem>)}</TextField><TextField select label="Project" value={fields.projectId} onChange={e=>set('projectId',e.target.value)}><MenuItem value="">None</MenuItem>{(data.projects??[]).map(row=><MenuItem key={String(row.id)} value={String(row.id)}>{value(row.name)}</MenuItem>)}</TextField><TextField select label="Site" value={fields.siteId} onChange={e=>set('siteId',e.target.value)}><MenuItem value="">None</MenuItem>{(data.sites??[]).filter(row=>!fields.projectId||row.projectId===fields.projectId).map(row=><MenuItem key={String(row.id)} value={String(row.id)}>{value(row.name)}</MenuItem>)}</TextField><TextField label="Effective from" type="date" required InputLabelProps={{shrink:true}} value={fields.effectiveFrom} onChange={e=>set('effectiveFrom',e.target.value)}/><TextField label="Effective to (optional)" type="date" InputLabelProps={{shrink:true}} value={fields.effectiveTo} onChange={e=>set('effectiveTo',e.target.value)}/></>}
      </Stack></DialogContent>
      <DialogActions sx={{p:2.5}}><Button onClick={()=>setDialog('')}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy?'Saving…':'Save'}</Button></DialogActions>
    </Box></Dialog>
  </Stack>;
}
