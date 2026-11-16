# 9. Security and privacy

## 9.1 Threat model
Protect worker personal data, payroll, bank/payment references, company records and platform billing. Threats include cross-tenant access, compromised credentials, insecure offline devices, malicious uploads, replayed sync commands, webhook forgery, privilege escalation and accidental disclosure in logs/exports.

## 9.2 Authentication
Use modern password hashing (Argon2id preferred), email/invitation verification, refresh-token rotation, session revocation and MFA for privileged roles. Rate-limit login/reset endpoints and use generic account recovery responses. Store only hashed refresh/reset token material.

## 9.3 Authorization and tenant isolation
Deny by default. Check permission and resource scope in application services. Enforce tenant context in repositories and PostgreSQL RLS. Validate access for nested resources, file downloads, reports, exports and background jobs. Audit platform support access.

## 9.4 Data protection
TLS everywhere. Encrypt database volumes, backups and object storage. Keep secrets in environment/secret manager, never source code or frontend bundles. Redact identity numbers, bank details, tokens and sensitive payloads from logs. Define data retention and deletion workflows.

## 9.5 Input and file handling
Validate DTOs, parameterize queries, constrain upload size/type, scan uploaded files where available, use random object keys and private buckets. Serve downloads through short-lived authorized URLs. Apply CSP, secure cookies where used, CSRF protections and security headers.

## 9.6 Operational security
Pin dependencies and scan for vulnerabilities. Use non-root containers, read-only filesystems where practical, minimal base images, health checks and network segmentation. Restrict PostgreSQL exposure to internal networks. Back up encryption keys separately and test restore procedures.

## 9.7 Audit
Record authentication/security events, role changes, worker/contract changes, attendance approvals, payroll calculations/finalization, payment state transitions, invoice issuance/credit, exports and support access. Audit data must be append-only to normal application roles.

## 9.8 Incident response
Document credential rotation, device revocation, tenant containment, backup restore, evidence preservation and customer notification procedures. Provide an operator runbook before production launch.
