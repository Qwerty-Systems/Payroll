import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, AppBar, Avatar, Box, Button, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid,
  Drawer, IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import BusinessRounded from '@mui/icons-material/BusinessRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import AssignmentTurnedInRounded from '@mui/icons-material/AssignmentTurnedInRounded';
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded';
import TenantAdministration from './TenantAdministration';
import CloudSyncRounded from '@mui/icons-material/CloudSyncRounded';
import { queueAttendanceCapture, synchronizeOfflineAttendance } from '../offline/offline-api';
import { countCommands } from '../offline/offline-db';
import { cacheReferenceData, loadCachedReferenceData, REFERENCE_ENTITIES, type ReferenceRows } from '../offline/reference-data';
import { useAutoSync } from '../offline/use-auto-sync';
import SyncReviewDialog from './SyncReviewDialog';
import ComplianceWorkspace from './ComplianceWorkspace';
import OrganizationWorkspace from './OrganizationWorkspace';
import WorkforceTimeWorkspace from './WorkforceTimeWorkspace';
import PayrollWorkspace from './PayrollWorkspace';

type Membership = {
  tenantId: string; slug: string; displayName: string; legalName: string;
  tenantStatus: string; membershipId: string; role: string;
};
type RowData = Record<string, unknown> & { id?: string };
type Section = 'overview' | 'workers' | 'pay-grades' | 'projects' | 'attendance' | 'time-management' | 'payroll' | 'compliance' | 'organization' | 'people';
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
  const [dialog, setDialog] = useState<'' | 'worker' | 'contract' | 'payGrade' | 'endContract' | 'project' | 'site' | 'attendance' | 'period' | 'payComponent'>('');
  const [busy, setBusy] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedRun, setSelectedRun] = useState('');
  const [selectedContract, setSelectedContract] = useState('');
  const [selectedPayGrade, setSelectedPayGrade] = useState('');
  const [selectedComponentId, setSelectedComponentId] = useState('');
  const [selectedComponentType, setSelectedComponentType] = useState<'allowance' | 'deduction'>('allowance');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [queueCounts, setQueueCounts] = useState({ pending: 0, syncing: 0, conflict: 0, failed: 0, rejected: 0 });
  const [reviewOpen, setReviewOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width:1199px)');
  const [contracts, setContracts] = useState<RowData[]>([]);
  const [workerDocuments, setWorkerDocuments] = useState<RowData[]>([]);
  const [documentType, setDocumentType] = useState('contract');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [forms, setForms] = useState<Record<string, string>>({
    workerNumber: '', firstName: '', lastName: '', phone: '', email: '',
    componentName: '', componentMethod: 'fixed_amount', componentTreatment: 'review_required', componentConfiguration: '{}', componentEnabled: 'true', componentApproval: 'true',
    engagementType: 'permanent', payBasis: 'monthly', rateAmount: '', effectiveFrom: dateToday(), contractEndDate: dateToday(), unitCodes: '', payGradeId: '',
    gradeCode: '', gradeName: '', gradeDescription: '', gradePayBasis: 'monthly', gradeMinimum: '', gradeMidpoint: '', gradeMaximum: '', gradeCurrency: 'KES',
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
      payGrades: 'tenant/pay-grades',
      allowanceTypes: 'tenant/pay-components/allowances',
      deductionTypes: 'tenant/pay-components/deductions',
      projects: 'tenant/projects',
      sites: 'tenant/sites',
      attendance: 'tenant/attendance',
      periods: 'payroll/periods',
      branches: 'tenant/organization/branches',
      departments: 'tenant/organization/departments',
      costCentres: 'tenant/organization/cost-centres',
      assignments: 'tenant/organization/worker-assignments',
      members: 'tenant/users',
    };
    const entries = await Promise.all(Object.entries(endpoints).map(async ([key, path]) => {
      try { return [key, asRows(await request<unknown>(path))] as const; }
      catch { return [key, null] as const; }
    }));
    // A failed endpoint (offline, 5xx) keeps its last known rows rather than showing an empty list as if it were real.
    setData(current => Object.fromEntries(entries.map(([key, rows]) => [key, rows ?? current[key] ?? []])));
    // Bootstrap the offline cache so attendance capture keeps working without a connection.
    const fetched = Object.fromEntries(entries.filter(([key, rows]) => rows && (REFERENCE_ENTITIES as readonly string[]).includes(key))) as Partial<ReferenceRows>;
    try { await cacheReferenceData(tenantId, fetched); } catch { /* offline storage unavailable: online use is unaffected */ }
    setLoading(false);
  }, [request, tenantId]);

  // Seed lists from the on-device cache first so the capture form is usable immediately, even with no connection.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void loadCachedReferenceData(tenantId).then(({ rows }) => {
      if (cancelled) return;
      setData(current => ({
        ...current,
        ...Object.fromEntries(REFERENCE_ENTITIES.filter(key => rows[key].length && !(current[key]?.length)).map(key => [key, rows[key]])),
      }));
    }).catch(() => { /* cache unavailable */ });
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedWorker) { setContracts([]); setWorkerDocuments([]); return; }
    let active = true;
    request<unknown>(`tenant/workers/${selectedWorker}/contracts`)
      .then(value => { if (active) setContracts(asRows(value)); })
      .catch(() => { if (active) setContracts([]); });
    request<unknown>(`tenant/workers/${selectedWorker}/documents`)
      .then(value => { if (active) setWorkerDocuments(asRows(value)); })
      .catch(() => { if (active) setWorkerDocuments([]); });
    return () => { active = false; };
  }, [request, selectedWorker]);

  async function uploadWorkerDocument() {
    if (!selectedWorker || !documentFile) return;
    setUploadingDocument(true); setError(''); setNotice('');
    try {
      const token = await getToken();
      const form = new FormData();
      form.append('file', documentFile);
      form.append('documentType', documentType);
      const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/api/v1/tenant/workers/${selectedWorker}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId, Accept: 'application/json' },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : 'Document upload failed.');
      setDocumentFile(null);
      setNotice('Employee document uploaded securely.');
      const docs = await request<unknown>(`tenant/workers/${selectedWorker}/documents`);
      setWorkerDocuments(asRows(docs));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Employee document upload failed.');
    } finally { setUploadingDocument(false); }
  }

  async function downloadWorkerDocument(documentId: string) {
    try {
      const result = await request<{ url: string }>(`tenant/workers/${selectedWorker}/documents/${documentId}/download`);
      if (!result.url || !result.url.startsWith('https://')) throw new Error('The API did not return a secure download URL.');
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to prepare the document download.');
    }
  }

  const refreshQueueCounts = useCallback(async () => {
    if (!tenantId) return;
    try { setQueueCounts(await countCommands(tenantId)); } catch { /* offline storage unavailable */ }
  }, [tenantId]);

  /** manual=true surfaces results and bypasses retry backoff; automatic runs stay quiet unless something changed. */
  const syncOfflineQueue = useCallback(async (manual = true) => {
    if (manual) { setSyncing(true); setSyncMessage(''); setError(''); }
    try {
      const summary = await synchronizeOfflineAttendance(tenantId, request, { ignoreBackoff: manual });
      if (manual || summary.synced || summary.conflicts || summary.rejected) {
        setSyncMessage(`Offline sync complete: ${summary.synced} sent, ${summary.conflicts} conflicts, ${summary.rejected} rejected, ${summary.remaining} remaining.`);
      }
      if (summary.conflicts || summary.rejected) setError('Some offline changes need attention. Open sync review to resolve them before relying on these records.');
      if (summary.synced) await refresh();
    } catch (cause) {
      if (manual) setError(cause instanceof Error ? cause.message : 'Offline synchronization failed.');
    } finally {
      if (manual) setSyncing(false);
      await refreshQueueCounts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, request, refreshQueueCounts]);

  useAutoSync({ enabled: Boolean(tenantId), run: () => syncOfflineQueue(false) });
  useEffect(() => { void refreshQueueCounts(); }, [refreshQueueCounts]);

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
        setNotice('Employee profile created.');
      } else if (dialog === 'contract') {
        await request(`tenant/workers/${selectedWorker}/contracts`, { method: 'POST', body: JSON.stringify({
          engagementType: forms.engagementType, payBasis: forms.payBasis, payGradeId: forms.payGradeId || undefined,
          rateAmount: Number(forms.rateAmount), currency: 'KES', effectiveFrom: forms.effectiveFrom,
          terms: forms.payBasis === 'per_unit' ? { unitCodes: (forms.unitCodes ?? '').split(',').map(x => x.trim()).filter(Boolean) } : {},
        }) });
        setContracts(asRows(await request<unknown>(`tenant/workers/${selectedWorker}/contracts`)));
        setNotice('Contract added to the employee history.');
      } else if (dialog === 'endContract') {
        await request(`tenant/workers/${selectedWorker}/contracts/${selectedContract}/end`, {
          method: 'PATCH', body: JSON.stringify({ effectiveTo: forms.contractEndDate }),
        });
        setContracts(asRows(await request<unknown>(`tenant/workers/${selectedWorker}/contracts`)));
        setNotice('Employee contract end date recorded.');
      } else if (dialog === 'payGrade') {
        const payload = {
          name: forms.gradeName, description: forms.gradeDescription || null,
          payBasis: forms.gradePayBasis, currency: forms.gradeCurrency,
          minimumRate: forms.gradeMinimum === '' ? null : Number(forms.gradeMinimum),
          midpointRate: forms.gradeMidpoint === '' ? null : Number(forms.gradeMidpoint),
          maximumRate: forms.gradeMaximum === '' ? null : Number(forms.gradeMaximum),
        };
        if (selectedPayGrade) {
          await request('tenant/pay-grades/' + selectedPayGrade, { method: 'PATCH', body: JSON.stringify(payload) });
          setNotice('Pay grade updated. Existing contracts retain their agreed rates.');
        } else {
          await request('tenant/pay-grades', { method: 'POST', body: JSON.stringify({ ...payload, code: forms.gradeCode }) });
          setNotice('Pay grade created and made available for new employee contracts.');
        }
        setSelectedPayGrade('');
      } else if (dialog === 'payComponent') {
        let configuration: Record<string, unknown>;
        try {
          configuration = JSON.parse(forms.componentConfiguration || '{}') as Record<string, unknown>;
          if (!configuration || Array.isArray(configuration) || typeof configuration !== 'object') throw new Error('Configuration must be a JSON object.');
        } catch (cause) {
          throw new Error(cause instanceof Error ? 'Configuration JSON is invalid: ' + cause.message : 'Configuration JSON is invalid.');
        }
        const payload: Record<string, unknown> = {
          name: forms.componentName, calculationMethod: forms.componentMethod, configuration,
          isEnabled: forms.componentEnabled === 'true', requiresApproval: forms.componentApproval === 'true',
        };
        if (selectedComponentType === 'allowance') payload.taxTreatment = forms.componentTreatment;
        else payload.taxableTreatment = forms.componentTreatment;
        const route = selectedComponentType === 'allowance' ? 'allowances' : 'deductions';
        await request('tenant/pay-components/' + route + '/' + selectedComponentId, { method: 'PATCH', body: JSON.stringify(payload) });
        setNotice('Pay component settings saved. New calculations will use the updated configuration; existing payroll snapshots remain unchanged.');
        setSelectedComponentId('');
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
        const { siteId, workDate } = forms;
        if (!siteId) throw new Error('Select a site before capturing attendance.');
        if (!workDate) throw new Error('Enter the work date.');
        await queueAttendanceCapture(tenantId, {
          workerId: selectedWorker, projectId: selectedProject,
          siteId, workDate, minutesWorked: Number(forms.minutesWorked),
        });
        await refreshQueueCounts();
        setNotice(typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Attendance saved on this device. It will upload automatically when you are back online.'
          : 'Attendance saved. Uploading now; it will appear as a draft to submit for approval.');
        void syncOfflineQueue(false);
      } else if (dialog === 'period') {
        await request('payroll/periods', { method: 'POST', body: JSON.stringify({
          code: forms.periodCode, name: forms.periodName, startDate: forms.startDate, endDate: forms.endDate,
        }) });
        setNotice('Payroll period created. Calculations remain subject to statutory approval and engine safeguards.');
      }
      setDialog('');
      setSelectedPayGrade('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally { setBusy(false); }
  }

  async function updateWorkerStatus(workerId: string, status: 'active' | 'inactive' | 'suspended' | 'archived') {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`tenant/workers/${workerId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`Employee status updated to ${status.replaceAll('_',' ')}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Employee status could not be updated.'); }
    finally { setBusy(false); }
  }

  async function permanentlyDeleteEmployee(employeeId: string) {
    const employee = data.workers?.find(row => row.id === employeeId);
    const employeeLabel = [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'this employee';
    if (!window.confirm(`Permanently delete ${employeeLabel}? This is allowed only when no contracts, attendance, payroll, documents or assignments depend on the record. This action cannot be undone.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`tenant/workers/${employeeId}/permanent`, { method: 'DELETE' });
      setSelectedWorker('');
      setNotice('Employee permanently deleted. The deletion event remains in the audit log.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Employee could not be permanently deleted. Linked history may need to be retained.');
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

  const currentRows = (section === 'workers' ? data.workers : section === 'pay-grades' ? data.payGrades : section === 'projects' ? data.projects :
    section === 'attendance' ? data.attendance : section === 'payroll' ? data.periods :
    section === 'people' ? data.members : section === 'organization' ? data.branches : []) ?? [];
  const filteredRows = currentRows.filter(row => !searchQuery.trim() ||
    JSON.stringify(row).toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const navItems = [
    { value: 'overview' as Section, label: 'Overview', icon: <DashboardRounded /> , group: 'WORKSPACE' },
    { value: 'workers' as Section, label: 'Employees', icon: <GroupsRounded />, group: 'WORKSPACE' },
    { value: 'pay-grades' as Section, label: 'Pay grades', icon: <PaymentsRounded />, group: 'FINANCE' },
    { value: 'projects' as Section, label: 'Projects & sites', icon: <BusinessRounded />, group: 'WORKSPACE' },
    { value: 'attendance' as Section, label: 'Attendance', icon: <EventAvailableRounded />, group: 'WORKSPACE' },
    { value: 'time-management' as Section, label: 'Time management', icon: <CalendarMonthRounded />, group: 'WORKSPACE' },
    { value: 'payroll' as Section, label: 'Payroll', icon: <PaymentsRounded />, group: 'FINANCE' },
    { value: 'compliance' as Section, label: 'Compliance', icon: <AssignmentTurnedInRounded />, group: 'COMPLIANCE' },
    { value: 'organization' as Section, label: 'Organization', icon: <SettingsRounded />, group: 'ADMINISTRATION' },
    { value: 'people' as Section, label: 'Team access', icon: <GroupsRounded />, group: 'ADMINISTRATION' },
  ];
  const complianceReadableRoles = ['owner','admin','hr_manager','payroll_manager','accountant','viewer'];
  const visibleNavItems = navItems.filter(item => item.value !== 'compliance' || complianceReadableRoles.includes(membership?.role ?? ''));
  const navGroups = ['WORKSPACE','FINANCE','COMPLIANCE','ADMINISTRATION'].filter(group => visibleNavItems.some(item => item.group === group));
  const pageTitle: Record<Section, string> = {
    overview: 'Overview', workers: 'Employees', 'pay-grades': 'Pay grades', projects: 'Projects & sites',
    attendance: 'Attendance', 'time-management': 'Time management', payroll: 'Payroll', compliance: 'Compliance', organization: 'Organization', people: 'Team access',
  };
  const pageDescription: Record<Section, string> = {
    overview: 'A clear picture of your workforce and operations.',
    workers: 'Manage employee records, contracts and employment history.',
    'pay-grades': 'Define reusable pay bands and assign them to employee contracts.',
    projects: 'Organize projects, clients and work sites.',
    attendance: 'Capture work activity and review submitted records.',
    'time-management': 'Manage shifts, leave balances, overtime requests and employee timesheets.',
    payroll: 'Manage pay periods and review payroll calculation previews.',
    compliance: 'Review statutory rules, approve effective-dated changes and track statutory filings.',
    organization: 'Structure your company and assign people to teams.',
    people: 'Control who can access this company workspace.',
  };
  const navContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#17372B', color: '#F7F5EF' }}>
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Stack direction="row" spacing={1.4} alignItems="center">
          <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: '#D6A84F', color: '#17372B', borderRadius: 2 }}>
            <ConstructionRounded />
          </Avatar>
          <Box>
            <Typography fontWeight={900} letterSpacing="-.035em" fontSize="1.12rem">JengaFlow</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: '.62rem', letterSpacing: '.13em' }}>BY QWERTY SYSTEMS</Typography>
          </Box>
        </Stack>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,.1)' }} />
      <Box sx={{ px: 1.5, py: 2, flex: 1 }}>
        {navGroups.map(group => (
          <Box key={group} sx={{ mb: 2 }}>
            <Typography sx={{ px: 1.5, mb: .8, color: 'rgba(255,255,255,.42)', fontSize: '.65rem', fontWeight: 800, letterSpacing: '.12em' }}>{group}</Typography>
            <List disablePadding>
              {visibleNavItems.filter(item => item.group === group).map(item => (
                <ListItemButton key={item.value} selected={section === item.value}
                  onClick={() => { setSection(item.value); setSearchQuery(''); setMobileNavOpen(false); }}
                  sx={{
                    minHeight: 44, px: 1.5, mb: .4, borderRadius: 2, color: 'rgba(255,255,255,.72)',
                    '& .MuiListItemIcon-root': { minWidth: 36, color: 'inherit' },
                    '&.Mui-selected': { color: '#FFFFFF', bgcolor: 'rgba(214,168,79,.17)', boxShadow: 'inset 3px 0 #D6A84F' },
                    '&.Mui-selected .MuiListItemIcon-root': { color: '#E5C16F' },
                    '&:hover': { bgcolor: 'rgba(255,255,255,.07)' },
                  }}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '.88rem', fontWeight: section === item.value ? 800 : 600 }} />
                  {section === item.value && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#D6A84F' }} />}
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
      </Box>
      <Box sx={{ p: 1.5 }}>
        <Box sx={{ p: 1.7, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.08)' }}>
          <Typography fontSize=".78rem" fontWeight={800}>{membership?.displayName ?? 'Company workspace'}</Typography>
          <Typography sx={{ mt: .45, color: 'rgba(255,255,255,.48)', fontSize: '.68rem' }}>{membership?.role ?? 'Member'} · {membership?.tenantStatus ?? 'Workspace'}</Typography>
        </Box>
      </Box>
    </Box>
  );

  return <Box sx={{ minHeight: '100vh', bgcolor: '#F5F7F4', color: '#17372B' }}>
    <AppBar position="sticky" elevation={0} sx={{ zIndex: theme => theme.zIndex.drawer + 1, bgcolor: '#FFFFFF', color: '#17372B', borderBottom: '1px solid #E7EBE6' }}>
      <Toolbar sx={{ minHeight: '72px !important', px: { xs: 1.5, md: 3 }, gap: 1.5 }}>
        {isMobile && <IconButton aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><MenuRounded /></IconButton>}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={850} sx={{ fontSize: '.9rem' }}>{membership?.displayName ?? 'Company workspace'}</Typography>
          <Typography variant="caption" color="text.secondary">{membership?.slug ?? 'JengaFlow'} · {membership?.role ?? 'Member'}</Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<CloudSyncRounded />} onClick={() => void syncOfflineQueue(true)} disabled={syncing || !tenantId} sx={{ whiteSpace: 'nowrap' }}>{syncing ? 'Syncing…' : queueCounts.pending + queueCounts.failed + queueCounts.syncing ? `Sync (${queueCounts.pending + queueCounts.failed + queueCounts.syncing})` : 'Sync offline'}</Button>
        {queueCounts.conflict + queueCounts.rejected + queueCounts.failed > 0 && <Button size="small" color="warning" variant="contained" onClick={() => setReviewOpen(true)} sx={{ whiteSpace: 'nowrap' }}>Review ({queueCounts.conflict + queueCounts.rejected + queueCounts.failed})</Button>}
        <TextField select size="small" value={tenantId} onChange={event => { setTenantId(event.target.value); setSection('overview'); }}
          sx={{ minWidth: { xs: 128, sm: 190 }, maxWidth: 220, '& .MuiOutlinedInput-root': { bgcolor: '#F7F8F6', borderRadius: 2 } }}
          aria-label="Company workspace">
          {memberships.map(item => <MenuItem key={item.tenantId} value={item.tenantId}>{item.displayName}</MenuItem>)}
        </TextField>
        <Tooltip title={userName ?? 'Account'}>
          <Avatar src={userPicture} alt={userName ?? 'User'} sx={{ width: 36, height: 36, bgcolor: '#E7F0E9', color: '#2F6B4F', fontWeight: 800 }}>
            {userName?.charAt(0) ?? 'U'}
          </Avatar>
        </Tooltip>
        <Tooltip title="Sign out">
          <IconButton aria-label="Sign out" onClick={onSignOut} sx={{ color: 'text.secondary' }}><LogoutRounded /></IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
    <Drawer variant="permanent" open={!isMobile} sx={{
      display: { xs: 'none', lg: 'block' }, width: 252, flexShrink: 0,
      '& .MuiDrawer-paper': { width: 252, boxSizing: 'border-box', top: 72, height: 'calc(100% - 72px)', border: 0, boxShadow: '5px 0 24px rgba(23,55,43,.04)' },
    }}>{navContent}</Drawer>
    <Drawer variant="temporary" open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}
      ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', lg: 'none' }, '& .MuiDrawer-paper': { width: 280, border: 0 } }}>
      {navContent}
    </Drawer>

    <Box component="main" sx={{ ml: { xs: 0, lg: '252px' }, minWidth: 0 }}>
      <Box sx={{ maxWidth: 1600, mx: 'auto', px: { xs: 2, sm: 3, xl: 4 }, py: { xs: 2.5, md: 4 } }}>
        {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
        {syncMessage && <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setSyncMessage('')}>{syncMessage}</Alert>}
        {section === 'overview' ? <>
          <Box sx={{
            p: { xs: 2.5, md: 3.5 }, mb: 3, borderRadius: 4, color: '#FFFFFF',
            background: 'linear-gradient(115deg, #17372B 0%, #24543D 68%, #2F6B4F 100%)',
            position: 'relative', overflow: 'hidden',
            '&:after': { content: '""', position: 'absolute', width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(255,255,255,.09)', right: -70, top: -115, boxShadow: '0 0 0 35px rgba(255,255,255,.025), 0 0 0 70px rgba(255,255,255,.02)' },
          }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
              <Box>
                <Chip size="small" label="COMPANY OVERVIEW" sx={{ mb: 1.5, color: '#F0D28B', bgcolor: 'rgba(214,168,79,.16)', fontWeight: 800, letterSpacing: '.08em' }} />
                <Typography component="h1" fontWeight={900} letterSpacing="-.045em" sx={{ fontSize: { xs: '1.8rem', md: '2.35rem' }, lineHeight: 1.15 }}>
                  Welcome back{userName ? `, ${userName.split(' ')[0]}` : ''}
                </Typography>
                <Typography sx={{ mt: 1, maxWidth: 620, color: 'rgba(255,255,255,.72)', fontSize: '.95rem', lineHeight: 1.65 }}>
                  Here’s your company at a glance. Keep your people, projects and payroll moving from one place.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'row', sm: 'column' }} spacing={1} sx={{ alignSelf: { xs: 'stretch', sm: 'center' }, minWidth: { sm: 170 } }}>
                <Button fullWidth variant="contained" startIcon={<PersonAddAlt1Rounded />} onClick={() => setDialog('worker')}
                  sx={{ bgcolor: '#D6A84F', color: '#17372B', '&:hover': { bgcolor: '#E7C77F' }, fontWeight: 850 }}>Add an employee</Button>
                <Button fullWidth variant="outlined" startIcon={<CalendarMonthRounded />} onClick={() => { setSection('payroll'); setDialog('period'); }}
                  sx={{ borderColor: 'rgba(255,255,255,.32)', color: '#FFFFFF', '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255,255,255,.06)' } }}>New pay period</Button>
              </Stack>
            </Stack>
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Box><Typography fontWeight={850} fontSize="1.05rem">Your operations</Typography><Typography variant="body2" color="text.secondary">Live totals from this workspace</Typography></Box>
            <Button size="small" startIcon={<RefreshRounded />} onClick={() => void refresh()} disabled={loading}>Refresh</Button>
          </Stack>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { title: 'Active employees', amount: counts.workers, caption: 'Employees in your company', icon: <GroupsRounded />, color: '#2F6B4F', bg: '#E7F0E9', target: 'workers' as Section },
              { title: 'Active projects', amount: counts.projects, caption: 'Projects marked active', icon: <BusinessRounded />, color: '#8B642D', bg: '#F6EFDF', target: 'projects' as Section },
              { title: 'Awaiting review', amount: counts.attendance, caption: 'Attendance submissions', icon: <AssignmentTurnedInRounded />, color: '#376A8A', bg: '#E8F0F5', target: 'attendance' as Section },
              { title: 'Payroll periods', amount: counts.periods, caption: 'Configured pay periods', icon: <AccountBalanceWalletRounded />, color: '#6D5A91', bg: '#F0ECF6', target: 'payroll' as Section },
            ].map(metric => (
              <Grid size={{ xs: 12, sm: 6, xl: 3 }} key={metric.title}>
                <Card variant="outlined" sx={{ height: '100%', borderColor: '#E6EBE5', borderRadius: 3, boxShadow: '0 3px 14px rgba(23,55,43,.025)', cursor: 'pointer', transition: 'all .18s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 10px 28px rgba(23,55,43,.08)', borderColor: '#C8D8CB' } }} onClick={() => setSection(metric.target)}>
                  <CardContent sx={{ p: 2.3, '&:last-child': { pb: 2.3 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box><Typography color="text.secondary" fontSize=".82rem" fontWeight={650}>{metric.title}</Typography><Typography variant="h3" fontWeight={900} letterSpacing="-.04em" sx={{ mt: 1, color: '#17372B' }}>{loading ? '—' : metric.amount}</Typography></Box>
                      <Avatar variant="rounded" sx={{ width: 44, height: 44, bgcolor: metric.bg, color: metric.color, borderRadius: 2 }}>{metric.icon}</Avatar>
                    </Stack>
                    <Typography color="text.secondary" variant="caption" sx={{ display: 'block', mt: 1.3 }}>{metric.caption}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#E6EBE5', borderRadius: 3, height: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Box><Typography fontWeight={850}>Projects at a glance</Typography><Typography variant="body2" color="text.secondary">Your active project portfolio</Typography></Box>
                  <Button size="small" onClick={() => setSection('projects')}>View all</Button>
                </Stack>
                {(data.projects ?? []).filter(row => row.status === 'active').slice(0, 4).map(project => (
                  <Stack key={String(project.id)} direction="row" alignItems="center" spacing={1.5} sx={{ py: 1.35, borderBottom: '1px solid #EEF1ED' }}>
                    <Avatar variant="rounded" sx={{ bgcolor: '#E7F0E9', color: '#2F6B4F', width: 38, height: 38, borderRadius: 2 }}><BusinessRounded fontSize="small" /></Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={750} fontSize=".88rem" noWrap>{label(project.name)}</Typography><Typography variant="caption" color="text.secondary">{label(project.projectCode)} · {label(project.clientName)}</Typography></Box>
                    <Chip size="small" label="Active" color="success" variant="outlined" />
                  </Stack>
                ))}
                {!(data.projects ?? []).some(row => row.status === 'active') && <Box sx={{ py: 4, textAlign: 'center' }}><BusinessRounded sx={{ color: '#AAB7AD', fontSize: 32 }} /><Typography fontWeight={750} sx={{ mt: 1 }}>No active projects yet</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .4 }}>Create a project to start organizing sites and teams.</Typography><Button size="small" sx={{ mt: 1 }} onClick={() => { setSection('projects'); setDialog('project'); }}>Create a project</Button></Box>}
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#E6EBE5', borderRadius: 3, height: '100%' }}>
                <Typography fontWeight={850}>Quick actions</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Common tasks, one click away</Typography>
                {[
                  { title: 'Add an employee', subtitle: 'Create an employee profile', icon: <PersonAddAlt1Rounded />, action: () => setDialog('worker') },
                  { title: 'Capture attendance', subtitle: 'Record work completed', icon: <EventAvailableRounded />, action: () => setSection('attendance') },
                  { title: 'Set up a pay period', subtitle: 'Prepare the next payroll cycle', icon: <CalendarMonthRounded />, action: () => { setSection('payroll'); setDialog('period'); } },
                  { title: 'Invite a teammate', subtitle: 'Give someone workspace access', icon: <GroupsRounded />, action: () => setSection('people') },
                ].map(action => <Button key={action.title} fullWidth onClick={action.action} sx={{ justifyContent: 'flex-start', textAlign: 'left', color: '#17372B', px: 1, py: 1.1, borderRadius: 2 }}>
                  <Avatar variant="rounded" sx={{ mr: 1.4, width: 36, height: 36, bgcolor: '#F0F4EF', color: '#2F6B4F', borderRadius: 2 }}>{action.icon}</Avatar>
                  <Box sx={{ flex: 1 }}><Typography fontWeight={800} fontSize=".84rem">{action.title}</Typography><Typography variant="caption" color="text.secondary">{action.subtitle}</Typography></Box>
                  <Typography color="text.secondary">›</Typography>
                </Button>)}
              </Paper>
            </Grid>
          </Grid>
          <Alert severity="info" sx={{ mt: 2.5, borderRadius: 2 }}>Payroll calculation previews are available. Finalization and payment execution remain restricted until statutory rules and approval controls are independently verified.</Alert>
        </> : <>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} spacing={2} sx={{ mb: 2.5 }}>
            <Box>
              <Typography variant="overline" sx={{ color: '#2F6B4F', fontWeight: 850, letterSpacing: '.13em' }}>{membership?.displayName ?? 'COMPANY'} / WORKSPACE</Typography>
              <Typography component="h1" fontWeight={900} letterSpacing="-.04em" sx={{ fontSize: { xs: '1.8rem', md: '2.25rem' }, lineHeight: 1.2 }}>{pageTitle[section]}</Typography>
              <Typography color="text.secondary" sx={{ mt: .6 }}>{pageDescription[section]}</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Refresh records"><span><Button variant="outlined" color="inherit" startIcon={<RefreshRounded />} onClick={() => void refresh()} disabled={loading} sx={{ borderColor: '#DCE4DC' }}>Refresh</Button></span></Tooltip>
              {section === 'workers' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog('worker')}>Add employee</Button>}
              {section === 'pay-grades' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => { setSelectedPayGrade(''); setDialog('payGrade'); }}>Create pay grade</Button>}
              {section === 'projects' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog('project')}>Add project</Button>}
              {section === 'attendance' && <Button variant="contained" startIcon={<AddRounded />} disabled={!selectedWorker || !selectedProject} onClick={() => setDialog('attendance')}>Capture</Button>}
              {section === 'payroll' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog('period')}>New period</Button>}
            </Stack>
          </Stack>
          {loading && <Box sx={{ mb: 2 }}><Typography variant="caption" color="text.secondary">Refreshing workspace data…</Typography></Box>}
          {section !== 'organization' && section !== 'people' && section !== 'compliance' && <TextField fullWidth size="small" placeholder={`Search ${pageTitle[section].toLowerCase()}…`} value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded sx={{ color: '#87948A' }} /></InputAdornment> }}
            sx={{ mb: 2, maxWidth: 520, '& .MuiOutlinedInput-root': { bgcolor: '#FFFFFF', borderRadius: 2 } }} />}
          {section === 'pay-grades' ? <Stack spacing={2}><Paper variant="outlined" sx={{ borderColor: '#E6EBE5', borderRadius: 3, overflow: 'hidden', bgcolor: '#FFFFFF' }}>
            <TableContainer><Table size="medium"><TableHead><TableRow>{['Code','Pay grade','Pay basis','Minimum','Midpoint','Maximum','Currency','Status','Actions'].map(x => <TableCell key={x} sx={{ bgcolor: '#F8FAF8', color: '#66756A', fontWeight: 800, fontSize: '.72rem' }}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
              {(data.payGrades ?? []).filter(row => !searchQuery || JSON.stringify(row).toLowerCase().includes(searchQuery.toLowerCase())).map(row => <TableRow key={String(row.id)} hover><TableCell>{label(row.code)}</TableCell><TableCell><Typography fontWeight={750}>{label(row.name)}</Typography><Typography variant="caption" color="text.secondary">{label(row.description)}</Typography></TableCell><TableCell>{label(row.payBasis)}</TableCell><TableCell>{label(row.minimumRate)}</TableCell><TableCell>{label(row.midpointRate)}</TableCell><TableCell>{label(row.maximumRate)}</TableCell><TableCell>{label(row.currency)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'active' ? 'success' : 'default'} /></TableCell><TableCell><Stack direction="row" spacing={.5}><Button size="small" disabled={busy} onClick={() => { setSelectedPayGrade(String(row.id)); setField('gradeCode', String(row.code ?? '')); setField('gradeName', String(row.name ?? '')); setField('gradeDescription', String(row.description ?? '')); setField('gradePayBasis', String(row.payBasis ?? 'monthly')); setField('gradeCurrency', String(row.currency ?? 'KES')); setField('gradeMinimum', row.minimumRate == null ? '' : String(row.minimumRate)); setField('gradeMidpoint', row.midpointRate == null ? '' : String(row.midpointRate)); setField('gradeMaximum', row.maximumRate == null ? '' : String(row.maximumRate)); setDialog('payGrade'); }}>Edit</Button><Button size="small" disabled={busy} onClick={async () => { setBusy(true); try { await request(`tenant/pay-grades/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: row.status === 'active' ? 'inactive' : 'active' }) }); setNotice(`Pay grade ${row.status === 'active' ? 'deactivated' : 'reactivated'}.`); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pay grade status could not be updated.'); } finally { setBusy(false); } }}>{row.status === 'active' ? 'Deactivate' : 'Reactivate'}</Button></Stack></TableCell></TableRow>)}
              {!(data.payGrades ?? []).length && <TableRow><TableCell colSpan={9} sx={{ py: 5, textAlign: 'center' }}>No pay grades yet. Create a pay grade to define a reusable rate band.</TableCell></TableRow>}
            </TableBody></Table></TableContainer>
          </Paper>
          <Paper variant="outlined" sx={{ borderColor: '#E6EBE5', borderRadius: 3, overflow: 'hidden', bgcolor: '#FFFFFF' }}>
            <Box sx={{ p: 2.5, borderBottom: '1px solid #E8EEE8' }}>
              <Typography fontWeight={850}>Allowance and deduction catalogue</Typography>
              <Typography variant="body2" color="text.secondary">Kenya payroll defaults are seeded for each new company. Configure names, calculation methods, tax treatment, approval and calculation settings here.</Typography>
            </Box>
            <Box sx={{ p: 2.5 }}>
              <Typography fontWeight={800} sx={{ mb: 1 }}>Allowances</Typography>
              <TableContainer><Table size="small"><TableHead><TableRow>{['Code','Allowance','Method','Tax treatment','Enabled',''].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
                {(data.allowanceTypes ?? []).map(row => <TableRow key={String(row.id)}><TableCell>{label(row.code)}</TableCell><TableCell>{label(row.name)}</TableCell><TableCell>{label(row.calculationMethod)}</TableCell><TableCell>{label(row.taxTreatment)}</TableCell><TableCell><Chip size="small" label={row.isEnabled ? 'Enabled' : 'Disabled'} color={row.isEnabled ? 'success' : 'default'} /></TableCell><TableCell><Button size="small" onClick={() => { setSelectedComponentType('allowance'); setSelectedComponentId(String(row.id)); setField('componentName',String(row.name ?? '')); setField('componentMethod',String(row.calculationMethod ?? 'fixed_amount')); setField('componentTreatment',String(row.taxTreatment ?? 'review_required')); setField('componentConfiguration',JSON.stringify(row.configuration ?? {},null,2)); setField('componentEnabled',String(Boolean(row.isEnabled))); setField('componentApproval',String(Boolean(row.requiresApproval))); setDialog('payComponent'); }}>Configure</Button></TableCell></TableRow>)}
                {!(data.allowanceTypes ?? []).length && <TableRow><TableCell colSpan={6}>No allowance types have been seeded for this company yet.</TableCell></TableRow>}
              </TableBody></Table></TableContainer>
              <Divider sx={{ my: 2.5 }} />
              <Typography fontWeight={800} sx={{ mb: 1 }}>Deductions</Typography>
              <TableContainer><Table size="small"><TableHead><TableRow>{['Code','Deduction','Category','Method','Tax treatment','Enabled',''].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
                {(data.deductionTypes ?? []).map(row => <TableRow key={String(row.id)}><TableCell>{label(row.code)}</TableCell><TableCell>{label(row.name)}</TableCell><TableCell>{label(row.category)}</TableCell><TableCell>{label(row.calculationMethod)}</TableCell><TableCell>{label(row.taxableTreatment)}</TableCell><TableCell><Chip size="small" label={row.isEnabled ? 'Enabled' : 'Disabled'} color={row.isEnabled ? 'success' : 'default'} /></TableCell><TableCell><Button size="small" onClick={() => { setSelectedComponentType('deduction'); setSelectedComponentId(String(row.id)); setField('componentName',String(row.name ?? '')); setField('componentMethod',String(row.calculationMethod ?? 'fixed_amount')); setField('componentTreatment',String(row.taxableTreatment ?? 'review_required')); setField('componentConfiguration',JSON.stringify(row.configuration ?? {},null,2)); setField('componentEnabled',String(Boolean(row.isEnabled))); setField('componentApproval',String(Boolean(row.requiresApproval))); setDialog('payComponent'); }}>Configure</Button></TableCell></TableRow>)}
                {!(data.deductionTypes ?? []).length && <TableRow><TableCell colSpan={7}>No deduction types have been seeded for this company yet.</TableCell></TableRow>}
              </TableBody></Table></TableContainer>
            </Box>
          </Paper></Stack> : section === 'time-management' ? <WorkforceTimeWorkspace workers={(data.workers ?? []).filter((row): row is RowData & { id: string } => typeof row.id === 'string')} request={request} /> : section === 'compliance' ? <ComplianceWorkspace role={membership?.role ?? 'viewer'} periods={data.periods ?? []} request={request} /> : section === 'organization' ? <OrganizationWorkspace request={request} workers={(data.workers ?? []).filter((row): row is RowData & { id: string } => typeof row.id === 'string')} projects={(data.projects ?? []).filter((row): row is RowData & { id: string } => typeof row.id === 'string')} sites={(data.sites ?? []).filter((row): row is RowData & { id: string } => typeof row.id === 'string')} /> : section === 'people' ? <TenantAdministration section={section} role={membership?.role ?? 'viewer'} data={data} request={request} refresh={refresh} /> :
            <Paper variant="outlined" sx={{ borderColor: '#E6EBE5', borderRadius: 3, overflow: 'hidden', bgcolor: '#FFFFFF' }}>
              {section === 'payroll' ? <PayrollWorkspace request={request} onRefresh={refresh} /> : <TableContainer sx={{ overflowX: 'auto' }}><Table size="medium"><TableHead><TableRow>
                {(section === 'workers' ? ['Employee no.','Name','Phone','Email','Status','Actions'] :
                  section === 'projects' ? ['Code','Project','Client','Status','Select'] :
                  ['Date','Employee ID','Project ID','Minutes','Status','Actions']).map(x => <TableCell key={x} sx={{ bgcolor: '#F8FAF8', color: '#66756A', fontWeight: 800, fontSize: '.72rem', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{x}</TableCell>)}
              </TableRow></TableHead><TableBody>
                {filteredRows.map(row => <TableRow key={String(row.id ?? JSON.stringify(row))} hover>
                  {section === 'workers' && <><TableCell>{label(row.workerNumber)}</TableCell><TableCell><Typography fontWeight={750}>{label(row.firstName)} {label(row.lastName)}</Typography></TableCell><TableCell>{label(row.phone)}</TableCell><TableCell>{label(row.email)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'active' ? 'success' : 'default'} /></TableCell><TableCell><Stack direction="row" spacing={.5}><Button size="small" variant={selectedWorker === row.id ? 'contained' : 'text'} onClick={() => setSelectedWorker(String(row.id))}>{selectedWorker === row.id ? 'Selected' : 'View'}</Button><Button size="small" color="error" disabled={busy} onClick={() => void permanentlyDeleteEmployee(String(row.id))}>Delete</Button></Stack></TableCell></>}
                  {section === 'projects' && <><TableCell>{label(row.projectCode)}</TableCell><TableCell><Typography fontWeight={750}>{label(row.name)}</Typography></TableCell><TableCell>{label(row.clientName)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'active' ? 'success' : 'default'} /></TableCell><TableCell><Button size="small" variant={selectedProject === row.id ? 'contained' : 'text'} onClick={() => setSelectedProject(String(row.id))}>{selectedProject === row.id ? 'Selected' : 'View sites'}</Button></TableCell></>}
                  {section === 'attendance' && <><TableCell>{label(row.workDate)}</TableCell><TableCell>{label(row.workerId)}</TableCell><TableCell>{label(row.projectId)}</TableCell><TableCell>{label(row.minutesWorked)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'approved' ? 'success' : row.status === 'submitted' ? 'warning' : 'default'} /></TableCell><TableCell>{row.status === 'draft' ? <Button size="small" disabled={busy} onClick={() => void attendanceAction(String(row.id), 'submit')}>Submit</Button> : row.status === 'submitted' ? <Button size="small" disabled={busy} onClick={() => void attendanceAction(String(row.id), 'approve')}>Approve</Button> : '—'}</TableCell></>}
                </TableRow>)}
                {!filteredRows.length && <TableRow><TableCell colSpan={6} sx={{ py: 5, textAlign: 'center' }}>
                  <Typography fontWeight={800}>{searchQuery ? 'No matching records' : 'Nothing here yet'}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{searchQuery ? 'Try another search term.' : 'When you add records, they will appear here.'}</Typography>
                </TableCell></TableRow>}
              </TableBody></Table></TableContainer>}
              {section === 'workers' && selectedWorker && <Box sx={{ p: 2.5, borderTop: '1px solid #E8EEE8' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography fontWeight={850}>Employee lifecycle & contract history</Typography><Button size="small" variant="contained" disabled={busy} onClick={() => setDialog('contract')}>Add contract</Button>
                  <Button size="small" disabled={busy} onClick={() => void updateWorkerStatus(selectedWorker, data.workers?.find(worker => worker.id === selectedWorker)?.status === 'active' ? 'inactive' : 'active')}>
                    {data.workers?.find(worker => worker.id === selectedWorker)?.status === 'active' ? 'Deactivate employee' : 'Activate employee'}
                  </Button>
                </Stack>
                <TableContainer><Table size="small"><TableHead><TableRow>{['Engagement','Pay basis','Rate','From','To','Actions'].map(item => <TableCell key={item}>{item}</TableCell>)}</TableRow></TableHead><TableBody>
                  {contracts.map(contract => <TableRow key={String(contract.id)}><TableCell>{label(contract.engagementType)}</TableCell><TableCell>{label(contract.payBasis)}</TableCell><TableCell>{label(contract.rateAmount)} {label(contract.currency)}</TableCell><TableCell>{label(contract.effectiveFrom)}</TableCell><TableCell>{label(contract.effectiveTo)}</TableCell><TableCell>{!contract.effectiveTo && <Button size="small" onClick={() => { setSelectedContract(String(contract.id)); setField('contractEndDate', dateToday()); setDialog('endContract'); }}>End contract</Button>}</TableCell></TableRow>)}
                  {!contracts.length && <TableRow><TableCell colSpan={6}>No contract history is recorded for this worker.</TableCell></TableRow>}
                </TableBody></Table></TableContainer>
              </Box>}
              {section === 'workers' && selectedWorker && <Box sx={{ p: 2.5, borderTop: '1px solid #E8EEE8' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
                  <Box><Typography fontWeight={850}>Employee documents</Typography><Typography variant="caption" color="text.secondary">Private tenant-scoped files. Download links expire after three minutes.</Typography></Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField select size="small" label="Document type" value={documentType} onChange={e => setDocumentType(e.target.value)} sx={{ minWidth: 170 }}>
                      {['identity','contract','tax','bank','qualification','other'].map(x => <MenuItem key={x} value={x}>{x.replaceAll('_',' ')}</MenuItem>)}
                    </TextField>
                    <Button component="label" variant="outlined" color="inherit" sx={{ whiteSpace: 'nowrap' }}>Choose file
                      <input hidden type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={e => setDocumentFile(e.target.files?.[0] ?? null)} />
                    </Button>
                    <Button variant="contained" disabled={!documentFile || uploadingDocument} onClick={() => void uploadWorkerDocument()}>{uploadingDocument ? 'Uploading…' : 'Upload document'}</Button>
                  </Stack>
                </Stack>
                {documentFile && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Selected: {documentFile.name} · {(documentFile.size / 1024 / 1024).toFixed(2)} MB</Typography>}
                <TableContainer><Table size="small"><TableHead><TableRow>{['Type','File','Size','Uploaded',''].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
                  {workerDocuments.map(doc => <TableRow key={String(doc.id)}><TableCell>{label(doc.documentType)}</TableCell><TableCell>{label(doc.originalName)}</TableCell><TableCell>{(Number(doc.sizeBytes ?? 0) / 1024).toFixed(1)} KB</TableCell><TableCell>{label(doc.createdAt)}</TableCell><TableCell><Button size="small" onClick={() => void downloadWorkerDocument(String(doc.id))}>Download</Button></TableCell></TableRow>)}
                  {!workerDocuments.length && <TableRow><TableCell colSpan={5}>No documents have been uploaded for this worker.</TableCell></TableRow>}
                </TableBody></Table></TableContainer>
              </Box>}
              {section === 'projects' && <Box sx={{ p: 2.5, borderTop: '1px solid #E8EEE8' }}>
                <Typography fontWeight={850} sx={{ mb: 1 }}>Project sites</Typography>
                <TableContainer><Table size="small"><TableHead><TableRow>{['Site code','Site','Project','Status'].map(item => <TableCell key={item}>{item}</TableCell>)}</TableRow></TableHead><TableBody>
                  {(data.sites ?? []).filter(site => !selectedProject || site.projectId === selectedProject).map(site => <TableRow key={String(site.id)}><TableCell>{label(site.siteCode)}</TableCell><TableCell>{label(site.name)}</TableCell><TableCell>{label(site.projectId)}</TableCell><TableCell>{label(site.status)}</TableCell></TableRow>)}
                  {!(data.sites ?? []).length && <TableRow><TableCell colSpan={4}>No project sites have been created.</TableCell></TableRow>}
                </TableBody></Table></TableContainer>
              </Box>}
            </Paper>}
        </>}
      </Box>
    </Box>

    <SyncReviewDialog open={reviewOpen} tenantId={tenantId} onClose={() => setReviewOpen(false)} onChanged={() => { void refreshQueueCounts(); void syncOfflineQueue(false); }} />
    <Dialog open={Boolean(dialog)} onClose={() => { setDialog(''); setSelectedPayGrade(''); setSelectedComponentId(''); }} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{dialog === 'worker' ? 'Add employee' : dialog === 'contract' ? 'Add employee contract' : dialog === 'endContract' ? 'End employee contract' : dialog === 'payGrade' ? (selectedPayGrade ? 'Edit pay grade' : 'Create pay grade') : dialog === 'project' ? 'Create project' : dialog === 'site' ? 'Create site' : dialog === 'attendance' ? 'Capture attendance' : dialog === 'payComponent' ? 'Configure pay component' : 'Create payroll period'}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {dialog === 'endContract' && <><Alert severity="warning">Ending a contract is effective-dated and cannot be extended. Create a new contract version if the employee is rehired.</Alert><TextField label="Effective to" type="date" required InputLabelProps={{ shrink: true }} value={forms.contractEndDate} onChange={e => setField('contractEndDate', e.target.value)} /></>}
          {dialog === 'worker' && <><TextField label="Employee number" required value={forms.workerNumber} onChange={e => setField('workerNumber', e.target.value)} /><TextField label="First name" required value={forms.firstName} onChange={e => setField('firstName', e.target.value)} /><TextField label="Last name" required value={forms.lastName} onChange={e => setField('lastName', e.target.value)} /><TextField label="Phone" value={forms.phone} onChange={e => setField('phone', e.target.value)} /><TextField label="Email" type="email" value={forms.email} onChange={e => setField('email', e.target.value)} /></>}
          {dialog === 'payGrade' && <>{!selectedPayGrade && <TextField label="Code" required value={forms.gradeCode} onChange={e => setField('gradeCode', e.target.value.toUpperCase())} />}<TextField label="Name" required value={forms.gradeName} onChange={e => setField('gradeName', e.target.value)} /><TextField label="Description" multiline minRows={2} value={forms.gradeDescription} onChange={e => setField('gradeDescription', e.target.value)} /><TextField select label="Pay basis" value={forms.gradePayBasis} onChange={e => setField('gradePayBasis', e.target.value)}>{['hourly','daily','weekly','monthly','per_unit'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField label="Currency" required inputProps={{ maxLength: 3 }} value={forms.gradeCurrency} onChange={e => setField('gradeCurrency', e.target.value.toUpperCase())} /><TextField label="Minimum rate" type="number" inputProps={{ min: 0, step: '0.0001' }} value={forms.gradeMinimum} onChange={e => setField('gradeMinimum', e.target.value)} /><TextField label="Midpoint rate" type="number" inputProps={{ min: 0, step: '0.0001' }} value={forms.gradeMidpoint} onChange={e => setField('gradeMidpoint', e.target.value)} /><TextField label="Maximum rate" type="number" inputProps={{ min: 0, step: '0.0001' }} value={forms.gradeMaximum} onChange={e => setField('gradeMaximum', e.target.value)} /></>}
           {dialog === 'contract' && <><TextField select label="Engagement" value={forms.engagementType} onChange={e => setField('engagementType', e.target.value)}>{['permanent','fixed_term','casual','piece_rate','subcontractor','independent_contractor'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Pay basis" value={forms.payBasis} onChange={e => setField('payBasis', e.target.value)}>{['hourly','daily','weekly','monthly','per_unit'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Pay grade (optional)" value={forms.payGradeId} onChange={e => { const grade = (data.payGrades ?? []).find(item => item.id === e.target.value); setField('payGradeId', e.target.value); if (grade) setField('payBasis', String(grade.payBasis)); }}><MenuItem value="">No pay grade</MenuItem>{(data.payGrades ?? []).filter(grade => grade.status === 'active').map(grade => <MenuItem key={String(grade.id)} value={String(grade.id)}>{label(grade.code)} — {label(grade.name)}</MenuItem>)}</TextField>{forms.payBasis === 'per_unit' && <TextField label="Approved unit codes (comma-separated)" required helperText="Example: blocks, metres, deliveries. These must match approved output entries." value={forms.unitCodes} onChange={e => setField('unitCodes', e.target.value)} />}<TextField label="Rate (KES)" type="number" required value={forms.rateAmount} onChange={e => setField('rateAmount', e.target.value)} /><TextField label="Effective from" type="date" required InputLabelProps={{ shrink: true }} value={forms.effectiveFrom} onChange={e => setField('effectiveFrom', e.target.value)} /></>}
          {dialog === 'project' && <><TextField label="Project code" required value={forms.projectCode} onChange={e => setField('projectCode', e.target.value)} /><TextField label="Project name" required value={forms.projectName} onChange={e => setField('projectName', e.target.value)} /><TextField label="Client name" value={forms.clientName} onChange={e => setField('clientName', e.target.value)} /></>}
          {dialog === 'site' && <><TextField label="Site code" required value={forms.siteCode} onChange={e => setField('siteCode', e.target.value)} /><TextField label="Site name" required value={forms.siteName} onChange={e => setField('siteName', e.target.value)} /></>}
          {dialog === 'attendance' && <><TextField select label="Site" required value={forms.siteId ?? ''} onChange={e => setField('siteId', e.target.value)}>{(data.sites ?? []).filter(site => site.projectId === selectedProject).map(site => <MenuItem key={String(site.id)} value={String(site.id)}>{label(site.name)}</MenuItem>)}</TextField><TextField label="Work date" type="date" required InputLabelProps={{ shrink: true }} value={forms.workDate} onChange={e => setField('workDate', e.target.value)} /><TextField label="Minutes worked" type="number" required value={forms.minutesWorked} onChange={e => setField('minutesWorked', e.target.value)} /></>}
          {dialog === 'payComponent' && <>
            <Alert severity="info">Changes affect future payroll calculations. Completed payroll snapshots are not rewritten.</Alert>
            <TextField label={selectedComponentType === 'allowance' ? 'Allowance name' : 'Deduction name'} required value={forms.componentName} onChange={e => setField('componentName',e.target.value)} />
            <TextField select label="Calculation method" value={forms.componentMethod} onChange={e => setField('componentMethod',e.target.value)}>
              {(selectedComponentType === 'allowance' ? ['fixed_amount','per_day','per_hour','percentage','quantity_times_rate'] : ['fixed_amount','percentage','balance_recovery']).map(method => <MenuItem key={method} value={method}>{method.replaceAll('_',' ')}</MenuItem>)}
            </TextField>
            <TextField select label="Tax treatment" value={forms.componentTreatment} onChange={e => setField('componentTreatment',e.target.value)}>
              {(selectedComponentType === 'allowance' ? ['review_required','taxable','non_taxable'] : ['review_required','not_applicable','post_tax']).map(value => <MenuItem key={value} value={value}>{value.replaceAll('_',' ')}</MenuItem>)}
            </TextField>
            <TextField label="Calculation configuration (JSON)" multiline minRows={5} helperText='Example: {"rate": 1.5, "maximumMonthly": 5000}. Use an empty object when no parameters are required.' value={forms.componentConfiguration} onChange={e => setField('componentConfiguration',e.target.value)} />
            <TextField select label="Status" value={forms.componentEnabled} onChange={e => setField('componentEnabled',e.target.value)}><MenuItem value="true">Enabled</MenuItem><MenuItem value="false">Disabled</MenuItem></TextField>
            <TextField select label="Require approval" value={forms.componentApproval} onChange={e => setField('componentApproval',e.target.value)}><MenuItem value="true">Yes</MenuItem><MenuItem value="false">No</MenuItem></TextField>
          </>}
          {dialog === 'period' && <><TextField label="Period code" required value={forms.periodCode} onChange={e => setField('periodCode', e.target.value)} /><TextField label="Period name" required value={forms.periodName} onChange={e => setField('periodName', e.target.value)} /><TextField label="Start date" type="date" required InputLabelProps={{ shrink: true }} value={forms.startDate} onChange={e => setField('startDate', e.target.value)} /><TextField label="End date" type="date" required InputLabelProps={{ shrink: true }} value={forms.endDate} onChange={e => setField('endDate', e.target.value)} /></>}
        </Stack></DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => { setDialog(''); setSelectedPayGrade(''); setSelectedComponentId(''); }}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></DialogActions>
      </Box>
    </Dialog>
  </Box>;
}
