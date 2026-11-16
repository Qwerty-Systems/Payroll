# 15. Responsive PWA and Qwerty commercial workspace

## 15.1 Responsive application
The same application supports desktop, tablet and mobile. Mobile is a first-class layout target. Responsive behavior is based on task and content density, not merely viewport scaling.

### Mobile
- Bottom navigation for high-frequency destinations; overflow drawer for administration.
- Large accessible tap targets and one-column forms.
- Worker/site selection optimized for touch and search.
- Attendance capture with minimal steps and explicit local timestamp/device context.
- Camera/file picker for authorized document attachments.
- Cards and compact lists instead of wide desktop grids.
- Sticky primary actions for save/submit where appropriate.
- Clear network and synchronization indicators.

### Tablet
- Two-column forms where space allows.
- Split list/detail layouts for supervisors.
- Site attendance and worker roster optimized for landscape and portrait.

### Desktop
- Persistent navigation, dense tables, keyboard workflows and multi-panel detail views.
- Bulk actions and export tools with explicit permissions.

## 15.2 PWA and installation
PWA is a required delivery target, not an optional enhancement. Provide manifest, icons, service worker, offline app shell, install instructions, update lifecycle and browser compatibility checks. Test Android Chrome, iOS Safari installation behavior and desktop Chromium browsers. Do not claim all browser capabilities are identical across platforms.

## 15.3 Offline capabilities
Offline support is a per-feature contract. Attendance capture and draft timesheets are initial candidates. Each offline screen must disclose whether data is cached, queued or server-confirmed. Use IndexedDB and an idempotent command outbox. For durable local-first operation at a site, provide a Docker-hosted local API and PostgreSQL. Browser-only storage cannot guarantee survival after storage eviction, device reset or app-data clearing.

## 15.4 Qwerty sales and delivery lifecycle
Lead -> qualified opportunity -> discovery -> proposal/quotation -> customer acceptance -> service agreement/SOW -> delivery project -> invoice -> payment -> support/maintenance renewal.

A proposal may contain scope, deliverables, milestones, assumptions, exclusions, dependencies, risks, pricing and validity. A quotation is a priced offer with line items, tax/discount details and expiry. Support revisions and approvals; never overwrite a sent/accepted version. Accepted proposal/quote may generate a delivery project and billing schedule.

## 15.5 Document generation
Generate branded PDF proposals, quotations, service agreements, invoices and receipts using approved Qwerty legal/company details and templates. Keep document versions, generated timestamp, author, approval and delivery history. Templates must be editable by authorized Qwerty administrators. E-signature integration is a later adapter and must not imply legal validity without appropriate review.

## 15.6 Qwerty internal versus tenant boundaries
Qwerty internal sales CRM, proposal costs/margins, delivery notes and customer support records are platform-owned data. Tenant payroll data remains tenant-owned. Use separate permissions and query boundaries. Do not expose internal Qwerty customer relationship data to tenant admins.
