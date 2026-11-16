# 5. Payroll and statutory calculation engine

## 5.1 Design
The calculation engine is a pure TypeScript domain package. Given a versioned input snapshot and effective-dated rule set, it returns deterministic line items, totals, warnings and an explanation trace. It performs no database, network or clock access.

## 5.2 Inputs
- Worker and engagement classification snapshot.
- Contract and effective pay rate.
- Pay period, approved attendance and timesheet lines.
- Overtime/shift/public-holiday policy version.
- Allowances, bonuses, arrears and approved deductions.
- Statutory profile and rule-set version.
- Currency and rounding policy.

## 5.3 Calculation sequence
1. Validate worker eligibility, contract dates and approved source records.
2. Resolve applicable pay basis and effective rate for each work date.
3. Calculate ordinary earnings from approved days, hours or units.
4. Calculate overtime/holiday/rest-day components according to the tenant's approved policy and applicable law.
5. Add taxable/non-taxable allowances and other earnings based on configured tax treatment.
6. Calculate gross earnings and taxable bases by statutory category.
7. Apply effective-dated employee statutory deductions and reliefs.
8. Apply approved non-statutory deductions within configured legal/contractual limits.
9. Calculate net pay and separately calculate employer contributions/cost.
10. Allocate labour costs to project/site/cost centre using approved allocation rules.
11. Validate totals, negative net pay, missing identifiers and unusual variance; emit warnings.
12. Persist calculation snapshot and result; approvals and finalization are separate commands.

## 5.4 Kenya statutory configuration
Do not hard-code rates in calculation functions. Model statutory schemes as versioned rules with:
- scheme/code and jurisdiction;
- effective_from/effective_to;
- employee/employer responsibility;
- calculation basis and caps/floors;
- bands, rates, thresholds and reliefs;
- rounding and minimum/maximum rules;
- source URL/reference, source publication/effective date;
- reviewer, approval timestamp and configuration version.

The Kenyan configuration domain may include PAYE, NSSF, SHIF and Affordable Housing Levy where applicable. Rules and worker applicability must be verified against current official Kenya Revenue Authority, NSSF, Social Health Authority and other competent authority publications before production activation. Do not assume every casual worker, contractor or subcontractor has identical treatment. Keep legal classification and payroll configuration reviewable.

## 5.5 Rounding and precision
Use decimal arithmetic (for example a decimal library) or integer minor units. Define rounding per statutory rule and at the correct stage; do not round intermediate values arbitrarily. Document currency precision and reconcile line sums exactly to totals.

## 5.6 Explainability
Each payroll line stores code, label, quantity, unit, rate, basis, amount, taxable flags, source record references and calculation metadata. Preview should show how each number was produced. Store engine version, ruleset ID/version and source input hashes.

## 5.7 Immutability
A finalized run and its payslips are immutable. Fixes create adjustment runs linked to original run and affected workers. Reversal requires a privileged workflow, reason, approval and audit. Payment status is separate from calculation status.

## 5.8 Testing
Use table-driven tests for each rule version, boundary tests at thresholds, date-boundary tests, leap-year/pay-period tests, property tests for arithmetic invariants and golden fixtures reviewed by payroll specialists. A statutory configuration cannot be promoted to production without signed-off test fixtures.
