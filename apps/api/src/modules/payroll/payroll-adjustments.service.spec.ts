import { PayrollService } from './payroll.service';
import { calculateKenyaMonthlyPayroll, type StatutoryRule } from './kenya-payroll-calculator';
const tenantId='123e4567-e89b-42d3-a456-426614174000',actorId='123e4567-e89b-42d3-a456-426614174001',runId='123e4567-e89b-42d3-a456-426614174002';
const rules:StatutoryRule[]=[
 {code:'PAYE',calculation_method:'progressive_annualized',configuration:{annualBands:[{upTo:288000,rate:.1},{upTo:388000,rate:.25},{upTo:6000000,rate:.3},{upTo:9600000,rate:.325},{upTo:null,rate:.35}],monthlyPersonalRelief:2400}},
 {code:'SHIF',calculation_method:'percentage_with_minimum',configuration:{rate:.0275,base:'gross_salary_or_wage'}},
 {code:'NSSF',calculation_method:'tiered_percentage',configuration:{employeeRate:.06,employerRate:.06,lowerEarningsLimit:9000,upperEarningsLimit:108000}},
 {code:'AHL',calculation_method:'percentage_of_gross_with_employer_match',configuration:{employeeRate:.015,employerRate:.015}},
 {code:'NITA',calculation_method:'fixed_per_employee_per_month',configuration:{amount:50}},
 {code:'PAYE_ALLOWABLE_DEDUCTIONS',calculation_method:'capped_components',configuration:{components:[{code:'SHIF',capMonthly:null},{code:'AHL',capMonthly:null},{code:'REGISTERED_PENSION_AND_NSSF',capMonthly:30000}]}}
];
function makeService(withAdjustments=true){
 const inserted:unknown[][]=[];
 const worker={worker_id:'w1',worker_number:'W001',first_name:'Amani',middle_name:null,last_name:'Otieno',email:null,contract_id:'c1',engagement_type:'permanent',pay_basis:'monthly',rate_amount:'100000',currency:'KES',effective_from:'2026-01-01',effective_to:null,terms:{},approved_days:20,approved_minutes:9600,approved_units:0,overlapping_contracts:1};
 const query=jest.fn(async(sql:string,params:unknown[] = [])=>{
  if(sql.includes('FROM payroll_runs r JOIN payroll_periods p'))return [{id:runId,status:'draft',period_id:'p1',ruleset_id:'rs1',created_by:actorId,start_date:'2026-11-01',end_date:'2026-11-30'}];
  if(sql.includes('FROM statutory_rule_sets'))return [{id:'rs1',compliance_approved_at:new Date()}];
  if(sql.includes('FROM statutory_rules'))return rules;
  if(sql.includes('FROM workers w JOIN worker_contracts'))return [worker];
  if(sql.includes('FROM worker_allowance_assignments a'))return withAdjustments?[
   {assignment_id:'a1',worker_id:'w1',type_id:'at1',code:'TRANSPORT',name:'Transport',method:'fixed_amount',tax_treatment:'taxable',configuration:{},type_enabled:true,type_effective_from:'2026-01-01',type_effective_to:null,amount:'10000',effective_from:'2026-01-01',effective_to:null,approved_days:20,approved_minutes:9600},
   {assignment_id:'a2',worker_id:'w1',type_id:'at2',code:'TOOLS',name:'Tools',method:'fixed_amount',tax_treatment:'non_taxable',configuration:{},type_enabled:true,type_effective_from:'2026-01-01',type_effective_to:null,amount:'5000',effective_from:'2026-01-01',effective_to:null,approved_days:20,approved_minutes:9600}
  ]:[];
  if(sql.includes('FROM worker_deduction_assignments d'))return withAdjustments?[{assignment_id:'d1',worker_id:'w1',type_id:'dt1',code:'SACCO',name:'SACCO',method:'fixed_amount',taxable_treatment:'post_tax',configuration:{},type_enabled:true,type_effective_from:'2026-01-01',type_effective_to:null,amount:'2000',outstanding_balance:null,effective_from:'2026-01-01',effective_to:null}]:[];
  if(sql.startsWith('INSERT INTO payroll_run_items')){inserted.push(params);return [];}
  return [];
 });
 const db={run:jest.fn(async(_tenant:string,fn:(manager:{query:typeof query})=>Promise<unknown>)=>fn({query}))};
 return {service:new PayrollService(db as never),query,inserted};
}
describe('PayrollService allowance and deduction integration',()=>{
 it('adds taxable allowances to statutory earnings, pays non-taxable allowances on top and deducts after tax',async()=>{
  const {service,query}=makeService();
  const result:any=await service.calculateRun(tenantId,actorId,runId);
  const insert=query.mock.calls.find(call=>call[0].startsWith('INSERT INTO payroll_run_items'));
  expect(insert).toBeDefined();
  const params=insert![1] as unknown[];
  const statutory=calculateKenyaMonthlyPayroll(110000,rules);
  expect(Number(params[3])).toBe(115000);
  expect(Number(params[4])).toBeCloseTo(statutory.employeeStatutoryDeductions+2000,2);
  expect(Number(params[6])).toBeCloseTo(115000-statutory.employeeStatutoryDeductions-2000,2);
  const snapshot=JSON.parse(String(params[7]));
  expect(snapshot.allowances).toMatchObject({taxableTotal:10000,nonTaxableTotal:5000,total:15000});
  expect(snapshot.otherDeductions.total).toBe(2000);
  expect(snapshot.statutory.gross).toBe(110000);
  expect(result.warnings.filter((w:string)=>w.includes('NOT_INCLUDED'))).toEqual([]);
 });
 it('flags a negative net pay as a finalization blocker',async()=>{
  const {service,query}=makeService();
  query.mockImplementation(async(sql:string)=>{
   if(sql.includes('FROM payroll_runs r JOIN payroll_periods p'))return [{id:runId,status:'draft',period_id:'p1',ruleset_id:'rs1',created_by:actorId,start_date:'2026-11-01',end_date:'2026-11-30'}];
   if(sql.includes('FROM statutory_rule_sets'))return [{id:'rs1',compliance_approved_at:new Date()}];
   if(sql.includes('FROM statutory_rules'))return rules;
   if(sql.includes('FROM workers w JOIN worker_contracts'))return [{worker_id:'w1',worker_number:'W001',first_name:'A',middle_name:null,last_name:'B',email:null,contract_id:'c1',engagement_type:'permanent',pay_basis:'monthly',rate_amount:'100000',currency:'KES',effective_from:'2026-01-01',effective_to:null,terms:{},approved_days:20,approved_minutes:9600,approved_units:0,overlapping_contracts:1}];
   if(sql.includes('FROM worker_allowance_assignments a'))return [];
   if(sql.includes('FROM worker_deduction_assignments d'))return [{assignment_id:'d1',worker_id:'w1',type_id:'dt1',code:'LOAN',name:'Loan',method:'fixed_amount',taxable_treatment:'post_tax',configuration:{},type_enabled:true,type_effective_from:'2026-01-01',type_effective_to:null,amount:'200000',outstanding_balance:null,effective_from:'2026-01-01',effective_to:null}];
   if(sql.startsWith('INSERT INTO payroll_run_items'))return [];
   return [];
  });
  const result:any=await service.calculateRun(tenantId,actorId,runId);
  expect(result.warnings).toContain('W001:NET_PAY_NEGATIVE');
 });
});
