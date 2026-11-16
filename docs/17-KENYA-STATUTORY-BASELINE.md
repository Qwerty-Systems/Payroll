# Kenya statutory baseline pack

JengaFlow ships with a versioned Kenya baseline pack. The seed values below are starter configuration, not legal advice. A tenant payroll administrator must review applicability and approve the pack before first payroll. The platform stores the source, effective dates, verification date and configuration snapshot.

| Rule | Starter setting | Effective from | Source |
|---|---:|---|---|
| PAYE | Progressive annual bands: 10%, 25%, 30%, 32.5%, 35%; resident personal relief KES 2,400/month | 1 Jul 2023 | KRA PAYE page |
| SHIF salaried employees | 2.75% of gross salary/wage; minimum KES 300/month | 1 Oct 2024 | SHI Regulations 2024, reg. 17 and amendment |
| NSSF Year 4 | 6% employee + 6% employer; LEL KES 9,000; UEL KES 108,000 | 1 Feb 2026 | NSSF Year 4 2026 notice |
| Affordable Housing Levy | 1.5% employee + 1.5% employer of gross monthly salary | 19 Mar 2024 | Affordable Housing Act 2024 / KRA notice |
| NITA training levy | KES 50 per employee/month; employer cost, not employee deduction | 16 Nov 2026 baseline snapshot (historical commencement date not established in the source) | NITA Levy Inspectorate |
| PAYE allowable deductions | SHIF, AHL, registered pension contributions (subject to KES 30,000/month cap), post-retirement medical fund (KES 15,000/month), mortgage interest (KES 30,000/month) | 16 Nov 2026 baseline snapshot | KRA PAYE page |
| Insurance relief | 15% of qualifying premiums, capped at KES 5,000/month | 1 Jul 2023 | KRA PAYE page |

## Calculation and governance requirements
- SHIF's KES 300 minimum applies to salaried contributors under regulation 17 as well as non-salaried households under regulation 18.
- NSSF employee and employer portions are separate cost lines. For Year 4, the maximum is KES 6,480 for each side, KES 12,960 combined.
- NITA is an employer levy and must never be subtracted from an employee's net pay.
- Employer Affordable Housing Levy is employer cost; only the employee's 1.5% is a payslip deduction.
- PAYE bands are stored as annual thresholds and the engine annualizes monthly taxable pay; the implementation must support irregular pay, bonuses and partial periods through tested period-specific rules.
- Tenant-specific overrides are separately versioned, require a reason and approval, and never overwrite the national baseline.
- Every finalized payroll run snapshots the exact rule set, rule versions, worker contract rates, allowances, deductions and rounding policy used.
- A rule change creates a new effective-dated row. Never rewrite historical payroll results.

## Source references
- KRA PAYE: https://www.kra.go.ke/individual/filing-paying/types-of-taxes/paye
- NSSF Year 4 2026: https://www.nssf.or.ke/notice-to-employers-year-4-2026-nssf-contribution-rates
- Social Health Insurance Regulations: https://new.kenyalaw.org/akn/ke/act/ln/2024/49/eng@2024-09-20/source
- Affordable Housing Levy: https://www.kra.go.ke/news-center/public-notices/2099-collection-of-the-affordable-housing-levy-by-kenya-revenue-authority
- NITA: https://www.nita.go.ke/our-services/levy-inspectorate.html

Before production use, payroll professionals should confirm any subsequent Finance Act, Gazette Notice, court order, exemption, employee category rule or regulator circular. A published baseline is never silently auto-applied to a finalized payroll.
