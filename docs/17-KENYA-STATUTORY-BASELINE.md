# Kenya statutory baseline and fixed monthly salary MVP

JengaFlow ships with a versioned Kenya statutory baseline. Starter values are configuration, not legal advice. A tenant payroll administrator must review applicability, source documents and effective dates, then obtain independent approval before the ruleset can be used for payroll.

## First-release payroll scope

- One basic salary amount per employee, paid monthly in KES.
- No allowances, bonuses, overtime, shift premiums, attendance-based salary, or automatic salary proration in this first release.
- A monthly contract must cover the entire payroll period. If it starts or ends mid-period, the calculation is blocked for review rather than silently inventing a proration convention.
- Employee deductions and employer costs are separate. Employer contributions must never reduce employee net pay.
- Each payroll run stores a calculation snapshot and the exact statutory ruleset version used.

## Kenya statutory baseline

| Rule | Starter setting | Effective from | Source |
|---|---:|---|---|
| PAYE | Progressive annual bands: 10%, 25%, 30%, 32.5%, 35%; resident personal relief KES 2,400/month | 1 Jul 2023 | KRA PAYE page |
| SHIF | 2.75% of gross salary/wage; minimum KES 300/month for a paid salaried record | 1 Oct 2024 | Social Health Insurance Regulations 2024, reg. 17 |
| NSSF Year 4 | 6% employee + 6% employer; LEL KES 9,000; UEL KES 108,000 | 1 Feb 2026 | NSSF Year 4 2026 notice |
| Affordable Housing Levy | 1.5% employee + 1.5% employer of gross monthly salary | 19 Mar 2024 | Affordable Housing Act 2024 / KRA notice |
| NITA training levy | KES 50 per employee/month; employer cost, not employee deduction | 16 Nov 2026 baseline snapshot | NITA Levy Inspectorate |
| PAYE allowable deductions | SHIF, AHL, registered pension contributions (subject to KES 30,000/month cap), post-retirement medical fund (KES 15,000/month), mortgage interest (KES 30,000/month) | 16 Nov 2026 baseline snapshot | KRA PAYE page |
| Insurance relief | 15% of qualifying premiums, capped at KES 5,000/month | 1 Jul 2023 | KRA PAYE page |

## Calculation behavior

- SHIF applies the configured monthly minimum after the percentage calculation, except where gross pay is zero.
- NSSF is calculated and displayed separately for Tier I (up to the LEL) and Tier II (earnings above LEL up to UEL). Employee and employer portions are separate lines.
- PAYE bands are annual thresholds applied to annualized monthly taxable pay; resident personal relief is then applied monthly.
- The PAYE taxable base deducts configured allowable deductions, including SHIF and employee AHL, plus eligible pension/NSSF amounts within the configured cap.
- Insurance relief and employee-specific tax adjustments require verified employee-level premium and eligibility data; the current fixed-salary MVP applies only standard resident personal relief. Do not assume insurance relief for employees without supporting records.
- NITA is an employer levy and must never be subtracted from employee net pay.
- Employer Affordable Housing Levy is employer cost; only the employee's 1.5% is a payslip deduction.

## Governance

- Tenant-specific overrides are separately versioned, require a reason and independent approval, and never overwrite the national baseline.
- Effective dates, source URLs, verification dates and configuration snapshots are retained.
- Every finalized payroll run snapshots the exact rule set, worker contract rates, allowances, deductions and rounding policy used.
- A rule change creates a new effective-dated row. Never rewrite historical payroll results.
- Before production use, payroll professionals should confirm any subsequent Finance Act, Gazette Notice, court order, exemption, employee category rule or regulator circular. A published baseline is never silently auto-applied to a finalized payroll.

## Source references

- KRA PAYE: https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye
- NSSF Year 4 2026: https://www.nssf.or.ke/notice-to-employers-year-4-2026-nssf-contribution-rates
- Social Health Insurance Regulations: https://new.kenyalaw.org/akn/ke/act/ln/2024/49/eng@2024-09-20/source
- Affordable Housing Levy: https://www.kra.go.ke/news-center/public-notices/2099-collection-of-the-affordable-housing-levy-by-kenya-revenue-authority
- NITA: https://www.nita.go.ke/our-services/levy-inspectorate.html
