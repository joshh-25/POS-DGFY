---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-15
declaration_id: 2026-09-15-pos-backoffice-consolidation
classification: regulatory
surfaces: pos,terminal,storefront,ims,inventory,identity,settings,compliance
reason_codes_impacted: DGFY_TENANT_SESSION_HANDOFF,AUTHORIZATION_FAILED,VALIDATION_FAILED,ALLOWED
policy_version: 2026.09.15
verification_evidence: POS, Storefront, and IMS full suites; shared route and handoff contracts; POS/Storefront/IMS lint/build; authenticated Masu Cafe migrated-module and IMS retirement-handoff browser verification; compliance/architecture/docs checks
rollback_note: Revert the Phase 370 POS Back Office modules, shared handoff/receiving boundary, Storefront links, IMS retirement routes, tests, documentation, and declaration together; no catalog, inventory, transaction, payment, user, or session data is rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T11:32:45.994Z
preflight_request_ref: PREFLIGHT-36561910280-2026-09-15-POS-BACKOFFICE-CONSOLIDATION
---

# POS Back Office merchant-surface consolidation

## Compliance Impact Classification

Major because the change moves the merchant-facing administrative route
boundary across independently deployed POS, Storefront, and IMS surfaces while
preserving tenant/session authority and existing inventory, procurement,
receiving, and operational command owners. The change does not recalculate
money, rewrite stock or fiscal history, copy credentials, or create a new
authorization store.

## Affected Surfaces

- POS Back Office catalog, suppliers, purchase orders, job orders, stock
  movements, dispatch orders, services, Food & Beverage, hospitality, sales,
  reports/settings entry points, and QR-based receiving.
- Storefront business inventory/company handoff and business-auth return paths.
- IMS legacy merchant URLs, which now render an authenticated POS handoff;
  IMS internal `/admin/*`, auth, invitation, and legal compatibility routes
  remain available.

## Compliance Preconditions

- POS and Storefront handoffs use the existing tenant/session exchange and
  browser-cookie authority. Tenant IDs and optional single-use handoff tokens
  are carried only into the governed POS company-selection hash route; caller
  input cannot choose an arbitrary origin or open redirect.
- Existing server membership, branch grants, section permissions, workflow
  gates, receiving-token validation, and canonical command owners remain
  authoritative. No client-side route handoff grants access.
- Shared migrated pages reuse the existing API services and inventory/procurement
  data owners. No database migration, credential store, catalog copy, or
  historical transaction rewrite is introduced.
- IMS platform-admin routes are not exposed through the merchant Back Office
  and are not removed by this migration.

## Verification Evidence

- POS migration contract passed (4 tests), and shared route/handoff contracts
  passed (29 tests).
- POS lint and production build passed (3,770 modules); Storefront full suite,
  lint, and production build passed; IMS lint and production build passed.
- The full IMS/shared suite passed (366 files, 2,383 tests), including the
  updated route-ownership and permission-parity contracts.
- Authenticated Masu Cafe browser verification rendered all 12 migrated module
  routes without page errors or failed requests, confirmed no horizontal
  overflow at 390px, and followed the IMS `/items` compatibility URL through
  POS company selection to `#/backoffice/catalog`. The IMS `/admin/tenants`
  route still presents its separate platform-admin login.
- Mobile QR receiving is covered by the POS production build and route
  contract; live token mutation was not performed. The local dependency
  install was restored without changing tracked manifests, so the IMS build
  and full IMS/shared suite now pass.

**Live request-time compliance preflight was not executed.** This declaration
uses the documented `NOT-EXECUTED-*` placeholder for local work; it must be
reconciled by the governed preflight process before promotion. No production
deployment, merge, push, or production data mutation was performed.
