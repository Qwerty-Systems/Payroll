import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, AppBar, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid,
  MenuItem, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Toolbar, Typography,
} from '@mui/material';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import BusinessRounded from '@mui/icons-material/BusinessRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';

type Membership = {
  tenantId: string; slug: string; displayName: string; legalName: string;
  tenantStatus: string; membershipId: string; role: string;
};
type RowData = Record<string, unknown> & { id?: string };
type Section = 'overview' | 'workers' | 'projects' | 'attendance' | 'payroll' | 'organization' | 'people';
type Props = {
  memberships: Membership[];
  userName?: string;
  userPicture?: string;
  apiBaseUrl: string;
  getToken: () => Promise<string>;
  onSignOut: () => void;
};

const asRows = (value: unknown): RowData[] => Array.isArray(value) ? value as RowData[] : [];
const label = (value: unknown) => value == null || value === '' ? '—' : String(value);
const dateToday = () => new Date().toISOString().slice(0, 10);

export default function TenantWorkspace({ memberships, userName, userPicture, apiBaseUrl, getToken, onSignOut }: Props) {
  const [tenantId, setTenantId] = useState(memberships[0]?.tenantId ?? '');
  const [section, setSection] = useState<Section>('overview');
  const [data, setData] = useState<Record<string, RowData[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'' | 'worker' | 'contract' | 'project' | 'site' | 'attendance' | 'period'>('');
  const [busy, setBusy] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedRun, setSelectedRun] = useState('');
  const [contracts, setContracts] = useState<RowData[]>([]);
  const [forms, setForms] = useState<Record<string, string>>({
    workerNumber: '', firstName: '', lastName: '', phone: '', email: '',
    engagementType: 'permanent', payBasis: 'monthly', rateAmount: '', effectiveFrom: dateToday(),
    projectCode: '', projectName: '', clientName: '', siteCode: '', siteName: '',
    workDate: dateToday(), minutesWorked: '480', periodCode: '', periodName: '',
    startDate: dateToday().slice(0, 8) + '01', endDate: dateToday(),
  });

  const membership = memberships.find(item => item.tenantId === tenantId) ?? memberships[0];
  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/api/v1/${path.replace(/^\/+/, '')}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body.message === 'string' ? body.message : Array.isArray(body.message) ? body.message.join(', ') : `Request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return body as T;
  }, [apiBaseUrl, getToken, tenantId]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    const endpoints: Record<string, string> = {
      workers: 'tenant/workers',
      projects: 'tenant/projects',
      sites: 'tenant/sites',
      attendance: 'tenant/attendance',
      periods: 'payroll/periods',
      branches: 'tenant/organization/branches',
      departments: 'tenant/organization/departments',
      costCentres: 'tenant/organization/cost-centres',
      members: 'tenant/users',
    };
    const entries = await Promise.all(Object.entries(endpoints).map(async ([key, path]) => {
      try { return [key, asRows(await request<unknown>(path))] as const; }
      catch { return [key, [] as RowData[]] as const; }
    }));
    setData(Object.fromEntries(entries));
    setLoading(false);
  }, [request, tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedWorker) { setContracts([]); return; }
    let active = true;
    request<unknown>(`tenant/workers/${selectedWorker}/contracts`)
      .then(value => { if (active) setContracts(asRows(value)); })
      .catch(() => { if (active) setContracts([]); });
    return () => { active = false; };
  }, [request, selectedWorker]);

  const counts = useMemo(() => ({
    workers: (data.workers ?? []).filter(row => row.status === 'active').length,
    projects: (data.projects ?? []).filter(row => row.status === 'active').length,
    attendance: (data.attendance ?? []).filter(row => row.status === 'submitted').length,
    periods: (data.periods ?? []).length,
  }), [data]);

  function setField(name: string, value: string) {
    setForms(current => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if (dialog === 'worker') {
        const worker = await request<RowData>('tenant/workers', { method: 'POST', body: JSON.stringify({
          workerNumber: forms.workerNumber, firstName: forms.firstName, lastName: forms.lastName,
          phone: forms.phone || undefined, email: forms.email || undefined,
        }) });
        setSelectedWorker(String(worker.id ?? ''));
        setNotice('Worker profile created.');
      } else if (dialog === 'contract') {
        await request(`tenant/workers/${selectedWorker}/contracts`, { method: 'POST', body: JSON.stringify({
          engagementType: forms.engagementType, payBasis: forms.payBasis,
          rateAmount: Number(forms.rateAmount), currency: 'KES', effectiveFrom: forms.effectiveFrom,
        }) });
        setNotice('Contract added to the worker history.');
      } else if (dialog === 'project') {
        const project = await request<RowData>('tenant/projects', { method: 'POST', body: JSON.stringify({
          projectCode: forms.projectCode, name: forms.projectName, clientName: forms.clientName || undefined,
        }) });
        setSelectedProject(String(project.id ?? ''));
        setNotice('Project created.');
      } else if (dialog === 'site') {
        await request('tenant/sites', { method: 'POST', body: JSON.stringify({
          projectId: selectedProject, siteCode: forms.siteCode, name: forms.siteName,
        }) });
        setNotice('Site created.');
      } else if (dialog === 'attendance') {
        await request('tenant/attendance', { method: 'POST', body: JSON.stringify({
          workerId: selectedWorker, projectId: selectedProject,
          siteId: forms.siteId, workDate: forms.workDate, minutesWorked: Number(forms.minutesWorked), source: 'web',
        }) });
        setNotice('Attendance record captured as a draft. Submit it for approval.');
      } else if (dialog === 'period') {
        await request('payroll/periods', { method: 'POST', body: JSON.stringify({
          code: forms.periodCode, name: forms.periodName, startDate: forms.startDate, endDate: forms.endDate,
        }) });
        setNotice('Payroll period created. Calculations remain subject to statutory approval and engine safeguards.');
      }
      setDialog('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally { setBusy(false); }
  }

  async function attendanceAction(id: string, action: 'submit' | 'approve') {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`tenant/attendance/${id}/${action}`, { method: 'POST', body: '{}' });
      setNotice(action === 'submit' ? 'Attendance submitted for approval.' : 'Attendance approved.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Attendance status could not be updated.');
    } finally { setBusy(false); }
  }

  async function createRun(periodId: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const run = await request<RowData>('payroll/runs', { method: 'POST', body: JSON.stringify({ periodId }) });
      setSelectedRun(String(run.id ?? ''));
      setNotice('Payroll run created. Review its warnings and statutory approval state before any further action.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create payroll run.'); }
    finally { setBusy(false); }
  }

  async function calculateRun() {
    if (!selectedRun) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`payroll/runs/${selectedRun}/calculate`, { method: 'POST', body: '{}' });
      const result = await request<RowData>(`payroll/runs/${selectedRun}`);
      setData(current => ({ ...current, run: [result] }));
      setNotice('Calculation completed. Inspect warnings and compliance status; finalization is not enabled here.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payroll calculation could not be completed.'); }
    finally { setBusy(false); }
  }

  const currentRows = (section === 'workers' ? data.workers : section === 'projects' ? data.projects :
    section === 'attendance' ? data.attendance : section === 'payroll' ? data.periods :
    section === 'people' ? data.members : section === 'organization' ? data.branches : []) ?? [];

  return <Box sx={{ minHeight: '100vh', bgcolor: '#F7F5EF', color: '#17372B' }}>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#17372B' }}>
      <Container maxWidth="xl"><Toolbar disableGutters sx={{ gap: 2 }}>
        <Avatar sx={{ bgcolor: '#D6A84F', color: '#17372B' }}><ConstructionRounded /></Avatar>
        <Box sx={{ flex: 1 }}><Typography fontWeight={900}>JengaFlow</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.65)' }}>WORKSPACE · {membership?.displayName}</Typography></Box>
        <TextField select size="small" value={tenantId} onChange={event => { setTenantId(event.target.value); setSection('overview'); }} sx={{ minWidth: 180, bgcolor: 'white', borderRadius: 1 }} aria-label="Company workspace">
          {memberships.map(item => <MenuItem key={item.tenantId} value={item.tenantId}>{item.displayName}</MenuItem>)}
        </TextField>
        <Avatar src={userPicture} alt={userName ?? 'User'}>{userName?.charAt(0) ?? 'U'}</Avatar>
        <Button color="inherit" startIcon={<LogoutRounded />} onClick={onSignOut}>Sign out</Button>
      </Toolbar></Container>
    </AppBar>
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1} sx={{ mb: 2 }}>
        <Box><Typography variant="overline" sx={{ color: '#2F6B4F', fontWeight: 800, letterSpacing: '.14em' }}>{membership?.role ?? 'member'} WORKSPACE</Typography><Typography variant="h4" fontWeight={900}>Company operations</Typography></Box>
        <Stack direction="row" spacing={1}><Chip label={membership?.tenantStatus ?? 'unknown'} color={membership?.tenantStatus === 'active' ? 'success' : 'warning'} /><Button variant="outlined" onClick={() => void refresh()} disabled={loading}>Refresh data</Button></Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
      <Paper variant="outlined" sx={{ mb: 3, borderColor: '#E3E0D6', overflow: 'hidden' }}>
        <Tabs value={section} onChange={(_, value: Section) => setSection(value)} variant="scrollable" scrollButtons="auto">
          <Tab value="overview" icon={<DashboardRounded />} iconPosition="start" label="Overview" />
          <Tab value="workers" icon={<GroupsRounded />} iconPosition="start" label="Workers" />
          <Tab value="projects" icon={<BusinessRounded />} iconPosition="start" label="Projects & sites" />
          <Tab value="attendance" icon={<EventAvailableRounded />} iconPosition="start" label="Attendance" />
          <Tab value="payroll" icon={<PaymentsRounded />} iconPosition="start" label="Payroll" />
          <Tab value="organization" icon={<SettingsRounded />} iconPosition="start" label="Organization" />
          <Tab value="people" icon={<GroupsRounded />} iconPosition="start" label="Team access" />
        </Tabs>
      </Paper>
      {loading && <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}><CircularProgress size={18} /><Typography color="text.secondary" variant="body2">Loading workspace records…</Typography></Stack>}
      {section === 'overview' && <>
        <Grid container spacing={2}>
          {[
            ['Active workers', counts.workers, 'Worker profiles in this workspace'],
            ['Active projects', counts.projects, 'Projects currently marked active'],
            ['Pending attendance', counts.attendance, 'Submitted records awaiting review'],
            ['Payroll periods', counts.periods, 'Configured pay periods'],
          ].map(([title, value, description]) => <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={String(title)}>
            <Card variant="outlined" sx={{ height: '100%', borderColor: '#E3E0D6' }}><CardContent><Typography color="text.secondary" variant="body2">{title}</Typography><Typography variant="h3" fontWeight={900} sx={{ my: 1 }}>{value}</Typography><Typography color="text.secondary" variant="caption">{description}</Typography></CardContent></Card>
          </Grid>)}
        </Grid>
        <Alert severity="info" sx={{ mt: 2 }}>Use the sections above to manage workers, contracts, projects, attendance and payroll periods. Payroll finalization and payment execution are intentionally not exposed in this workspace build.</Alert>
      </>}
      {section !== 'overview' && <Paper variant="outlined" sx={{ borderColor: '#E3E0D6', overflow: 'hidden' }}>
        <Box sx={{ p: 2.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}>
            <Box><Typography variant="h6" fontWeight={900}>{section === 'workers' ? 'Workforce' : section === 'projects' ? 'Projects and sites' : section === 'attendance' ? 'Attendance register' : section === 'payroll' ? 'Payroll periods and runs' : section === 'organization' ? 'Organization structure' : 'Workspace members'}</Typography><Typography variant="body2" color="text.secondary">Tenant-scoped records · Role-based access</Typography></Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {section === 'workers' && <><Button variant="outlined" onClick={() => setDialog('worker')}>Add worker</Button><Button variant="contained" disabled={!selectedWorker} onClick={() => setDialog('contract')}>Add contract</Button><Button variant="outlined" disabled={!selectedWorker || !selectedProject} onClick={() => setDialog('attendance')}>Capture attendance</Button></>}
              {section === 'projects' && <><Button variant="outlined" onClick={() => setDialog('project')}>Add project</Button><Button variant="contained" disabled={!selectedProject} onClick={() => setDialog('site')}>Add site</Button></>}
              {section === 'attendance' && <Button variant="contained" disabled={!selectedWorker || !selectedProject} onClick={() => setDialog('attendance')}>Capture attendance</Button>}
              {section === 'payroll' && <Button variant="contained" onClick={() => setDialog('period')}>Create period</Button>}
            </Stack>
          </Stack>
        </Box>
        <Divider />
        {section === 'payroll' ? <Box sx={{ p: 2.5 }}>
          <Table size="small"><TableHead><TableRow>{['Code','Period','Start','End','Status','Actions'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
            {(data.periods ?? []).map(row => <TableRow key={String(row.id)}><TableCell>{label(row.code)}</TableCell><TableCell>{label(row.name)}</TableCell><TableCell>{label(row.startDate)}</TableCell><TableCell>{label(row.endDate)}</TableCell><TableCell><Chip size="small" label={label(row.status)} /></TableCell><TableCell><Button size="small" onClick={() => void createRun(String(row.id))} disabled={busy}>Create run</Button></TableCell></TableRow>)}
            {!data.periods?.length && <TableRow><TableCell colSpan={6}>No payroll periods have been created.</TableCell></TableRow>}
          </TableBody></Table>
          {selectedRun && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}><Typography variant="body2">Selected run: {selectedRun}</Typography><Button variant="outlined" size="small" onClick={() => void calculateRun()} disabled={busy}>Calculate preview</Button></Stack>}
          {(data.run ?? []).map(run => <Alert key={String(run.id)} severity="warning" sx={{ mt: 2 }}>Run status: {label(run.status)} · Totals and warnings: {JSON.stringify(run.totals ?? {})} {JSON.stringify(run.warnings ?? [])}</Alert>)}
        </Box> : <Table size="small"><TableHead><TableRow>
          {(section === 'workers' ? ['Worker no.','Name','Phone','Email','Status','Select'] :
            section === 'projects' ? ['Code','Project','Client','Status','Select'] :
            section === 'attendance' ? ['Date','Worker ID','Project ID','Minutes','Status','Actions'] :
            section === 'people' ? ['Name','Email','Role','Status'] :
            ['Code','Name','Status']).map(x => <TableCell key={x}>{x}</TableCell>)}
        </TableRow></TableHead><TableBody>
          {currentRows.map(row => <TableRow key={String(row.id ?? JSON.stringify(row))} hover>
            {section === 'workers' && <><TableCell>{label(row.workerNumber)}</TableCell><TableCell>{label(row.firstName)} {label(row.lastName)}</TableCell><TableCell>{label(row.phone)}</TableCell><TableCell>{label(row.email)}</TableCell><TableCell>{label(row.status)}</TableCell><TableCell><Button size="small" onClick={() => setSelectedWorker(String(row.id))}>{selectedWorker === row.id ? 'Selected' : 'Select'}</Button></TableCell></>}
            {section === 'projects' && <><TableCell>{label(row.projectCode)}</TableCell><TableCell>{label(row.name)}</TableCell><TableCell>{label(row.clientName)}</TableCell><TableCell>{label(row.status)}</TableCell><TableCell><Button size="small" onClick={() => setSelectedProject(String(row.id))}>{selectedProject === row.id ? 'Selected' : 'Select'}</Button></TableCell></>}
            {section === 'attendance' && <><TableCell>{label(row.workDate)}</TableCell><TableCell>{label(row.workerId)}</TableCell><TableCell>{label(row.projectId)}</TableCell><TableCell>{label(row.minutesWorked)}</TableCell><TableCell><Chip size="small" label={label(row.status)} /></TableCell><TableCell>{row.status === 'draft' ? <Button size="small" disabled={busy} onClick={() => void attendanceAction(String(row.id), 'submit')}>Submit</Button> : row.status === 'submitted' ? <Button size="small" disabled={busy} onClick={() => void attendanceAction(String(row.id), 'approve')}>Approve</Button> : '—'}</TableCell></>}
            {section === 'people' && <><TableCell>{label(row.fullName)}</TableCell><TableCell>{label(row.email)}</TableCell><TableCell>{label(row.role)}</TableCell><TableCell>{label(row.status)}</TableCell></>}
            {section === 'organization' && <><TableCell>{label(row.code)}</TableCell><TableCell>{label(row.name)}</TableCell><TableCell>{label(row.status)}</TableCell></>}
          </TableRow>)}
          {!currentRows?.length && <TableRow><TableCell colSpan={6}>No records available or your role does not grant access to this section.</TableCell></TableRow>}
        </TableBody></Table>}
        {section === 'workers' && selectedWorker && <Box sx={{ p: 2.5, borderTop: '1px solid #E3E0D6' }}>
          <Typography fontWeight={850} sx={{ mb: 1 }}>Effective-dated contract history</Typography>
          <Table size="small"><TableHead><TableRow>{['Engagement','Pay basis','Rate','From','To'].map(item => <TableCell key={item}>{item}</TableCell>)}</TableRow></TableHead><TableBody>
            {contracts.map(contract => <TableRow key={String(contract.id)}><TableCell>{label(contract.engagementType)}</TableCell><TableCell>{label(contract.payBasis)}</TableCell><TableCell>{label(contract.rateAmount)} {label(contract.currency)}</TableCell><TableCell>{label(contract.effectiveFrom)}</TableCell><TableCell>{label(contract.effectiveTo)}</TableCell></TableRow>)}
            {!contracts.length && <TableRow><TableCell colSpan={5}>No contract history is recorded for this worker.</TableCell></TableRow>}
          </TableBody></Table>
        </Box>}
        {section === 'projects' && <Box sx={{ p: 2.5, borderTop: '1px solid #E3E0D6' }}>
          <Typography fontWeight={850} sx={{ mb: 1 }}>Project sites</Typography>
          <Table size="small"><TableHead><TableRow>{['Site code','Site','Project','Status'].map(item => <TableCell key={item}>{item}</TableCell>)}</TableRow></TableHead><TableBody>
            {(data.sites ?? []).filter(site => !selectedProject || site.projectId === selectedProject).map(site => <TableRow key={String(site.id)}><TableCell>{label(site.siteCode)}</TableCell><TableCell>{label(site.name)}</TableCell><TableCell>{label(site.projectId)}</TableCell><TableCell>{label(site.status)}</TableCell></TableRow>)}
            {!(data.sites ?? []).length && <TableRow><TableCell colSpan={4}>No project sites have been created.</TableCell></TableRow>}
          </TableBody></Table>
        </Box>}
      </Paper>}
    </Container>
    <Dialog open={Boolean(dialog)} onClose={() => setDialog('')} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{dialog === 'worker' ? 'Add worker' : dialog === 'contract' ? 'Add worker contract' : dialog === 'project' ? 'Create project' : dialog === 'site' ? 'Create site' : dialog === 'attendance' ? 'Capture attendance' : 'Create payroll period'}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {dialog === 'worker' && <><TextField label="Worker number" required value={forms.workerNumber} onChange={e => setField('workerNumber', e.target.value)} /><TextField label="First name" required value={forms.firstName} onChange={e => setField('firstName', e.target.value)} /><TextField label="Last name" required value={forms.lastName} onChange={e => setField('lastName', e.target.value)} /><TextField label="Phone" value={forms.phone} onChange={e => setField('phone', e.target.value)} /><TextField label="Email" type="email" value={forms.email} onChange={e => setField('email', e.target.value)} /></>}
          {dialog === 'contract' && <><TextField select label="Engagement" value={forms.engagementType} onChange={e => setField('engagementType', e.target.value)}>{['permanent','fixed_term','casual','piece_rate','subcontractor'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Pay basis" value={forms.payBasis} onChange={e => setField('payBasis', e.target.value)}>{['hourly','daily','weekly','monthly','per_unit'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField label="Rate (KES)" type="number" required value={forms.rateAmount} onChange={e => setField('rateAmount', e.target.value)} /><TextField label="Effective from" type="date" required InputLabelProps={{ shrink: true }} value={forms.effectiveFrom} onChange={e => setField('effectiveFrom', e.target.value)} /></>}
          {dialog === 'project' && <><TextField label="Project code" required value={forms.projectCode} onChange={e => setField('projectCode', e.target.value)} /><TextField label="Project name" required value={forms.projectName} onChange={e => setField('projectName', e.target.value)} /><TextField label="Client name" value={forms.clientName} onChange={e => setField('clientName', e.target.value)} /></>}
          {dialog === 'site' && <><TextField label="Site code" required value={forms.siteCode} onChange={e => setField('siteCode', e.target.value)} /><TextField label="Site name" required value={forms.siteName} onChange={e => setField('siteName', e.target.value)} /></>}
          {dialog === 'attendance' && <><TextField select label="Site" required value={forms.siteId ?? ''} onChange={e => setField('siteId', e.target.value)}>{(data.sites ?? []).filter(site => site.projectId === selectedProject).map(site => <MenuItem key={String(site.id)} value={String(site.id)}>{label(site.name)}</MenuItem>)}</TextField><TextField label="Work date" type="date" required InputLabelProps={{ shrink: true }} value={forms.workDate} onChange={e => setField('workDate', e.target.value)} /><TextField label="Minutes worked" type="number" required value={forms.minutesWorked} onChange={e => setField('minutesWorked', e.target.value)} /></>}
          {dialog === 'period' && <><TextField label="Period code" required value={forms.periodCode} onChange={e => setField('periodCode', e.target.value)} /><TextField label="Period name" required value={forms.periodName} onChange={e => setField('periodName', e.target.value)} /><TextField label="Start date" type="date" required InputLabelProps={{ shrink: true }} value={forms.startDate} onChange={e => setField('startDate', e.target.value)} /><TextField label="End date" type="date" required InputLabelProps={{ shrink: true }} value={forms.endDate} onChange={e => setField('endDate', e.target.value)} /></>}
        </Stack></DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => setDialog('')}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></DialogActions>
      </Box>
    </Dialog>
  </Box>;
}
