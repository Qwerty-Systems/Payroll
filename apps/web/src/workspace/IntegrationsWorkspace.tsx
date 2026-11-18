import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, Divider, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';

type Row = Record<string, any>;
type Request = <T,>(path: string, init?: RequestInit) => Promise<T>;
type Props = { request: Request };
const providers = [
 {id:'daraja',title:'M-Pesa / Daraja',fields:[['shortCode','Short code'],['initiatorName','Initiator name'],['callbackBaseUrl','Callback base URL'],['accountReferencePrefix','Account reference prefix']]},
 {id:'bank_transfer',title:'Bank payouts',fields:[['bankName','Bank name'],['transferFormat','Transfer format'],['accountDisplayName','Account display name'],['currency','Currency'],['exportDelivery','Export delivery method']]},
 {id:'email',title:'Payslip delivery',fields:[['provider','Email provider'],['fromName','Sender name'],['fromEmail','Sender email'],['deliveryMode','Delivery mode']]},
 {id:'accounting',title:'Accounting',fields:[['provider','Accounting provider'],['exportFormat','Export format'],['defaultCurrency','Currency'],['externalCompanyReference','Company reference']]},
] as const;

export default function IntegrationsWorkspace({request}:Props) {
 const [rows,setRows]=useState<Row[]>([]);
 const [forms,setForms]=useState<Record<string,Record<string,string>>>({});
 const [enabled,setEnabled]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
   const result=await request<Row[]>('integrations/settings');
   const loaded=Array.isArray(result)?result:[];
   setRows(loaded);
   const formState:Record<string,Record<string,string>>={};
   const enabledState:Record<string,boolean>={};
   loaded.forEach(row=>{formState[String(row.provider)]={...(row.settings??{})};enabledState[String(row.provider)]=Boolean(row.enabled);});
   setForms(prev=>({...prev,...formState}));
   setEnabled(prev=>({...prev,...enabledState}));
 },[request]);
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Could not load integrations.'));},[refresh]);
 const updateField=(provider:string,key:string,value:string)=>setForms(prev=>({...prev,[provider]:{...(prev[provider]??{}),[key]:value}}));
 async function save(provider:string){
   setBusy(provider);setError('');setNotice('');
   try{
     await request('integrations/settings',{method:'POST',body:JSON.stringify({provider,enabled:Boolean(enabled[provider]),environment:'sandbox',settings:forms[provider]??{}})});
     await refresh();setNotice(provider+' settings saved in sandbox mode.');
   }catch(e){setError(e instanceof Error?e.message:'Unable to save integration settings.');}
   finally{setBusy('');}
 }
 async function testDaraja(){
   setBusy('daraja-test');setError('');setNotice('');
   try{const result=await request<Row>('integrations/daraja/test-sandbox',{method:'POST'});setNotice(String(result.message??'Sandbox test succeeded.'));await refresh();}
   catch(e){setError(e instanceof Error?e.message:'Daraja sandbox test failed.');}
   finally{setBusy('');}
 }
 return <Stack spacing={2.5}>
  <Alert severity="info">Sandbox-only configuration. Credentials are provisioned through deployment secrets and are never entered or displayed here. Live transfers, payslip email and accounting synchronization are not enabled.</Alert>
  {error&&<Alert severity="error">{error}</Alert>}{notice&&<Alert severity="success">{notice}</Alert>}
  <Grid container spacing={2}>
   {providers.map(provider=>{
    const status=rows.find(row=>row.provider===provider.id);
    return <Grid item xs={12} lg={6} key={provider.id}>
     <Card variant="outlined" sx={{height:'100%',borderRadius:3,borderColor:'#E2E9E2'}}>
      <CardContent sx={{p:2.5}}>
       <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
         <Typography fontWeight={850}>{provider.title}</Typography>
         <Chip size="small" label={status?.connectionStatus??'Not tested'} color={status?.connectionStatus==='connected'?'success':'default'}/>
        </Stack>
        <TextField select size="small" label="Mode" value="sandbox" disabled>
         <MenuItem value="sandbox">Sandbox</MenuItem>
        </TextField>
        <TextField select size="small" label="Enabled" value={enabled[provider.id]?'yes':'no'} onChange={e=>setEnabled(prev=>({...prev,[provider.id]:e.target.value==='yes'}))}>
         <MenuItem value="no">Disabled</MenuItem><MenuItem value="yes">Enabled</MenuItem>
        </TextField>
        <Divider/>
        {provider.fields.map(([key,label])=><TextField key={key} size="small" fullWidth label={label} value={forms[provider.id]?.[key]??''} onChange={e=>updateField(provider.id,key,e.target.value)}/>)}
        <Stack direction="row" gap={1} flexWrap="wrap">
         <Button variant="contained" disabled={busy===provider.id} onClick={()=>void save(provider.id)}>{busy===provider.id?'Saving…':'Save settings'}</Button>
         {provider.id==='daraja'&&<Button variant="outlined" disabled={busy!==''} onClick={()=>void testDaraja()}>{busy==='daraja-test'?'Testing…':'Test sandbox OAuth'}</Button>}
        </Stack>
        {provider.id==='daraja'&&<Typography variant="caption" color="text.secondary">The sandbox test validates OAuth credentials only. It does not initiate a payment.</Typography>}
        {status?.lastTestedAt&&<Typography variant="caption" color="text.secondary">Last tested: {new Date(status.lastTestedAt).toLocaleString()}</Typography>}
       </Stack>
      </CardContent>
     </Card>
    </Grid>
   })}
  </Grid>
 </Stack>;
}
