import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import BillingCatalogWorkspace from './BillingCatalogWorkspace';

type Request = <T,>(path: string, init?: RequestInit) => Promise<T>;
type BillingLine = { description: string; quantity: number; unitPrice: number; taxRate: number };
type BillingDoc = {
  id: string; documentType: 'quote'|'invoice'; documentNumber: string; customerName: string;
  customerEmail?: string; issueDate?: string; dueDate?: string; currency: string; items: BillingLine[];
  subtotal: number; taxAmount: number; total: number; status: string; notes?: string; recurringInterval?: string;
};
type Payment = { id: string; paymentReference: string; amount: number; currency: string; paymentDate: string; paymentMethod: string; notes?: string };

const money = (value: unknown, currency = 'KES') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value ?? 0));
const today = () => new Date().toISOString().slice(0,10);
const statusColor = (status: string): 'success'|'warning'|'error'|'default' => status === 'paid' || status === 'accepted' ? 'success' : status === 'sent' ? 'warning' : status === 'rejected' || status === 'void' ? 'error' : 'default';

export default function BillingWorkspace({ request }: { request: Request }) {
  const [documents, setDocuments] = useState<BillingDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all'|'quote'|'invoice'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentDoc, setPaymentDoc] = useState<BillingDoc|null>(null);
  const [paymentHistoryDoc, setPaymentHistoryDoc] = useState<BillingDoc|null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState({ documentType: 'invoice' as 'quote'|'invoice', documentNumber: '', customerName: '', customerEmail: '', issueDate: today(), dueDate: '', currency: 'KES', notes: '', description: '', quantity: '1', unitPrice: '0', taxRate: '0' });
  const [paymentForm, setPaymentForm] = useState({ paymentReference: '', amount: '', currency: 'KES', paymentDate: today(), paymentMethod: 'mpesa', notes: '' });
  const [busy, setBusy] = useState(false);
  const [conversionDoc, setConversionDoc] = useState<BillingDoc|null>(null);
  const [conversionForm, setConversionForm] = useState({invoiceNumber:'',dueDate:'',notes:''});
  const [report, setReport] = useState<unknown|null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const rows = await request<BillingDoc[]>('billing/documents');
      setDocuments(Array.isArray(rows) ? rows : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Billing data could not be loaded.'); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => documents.filter(d =>
    (typeFilter === 'all' || d.documentType === typeFilter) &&
    (statusFilter === 'all' || d.status === statusFilter)
  ), [documents, typeFilter, statusFilter]);
  const totals = useMemo(() => ({
    invoices: documents.filter(d => d.documentType === 'invoice').length,
    quotes: documents.filter(d => d.documentType === 'quote').length,
    unpaid: documents.filter(d => d.documentType === 'invoice' && !['paid','void'].includes(d.status)).reduce((sum,d)=>sum+Number(d.total||0),0),
    paid: documents.filter(d => d.documentType === 'invoice' && d.status === 'paid').reduce((sum,d)=>sum+Number(d.total||0),0),
  }), [documents]);

  const updateForm = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const createDocument = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request('billing/documents', { method: 'POST', body: JSON.stringify({
        documentType: form.documentType, documentNumber: form.documentNumber.trim(), customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim() || undefined, issueDate: form.issueDate || undefined, dueDate: form.dueDate || undefined,
        currency: form.currency, notes: form.notes || undefined,
        items: [{ description: form.description.trim(), quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), taxRate: Number(form.taxRate) }],
      })});
      setCreateOpen(false); setNotice('Billing document created.'); setForm(current => ({ ...current, documentNumber:'', customerName:'', customerEmail:'', description:'', quantity:'1', unitPrice:'0', taxRate:'0', notes:'' }));
      await refresh();
    } catch(e) { setError(e instanceof Error ? e.message : 'Document creation failed.'); }
    finally { setBusy(false); }
  };
  const changeStatus = async (doc: BillingDoc, status: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await request(`billing/documents/${doc.id}/status`, { method:'PATCH', body:JSON.stringify({ status }) }); setNotice(`${doc.documentNumber} updated to ${status}.`); await refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : 'Status update failed.'); }
    finally { setBusy(false); }
  };
  const openPayments = async (doc: BillingDoc) => {
    setPaymentHistoryDoc(doc); setPayments([]);
    try { const rows = await request<Payment[]>(`billing/documents/${doc.id}/payments`); setPayments(Array.isArray(rows) ? rows : []); }
    catch(e) { setError(e instanceof Error ? e.message : 'Payment history could not be loaded.'); }
  };
  const convertQuote = async () => {
    if (!conversionDoc) return;
    setBusy(true); setError('');
    try {
      await request('billing/documents/'+conversionDoc.id+'/convert',{method:'POST',body:JSON.stringify({invoiceNumber:conversionForm.invoiceNumber.trim(),dueDate:conversionForm.dueDate||undefined,notes:conversionForm.notes||undefined})});
      setConversionDoc(null); setConversionForm({invoiceNumber:'',dueDate:'',notes:''}); setNotice('Quotation converted to invoice.'); await refresh();
    } catch(e) { setError(e instanceof Error?e.message:'Quote conversion failed.'); }
    finally { setBusy(false); }
  };
  const processRecurring = async () => {
    setBusy(true); setError('');
    try { const result=await request<{processed:number;generated:number}>('billing/recurring/process',{method:'POST'}); setNotice('Recurring billing processed: '+result.generated+' invoice(s) generated from '+result.processed+' template(s).'); await refresh(); }
    catch(e) { setError(e instanceof Error?e.message:'Recurring invoice processing failed.'); }
    finally { setBusy(false); }
  };
  const loadReconciliation = async () => {
    setBusy(true); setError('');
    try { const data=await request<unknown>('billing/reports/reconciliation'); setReport(data); }
    catch(e) { setError(e instanceof Error?e.message:'Reconciliation report could not be loaded.'); }
    finally { setBusy(false); }
  };
  const printDocument = (doc:BillingDoc) => {
    const popup=window.open('','_blank','noopener,noreferrer');
    if(!popup){setError('Allow pop-ups to print billing documents.');return;}
    const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] as string));
    const lines=Array.isArray(doc.items)?doc.items:[];
    const rows=lines.map(item=>'<tr><td>'+esc(item.description)+'</td><td class="num">'+esc(item.quantity)+'</td><td class="num">'+esc(item.unitPrice)+'</td><td class="num">'+esc(item.lineTax??0)+'</td><td class="num">'+esc(item.lineTotal??Number(item.quantity)*Number(item.unitPrice))+'</td></tr>').join('');
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(doc.documentNumber)+'</title><style>body{font:14px system-ui;color:#17372b;margin:32px}header{display:flex;justify-content:space-between;border-bottom:2px solid #17372b;padding-bottom:12px}h1{margin:24px 0}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.num{text-align:right}.totals{width:320px;margin-left:auto}.totals td{border:0;padding:6px}.notes{white-space:pre-wrap;border-top:1px solid #ddd;padding-top:12px}@media print{button{display:none}}</style></head><body><header><div><strong style="font-size:24px">JengaFlow</strong><div>Qwerty Systems Workspace</div></div><div style="text-align:right">'+esc(doc.documentType.toUpperCase())+'<br><strong>'+esc(doc.documentNumber)+'</strong><br>'+esc(doc.status)+'</div></header><h1>'+esc(doc.documentType==='quote'?'Quotation':'Invoice')+'</h1><div><strong>Customer:</strong> '+esc(doc.customerName)+'<br>'+esc(doc.customerEmail)+'<br><strong>Issue date:</strong> '+esc(doc.issueDate)+'<br><strong>Due date:</strong> '+esc(doc.dueDate||'—')+'</div><table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Tax</th><th class="num">Total</th></tr></thead><tbody>'+rows+'</tbody></table><table class="totals"><tr><td>Subtotal</td><td class="num">'+esc(doc.currency)+' '+esc(doc.subtotal)+'</td></tr><tr><td>Tax</td><td class="num">'+esc(doc.currency)+' '+esc(doc.taxTotal)+'</td></tr><tr><td><strong>Total</strong></td><td class="num"><strong>'+esc(doc.currency)+' '+esc(doc.total)+'</strong></td></tr></table>'+ (doc.notes?'<div class="notes"><strong>Notes</strong><br>'+esc(doc.notes)+'</div>':'')+'<button onclick="window.print()">Print / Save as PDF</button></body></html>');
    popup.document.close();
  };
  const recordPayment = async () => {
    if (!paymentDoc) return;
    setBusy(true); setError('');
    try { await request(`billing/documents/${paymentDoc.id}/payments`, { method:'POST', body:JSON.stringify({
      paymentReference: paymentForm.paymentReference.trim(), amount:Number(paymentForm.amount), currency:paymentForm.currency,
      paymentDate:paymentForm.paymentDate, paymentMethod:paymentForm.paymentMethod, notes:paymentForm.notes || undefined,
    })});
      setPaymentDoc(null); setPaymentForm({ paymentReference:'', amount:'', currency:'KES', paymentDate:today(), paymentMethod:'mpesa', notes:'' });
      setNotice('Payment recorded.'); await refresh();
    } catch(e) { setError(e instanceof Error ? e.message : 'Payment could not be recorded.'); }
    finally { setBusy(false); }
  };

  return <Stack spacing={2.5}>
    <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{xs:'stretch',sm:'center'}} gap={1}>
      <Box><Typography variant="h5" fontWeight={850}>Billing</Typography><Typography color="text.secondary">Quotes, invoices and payment records for this company.</Typography></Box>
      <Stack direction="row" gap={1}><Button variant="outlined" startIcon={<RefreshRounded />} onClick={()=>void refresh()} disabled={loading}>Refresh</Button><Button variant="outlined" onClick={()=>void processRecurring()} disabled={busy}>Run recurring</Button><Button variant="outlined" onClick={()=>void loadReconciliation()} disabled={busy}>Reconciliation</Button><Button variant="contained" startIcon={<AddRounded />} onClick={()=>setCreateOpen(true)}>New document</Button></Stack>
    </Stack>
    {error && <Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    <BillingCatalogWorkspace request={request} />
    <Grid container spacing={1.5}>
      {[['Invoices',totals.invoices],['Quotations',totals.quotes],['Outstanding',money(totals.unpaid)],['Paid invoices',money(totals.paid)]].map(([label,value])=><Grid size={{xs:12,sm:6,md:3}} key={String(label)}><Card variant="outlined" sx={{borderRadius:3}}><CardContent><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" fontWeight={850} sx={{mt:.5}}>{value}</Typography></CardContent></Card></Grid>)}
    </Grid>
    <Paper variant="outlined" sx={{borderRadius:3,overflow:'hidden'}}>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1} sx={{p:2}}>
        <TextField select size="small" label="Type" value={typeFilter} onChange={e=>setTypeFilter(e.target.value as typeof typeFilter)} sx={{minWidth:140}}>{['all','invoice','quote'].map(v=><MenuItem key={v} value={v}>{v==='all'?'All documents':v==='quote'?'Quotes':'Invoices'}</MenuItem>)}</TextField>
        <TextField select size="small" label="Status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} sx={{minWidth:140}}>{['all','draft','sent','accepted','rejected','paid','void'].map(v=><MenuItem key={v} value={v}>{v==='all'?'All statuses':v}</MenuItem>)}</TextField>
      </Stack>
      <TableContainer sx={{overflowX:'auto'}}><Table size="small"><TableHead><TableRow>{['Document','Customer','Issue date','Due date','Total','Status','Actions'].map(h=><TableCell key={h} sx={{fontWeight:800,whiteSpace:'nowrap'}}>{h}</TableCell>)}</TableRow></TableHead><TableBody>
        {filtered.map(d=><TableRow key={d.id} hover><TableCell><Stack direction="row" spacing={1} alignItems="center"><ReceiptLongRounded color="action"/><Box><Typography fontWeight={750}>{d.documentNumber}</Typography><Typography variant="caption" color="text.secondary">{d.documentType}</Typography></Box></Stack></TableCell><TableCell>{d.customerName}<Typography variant="caption" display="block" color="text.secondary">{d.customerEmail||''}</Typography></TableCell><TableCell>{d.issueDate||'—'}</TableCell><TableCell>{d.dueDate||'—'}</TableCell><TableCell sx={{fontWeight:800,whiteSpace:'nowrap'}}>{money(d.total,d.currency)}</TableCell><TableCell><Chip size="small" label={d.status} color={statusColor(d.status)}/></TableCell><TableCell><Stack direction="row" spacing={.5} alignItems="center">
          {d.documentType==='invoice' && ['sent','accepted'].includes(d.status) && <Button size="small" onClick={()=>{setPaymentDoc(d);setPaymentForm(current=>({...current,amount:String(Math.max(0,Number(d.total||0))),currency:d.currency||'KES'}));}}>Record payment</Button>}
          <Button size="small" onClick={()=>printDocument(d)}>Print</Button>
          {d.documentType==='quote' && d.status==='draft' && <Button size="small" onClick={()=>void changeStatus(d,'sent')} disabled={busy}>Send</Button>}
          {d.documentType==='quote' && d.status==='sent' && <Button size="small" onClick={()=>void changeStatus(d,'accepted')} disabled={busy}>Accept</Button>}
          {d.documentType==='quote' && d.status==='accepted' && <Button size="small" onClick={()=>{setConversionDoc(d);setConversionForm({invoiceNumber:'INV-'+d.documentNumber,dueDate:'',notes:d.notes||''});}}>Convert</Button>}
          {d.documentType==='invoice' && d.status==='draft' && <Button size="small" onClick={()=>void changeStatus(d,'sent')} disabled={busy}>Send</Button>}
          {d.status!=='void' && d.status!=='paid' && <Button size="small" color="inherit" onClick={()=>void changeStatus(d,'void')} disabled={busy}>Void</Button>}
          <Button size="small" onClick={()=>void openPayments(d)}>Payments</Button>
        </Stack></TableCell></TableRow>)}
        {!filtered.length && <TableRow><TableCell colSpan={7} align="center"><Box sx={{py:5}}><Typography fontWeight={750}>{loading?'Loading billing records…':'No billing documents yet'}</Typography><Typography variant="body2" color="text.secondary">{loading?'':'Create a quotation or invoice to get started.'}</Typography></Box></TableCell>}
      </TableBody></Table></TableContainer>
    </Paper>
    <Dialog open={createOpen} onClose={()=>!busy&&setCreateOpen(false)} fullWidth maxWidth="md"><DialogTitle>Create billing document</DialogTitle><DialogContent><Grid container spacing={1.5} sx={{pt:1}}>
      <Grid size={{xs:12,sm:4}}><TextField select fullWidth label="Document type" value={form.documentType} onChange={e=>updateForm('documentType',e.target.value as 'quote'|'invoice')}>{['invoice','quote'].map(v=><MenuItem key={v} value={v}>{v==='invoice'?'Invoice':'Quotation'}</MenuItem>)}</TextField></Grid>
      <Grid size={{xs:12,sm:4}}><TextField fullWidth label="Document number" value={form.documentNumber} onChange={e=>updateForm('documentNumber',e.target.value)} required/></Grid>
      <Grid size={{xs:12,sm:4}}><TextField fullWidth label="Currency (ISO)" value={form.currency} onChange={e=>updateForm('currency',e.target.value.toUpperCase())} inputProps={{maxLength:3}}/></Grid>
      <Grid size={{xs:12,sm:6}}><TextField fullWidth label="Customer name" value={form.customerName} onChange={e=>updateForm('customerName',e.target.value)} required/></Grid>
      <Grid size={{xs:12,sm:6}}><TextField fullWidth label="Customer email" value={form.customerEmail} onChange={e=>updateForm('customerEmail',e.target.value)}/></Grid>
      <Grid size={{xs:12,sm:6}}><TextField fullWidth type="date" label="Issue date" InputLabelProps={{shrink:true}} value={form.issueDate} onChange={e=>updateForm('issueDate',e.target.value)}/></Grid>
      <Grid size={{xs:12,sm:6}}><TextField fullWidth type="date" label="Due date" InputLabelProps={{shrink:true}} value={form.dueDate} onChange={e=>updateForm('dueDate',e.target.value)}/></Grid>
      <Grid size={{xs:12}}><Divider/><Typography fontWeight={800}>First line item</Typography></Grid>
      <Grid size={{xs:12}}><TextField fullWidth label="Description" value={form.description} onChange={e=>updateForm('description',e.target.value)} required/></Grid>
      <Grid size={{xs:12,sm:4}}><TextField fullWidth type="number" label="Quantity" value={form.quantity} onChange={e=>updateForm('quantity',e.target.value)} inputProps={{min:0,step:'any'}}/></Grid>
      <Grid size={{xs:12,sm:4}}><TextField fullWidth type="number" label="Unit price" value={form.unitPrice} onChange={e=>updateForm('unitPrice',e.target.value)} inputProps={{min:0,step:'any'}}/></Grid>
      <Grid size={{xs:12,sm:4}}><TextField fullWidth type="number" label="Tax rate (%)" value={form.taxRate} onChange={e=>updateForm('taxRate',e.target.value)} inputProps={{min:0,step:'any'}}/></Grid>
      <Grid size={{xs:12}}><TextField fullWidth multiline minRows={2} label="Notes" value={form.notes} onChange={e=>updateForm('notes',e.target.value)}/></Grid>
    </Grid></DialogContent><DialogActions><Button onClick={()=>setCreateOpen(false)} disabled={busy}>Cancel</Button><Button variant="contained" onClick={()=>void createDocument()} disabled={busy||!form.documentNumber.trim()||!form.customerName.trim()||!form.description.trim()||Number(form.quantity)<=0||Number(form.unitPrice)<0}>Create</Button></DialogActions></Dialog>
    <Dialog open={Boolean(paymentDoc)} onClose={()=>!busy&&setPaymentDoc(null)} fullWidth maxWidth="sm"><DialogTitle>Record payment · {paymentDoc?.documentNumber}</DialogTitle><DialogContent><Grid container spacing={1.5} sx={{pt:1}}>
      <Grid size={{xs:12,sm:6}}><TextField fullWidth label="Payment reference" value={paymentForm.paymentReference} onChange={e=>setPaymentForm(f=>({...f,paymentReference:e.target.value}))} required/></Grid>
      <Grid size={{xs:12,sm:6}}><TextField fullWidth type="number" label="Amount" value={paymentForm.amount} onChange={e=>setPaymentForm(f=>({...f,amount:e.target.value}))} inputProps={{min:.01,step:'any'}}/></Grid>
      <Grid size={{xs:12,sm:4}}><TextField fullWidth label="Currency" value={paymentForm.currency} onChange={e=>setPaymentForm(f=>({...f,currency:e.target.value.toUpperCase()}))} inputProps={{maxLength:3}}/></Grid>
      <Grid size={{xs:12,sm:4}}><TextField fullWidth type="date" label="Date" value={paymentForm.paymentDate} onChange={e=>setPaymentForm(f=>({...f,paymentDate:e.target.value}))} InputLabelProps={{shrink:true}}/></Grid>
      <Grid size={{xs:12,sm:4}}><TextField select fullWidth label="Method" value={paymentForm.paymentMethod} onChange={e=>setPaymentForm(f=>({...f,paymentMethod:e.target.value}))}>{['mpesa','bank_transfer','cash','card','other'].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField></Grid>
      <Grid size={{xs:12}}><TextField fullWidth label="Notes" value={paymentForm.notes} onChange={e=>setPaymentForm(f=>({...f,notes:e.target.value}))}/></Grid>
    </Grid></DialogContent><DialogActions><Button onClick={()=>setPaymentDoc(null)} disabled={busy}>Cancel</Button><Button variant="contained" startIcon={<PaymentsRounded/>} onClick={()=>void recordPayment()} disabled={busy||!paymentForm.paymentReference.trim()||Number(paymentForm.amount)<=0}>Record payment</Button></DialogActions></Dialog>
    <Dialog open={Boolean(conversionDoc)} onClose={()=>!busy&&setConversionDoc(null)} fullWidth maxWidth="sm"><DialogTitle>Convert quotation to invoice · {conversionDoc?.documentNumber}</DialogTitle><DialogContent><Stack spacing={1.5} sx={{pt:1}}><TextField fullWidth label="New invoice number" value={conversionForm.invoiceNumber} onChange={e=>setConversionForm(f=>({...f,invoiceNumber:e.target.value}))} required/><TextField fullWidth type="date" label="Due date" value={conversionForm.dueDate} onChange={e=>setConversionForm(f=>({...f,dueDate:e.target.value})) InputLabelProps={{shrink:true}}/><TextField fullWidth multiline minRows={2} label="Notes" value={conversionForm.notes} onChange={e=>setConversionForm(f=>({...f,notes:e.target.value}))}/></Stack></DialogContent><DialogActions><Button onClick={()=>setConversionDoc(null)} disabled={busy}>Cancel</Button><Button variant="contained" onClick={()=>void convertQuote()} disabled={busy||!conversionForm.invoiceNumber.trim()}>Convert</Button></DialogActions></Dialog>
    <Dialog open={report!==null} onClose={()=>setReport(null)} fullWidth maxWidth="md"><DialogTitle>Payment reconciliation & aging report</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary" sx={{mb:1}}>Summary grouped by currency, invoice aging and recorded payment totals.</Typography><Box component="pre" sx={{whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:12,bgcolor:'action.hover',p:2,borderRadius:2}}>{report===null?'':JSON.stringify(report,null,2)}</Box></DialogContent><DialogActions><Button onClick={()=>setReport(null)}>Close</Button></DialogActions></Dialog>
    <Dialog open={Boolean(paymentHistoryDoc)} onClose={()=>setPaymentHistoryDoc(null)} fullWidth maxWidth="md"><DialogTitle>Payment history · {paymentHistoryDoc?.documentNumber}</DialogTitle><DialogContent><TableContainer><Table size="small"><TableHead><TableRow>{['Reference','Date','Method','Amount','Notes'].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{payments.map(p=><TableRow key={p.id}><TableCell>{p.paymentReference}</TableCell><TableCell>{p.paymentDate}</TableCell><TableCell>{p.paymentMethod}</TableCell><TableCell>{money(p.amount,p.currency)}</TableCell><TableCell>{p.notes||'—'}</TableCell></TableRow>)}{!payments.length&&<TableRow><TableCell colSpan={5} align="center">No payments recorded.</TableCell></TableRow>}</TableBody></Table></TableContainer></DialogContent><DialogActions><Button onClick={()=>setPaymentHistoryDoc(null)}>Close</Button></DialogActions></Dialog>
  </Stack>;
}
