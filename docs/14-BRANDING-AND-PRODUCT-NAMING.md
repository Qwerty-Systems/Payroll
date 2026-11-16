# 14. Product naming and Qwerty brand architecture

## 14.1 Qwerty brand context
The Qwerty website presents the company as a software builder, with the message “We build awesome software” and the positioning “Design -> Innovate -> Transform”. The product should therefore be named as a Qwerty-built software product, not as a payroll-only utility. Keep the platform identity broad enough to cover construction operations and Qwerty's wider product portfolio.

## 14.2 Brand relationship
The platform is a Qwerty Systems product. Use a product brand endorsed by Qwerty rather than presenting it as an unrelated company. Suggested endorsement: "A Qwerty Systems product" or "Powered by Qwerty Systems". Keep the legal vendor identity, support contacts, privacy policy and service terms visible in the platform footer/about screen.

## 14.3 Naming criteria
The product name should be:
- Easy to pronounce and spell in Kenya and across East Africa.
- Suitable for construction workforce, site operations, payroll and project cost visibility.
- Broad enough to grow beyond payroll into quotations, proposals, contracts, billing and customer management.
- Distinctive enough to search and protect as a brand.
- Short enough for an app icon and customer subdomain.
- Not so generic that it is difficult to distinguish in app stores or search results.

## 14.4 Candidate names
1. **JengaFlow** — clear construction association with a broad workflow/operations meaning. Suggested primary candidate.
2. **JengaWorks** — friendly and broad; suitable for workforce and site operations.
3. **SiteLedger** — professional and finance-oriented; strongest if payroll and labour costing remain the centre.
4. **FundiFlow** — memorable local feel; may sound more worker-focused than enterprise software.
5. **CrewLedger** — clear connection between workforce and money; less explicitly Kenyan.
6. **BuildDesk** — broad construction business workspace; simple but more generic.
7. **JengaSuite** — signals a larger suite of connected business modules.
8. **SitePilot** — modern operations feel; does not immediately communicate payroll.

These are creative candidates, not cleared trademarks or confirmed available domains. Before choosing, check Kenyan trademark records, company-name conflicts, app-store listings, search results and domain availability. Do not assume a name is legally available because a subdomain can be configured.

## 14.5 Recommendation
Use **JengaFlow by Qwerty** as the working name for design and code until formal name clearance. It accommodates workforce, site operations, payroll and the future commercial workspace. If a more formal enterprise tone is preferred, use **JengaWorks by Qwerty**. If the client insists the product be described primarily as payroll, use **SiteLedger by Qwerty**.

## 14.6 Domain strategy
- Product marketing site: qwerty.co.ke/products/jengaflow (or a product landing page chosen by Qwerty).
- Tenant workspace: {tenant-slug}.qwerty.co.ke.
- Platform control plane: control.qwerty.co.ke.
- Platform sales/CRM: sales.qwerty.co.ke or a module inside control.qwerty.co.ke.
- API: api.qwerty.co.ke, with tenant context derived and validated by the API.
- Optional customer vanity domains: customer-controlled CNAME + domain ownership verification.

The tenant slug must be unique, normalized, reserved against abuse, and changeable only through an audited process. A tenant subdomain identifies a workspace but never grants access by itself. Use wildcard DNS and a wildcard TLS certificate only after validating DNS, hosting and certificate automation. Avoid using a wildcard certificate private key in application containers.

## 14.7 Visual identity
Use Qwerty's approved logo, typography and brand guidelines as the source of truth. Until those assets are confirmed, use a restrained construction/operations visual direction: deep green/navy, warm neutral surfaces, high-contrast text, clear status colors and accessible touch targets. Do not invent a new Qwerty logo or claim colors are official without confirmation.

## 14.8 Responsive experience
Design mobile-first. Primary mobile navigation should use a bottom navigation bar or compact drawer, with large touch targets, concise forms, camera/file upload support where authorized, and clear offline/sync status. Desktop uses a persistent side navigation and data-dense tables. Tablet adapts between these patterns. Do not simply scale down desktop tables; provide card/list views and focused detail screens on small displays.

## 14.9 PWA requirements
- Web app manifest with app name, short name, icons, theme/background colors and standalone display.
- Installability checks and an in-app install guide where supported.
- Service worker app-shell caching and controlled version updates.
- IndexedDB offline cache/outbox for specifically approved actions.
- Offline banner, pending-sync count, last-sync time, retry controls and conflict review.
- No blanket caching of authenticated API responses.
- Clear local data on logout, tenant switch and revoked device membership.
- iOS-specific install instructions because installation prompts differ by browser/platform.
- Push notifications are optional and require explicit permission; core operation must not depend on them.

## 14.10 Qwerty commercial workspace
In addition to platform subscriptions, Qwerty needs its own internal sales and customer-delivery workspace:
- Leads, contacts, organizations and opportunities.
- Discovery notes, requirements, follow-up tasks and communication history.
- Proposal templates, versions, line items, scope, assumptions, exclusions, milestones and acceptance.
- Quotations with validity dates, taxes, discounts, optional items and approval.
- Service agreements, statements of work and change requests.
- Project delivery handover from accepted quote/proposal.
- Recurring maintenance contracts, support plans, renewal dates and service entitlements.
- Customer invoices, receipts, payment tracking and outstanding balances.
- Document numbering, PDF generation, email delivery and audit history.

Keep this Qwerty internal CRM/sales area separate from tenant payroll records. A customer tenant may optionally have its own customer-facing subscription and invoice portal, but must never see Qwerty's other customers, internal margins, notes or proposals.

## 14.11 Decision gate
The working name should not be treated as final until Qwerty approves it and legal/domain checks are completed. The product architecture should store brand name, logos, theme tokens, support links and tenant display name as configuration so a name change does not require rewriting the domain model.
