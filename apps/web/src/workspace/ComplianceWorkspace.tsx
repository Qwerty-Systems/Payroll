import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';

type Row = Record<string, any> & { id?: string };
type Props = {
  role: string;
  periods: Row[];
  request: <T,>(path: string, init?: RequestInit) => Promise<T>;
};
const rows = (v:unknown):Row[] => Array.isArray(v) ? v as Row[] : [];
const show = (v:unknown) => v == null || v === '' ? '—' : String(v);
const today = () => new Date().toISOString().slice(0,10);
const statusColor = (s:string) => s==='approved'||s==='accepted'?'success':s==='rejected'?'error':s==='submitted'||s==='in_review'?'warning':'default';

export default function ComplianceWorkspace({role,periods,request}:Props) {
  const [rulesets,setRulesets]=useState<Row[]>([]);
  const [selectedRuleset,setSelectedRuleset]=useState('');
  const [rules,setRules]=useState<Row[]>([]);
  const [changes,setChanges]=useState<Row[]>([]);
  const [filings,setFilings]=useState<Row[]>([]);
  const [audit,setAudit]=useState<Row[]>([]);
  const [runs,setRuns]=useState<Row[]>([]);
  const [selectedPeriod,setSelectedPeriod]=useState('');
  const [dialog,setDialog]=useState('');
  const [activeId,setActiveId]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [fields,setFields]=useState<Record<string,string>>({
    effectiveFrom:today(),effectiveTo:'',submissionNotes:'Reviewed against the cited statutory source.',
    notes:'',ruleCode:'',label:'',category:'tax',calculationMethod:'progressive_annualized',
    configuration:'{}',sourceTitle:'',sourceUrl:'',verifiedOn:today(),reason:'',
    payrollPeriodId:'',payrollRunId:'',authority:'KRA',filingType:'PAYE',dueDate:'',
    externalReference:'',submissionChannel:'iTax / authority portal',submissionEvidenceUrl:'',
  });
  const set=(key:string,value:string)=>setFields(v=>({...v,[key]:value}));
  const canManage=['owner','admin','hr_manager','payroll_manager'].includes(role);
  const canReview=['owner','admin'].includes(role);

  const reload=useCallback(async()=>{
    setError('');
    const [sets,proposals,filingRows,auditRows]=await Promise.all([
      request<unknown>('compliance/rulesets'),request<unknown>('compliance/rule-changes'),
      request<unknown>('compliance/filings'),request<unknown>('compliance/audit?limit=150'),
    ]);
    const next=rows(sets);setRulesets(next);
    setChanges(rows(proposals));setFilings(rows(filingRows));setAudit(rows(auditRows));
    if(!selectedRuleset && next.length) setSelectedRuleset(String(next[0].id));
  },[request,selectedRuleset]);

  useEffect(()=>{void reload().catch(e=>setError(e instanceof Error?e.message:'Compliance data could not be loaded.'));},[reload]);
  useEffect(()=>{
    if(!selectedRuleset){setRules([]);return;}
    let live=true;
    request<Row>('compliance/rulesets/'+selectedRuleset).then(v=>{if(live)setRules(rows(v.rules));})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'Statutory rules could not be loaded.');});
    return ()=>{live=false;};
  },[request,selectedRuleset]);
  useEffect(()=>{
    if(!selectedPeriod){setRuns([]);return;}
    let live=true;
    request<unknown>('payroll/runs?periodId='+encodeURIComponent(selectedPeriod)).then(v=>{if(live)setRuns(rows(v));})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'Payroll runs could not be loaded.');});
    return ()=>{live=false;};
  },[request,selectedPeriod]);

  async function act(path:string,body?:unknown,method='POST',success='Compliance record updated.') {
    setBusy(true);setError('');setNotice('');
    try{
      await request(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
      setNotice(success);await reload();
    }catch(e){setError(e instanceof Error?e.message:'The compliance action failed.');}
    finally{setBusy(false);}
  }
  function openDialog(name:string,id=''){setActiveId(id);setDialog(name);setError('');setNotice('');}
  function closeDialog(){setDialog('');setActiveId('');}

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      if(dialog==='reviewRuleset'){
        await request('compliance/rulesets/'+selectedRuleset+'/reviews',{method:'POST',body:JSON.stringify({
          effectiveFrom:fields.effectiveFrom,effectiveTo:fields.effectiveTo||undefined,submissionNotes:fields.submissionNotes,
        })});
        setNotice('Statutory ruleset review submitted. It cannot be approved by its submitter.');
      }else if(dialog==='ruleChange'){
        const configuration=JSON.parse(fields.configuration||'{}');
        if(!configuration||Array.isArray(configuration)||typeof configuration!=='object')throw new Error('Calculation configuration must be a JSON object.');
        await request('compliance/rulesets/'+selectedRuleset+'/changes',{method:'POST',body:JSON.stringify({
          ruleCode:fields.ruleCode,label:fields.label,category:fields.category,calculationMethod:fields.calculationMethod,
          configuration,effectiveFrom:fields.effectiveFrom,effectiveTo:fields.effectiveTo||undefined,
          sourceTitle:fields.sourceTitle,sourceUrl:fields.sourceUrl,verifiedOn:fields.verifiedOn,reason:fields.reason,
        })});
        setNotice('Effective-dated rule change saved as a draft. It will not affect payroll until reviewed and approved.');
      }else if(dialog==='prepareFiling'){
        await request('compliance/filings/prepare',{method:'POST',body:JSON.stringify({
          payrollPeriodId:fields.payrollPeriodId,payrollRunId:fields.payrollRunId,authority:fields.authority,
          filingType:fields.filingType,dueDate:fields.dueDate||undefined,
        })});
        setNotice('Filing report prepared from the approved payroll run.');
      }else if(dialog==='reviewDecision'){
        const endpoint=activeId.startsWith('rule-review:')?'compliance/rule-reviews/':'compliance/rule-changes/';
        const kind=activeId.split(':')[0];const id=activeId.split(':')[1];
        await request(endpoint+id+'/'+(fields.decision==='reject'?'reject':'approve'),{method:'POST',body:JSON.stringify({notes:fields.notes})});
        setNotice(kind==='rule-review'?'Statutory ruleset review decision recorded.':'Statutory rule change decision recorded.');
      }else if(dialog==='filingDecision'){
        await request('compliance/filings/'+activeId+'/'+(fields.decision==='reject'?'reject':'approve'),{method:'POST',body:JSON.stringify({reason:fields.notes})});
        setNotice('Filing review decision recorded.');
      }else if(dialog==='recordSubmission'){
        await request('compliance/filings/'+activeId+'/record-submission',{method:'POST',body:JSON.stringify({
          externalReference:fields.externalReference,submissionChannel:fields.submissionChannel,
          submissionEvidenceUrl:fields.submissionEvidenceUrl||undefined,
        })});
        setNotice('Submission reference recorded. This records an external submission; it does not submit directly to the authority.');
      }else if(dialog==='authorityResponse'){
        await request('compliance/filings/'+activeId+'/authority-response',{method:'POST',body:JSON.stringify({
          accepted:fields.decision==='approve',reason:fields.notes||undefined,
        })});
        setNotice('Authority response recorded.');
      }
      closeDialog();await reload();
    }catch(e){setError(e instanceof Error?e.message:'The compliance action could not be completed.');}
    finally{setBusy(false);}
  }

  const selected=rulesets.find(r=>String(r.id)===selectedRuleset);
  return <Stack spacing={2.5}>
    {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
    {notice&&<Alert severity="success" onClose={()=>setNotice('')}>{notice}</Alert>}
    <Paper variant="outlined" sx={{p:{xs:2,md:2.5},borderColor:'#E4EAE3',borderRadius:3}}>
      <Stack direction={{xs:'column',md:'row'}} justifyContent="space-between" alignItems={{md:'center'}} spacing={1.5}>
        <Box><Typography variant="h6" fontWeight={900}>Statutory rules and approvals</Typography><Typography variant="body2" color="text.secondary">Review the statutory baseline assigned to this company before processing payroll.</Typography></Box>
        <Button variant="outlined" onClick={()=>void reload()} disabled={busy}>Refresh compliance</Button>
      </Stack>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{mt:2}}>
        <TextField select fullWidth label="Statutory ruleset" value={selectedRuleset} onChange={e=>setSelectedRuleset(e.target.value)}>
          {rulesets.map(r=><MenuItem key={r.id} value={r.id}>{r.countryCode} · {r.name} · {r.version}</MenuItem>)}
        </TextField>
        <Button variant="contained" disabled={!selectedRuleset||busy||!canManage} onClick={()=>openDialog('reviewRuleset')}>Submit for review</Button>
      </Stack>
      {selected&&<Stack direction="row" spacing={1} flexWrap="wrap" sx={{mt:1.5}}>
        <Chip size="small" label={'Ruleset '+show(selected.version)}/>
        <Chip size="small" color={statusColor(String(selected.reviewStatus??'not reviewed'))} label={'Company review: '+show(selected.reviewStatus??'not reviewed')}/>
        {selected.assignedFrom&&<Chip size="small" label={'Assigned from '+show(selected.assignedFrom)}/>}
      </Stack>}
      <TableContainer sx={{mt:2}}><Table size="small"><TableHead><TableRow>{['Rule','Category','Method','Effective from','Verified source'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
        {rules.map((r,i)=><TableRow key={String(r.code)+i}><TableCell><Typography fontWeight={800}>{show(r.code)}</Typography><Typography variant="caption" color="text.secondary">{show(r.label)}</Typography></TableCell><TableCell>{show(r.category)}</TableCell><TableCell>{show(r.calculationMethod)}</TableCell><TableCell>{show(r.effectiveFrom)}</TableCell><TableCell>{r.sourceUrl?<a href={String(r.sourceUrl)} target="_blank" rel="noreferrer">{show(r.sourceTitle)}</a>:'—'}<Typography variant="caption" display="block" color="text.secondary">Verified {show(r.verifiedOn)}</Typography></TableCell></TableRow>)}
        {!rules.length&&<TableRow><TableCell colSpan={5}>Select a statutory ruleset to inspect its rules.</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
      {selected?.reviewStatus==='submitted'&&canReview&&<Stack direction="row" spacing={1} sx={{mt:2}}>
        <Button color="success" variant="contained" onClick={()=>{set('decision','approve');openDialog('reviewDecision','rule-review:'+String(selected.reviewId));}}>Approve review</Button>
        <Button color="error" variant="outlined" onClick={()=>{set('decision','reject');openDialog('reviewDecision','rule-review:'+String(selected.reviewId));}}>Reject review</Button>
      </Stack>}
    </Paper>

    <Paper variant="outlined" sx={{p:{xs:2,md:2.5},borderColor:'#E4EAE3',borderRadius:3}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1}>
        <Box><Typography variant="h6" fontWeight={900}>Effective-dated rule changes</Typography><Typography variant="body2" color="text.secondary">Every proposal requires a reason, source and verification date. Only approved changes enter payroll calculations.</Typography></Box>
        <Button variant="contained" disabled={!selectedRuleset||!canManage} onClick={()=>openDialog('ruleChange')}>Propose rule change</Button>
      </Stack>
      <TableContainer sx={{mt:2}}><Table size="small"><TableHead><TableRow>{['Rule','Effective','Source','Status','Actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
        {changes.map(r=><TableRow key={r.id}><TableCell><Typography fontWeight={800}>{show(r.ruleCode)} · {show(r.label)}</Typography><Typography variant="caption" color="text.secondary">{show(r.reason)}</Typography></TableCell><TableCell>{show(r.effectiveFrom)}{r.effectiveTo?' → '+show(r.effectiveTo):' onward'}</TableCell><TableCell>{show(r.sourceTitle)}<Typography variant="caption" display="block">{show(r.verifiedOn)}</Typography></TableCell><TableCell><Chip size="small" color={statusColor(String(r.status))} label={show(r.status)}/></TableCell><TableCell>
          {r.status==='draft'||r.status==='rejected'?<Button size="small" disabled={!canManage||busy} onClick={()=>void act('compliance/rule-changes/'+r.id+'/submit',{notes:'Submitted for independent compliance review.'},'POST','Rule change submitted for review.')}>Submit</Button>:null}
          {r.status==='submitted'&&canReview?<><Button size="small" color="success" onClick={()=>{set('decision','approve');openDialog('reviewDecision','rule-change:'+String(r.id));}}>Approve</Button><Button size="small" color="error" onClick={()=>{set('decision','reject');openDialog('reviewDecision','rule-change:'+String(r.id));}}>Reject</Button></>:null}
        </TableCell></TableRow>)}
        {!changes.length&&<TableRow><TableCell colSpan={5}>No rule change proposals yet.</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
    </Paper>

    <Paper variant="outlined" sx={{p:{xs:2,md:2.5},borderColor:'#E4EAE3',borderRadius:3}}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1}>
        <Box><Typography variant="h6" fontWeight={900}>Statutory filings</Typography><Typography variant="body2" color="text.secondary">Prepare reports from approved payroll runs, route them for review and record the authority response.</Typography></Box>
        <Button variant="contained" disabled={!canManage||!periods.length} onClick={()=>openDialog('prepareFiling')}>Prepare filing</Button>
      </Stack>
      <TableContainer sx={{mt:2}}><Table size="small"><TableHead><TableRow>{['Authority','Filing','Period','Due date','Status','Reference / actions'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
        {filings.map(f=><TableRow key={f.id}><TableCell>{show(f.authority)}</TableCell><TableCell>{show(f.filingType)}</TableCell><TableCell>{show(f.referencePeriod)}</TableCell><TableCell>{show(f.dueDate)}</TableCell><TableCell><Chip size="small" color={statusColor(String(f.status))} label={show(f.status)}/></TableCell><TableCell>
          {f.status==='prepared'?<Button size="small" onClick={()=>void act('compliance/filings/'+f.id+'/request-review',{},'POST','Filing sent for review.')}>Request review</Button>:null}
          {f.status==='in_review'&&canReview?<><Button size="small" color="success" onClick={()=>{set('decision','approve');openDialog('filingDecision',String(f.id));}}>Approve</Button><Button size="small" color="error" onClick={()=>{set('decision','reject');openDialog('filingDecision',String(f.id));}}>Reject</Button></>:null}
          {f.status==='approved'?<Button size="small" onClick={()=>openDialog('recordSubmission',String(f.id))}>Record submission</Button>:null}
          {f.status==='submitted'&&canManage?<Button size="small" onClick={()=>{set('decision','approve');openDialog('authorityResponse',String(f.id));}}>Record acceptance</Button>:null}
          {f.status==='submitted'&&canManage?<Button size="small" color="error" onClick={()=>{set('decision','reject');openDialog('authorityResponse',String(f.id));}}>Record rejection</Button>:null}
          {f.externalReference?<Typography variant="caption" display="block">{show(f.externalReference)}</Typography>:null}
        </TableCell></TableRow>)}
        {!filings.length&&<TableRow><TableCell colSpan={6}>No statutory filings prepared for this company.</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
    </Paper>

    <Paper variant="outlined" sx={{p:{xs:2,md:2.5},borderColor:'#E4EAE3',borderRadius:3}}>
      <Typography variant="h6" fontWeight={900}>Compliance audit history</Typography>
      <Typography variant="body2" color="text.secondary">Immutable event history for rule reviews, rule changes and filing preparation, review and submission records.</Typography>
      <TableContainer sx={{mt:2,maxHeight:420}}><Table size="small" stickyHeader><TableHead><TableRow>{['When','Action','Record','Actor','Details'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>
        {audit.map(a=><TableRow key={a.id}><TableCell>{a.createdAt?new Date(a.createdAt).toLocaleString():'—'}</TableCell><TableCell>{show(a.action)}</TableCell><TableCell>{show(a.entityType)} · {show(a.entityId)}</TableCell><TableCell>{show(a.actorUserId)}</TableCell><TableCell><Typography variant="caption">{JSON.stringify(a.metadata??{})}</Typography></TableCell></TableRow>)}
        {!audit.length&&<TableRow><TableCell colSpan={5}>No compliance audit events yet.</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
    </Paper>

    <Dialog open={Boolean(dialog)} onClose={closeDialog} fullWidth maxWidth="md">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{dialog==='reviewRuleset'?'Submit statutory ruleset for review':dialog==='ruleChange'?'Propose an effective-dated rule change':dialog==='prepareFiling'?'Prepare statutory filing':dialog==='recordSubmission'?'Record authority submission':dialog==='authorityResponse'?'Record authority response':'Compliance review decision'}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{pt:1}}>
          {dialog==='reviewRuleset'&&<><Alert severity="info">Approval is company-specific and requires a different reviewer from the submitter.</Alert><TextField type="date" label="Effective from" InputLabelProps={{shrink:true}} required value={fields.effectiveFrom} onChange={e=>set('effectiveFrom',e.target.value)}/><TextField type="date" label="Effective to (optional)" InputLabelProps={{shrink:true}} value={fields.effectiveTo} onChange={e=>set('effectiveTo',e.target.value)}/><TextField label="Review submission notes" multiline minRows={2} value={fields.submissionNotes} onChange={e=>set('submissionNotes',e.target.value)}/></>}
          {dialog==='ruleChange'&&<>
            <Alert severity="warning">This proposal is not active until an authorised reviewer approves it. Add the official source and verify the dates before submitting.</Alert>
            <TextField label="Rule code" required value={fields.ruleCode} onChange={e=>set('ruleCode',e.target.value.toUpperCase())}/>
            <TextField label="Rule label" required value={fields.label} onChange={e=>set('label',e.target.value)}/>
            <TextField select label="Category" value={fields.category} onChange={e=>set('category',e.target.value)}>{['tax','employee_deduction','employer_contribution','tax_relief','allowable_deduction','levy'].map(v=><MenuItem key={v} value={v}>{v.replaceAll('_',' ')}</MenuItem>)}</TextField>
            <TextField label="Calculation method" required value={fields.calculationMethod} onChange={e=>set('calculationMethod',e.target.value)}/>
            <TextField label="Configuration (JSON)" multiline minRows={5} required value={fields.configuration} onChange={e=>set('configuration',e.target.value)}/>
            <Stack direction={{xs:'column',sm:'row'}} spacing={1}><TextField fullWidth type="date" label="Effective from" InputLabelProps={{shrink:true}} required value={fields.effectiveFrom} onChange={e=>set('effectiveFrom',e.target.value)}/><TextField fullWidth type="date" label="Effective to" InputLabelProps={{shrink:true}} value={fields.effectiveTo} onChange={e=>set('effectiveTo',e.target.value)}/></Stack>
            <TextField label="Source title" required value={fields.sourceTitle} onChange={e=>set('sourceTitle',e.target.value)}/>
            <TextField label="Source URL" type="url" required value={fields.sourceUrl} onChange={e=>set('sourceUrl',e.target.value)}/>
            <TextField type="date" label="Verified on" InputLabelProps={{shrink:true}} required value={fields.verifiedOn} onChange={e=>set('verifiedOn',e.target.value)}/>
            <TextField label="Reason and impact" multiline minRows={2} required value={fields.reason} onChange={e=>set('reason',e.target.value)}/>
          </>}
          {dialog==='prepareFiling'&&<>
            <Alert severity="info">Reports can only be prepared from approved or finalised payroll runs. Preparing a report does not file it with the authority.</Alert>
            <TextField select label="Payroll period" required value={fields.payrollPeriodId} onChange={e=>{set('payrollPeriodId',e.target.value);set('payrollRunId','');setSelectedPeriod(e.target.value);}}>{periods.map(p=><MenuItem key={p.id} value={p.id}>{show(p.code)} · {show(p.startDate)} – {show(p.endDate)}</MenuItem>)}</TextField>
            <TextField select label="Approved payroll run" required value={fields.payrollRunId} onChange={e=>set('payrollRunId',e.target.value)}>{runs.filter(r=>['approved','finalized'].includes(String(r.status))).map(r=><MenuItem key={r.id} value={r.id}>Run {show(r.runNumber)} · {show(r.status)}</MenuItem>)}</TextField>
            <TextField select label="Authority" value={fields.authority} onChange={e=>set('authority',e.target.value)}>{['KRA','NSSF','SHA','HOUSING_LEVY','NITA','OTHER'].map(v=><MenuItem key={v} value={v}>{v.replaceAll('_',' ')}</MenuItem>)}</TextField>
            <TextField label="Filing type" required value={fields.filingType} onChange={e=>set('filingType',e.target.value)}/>
            <TextField type="date" label="Due date" InputLabelProps={{shrink:true}} value={fields.dueDate} onChange={e=>set('dueDate',e.target.value)}/>
          </>}
          {dialog==='reviewDecision'&&<><Alert severity="warning">Your decision and notes will be recorded in the compliance audit history.</Alert><TextField label="Decision" select value={fields.decision} onChange={e=>set('decision',e.target.value)}><MenuItem value="approve">Approve</MenuItem><MenuItem value="reject">Reject</MenuItem></TextField><TextField label="Review notes" required multiline minRows={3} value={fields.notes} onChange={e=>set('notes',e.target.value)}/></>}
          {dialog==='filingDecision'&&<><TextField label="Decision" select value={fields.decision} onChange={e=>set('decision',e.target.value)}><MenuItem value="approve">Approve filing</MenuItem><MenuItem value="reject">Reject filing</MenuItem></TextField><TextField label="Review notes / rejection reason" required multiline minRows={3} value={fields.notes} onChange={e=>set('notes',e.target.value)}/></>}
          {dialog==='recordSubmission'&&<><Alert severity="info">Enter the reference returned by the external authority portal. JengaFlow records this information but does not transmit the filing.</Alert><TextField label="External submission reference" required value={fields.externalReference} onChange={e=>set('externalReference',e.target.value)}/><TextField label="Submission channel" required value={fields.submissionChannel} onChange={e=>set('submissionChannel',e.target.value)}/><TextField label="Evidence URL (optional)" type="url" value={fields.submissionEvidenceUrl} onChange={e=>set('submissionEvidenceUrl',e.target.value)}/></>}
          {dialog==='authorityResponse'&&<><TextField label="Authority response" select value={fields.decision} onChange={e=>set('decision',e.target.value)}><MenuItem value="approve">Accepted</MenuItem><MenuItem value="reject">Rejected</MenuItem></TextField><TextField label="Response notes / rejection reason" multiline minRows={2} value={fields.notes} onChange={e=>set('notes',e.target.value)}/></>}
        </Stack></DialogContent>
        <DialogActions sx={{p:2.5}}><Button onClick={closeDialog} disabled={busy}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{busy?'Saving…':'Save and continue'}</Button></DialogActions>
      </Box>
    </Dialog>
  </Stack>;
}
