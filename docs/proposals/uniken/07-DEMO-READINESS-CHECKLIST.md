# Uniken demo readiness checklist

Use this checklist before scheduling or sharing a JengaFlow demonstration.

## Access and security
- [ ] Identity and tenant membership migrations are implemented.
- [ ] Platform Owner and Organisation Admin permissions are documented and tested.
- [ ] Tenant isolation tests pass, including cross-tenant denial tests.
- [ ] Demo seeder is idempotent and disabled by default.
- [ ] Seeder refuses to run in production.
- [ ] Demo credentials are injected through protected secrets, not source control.
- [ ] First-login password change and account expiry/rotation are enabled.
- [ ] No production personal, payroll or customer data is present.

## Product walkthrough
- [ ] Organization dashboard loads.
- [ ] User and role administration works.
- [ ] Worker records and assignments work.
- [ ] Projects and sites work.
- [ ] Attendance and approvals work.
- [ ] Payroll calculations have passed agreed validation.
- [ ] Reports and audit history work.
- [ ] Any incomplete or simulated capability is clearly labelled.

## Presentation pack
- [ ] Confirm Uniken's legal entity name and contact person.
- [ ] Confirm implementation scope and delivery assumptions.
- [ ] Complete and approve all quotation amounts and tax treatment.
- [ ] Confirm hosting, support, integrations and recurring fees.
- [ ] Export final proposal and quotation to PDF or Word.
- [ ] Remove internal notes and draft labels from the client issue version only after approval.

**Release decision:** Do not issue demo credentials or promise a go-live date while any mandatory access/security item remains incomplete.
