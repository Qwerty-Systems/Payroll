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
import { downloadOfflineReferenceData, getCachedOfflineReferenceData, queueOfflineAttendance, synchronizeOfflineAttendance } from '../offline/offline-api';

type Membership = {
  tenantId: string; slug: string; displayName: string; legalName: string;
  tenantStatus: string; membershipId: string; role: string;
};
type RowData = Record<string, unknown> & { id?: string };
type Section = 'overview' | 'workers' | 'pay-grades' | 'projects' | 'attendance' | 'payroll' | 'billing' | 'organization' | 'people' | 'reports';
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
  const [dialog, setDialog] = useState<'' | 'worker' | 'contract' | 'payGrade' | 'endContract' | 'project' | 'site' | 'attendance' | 'period' | 'shift' | 'leave' | 'overtime' | 'timesheet' | 'correction' | 'leavePolicy' | 'payComponent' | 'billingQuote' | 'billingInvoice' | 'billingRecurring' | 'billingSubscription' | 'billingPayment'>('');
  const [busy, setBusy] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedRun, setSelectedRun] = useState('');
  const [selectedContract, setSelectedContract] = useState('');
  const [selectedAttendance, setSelectedAttendance] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [downloadingReferenceData, setDownloadingReferenceData] = useState(false);
  const [referenceDataMessage, setReferenceDataMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const isMobile = useMediaQuery('(max-width:1199px)');
  const [contracts, setContracts] = useState<RowData[]>([]);
  const [workerDocuments, setWorkerDocuments] = useState<RowData[]>([]);
  const [workerPayComponents, setWorkerPayComponents] = useState<RowData[]>([]);
  const [documentType, setDocumentType] = useState('contract');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [forms, setForms] = useState<Record<string, string>>({
    workerNumber: '', firstName: '', lastName: '', phone: '', email: '',
    engagementType: 'permanent', payBasis: 'monthly', rateAmount: '', effectiveFrom: dateToday(), contractEndDate: dateToday(), unitCodes: '', payGradeId: '',
    gradeCode: '', gradeName: '', gradeDescription: '', gradePayBasis: 'monthly', gradeMinimum: '', gradeMidpoint: '', gradeMaximum: '', gradeCurrency: 'KES',
    projectCode: '', projectName: '', clientName: '', siteCode: '', siteName: '',
    workDate: dateToday(), minutesWorked: '480', periodCode: '', periodName: '',
    shiftCode: '', shiftName: '', shiftStart: '08:00', shiftEnd: '17:00', shiftBreak: '60', shiftGrace: '10',
    leaveType: 'annual', leaveStart: dateToday(), leaveEnd: dateToday(), leaveDays: '1', leaveReason: '', leaveYear: String(new Date().getUTCFullYear()), leaveEntitlement: '21', reviewReason: '',
    overtimeAttendanceId: '', overtimeMinutes: '60', overtimeReason: '', timesheetStart: dateToday().slice(0,8)+'01', timesheetEnd: dateToday(), correctionClockIn: '', correctionClockOut: '', correctionMinutes: '', correctionReason: '', componentCode: '', componentName: '', componentType: 'allowance', componentMethod: 'fixed', componentAmount: '', componentTaxable: 'false', componentFrom: dateToday(), billingCustomer: '', billingEmail: '', billingCurrency: 'KES', billingDescription: '', billingQuantity: '1', billingUnitPrice: '', billingTaxRate: '0', billingDueDate: dateToday(), billingValidUntil: '', billingFrequency: 'monthly', billingNextRun: dateToday(), billingDueDays: '30', billingPlanId: '', billingInvoiceId: '', billingPaymentAmount: '', billingPaymentMethod: 'bank_transfer', billingPaymentReference: '', billingReviewReason: '', reportFrom: dateToday().slice(0,8)+'01', reportTo: dateToday(), reportPeriodId: '',
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
      projects: 'tenant/projects',
      sites: 'tenant/sites',
      attendance: 'tenant/attendance',
      shifts: 'tenant/attendance/shifts', leaveRequests: 'tenant/attendance/leave-requests', overtimeRequests: 'tenant/attendance/overtime-requests', timesheets: 'tenant/attendance/timesheets', conflicts: 'tenant/sync/conflicts', billingPlans: 'tenant/billing/plans', subscriptions: 'tenant/billing/subscriptions', quotes: 'tenant/billing/quotes', invoices: 'tenant/billing/invoices', payments: 'tenant/billing/payments', recurringSchedules: 'tenant/billing/recurring-schedules', reportDashboard: 'tenant/reports/dashboard',
      periods: 'payroll/periods',
      branches: 'tenant/organization/branches',
      departments: 'tenant/organization/departments',
      costCentres: 'tenant/organization/cost-centres',
      assignments: 'tenant/organization/worker-assignments',
      members: 'tenant/users',
    };
    const entries = await Promise.all(Object.entries(endpoints).map(async ([key, path]) => {
      try { return [key, asRows(await request<unknown>(path))] as const; }
      catch { const cached = await getCachedOfflineReferenceData<Record<string, unknown[]>>(tenantId); return [key, asRows(cached?.[key])] as const; }
    }));
    setData(Object.fromEntries(entries));
    setLoading(false);
  }, [request, tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedWorker) { setContracts([]); setWorkerDocuments([]); setWorkerPayComponents([]); return; }
    let active = true;
    request<unknown>(`tenant/workers/${selectedWorker}/contracts`)
      .then(value => { if (active) setContracts(asRows(value)); })
      .catch(() => { if (active) setContracts([]); });
    request<unknown>(`tenant/workers/${selectedWorker}/documents`)
      .then(value => { if (active) setWorkerDocuments(asRows(value)); })
      .catch(() => { if (active) setWorkerDocuments([]); });
    request<unknown>(`payroll/workers/${selectedWorker}/components`)
      .then(value => { if (active) setWorkerPayComponents(asRows(value)); })
      .catch(() => { if (active) setWorkerPayComponents([]); });
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
      setNotice('Worker document uploaded securely.');
      const docs = await request<unknown>(`tenant/workers/${selectedWorker}/documents`);
      setWorkerDocuments(asRows(docs));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Worker document upload failed.');
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


  async function downloadReferenceData(){
    setDownloadingReferenceData(true);setError('');setReferenceDataMessage('');
    try{const snapshot=await downloadOfflineReferenceData(tenantId,request);const counts=['workers','projects','sites','shifts','payGrades'].map(k=>`${k}: ${Array.isArray(snapshot[k])?(snapshot[k] as unknown[]).length:0}`).join(' · ');setReferenceDataMessage('Offline reference data saved — '+counts);}
    catch(cause){setError(cause instanceof Error?cause.message:'Unable to download offline reference data.');}
    finally{setDownloadingReferenceData(false);}
  }


  async function downloadReport(path:string,filename:string){
    setBusy(true);setError('');
    try{
      const token=await getToken();
      const response=await fetch(`${apiBaseUrl.replace(/\\/$/,'')}/api/v1/${path}`,{headers:{Authorization:`Bearer ${token}`,'x-tenant-id':tenantId}});
      if(!response.ok)throw new Error(await response.text()||'Report download failed.');
      const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to download report.');}finally{setBusy(false);}
  }

  async function syncOfflineQueue() {
    setSyncing(true); setSyncMessage(''); setError('');
    try {
      const summary = await synchronizeOfflineAttendance(tenantId, request);
      setSyncMessage(`Offline sync complete: ${summary.synced} sent, ${summary.conflicts} conflicts, ${summary.rejected} rejected, ${summary.remaining} remaining.`);
      if (summary.conflicts || summary.rejected || summary.failed) setError('Some offline changes need attention. Review the sync status before relying on these records.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Offline synchronization failed.'); }
    finally { setSyncing(false); }
  }

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
          engagementType: forms.engagementType, payBasis: forms.payBasis, payGradeId: forms.payGradeId || undefined,
          rateAmount: Number(forms.rateAmount), currency: 'KES', effectiveFrom: forms.effectiveFrom,
          terms: forms.payBasis === 'per_unit' ? { unitCodes: (forms.unitCodes ?? '').split(',').map(x => x.trim()).filter(Boolean) } : {},
        }) });
        setContracts(asRows(await request<unknown>(`tenant/workers/${selectedWorker}/contracts`)));
        setNotice('Contract added to the worker history.');
      } else if (dialog === 'billingQuote' || dialog === 'billingInvoice') {
        const payload = { customerName: forms.billingCustomer, customerEmail: forms.billingEmail || undefined, currency: forms.billingCurrency, notes: undefined, lines: [{ description: forms.billingDescription, quantity: Number(forms.billingQuantity), unitPriceMinor: Number(forms.billingUnitPrice), taxRate: Number(forms.billingTaxRate) }] };
        if (dialog === 'billingQuote') await request('tenant/billing/quotes', { method: 'POST', body: JSON.stringify({ ...payload, validUntil: forms.billingValidUntil || undefined }) });
        else await request('tenant/billing/invoices', { method: 'POST', body: JSON.stringify({ ...payload, dueDate: forms.billingDueDate }) });
        setNotice(dialog === 'billingQuote' ? 'Quotation created.' : 'Invoice issued.');
      } else if (dialog === 'billingRecurring') {
        await request('tenant/billing/recurring-schedules', { method: 'POST', body: JSON.stringify({ name: forms.billingDescription, customerName: forms.billingCustomer, customerEmail: forms.billingEmail || undefined, currency: forms.billingCurrency, frequency: forms.billingFrequency, nextRunDate: forms.billingNextRun, dueDays: Number(forms.billingDueDays), lines: [{ description: forms.billingDescription, quantity: Number(forms.billingQuantity), unitPriceMinor: Number(forms.billingUnitPrice), taxRate: Number(forms.billingTaxRate) }] }) });
        setNotice('Recurring billing schedule created.');
      } else if (dialog === 'billingSubscription') {
        await request('tenant/billing/subscriptions', { method: 'POST', body: JSON.stringify({ planId: forms.billingPlanId }) });
        setNotice('Subscription request submitted.');
      } else if (dialog === 'billingPayment') {
        await request('tenant/billing/payments', { method: 'POST', body: JSON.stringify({ invoiceId: forms.billingInvoiceId, amountMinor: Number(forms.billingPaymentAmount), currency: forms.billingCurrency, method: forms.billingPaymentMethod, externalReference: forms.billingPaymentReference }) });
        setNotice('Payment recorded and awaiting independent reconciliation.');
      } else if (dialog === 'payComponent') {
        await request(`payroll/workers/${selectedWorker}/components`, { method: 'POST', body: JSON.stringify({ code: forms.componentCode, name: forms.componentName, componentType: forms.componentType, calculationMethod: forms.componentMethod, amount: Number(forms.componentAmount), taxable: forms.componentType === 'allowance' && forms.componentTaxable === 'true', effectiveFrom: forms.componentFrom }) });
        setWorkerPayComponents(asRows(await request<unknown>(`payroll/workers/${selectedWorker}/components`)));
        setNotice('Payroll component added to the worker pay profile.');
      } else if (dialog === 'endContract') {
        await request(`tenant/workers/${selectedWorker}/contracts/${selectedContract}/end`, {
          method: 'PATCH', body: JSON.stringify({ effectiveTo: forms.contractEndDate }),
        });
        setContracts(asRows(await request<unknown>(`tenant/workers/${selectedWorker}/contracts`)));
        setNotice('Worker contract end date recorded.');
      } else if (dialog === 'payGrade') {
        await request('tenant/pay-grades', { method: 'POST', body: JSON.stringify({
          code: forms.gradeCode, name: forms.gradeName, description: forms.gradeDescription || undefined,
          payBasis: forms.gradePayBasis, currency: forms.gradeCurrency,
          minimumRate: forms.gradeMinimum === '' ? undefined : Number(forms.gradeMinimum),
          midpointRate: forms.gradeMidpoint === '' ? undefined : Number(forms.gradeMidpoint),
          maximumRate: forms.gradeMaximum === '' ? undefined : Number(forms.gradeMaximum),
        }) });
        setNotice('Pay grade created. It is now available for new worker contracts.');
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
        const attendancePayload = { workerId: selectedWorker, projectId: selectedProject, siteId: forms.siteId, workDate: forms.workDate, minutesWorked: Number(forms.minutesWorked), source: 'web' };
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const queued = await queueOfflineAttendance(tenantId, attendancePayload);
          setNotice('Attendance saved to this device and queued for synchronization. Command ' + queued.id + '.');
        } else {
          await request('tenant/attendance', { method: 'POST', body: JSON.stringify(attendancePayload) });
          setNotice('Attendance record captured as a draft. Submit it for approval.');
        }
      } else if (dialog === 'shift') {
        const shift = await request<RowData>('tenant/attendance/shifts', { method: 'POST', body: JSON.stringify({ code: forms.shiftCode, name: forms.shiftName, startTime: forms.shiftStart, endTime: forms.shiftEnd, breakMinutes: Number(forms.shiftBreak), graceMinutes: Number(forms.shiftGrace) }) });
        if (selectedWorker) await request('tenant/attendance/shift-assignments', { method: 'POST', body: JSON.stringify({ workerId: selectedWorker, shiftId: shift.id, effectiveFrom: dateToday() }) });
        setNotice('Shift created and assigned where a worker was selected.');
      } else if (dialog === 'leave') {
        await request('tenant/attendance/leave-requests', { method: 'POST', body: JSON.stringify({ workerId: selectedWorker, leaveType: forms.leaveType, startDate: forms.leaveStart, endDate: forms.leaveEnd, requestedDays: Number(forms.leaveDays), reason: forms.leaveReason }) });
        setNotice('Leave request submitted for independent review.');
      } else if (dialog === 'leavePolicy') {
        await request('tenant/attendance/leave-entitlements', { method: 'POST', body: JSON.stringify({ leaveType: forms.leaveType, annualDays: Number(forms.leaveEntitlement), effectiveFrom: forms.leaveYear + '-01-01' }) });
        setNotice('Leave entitlement policy saved.');
      } else if (dialog === 'overtime') {
        await request('tenant/attendance/overtime-requests', { method: 'POST', body: JSON.stringify({ workerId: selectedWorker, attendanceId: forms.overtimeAttendanceId, minutesRequested: Number(forms.overtimeMinutes), reason: forms.overtimeReason }) });
        setNotice('Overtime request submitted for review.');
      } else if (dialog === 'timesheet') {
        await request('tenant/attendance/timesheets', { method: 'POST', body: JSON.stringify({ workerId: selectedWorker, periodStart: forms.timesheetStart, periodEnd: forms.timesheetEnd }) });
        setNotice('Timesheet generated from approved attendance.');
      } else if (dialog === 'correction') {
        await request('tenant/attendance/' + selectedAttendance + '/corrections', { method: 'POST', body: JSON.stringify({ clockIn: forms.correctionClockIn || undefined, clockOut: forms.correctionClockOut || undefined, minutesWorked: forms.correctionMinutes === '' ? undefined : Number(forms.correctionMinutes), reason: forms.correctionReason }) });
        setNotice('Attendance correction submitted for independent review.');
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

  async function updateWorkerStatus(workerId: string, status: 'active' | 'inactive' | 'suspended' | 'archived') {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`tenant/workers/${workerId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`Worker status updated to ${status.replaceAll('_',' ')}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Worker status could not be updated.'); }
    finally { setBusy(false); }
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


  async function reviewAttendanceRequest(kind:'leave-requests'|'overtime-requests',id:string,action:'approve'|'reject'){
    setBusy(true);setError('');setNotice('');
    try{await request(`tenant/attendance/${kind}/${id}/${action}`,{method:'POST',body:JSON.stringify({reason:forms.reviewReason||'Reviewed against supporting records'})});setNotice(`${kind==='leave-requests'?'Leave':'Overtime'} request ${action}d.`);await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'Review action failed.');}finally{setBusy(false);}
  }

  async function discardOfflineConflict(id:string){
    setBusy(true);setError('');setNotice('');
    try{await request(`tenant/sync/conflicts/${id}/discard`,{method:'POST',body:JSON.stringify({resolution:'Reviewed duplicate offline command; retained the server-side record.'})});setNotice('Offline conflict closed. The server-side record was retained.');await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'Unable to resolve the offline conflict.');}finally{setBusy(false);}
  }

  async function timesheetAction(id:string,action:'submit'|'approve'){
    setBusy(true);setError('');setNotice('');
    try{await request(`tenant/attendance/timesheets/${id}/${action}`,{method:'POST',body:'{}'});setNotice(`Timesheet ${action}ted.`);await refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'Timesheet action failed.');}finally{setBusy(false);}
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

  const currentRows = (section === 'workers' ? data.workers : section === 'pay-grades' ? data.payGrades : section === 'projects' ? data.projects :
    section === 'attendance' ? data.attendance : section === 'payroll' ? data.periods : section === 'billing' ? data.invoices :
    section === 'people' ? data.members : section === 'organization' ? data.branches : []) ?? [];
  const filteredRows = currentRows.filter(row => !searchQuery.trim() ||
    JSON.stringify(row).toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const navItems = [
    { value: 'overview' as Section, label: 'Overview', icon: <DashboardRounded /> , group: 'WORKSPACE' },
    { value: 'workers' as Section, label: 'People & workers', icon: <GroupsRounded />, group: 'WORKSPACE' },
    { value: 'pay-grades' as Section, label: 'Pay grades', icon: <PaymentsRounded />, group: 'FINANCE' },
    { value: 'projects' as Section, label: 'Projects & sites', icon: <BusinessRounded />, group: 'WORKSPACE' },
    { value: 'attendance' as Section, label: 'Attendance', icon: <EventAvailableRounded />, group: 'WORKSPACE' },
    { value: 'payroll' as Section, label: 'Payroll', icon: <PaymentsRounded />, group: 'FINANCE' },
    { value: 'billing' as Section, label: 'Billing', icon: <PaymentsRounded />, group: 'FINANCE' },
    { value: 'reports' as Section, label: 'Reports & exports', icon: <AssessmentRounded />, group: 'FINANCE' },
    { value: 'organization' as Section, label: 'Organization', icon: <SettingsRounded />, group: 'ADMINISTRATION' },
    { value: 'people' as Section, label: 'Team access', icon: <GroupsRounded />, group: 'ADMINISTRATION' },
  ];
  const pageTitle: Record<Section, string> = {
    overview: 'Overview', workers: 'People & workers', 'pay-grades': 'Pay grades', projects: 'Projects & sites',
    attendance: 'Attendance', payroll: 'Payroll', billing: 'Billing & subscriptions', reports: 'Reports & exports', organization: 'Organization', people: 'Team access',
  };
  const pageDescription: Record<Section, string> = {
    overview: 'A clear picture of your workforce and operations.',
    workers: 'Manage worker records, contracts and employment history.',
    'pay-grades': 'Define reusable pay bands and assign them to worker contracts.',
    projects: 'Organize projects, clients and work sites.',
    attendance: 'Capture work activity and review submitted records.',
    payroll: 'Manage pay periods and review payroll calculation previews.',
    billing: 'Manage subscriptions, quotes, invoices, recurring billing and payment reconciliation.',
    reports: 'Operational dashboards and downloadable payroll, attendance and audit reports.',
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
        {['WORKSPACE','FINANCE','ADMINISTRATION'].map(group => (
          <Box key={group} sx={{ mb: 2 }}>
            <Typography sx={{ px: 1.5, mb: .8, color: 'rgba(255,255,255,.42)', fontSize: '.65rem', fontWeight: 800, letterSpacing: '.12em' }}>{group}</Typography>
            <List disablePadding>
              {navItems.filter(item => item.group === group).map(item => (
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
        <Button size="small" variant="outlined" startIcon={<CloudSyncRounded />} onClick={() => void syncOfflineQueue()} disabled={syncing || !tenantId} sx={{ whiteSpace: 'nowrap' }}>{syncing ? 'Syncing…' : 'Sync offline'}</Button>
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
                  sx={{ bgcolor: '#D6A84F', color: '#17372B', '&:hover': { bgcolor: '#E7C77F' }, fontWeight: 850 }}>Add a worker</Button>
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
              { title: 'Active workers', amount: counts.workers, caption: 'People on your workforce', icon: <GroupsRounded />, color: '#2F6B4F', bg: '#E7F0E9', target: 'workers' as Section },
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
                  { title: 'Add a worker', subtitle: 'Create a workforce profile', icon: <PersonAddAlt1Rounded />, action: () => setDialog('worker') },
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
              {section === 'workers' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog('worker')}>Add worker</Button>}
              {section === 'pay-grades' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog('payGrade')}>Create pay grade</Button>}
              {section === 'projects' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog('project')}>Add project</Button>}
              {section === 'attendance' && <><Button variant="outlined" disabled={downloadingReferenceData} onClick={() => void downloadReferenceData()}>{downloadingReferenceData ? 'Downloading…' : 'Download offline data'}</Button><Button variant="contained" startIcon={<AddRounded />} disabled={!selectedWorker || !selectedProject} onClick={() => setDialog('attendance')}>Capture</Button><Button variant="outlined" onClick={() => setDialog('shift')}>New shift</Button><Button variant="outlined" disabled={!selectedWorker} onClick={() => setDialog('leave')}>Request leave</Button><Button variant="outlined" disabled={!['owner','admin','hr_manager'].includes(membership?.role ?? '')} onClick={() => setDialog('leavePolicy')}>Leave policy</Button><Button variant="outlined" disabled={!selectedWorker} onClick={() => setDialog('overtime')}>Request overtime</Button><Button variant="outlined" disabled={!selectedWorker} onClick={() => setDialog('timesheet')}>Generate timesheet</Button></>}
              {section === 'payroll' && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog('period')}>New period</Button>}
          {section === 'billing' && <><Button variant="contained" onClick={()=>setDialog('billingQuote')}>New quote</Button><Button variant="outlined" onClick={()=>setDialog('billingInvoice')}>New invoice</Button><Button variant="outlined" onClick={()=>setDialog('billingRecurring')}>Recurring schedule</Button><Button variant="outlined" onClick={()=>setDialog('billingSubscription')}>Request plan</Button></>}
            </Stack>
          </Stack>
          {referenceDataMessage && <Alert severity="success" sx={{ mb: 2 }}>{referenceDataMessage}</Alert>}
          {loading && <Box sx={{ mb: 2 }}><Typography variant="caption" color="text.secondary">Refreshing workspace data…</Typography></Box>}
          {section !== 'organization' && section !== 'people' && <TextField fullWidth size="small" placeholder={`Search ${pageTitle[section].toLowerCase()}…`} value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded sx={{ color: '#87948A' }} /></InputAdornment> }}
            sx={{ mb: 2, maxWidth: 520, '& .MuiOutlinedInput-root': { bgcolor: '#FFFFFF', borderRadius: 2 } }} />}
          {section === 'pay-grades' ? <Paper variant="outlined" sx={{ borderColor: '#E6EBE5', borderRadius: 3, overflow: 'hidden', bgcolor: '#FFFFFF' }}>
            <TableContainer><Table size="medium"><TableHead><TableRow>{['Code','Pay grade','Pay basis','Minimum','Midpoint','Maximum','Currency','Status','Actions'].map(x => <TableCell key={x} sx={{ bgcolor: '#F8FAF8', color: '#66756A', fontWeight: 800, fontSize: '.72rem' }}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
              {(data.payGrades ?? []).filter(row => !searchQuery || JSON.stringify(row).toLowerCase().includes(searchQuery.toLowerCase())).map(row => <TableRow key={String(row.id)} hover><TableCell>{label(row.code)}</TableCell><TableCell><Typography fontWeight={750}>{label(row.name)}</Typography><Typography variant="caption" color="text.secondary">{label(row.description)}</Typography></TableCell><TableCell>{label(row.payBasis)}</TableCell><TableCell>{label(row.minimumRate)}</TableCell><TableCell>{label(row.midpointRate)}</TableCell><TableCell>{label(row.maximumRate)}</TableCell><TableCell>{label(row.currency)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'active' ? 'success' : 'default'} /></TableCell><TableCell><Button size="small" disabled={busy} onClick={async () => { setBusy(true); try { await request(`tenant/pay-grades/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: row.status === 'active' ? 'inactive' : 'active' }) }); setNotice(`Pay grade ${row.status === 'active' ? 'deactivated' : 'reactivated'}.`); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pay grade status could not be updated.'); } finally { setBusy(false); } }}>{row.status === 'active' ? 'Deactivate' : 'Reactivate'}</Button></TableCell></TableRow>)}
              {!(data.payGrades ?? []).length && <TableRow><TableCell colSpan={9} sx={{ py: 5, textAlign: 'center' }}>No pay grades yet. Create a pay grade to define a reusable rate band.</TableCell></TableRow>}
            </TableBody></Table></TableContainer>
          </Paper> : section === 'organization' || section === 'people' ? <TenantAdministration section={section} role={membership?.role ?? 'viewer'} data={data} request={request} refresh={refresh} /> :
            <Paper variant="outlined" sx={{ borderColor: '#E6EBE5', borderRadius: 3, overflow: 'hidden', bgcolor: '#FFFFFF' }}>
              
              
              {section === 'reports' ? <Box sx={{p:{xs:1.5,md:2.5}}}>
                <Typography fontWeight={850} sx={{mb:2}}>Operational overview</Typography>
                <Grid container spacing={2}>
                  {[
                    ['Active workers',data.reportDashboard?.workforce?.active??0],
                    ['Attendance this month',data.reportDashboard?.attendanceThisMonth?.total??0],
                    ['Pending attendance',data.reportDashboard?.attendanceThisMonth?.pending??0],
                    ['Leave awaiting review',data.reportDashboard?.pendingLeave??0],
                    ['Overtime awaiting review',data.reportDashboard?.pendingOvertime??0],
                    ['Open payroll runs',data.reportDashboard?.openPayrollRuns??0],
                    ['Outstanding invoices (minor units)',data.reportDashboard?.outstandingInvoices?.balance_minor??0],
                    ['Offline conflicts',data.reportDashboard?.openOfflineConflicts??0],
                  ].map(([title,value])=><Grid size={{xs:12,sm:6,md:3}} key={String(title)}><Card variant="outlined"><CardContent><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h5" fontWeight={850}>{String(value)}</Typography></CardContent></Card></Grid>)}
                  <Grid size={{xs:12}}><Card variant="outlined"><CardContent><Typography fontWeight={850} sx={{mb:1}}>Download reports</Typography><Stack direction={{xs:'column',md:'row'}} spacing={1} alignItems={{md:'center'}}><TextField size="small" label="From" type="date" InputLabelProps={{shrink:true}} value={forms.reportFrom} onChange={e=>setField('reportFrom',e.target.value)} /><TextField size="small" label="To" type="date" InputLabelProps={{shrink:true}} value={forms.reportTo} onChange={e=>setField('reportTo',e.target.value)} /><Button variant="outlined" disabled={busy} onClick={()=>void downloadReport(`tenant/reports/attendance.csv?from=${forms.reportFrom}&to=${forms.reportTo}`,`attendance-${forms.reportFrom}-${forms.reportTo}.csv`)}>Attendance CSV</Button><Button variant="outlined" disabled={busy} onClick={()=>void downloadReport(`tenant/reports/audit.csv?from=${forms.reportFrom}&to=${forms.reportTo}`,`audit-${forms.reportFrom}-${forms.reportTo}.csv`)}>Audit CSV</Button></Stack><Divider sx={{my:2}}/><Stack direction={{xs:'column',md:'row'}} spacing={1}><TextField select size="small" label="Payroll period" value={forms.reportPeriodId} onChange={e=>setField('reportPeriodId',e.target.value)} sx={{minWidth:260}}>{(data.periods??[]).map(p=><MenuItem key={String(p.id)} value={String(p.id)}>{label(p.name)} · {label(p.startDate)}–{label(p.endDate)}</MenuItem>)}</TextField><Button variant="contained" disabled={busy||!forms.reportPeriodId} onClick={()=>void downloadReport(`tenant/reports/payroll/${forms.reportPeriodId}.csv`,`payroll-${forms.reportPeriodId}.csv`)}>Payroll CSV</Button></Stack></CardContent></Card></Grid>
                </Grid>
              </Box> : section === 'billing' ? <Box sx={{p:{xs:1.5,md:2.5}}}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{mb:2}}><Typography fontWeight={850}>Review note</Typography><TextField size="small" value={forms.billingReviewReason} onChange={e=>setField('billingReviewReason',e.target.value)} placeholder="Reason for reconciliation" sx={{flex:1}} /></Stack>
                <Grid container spacing={2}>
                  <Grid size={{xs:12,md:6}}><Card variant="outlined"><CardContent><Typography fontWeight={850}>Available plans</Typography><Table size="small"><TableHead><TableRow><TableCell>Plan</TableCell><TableCell>Price</TableCell><TableCell>Interval</TableCell></TableRow></TableHead><TableBody>{(data.billingPlans??[]).map(p=><TableRow key={String(p.id)}><TableCell>{label(p.name)}</TableCell><TableCell>{p.priceMinor==null?'Unpriced':String(p.currency)+' '+String(p.priceMinor)}</TableCell><TableCell>{label(p.billingInterval)}</TableCell></TableRow>)}{!data.billingPlans?.length&&<TableRow><TableCell colSpan={3}>No active plans are configured.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
                  <Grid size={{xs:12,md:6}}><Card variant="outlined"><CardContent><Typography fontWeight={850}>Workspace subscription</Typography><Table size="small"><TableHead><TableRow><TableCell>Plan</TableCell><TableCell>Status</TableCell><TableCell>Price</TableCell></TableRow></TableHead><TableBody>{(data.subscriptions??[]).map(s=><TableRow key={String(s.id)}><TableCell>{label(s.planName)}</TableCell><TableCell><Chip size="small" label={label(s.status)} /></TableCell><TableCell>{label(s.currency)} {label(s.unitPriceMinor)}</TableCell></TableRow>)}{!data.subscriptions?.length&&<TableRow><TableCell colSpan={3}>No subscription request yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
                  <Grid size={{xs:12}}><Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={850}>Quotations</Typography><Typography variant="caption" color="text.secondary">{(data.quotes??[]).length} total</Typography></Stack><Table size="small"><TableHead><TableRow><TableCell>Quote</TableCell><TableCell>Customer</TableCell><TableCell>Total</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell></TableRow></TableHead><TableBody>{(data.quotes??[]).map(q=><TableRow key={String(q.id)}><TableCell>{label(q.quoteNumber)}</TableCell><TableCell>{label(q.customerName)}</TableCell><TableCell>{label(q.currency)} {label(q.totalMinor)}</TableCell><TableCell>{label(q.status)}</TableCell><TableCell><Stack direction="row" flexWrap="wrap">{q.status==='draft'&&<Button size="small" onClick={async()=>{await request(`tenant/billing/quotes/${q.id}/issue`,{method:'POST',body:'{}'});await refresh();}}>Issue</Button>}{q.status==='issued'&&<><Button size="small" onClick={async()=>{await request(`tenant/billing/quotes/${q.id}/accept`,{method:'POST',body:'{}'});await refresh();}}>Accept</Button><Button size="small" color="error" onClick={async()=>{await request(`tenant/billing/quotes/${q.id}/reject`,{method:'POST',body:'{}'});await refresh();}}>Reject</Button></>}{q.status==='accepted'&&<Button size="small" onClick={async()=>{await request(`tenant/billing/quotes/${q.id}/convert`,{method:'POST',body:JSON.stringify({dueDate:forms.billingDueDate})});setNotice('Accepted quote converted to an invoice.');await refresh();}}>Convert to invoice</Button>}</Stack></TableCell></TableRow>)}{!data.quotes?.length&&<TableRow><TableCell colSpan={5}>No quotations created.</TableCell></TableRow>}</TableBody></Table><TextField size="small" type="date" label="Invoice due date for quote conversion" InputLabelProps={{shrink:true}} value={forms.billingDueDate} onChange={e=>setField('billingDueDate',e.target.value)} sx={{mt:1}} /></CardContent></Card></Grid>
                  <Grid size={{xs:12}}><Card variant="outlined"><CardContent><Typography fontWeight={850}>Invoices</Typography><Table size="small"><TableHead><TableRow><TableCell>Invoice</TableCell><TableCell>Customer</TableCell><TableCell>Issued / due</TableCell><TableCell>Total</TableCell><TableCell>Paid</TableCell><TableCell>Status</TableCell><TableCell>Action</TableCell></TableRow></TableHead><TableBody>{(data.invoices??[]).map(inv=><TableRow key={String(inv.id)}><TableCell>{label(inv.invoiceNumber)}</TableCell><TableCell>{label(inv.customerName)}</TableCell><TableCell>{label(inv.issueDate)} / {label(inv.dueDate)}</TableCell><TableCell>{label(inv.currency)} {label(inv.totalMinor)}</TableCell><TableCell>{label(inv.amountPaidMinor)}</TableCell><TableCell>{label(inv.status)}</TableCell><TableCell>{['issued','partially_paid','overdue'].includes(String(inv.status))?<Button size="small" onClick={()=>{setField('billingInvoiceId',String(inv.id));setDialog('billingPayment');}}>Record payment</Button>:'—'}</TableCell></TableRow>)}{!data.invoices?.length&&<TableRow><TableCell colSpan={7}>No invoices created.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
                  <Grid size={{xs:12,md:6}}><Card variant="outlined"><CardContent><Typography fontWeight={850}>Payment reconciliation</Typography><Table size="small"><TableHead><TableRow><TableCell>Reference</TableCell><TableCell>Amount</TableCell><TableCell>Status</TableCell><TableCell>Action</TableCell></TableRow></TableHead><TableBody>{(data.payments??[]).map(p=><TableRow key={String(p.id)}><TableCell>{label(p.externalReference)}</TableCell><TableCell>{label(p.currency)} {label(p.amountMinor)}</TableCell><TableCell>{label(p.status)}</TableCell><TableCell>{p.status==='pending'?<Button size="small" onClick={async()=>{await request(`tenant/billing/payments/${p.id}/reconcile`,{method:'POST',body:JSON.stringify({action:'confirm',reason:forms.billingReviewReason||'Matched against bank or payment provider evidence'})});await refresh();}}>Confirm</Button>:p.status==='confirmed'?<Button size="small" color="error" onClick={async()=>{await request(`tenant/billing/payments/${p.id}/reconcile`,{method:'POST',body:JSON.stringify({action:'reverse',reason:forms.billingReviewReason||'Payment reversal verified against provider evidence'})});await refresh();}}>Reverse</Button>:'—'}</TableCell></TableRow>)}{!data.payments?.length&&<TableRow><TableCell colSpan={4}>No payment records.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
                  <Grid size={{xs:12,md:6}}><Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={850}>Recurring schedules</Typography><Button size="small" onClick={async()=>{const result=await request<{generatedCount:number}>('tenant/billing/recurring-schedules/generate-due',{method:'POST',body:'{}'});setNotice(`Generated ${result.generatedCount} recurring invoice(s).`);await refresh();}}>Generate due</Button></Stack><Table size="small"><TableHead><TableRow><TableCell>Schedule</TableCell><TableCell>Frequency</TableCell><TableCell>Next run</TableCell><TableCell>Status</TableCell></TableRow></TableHead><TableBody>{(data.recurringSchedules??[]).map(s=><TableRow key={String(s.id)}><TableCell>{label(s.name)}</TableCell><TableCell>{label(s.frequency)}</TableCell><TableCell>{label(s.nextRunDate)}</TableCell><TableCell>{label(s.status)}</TableCell></TableRow>)}{!data.recurringSchedules?.length&&<TableRow><TableCell colSpan={4}>No recurring schedules.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
                </Grid>
              </Box> : section === 'payroll' ? <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
                <TableContainer><Table size="small"><TableHead><TableRow>{['Code','Period','Start','End','Status','Actions'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
                  {(data.periods ?? []).filter(row => !searchQuery || JSON.stringify(row).toLowerCase().includes(searchQuery.toLowerCase())).map(row => <TableRow key={String(row.id)} hover><TableCell>{label(row.code)}</TableCell><TableCell>{label(row.name)}</TableCell><TableCell>{label(row.startDate)}</TableCell><TableCell>{label(row.endDate)}</TableCell><TableCell><Chip size="small" label={label(row.status)} /></TableCell><TableCell><Button size="small" onClick={() => void createRun(String(row.id))} disabled={busy}>Create run</Button></TableCell></TableRow>)}
                  {!data.periods?.length && <TableRow><TableCell colSpan={6} sx={{ py: 4, textAlign: 'center' }}>No payroll periods yet. Create one to prepare a calculation preview.</TableCell></TableRow>}
                </TableBody></Table></TableContainer>
                {selectedRun && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}><Typography variant="body2">Selected run: {selectedRun}</Typography><Button variant="outlined" size="small" onClick={() => void calculateRun()} disabled={busy}>Calculate preview</Button></Stack>}
                {(data.run ?? []).map(run => <Alert key={String(run.id)} severity="warning" sx={{ mt: 2 }}>Run status: {label(run.status)} · Totals and warnings: {JSON.stringify(run.totals ?? {})} {JSON.stringify(run.warnings ?? [])}</Alert>)}
              </Box> : <TableContainer sx={{ overflowX: 'auto' }}><Table size="medium"><TableHead><TableRow>
                {(section === 'workers' ? ['Worker no.','Name','Phone','Email','Status','Select'] :
                  section === 'projects' ? ['Code','Project','Client','Status','Select'] :
                  ['Date','Worker ID','Project ID','Minutes','Status','Actions']).map(x => <TableCell key={x} sx={{ bgcolor: '#F8FAF8', color: '#66756A', fontWeight: 800, fontSize: '.72rem', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{x}</TableCell>)}
              </TableRow></TableHead><TableBody>
                {filteredRows.map(row => <TableRow key={String(row.id ?? JSON.stringify(row))} hover>
                  {section === 'workers' && <><TableCell>{label(row.workerNumber)}</TableCell><TableCell><Typography fontWeight={750}>{label(row.firstName)} {label(row.lastName)}</Typography></TableCell><TableCell>{label(row.phone)}</TableCell><TableCell>{label(row.email)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'active' ? 'success' : 'default'} /></TableCell><TableCell><Button size="small" variant={selectedWorker === row.id ? 'contained' : 'text'} onClick={() => setSelectedWorker(String(row.id))}>{selectedWorker === row.id ? 'Selected' : 'View'}</Button></TableCell></>}
                  {section === 'projects' && <><TableCell>{label(row.projectCode)}</TableCell><TableCell><Typography fontWeight={750}>{label(row.name)}</Typography></TableCell><TableCell>{label(row.clientName)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'active' ? 'success' : 'default'} /></TableCell><TableCell><Button size="small" variant={selectedProject === row.id ? 'contained' : 'text'} onClick={() => setSelectedProject(String(row.id))}>{selectedProject === row.id ? 'Selected' : 'View sites'}</Button></TableCell></>}
                  {section === 'attendance' && <><TableCell>{label(row.workDate)}</TableCell><TableCell>{label(row.workerId)}</TableCell><TableCell>{label(row.projectId)}</TableCell><TableCell>{label(row.minutesWorked)}</TableCell><TableCell><Chip size="small" label={label(row.status)} color={row.status === 'approved' ? 'success' : row.status === 'submitted' ? 'warning' : 'default'} /></TableCell><TableCell>{row.status === 'draft' ? <Button size="small" disabled={busy} onClick={() => void attendanceAction(String(row.id), 'submit')}>Submit</Button> : row.status === 'submitted' ? <Button size="small" disabled={busy} onClick={() => void attendanceAction(String(row.id), 'approve')}>Approve</Button> : row.status === 'approved' ? <Button size="small" onClick={() => { setSelectedAttendance(String(row.id)); setDialog('correction'); }}>Correct</Button> : '—'}</TableCell></>}
                </TableRow>)}
                {!filteredRows.length && <TableRow><TableCell colSpan={6} sx={{ py: 5, textAlign: 'center' }}>
                  <Typography fontWeight={800}>{searchQuery ? 'No matching records' : 'Nothing here yet'}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{searchQuery ? 'Try another search term.' : 'When you add records, they will appear here.'}</Typography>
                </TableCell></TableRow>}
              </TableBody></Table></TableContainer>}
              {section === 'workers' && selectedWorker && <Box sx={{ p: 2.5, borderTop: '1px solid #E8EEE8' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography fontWeight={850}>Worker lifecycle & contract history</Typography><Button size="small" variant="contained" disabled={busy} onClick={() => setDialog('contract')}>Add contract</Button>
                  <Button size="small" disabled={busy} onClick={() => void updateWorkerStatus(selectedWorker, data.workers?.find(worker => worker.id === selectedWorker)?.status === 'active' ? 'inactive' : 'active')}>
                    {data.workers?.find(worker => worker.id === selectedWorker)?.status === 'active' ? 'Deactivate worker' : 'Activate worker'}
                  </Button>
                </Stack>
                <TableContainer><Table size="small"><TableHead><TableRow>{['Engagement','Pay basis','Rate','From','To','Actions'].map(item => <TableCell key={item}>{item}</TableCell>)}</TableRow></TableHead><TableBody>
                  {contracts.map(contract => <TableRow key={String(contract.id)}><TableCell>{label(contract.engagementType)}</TableCell><TableCell>{label(contract.payBasis)}</TableCell><TableCell>{label(contract.rateAmount)} {label(contract.currency)}</TableCell><TableCell>{label(contract.effectiveFrom)}</TableCell><TableCell>{label(contract.effectiveTo)}</TableCell><TableCell>{!contract.effectiveTo && <Button size="small" onClick={() => { setSelectedContract(String(contract.id)); setField('contractEndDate', dateToday()); setDialog('endContract'); }}>End contract</Button>}</TableCell></TableRow>)}
                  {!contracts.length && <TableRow><TableCell colSpan={6}>No contract history is recorded for this worker.</TableCell></TableRow>}
                </TableBody></Table></TableContainer>
              </Box>}
              {section === 'workers' && selectedWorker && <Box sx={{ p: 2.5, borderTop: '1px solid #E8EEE8' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
                  <Box><Typography fontWeight={850}>Worker documents</Typography><Typography variant="caption" color="text.secondary">Private tenant-scoped files. Download links expire after three minutes.</Typography></Box>
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

                <Divider sx={{my:2}} />
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}><Box><Typography fontWeight={850}>Allowances, deductions & benefits</Typography><Typography variant="caption" color="text.secondary">Effective-dated payroll components used by the calculation engine.</Typography></Box><Button size="small" variant="contained" onClick={()=>setDialog('payComponent')}>Add component</Button></Stack>
                <TableContainer><Table size="small"><TableHead><TableRow>{['Code','Component','Type','Method','Amount','Taxable','Effective from','Status',''].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{workerPayComponents.map(x=><TableRow key={String(x.id)}><TableCell>{label(x.code)}</TableCell><TableCell>{label(x.name)}</TableCell><TableCell>{label(x.componentType)}</TableCell><TableCell>{label(x.calculationMethod)}</TableCell><TableCell>{label(x.amount)}</TableCell><TableCell>{x.taxable?'Yes':'No'}</TableCell><TableCell>{label(x.effectiveFrom)}</TableCell><TableCell>{label(x.status)}</TableCell><TableCell>{x.status==='active'?<Button size="small" onClick={async()=>{await request(`payroll/components/${x.id}/status`,{method:'PATCH',body:JSON.stringify({status:'inactive'})});setWorkerPayComponents(asRows(await request<unknown>(`payroll/workers/${selectedWorker}/components`)));}}>Deactivate</Button>:'—'}</TableCell></TableRow>)}{!workerPayComponents.length&&<TableRow><TableCell colSpan={9}>No payroll components configured.</TableCell></TableRow>}</TableBody></Table></TableContainer>
              </Box>}
              {section === 'projects' && <Box sx={{ p: 2.5, borderTop: '1px solid #E8EEE8' }}>
                <Typography fontWeight={850} sx={{ mb: 1 }}>Project sites</Typography>
                <TableContainer><Table size="small"><TableHead><TableRow>{['Site code','Site','Project','Status'].map(item => <TableCell key={item}>{item}</TableCell>)}</TableRow></TableHead><TableBody>
                  {(data.sites ?? []).filter(site => !selectedProject || site.projectId === selectedProject).map(site => <TableRow key={String(site.id)}><TableCell>{label(site.siteCode)}</TableCell><TableCell>{label(site.name)}</TableCell><TableCell>{label(site.projectId)}</TableCell><TableCell>{label(site.status)}</TableCell></TableRow>)}
                  {!(data.sites ?? []).length && <TableRow><TableCell colSpan={4}>No project sites have been created.</TableCell></TableRow>}
                </TableBody></Table></TableContainer>
              </Box>}
            </Paper>}
          {section === 'attendance' && <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}><TextField size="small" label="Review reason for leave / overtime" value={forms.reviewReason} onChange={e=>setField('reviewReason',e.target.value)} fullWidth helperText="A meaningful review note is recorded in the audit trail." /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent><Typography fontWeight={850} sx={{mb:1}}>Shift patterns</Typography><Table size="small"><TableHead><TableRow><TableCell>Code</TableCell><TableCell>Shift</TableCell><TableCell>Hours</TableCell></TableRow></TableHead><TableBody>{(data.shifts??[]).map(x=><TableRow key={String(x.id)}><TableCell>{label(x.code)}</TableCell><TableCell>{label(x.name)}</TableCell><TableCell>{label(x.startTime)}–{label(x.endTime)}</TableCell></TableRow>)}{!(data.shifts??[]).length&&<TableRow><TableCell colSpan={3}>No shifts configured.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent><Typography fontWeight={850} sx={{mb:1}}>Leave requests</Typography><Table size="small"><TableHead><TableRow><TableCell>Worker</TableCell><TableCell>Type / Dates</TableCell><TableCell>Status</TableCell><TableCell>Review</TableCell></TableRow></TableHead><TableBody>{(data.leaveRequests??[]).map(x=><TableRow key={String(x.id)}><TableCell>{label(x.workerNumber)}</TableCell><TableCell>{label(x.leaveType)} · {label(x.startDate)}–{label(x.endDate)}</TableCell><TableCell>{label(x.status)}</TableCell><TableCell>{x.status==='pending'?<Stack direction="row"><Button size="small" disabled={busy} onClick={()=>void reviewAttendanceRequest('leave-requests',String(x.id),'approve')}>Approve</Button><Button size="small" color="error" disabled={busy} onClick={()=>void reviewAttendanceRequest('leave-requests',String(x.id),'reject')}>Reject</Button></Stack>:'—'}</TableCell></TableRow>)}{!(data.leaveRequests??[]).length&&<TableRow><TableCell colSpan={4}>No leave requests.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent><Typography fontWeight={850} sx={{mb:1}}>Overtime requests</Typography><Table size="small"><TableHead><TableRow><TableCell>Worker</TableCell><TableCell>Date</TableCell><TableCell>Minutes</TableCell><TableCell>Status</TableCell><TableCell>Review</TableCell></TableRow></TableHead><TableBody>{(data.overtimeRequests??[]).map(x=><TableRow key={String(x.id)}><TableCell>{label(x.workerId)}</TableCell><TableCell>{label(x.workDate)}</TableCell><TableCell>{label(x.minutesRequested)}</TableCell><TableCell>{label(x.status)}</TableCell><TableCell>{x.status==='pending'?<Stack direction="row"><Button size="small" disabled={busy} onClick={()=>void reviewAttendanceRequest('overtime-requests',String(x.id),'approve')}>Approve</Button><Button size="small" color="error" disabled={busy} onClick={()=>void reviewAttendanceRequest('overtime-requests',String(x.id),'reject')}>Reject</Button></Stack>:'—'}</TableCell></TableRow>)}{!(data.overtimeRequests??[]).length&&<TableRow><TableCell colSpan={5}>No overtime requests.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Card variant="outlined"><CardContent><Typography fontWeight={850} sx={{mb:1}}>Timesheets</Typography><Table size="small"><TableHead><TableRow><TableCell>Worker</TableCell><TableCell>Period</TableCell><TableCell>Minutes</TableCell><TableCell>Status</TableCell><TableCell>Action</TableCell></TableRow></TableHead><TableBody>{(data.timesheets??[]).map(x=><TableRow key={String(x.id)}><TableCell>{label(x.workerNumber)}</TableCell><TableCell>{label(x.periodStart)}–{label(x.periodEnd)}</TableCell><TableCell>{label(x.totalMinutes)}</TableCell><TableCell>{label(x.status)}</TableCell><TableCell>{x.status==='draft'?<Button size="small" onClick={()=>void timesheetAction(String(x.id),'submit')}>Submit</Button>:x.status==='submitted'?<Button size="small" onClick={()=>void timesheetAction(String(x.id),'approve')}>Approve</Button>:'—'}</TableCell></TableRow>)}{!(data.timesheets??[]).length&&<TableRow><TableCell colSpan={5}>No timesheets generated.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>

            <Grid size={{ xs: 12 }}><Card variant="outlined"><CardContent><Typography fontWeight={850} sx={{mb:1}}>Offline sync conflicts</Typography><Typography variant="caption" color="text.secondary">Conflicts are never silently overwritten. Discarding keeps the server-side version and closes the local command.</Typography><Table size="small"><TableHead><TableRow><TableCell>Conflict</TableCell><TableCell>Type</TableCell><TableCell>Created</TableCell><TableCell>Action</TableCell></TableRow></TableHead><TableBody>{(data.conflicts??[]).map(x=><TableRow key={String(x.id)}><TableCell>{label(x.commandId)}</TableCell><TableCell>{label(x.conflictType)}</TableCell><TableCell>{label(x.createdAt)}</TableCell><TableCell><Button size="small" color="error" disabled={busy} onClick={()=>void discardOfflineConflict(String(x.id))}>Discard local copy</Button></TableCell></TableRow>)}{!(data.conflicts??[]).length&&<TableRow><TableCell colSpan={4}>No open offline conflicts.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></Grid>
          </Grid>}

        </>}
      </Box>
    </Box>

    <Dialog open={Boolean(dialog)} onClose={() => setDialog('')} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{dialog === 'worker' ? 'Add worker' : dialog === 'contract' ? 'Add worker contract' : dialog === 'endContract' ? 'End worker contract' : dialog === 'payGrade' ? 'Create pay grade' : dialog === 'project' ? 'Create project' : dialog === 'site' ? 'Create site' : dialog === 'attendance' ? 'Capture attendance' : dialog === 'shift' ? 'Create shift' : dialog === 'leave' ? 'Request leave' : dialog === 'leavePolicy' ? 'Configure leave entitlement' : dialog === 'payComponent' ? 'Add payroll component' : dialog === 'billingQuote' ? 'Create quotation' : dialog === 'billingInvoice' ? 'Issue invoice' : dialog === 'billingRecurring' ? 'Create recurring schedule' : dialog === 'billingSubscription' ? 'Request subscription' : dialog === 'billingPayment' ? 'Record payment' : dialog === 'overtime' ? 'Request overtime' : dialog === 'timesheet' ? 'Generate timesheet' : dialog === 'correction' ? 'Request attendance correction' : 'Create payroll period'}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>

          {dialog === 'shift' && <><TextField label="Shift code" required value={forms.shiftCode} onChange={e=>setField('shiftCode',e.target.value)} /><TextField label="Shift name" required value={forms.shiftName} onChange={e=>setField('shiftName',e.target.value)} /><TextField label="Start time" type="time" required InputLabelProps={{shrink:true}} value={forms.shiftStart} onChange={e=>setField('shiftStart',e.target.value)} /><TextField label="End time" type="time" required InputLabelProps={{shrink:true}} value={forms.shiftEnd} onChange={e=>setField('shiftEnd',e.target.value)} /><TextField label="Break (minutes)" type="number" value={forms.shiftBreak} onChange={e=>setField('shiftBreak',e.target.value)} /><TextField label="Grace (minutes)" type="number" value={forms.shiftGrace} onChange={e=>setField('shiftGrace',e.target.value)} /><Alert severity="info">If a worker is selected, the shift is assigned to that worker from today.</Alert></>}
          {(dialog === 'leave' || dialog === 'leavePolicy') && <><TextField select label="Leave type" value={forms.leaveType} onChange={e=>setField('leaveType',e.target.value)}>{['annual','sick','maternity','paternity','compassionate','unpaid','other'].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>{dialog === 'leavePolicy' ? <><TextField label="Annual entitlement (days)" type="number" value={forms.leaveEntitlement} onChange={e=>setField('leaveEntitlement',e.target.value)} /><TextField label="Effective year" type="number" value={forms.leaveYear} onChange={e=>setField('leaveYear',e.target.value)} /></> : <><TextField label="Start date" type="date" InputLabelProps={{shrink:true}} value={forms.leaveStart} onChange={e=>setField('leaveStart',e.target.value)} /><TextField label="End date" type="date" InputLabelProps={{shrink:true}} value={forms.leaveEnd} onChange={e=>setField('leaveEnd',e.target.value)} /><TextField label="Days requested" type="number" value={forms.leaveDays} onChange={e=>setField('leaveDays',e.target.value)} /><TextField label="Reason" required multiline minRows={2} value={forms.leaveReason} onChange={e=>setField('leaveReason',e.target.value)} /></>}</>}
          {dialog === 'overtime' && <><TextField select label="Approved attendance record" required value={forms.overtimeAttendanceId} onChange={e=>setField('overtimeAttendanceId',e.target.value)}>{(data.attendance??[]).filter(a=>a.workerId===selectedWorker&&a.status==='approved').map(a=><MenuItem key={String(a.id)} value={String(a.id)}>{label(a.workDate)} · {label(a.minutesWorked)} min</MenuItem>)}</TextField><TextField label="Overtime minutes" type="number" value={forms.overtimeMinutes} onChange={e=>setField('overtimeMinutes',e.target.value)} /><TextField label="Reason" required multiline minRows={2} value={forms.overtimeReason} onChange={e=>setField('overtimeReason',e.target.value)} /></>}
          {dialog === 'timesheet' && <><TextField label="Period start" type="date" InputLabelProps={{shrink:true}} value={forms.timesheetStart} onChange={e=>setField('timesheetStart',e.target.value)} /><TextField label="Period end" type="date" InputLabelProps={{shrink:true}} value={forms.timesheetEnd} onChange={e=>setField('timesheetEnd',e.target.value)} /><Alert severity="info">Only approved attendance is included.</Alert></>}
          {dialog === 'correction' && <><Alert severity="warning">Corrections are requests, not direct edits. Another authorized reviewer must approve the change.</Alert><TextField label="Corrected clock-in" type="datetime-local" InputLabelProps={{shrink:true}} value={forms.correctionClockIn} onChange={e=>setField('correctionClockIn',e.target.value)} /><TextField label="Corrected clock-out" type="datetime-local" InputLabelProps={{shrink:true}} value={forms.correctionClockOut} onChange={e=>setField('correctionClockOut',e.target.value)} /><TextField label="Corrected minutes" type="number" value={forms.correctionMinutes} onChange={e=>setField('correctionMinutes',e.target.value)} /><TextField label="Reason" required multiline minRows={2} value={forms.correctionReason} onChange={e=>setField('correctionReason',e.target.value)} /></>}

          {(dialog === 'billingQuote' || dialog === 'billingInvoice' || dialog === 'billingRecurring') && <><TextField label="Customer name" required value={forms.billingCustomer} onChange={e=>setField('billingCustomer',e.target.value)} /><TextField label="Customer email" type="email" value={forms.billingEmail} onChange={e=>setField('billingEmail',e.target.value)} /><TextField label="Currency" value={forms.billingCurrency} onChange={e=>setField('billingCurrency',e.target.value.toUpperCase())} /><TextField label="Line description" required value={forms.billingDescription} onChange={e=>setField('billingDescription',e.target.value)} /><TextField label="Quantity" type="number" value={forms.billingQuantity} onChange={e=>setField('billingQuantity',e.target.value)} /><TextField label="Unit price (minor units)" type="number" value={forms.billingUnitPrice} onChange={e=>setField('billingUnitPrice',e.target.value)} /><TextField label="Tax rate (0–1)" type="number" value={forms.billingTaxRate} onChange={e=>setField('billingTaxRate',e.target.value)} />{dialog==='billingQuote'&&<TextField label="Valid until" type="date" InputLabelProps={{shrink:true}} value={forms.billingValidUntil} onChange={e=>setField('billingValidUntil',e.target.value)} />}{dialog==='billingInvoice'&&<TextField label="Due date" type="date" InputLabelProps={{shrink:true}} value={forms.billingDueDate} onChange={e=>setField('billingDueDate',e.target.value)} />}{dialog==='billingRecurring'&&<><TextField label="Frequency" select value={forms.billingFrequency} onChange={e=>setField('billingFrequency',e.target.value)}><MenuItem value="monthly">Monthly</MenuItem><MenuItem value="yearly">Yearly</MenuItem></TextField><TextField label="Next run date" type="date" InputLabelProps={{shrink:true}} value={forms.billingNextRun} onChange={e=>setField('billingNextRun',e.target.value)} /><TextField label="Payment terms (days)" type="number" value={forms.billingDueDays} onChange={e=>setField('billingDueDays',e.target.value)} /></>}</>}
          {dialog==='billingSubscription'&&<TextField select label="Plan" required value={forms.billingPlanId} onChange={e=>setField('billingPlanId',e.target.value)}>{(data.billingPlans??[]).map(p=><MenuItem key={String(p.id)} value={String(p.id)}>{label(p.name)} · {p.priceMinor==null?'Price to be configured':String(p.currency)+' '+String(p.priceMinor)}</MenuItem>)}</TextField>}
          {dialog==='billingPayment'&&<><TextField select label="Invoice" required value={forms.billingInvoiceId} onChange={e=>setField('billingInvoiceId',e.target.value)}>{(data.invoices??[]).filter(x=>['issued','partially_paid','overdue'].includes(String(x.status))).map(x=><MenuItem key={String(x.id)} value={String(x.id)}>{label(x.invoiceNumber)} · {label(x.customerName)} · {label(x.totalMinor)}</MenuItem>)}</TextField><TextField label="Amount (minor units)" type="number" value={forms.billingPaymentAmount} onChange={e=>setField('billingPaymentAmount',e.target.value)} /><TextField label="Method" select value={forms.billingPaymentMethod} onChange={e=>setField('billingPaymentMethod',e.target.value)}>{['bank_transfer','mpesa','card','cash','other'].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField label="External reference" required value={forms.billingPaymentReference} onChange={e=>setField('billingPaymentReference',e.target.value)} /></>}
          {dialog === 'payComponent' && <><Alert severity="info">Components are period amounts. Taxable allowances enter the statutory calculation base; other component lines are shown separately in payroll snapshots.</Alert><TextField label="Component code" required value={forms.componentCode} onChange={e=>setField('componentCode',e.target.value.toUpperCase())} /><TextField label="Component name" required value={forms.componentName} onChange={e=>setField('componentName',e.target.value)} /><TextField select label="Component type" value={forms.componentType} onChange={e=>setField('componentType',e.target.value)}>{['allowance','deduction','benefit'].map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Calculation method" value={forms.componentMethod} onChange={e=>setField('componentMethod',e.target.value)}>{['fixed','percentage_of_base'].map(x=><MenuItem key={x} value={x}>{x==='fixed'?'Fixed amount':'Percentage of base earnings'}</MenuItem>)}</TextField><TextField label={forms.componentMethod==='fixed'?'Amount per payroll period':'Percentage'} type="number" required value={forms.componentAmount} onChange={e=>setField('componentAmount',e.target.value)} /><TextField select label="Taxable allowance" disabled={forms.componentType!=='allowance'} value={forms.componentTaxable} onChange={e=>setField('componentTaxable',e.target.value)}><MenuItem value="false">No</MenuItem><MenuItem value="true">Yes</MenuItem></TextField><TextField label="Effective from" type="date" InputLabelProps={{shrink:true}} value={forms.componentFrom} onChange={e=>setField('componentFrom',e.target.value)} /></>}
          {dialog === 'endContract' && <><Alert severity="warning">Ending a contract is effective-dated and cannot be extended. Create a new contract version if the worker is rehired.</Alert><TextField label="Effective to" type="date" required InputLabelProps={{ shrink: true }} value={forms.contractEndDate} onChange={e => setField('contractEndDate', e.target.value)} /></>}
          {dialog === 'worker' && <><TextField label="Worker number" required value={forms.workerNumber} onChange={e => setField('workerNumber', e.target.value)} /><TextField label="First name" required value={forms.firstName} onChange={e => setField('firstName', e.target.value)} /><TextField label="Last name" required value={forms.lastName} onChange={e => setField('lastName', e.target.value)} /><TextField label="Phone" value={forms.phone} onChange={e => setField('phone', e.target.value)} /><TextField label="Email" type="email" value={forms.email} onChange={e => setField('email', e.target.value)} /></>}
          {dialog === 'payGrade' && <><TextField label="Code" required value={forms.gradeCode} onChange={e => setField('gradeCode', e.target.value.toUpperCase())} /><TextField label="Name" required value={forms.gradeName} onChange={e => setField('gradeName', e.target.value)} /><TextField label="Description" multiline minRows={2} value={forms.gradeDescription} onChange={e => setField('gradeDescription', e.target.value)} /><TextField select label="Pay basis" value={forms.gradePayBasis} onChange={e => setField('gradePayBasis', e.target.value)}>{['hourly','daily','weekly','monthly','per_unit'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField label="Currency" required inputProps={{ maxLength: 3 }} value={forms.gradeCurrency} onChange={e => setField('gradeCurrency', e.target.value.toUpperCase())} /><TextField label="Minimum rate" type="number" inputProps={{ min: 0, step: '0.0001' }} value={forms.gradeMinimum} onChange={e => setField('gradeMinimum', e.target.value)} /><TextField label="Midpoint rate" type="number" inputProps={{ min: 0, step: '0.0001' }} value={forms.gradeMidpoint} onChange={e => setField('gradeMidpoint', e.target.value)} /><TextField label="Maximum rate" type="number" inputProps={{ min: 0, step: '0.0001' }} value={forms.gradeMaximum} onChange={e => setField('gradeMaximum', e.target.value)} /></>}
           {dialog === 'contract' && <><TextField select label="Engagement" value={forms.engagementType} onChange={e => setField('engagementType', e.target.value)}>{['permanent','fixed_term','casual','piece_rate','subcontractor','independent_contractor'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Pay basis" value={forms.payBasis} onChange={e => setField('payBasis', e.target.value)}>{['hourly','daily','weekly','monthly','per_unit'].map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField><TextField select label="Pay grade (optional)" value={forms.payGradeId} onChange={e => { const grade = (data.payGrades ?? []).find(item => item.id === e.target.value); setField('payGradeId', e.target.value); if (grade) setField('payBasis', String(grade.payBasis)); }}><MenuItem value="">No pay grade</MenuItem>{(data.payGrades ?? []).filter(grade => grade.status === 'active').map(grade => <MenuItem key={String(grade.id)} value={String(grade.id)}>{label(grade.code)} — {label(grade.name)}</MenuItem>)}</TextField>{forms.payBasis === 'per_unit' && <TextField label="Approved unit codes (comma-separated)" required helperText="Example: blocks, metres, deliveries. These must match approved output entries." value={forms.unitCodes} onChange={e => setField('unitCodes', e.target.value)} />}<TextField label="Rate (KES)" type="number" required value={forms.rateAmount} onChange={e => setField('rateAmount', e.target.value)} /><TextField label="Effective from" type="date" required InputLabelProps={{ shrink: true }} value={forms.effectiveFrom} onChange={e => setField('effectiveFrom', e.target.value)} /></>}
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
