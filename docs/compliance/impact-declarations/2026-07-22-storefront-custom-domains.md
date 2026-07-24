---
status: reference
owner: engineering
last_reviewed: 2026-07-22
related_adr: docs/architecture/adr/0036-verified-storefront-custom-domains.md
declaration_id: 2026-07-22-storefront-custom-domains
classification: regulatory
surfaces: settings,compliance,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.22
verification_evidence: npm run check:compliance,npm run check:architecture,npm --prefix backend test -- --runTestsByPath tests/storefrontDomain.hostnamePolicy.test.js tests/storefrontDomain.dnsVerification.test.js tests/storefrontDomain.usecases.test.js tests/tenantHandler.storefrontDomain.test.js tests/corsPolicy.test.js,npm --prefix frontend run build:store
rollback_note: Suspend custom-domain rows and remove generated custom-host Nginx blocks; DGFY slug storefront URLs and all existing compliance controls remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-22T14:05:00Z
preflight_request_ref: DGFY-GRANDMATADOR-CUSTOM-DOMAIN
---

# Storefront Custom Domains

## Compliance Impact Classification

Regulatory by repository path floor because the authenticated route additions are
mounted in `backend/src/routes/adminTenants.js`. The new routes manage Storefront
hostnames only; they do not modify compliance mode, fiscal data, payment amounts,
tenant capabilities, or approval semantics.

## Affected Surfaces

The settings/compliance classification is triggered by the shared admin-tenant
router. Added endpoints require the existing `authenticateAdmin` middleware and
operate on new landlord-owned custom-domain and audit tables. Existing compliance
endpoints and handlers are unchanged.

## Compliance Preconditions

1. Only authenticated platform administrators can mutate a domain.
2. Every mutation requires an audit reason and records before/after evidence.
3. Active Premium eligibility, TXT proof, route proof, and external HTTPS health
   acknowledgement are required before activation.
4. Custom-host traffic cannot bypass tenant isolation or select a different store
   with `x-store-slug`.
5. No fiscal/BIR, statutory-discount, receipt, or compliance-mode data changes.

## Verification Evidence

The commands in front matter cover repository compliance classification, module
boundaries, hostname and DNS policy, lifecycle guards, host-bound tenant isolation,
CORS behavior, and the production Storefront build. Production DNS and certificate
cutover are explicitly outside this code change and require the operations runbook.
