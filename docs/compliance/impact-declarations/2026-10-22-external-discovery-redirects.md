---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-23
related_adr: docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md
declaration_id: 2026-10-22-external-discovery-redirects
classification: regulatory
surfaces: pos,settings,compliance
reason_codes_impacted: AUTHORIZATION_FAILED,VALIDATION_FAILED,RESOURCE_NOT_FOUND,CONFLICT
policy_version: 2026.10.16
verification_evidence: Focused API Jest and Storefront Vitest suites,Admin and Storefront builds,API syntax and architecture checks,MySQL 8 migration round trip,docs lint,compliance gate
rollback_note: Revert the Admin, API, and Storefront code together. Leave the additive landlord table and origin column in place if configured destinations or pins exist; an explicit data-preserving migration plan is required before dropping them.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-23T02:51:04.020Z
preflight_request_ref: PREFLIGHT-LOCAL-1792723752571-2026-10-22-EXTERNAL-DISCOVERY-REDIRECTS
---

# External discovery redirects (#2629)

## Compliance Impact Classification

Regulatory is the computed floor because `apps/dgfy-admin/src/services/adminService.js` is a settings and compliance surface. `apps/dgfy-api/src/middleware/auth.js` adds an explicit master-only route policy and is classified for POS and settings by the path matrix. This change does not modify POS operations, payment capture, tax, settlement, or tenant permissions.

## Affected Surfaces

- `settings`, `compliance` — Platform Admin management in **External Map Pins** of partner destination templates and external pin metadata, with audited writes through the new Admin service methods.
- `pos` — classification triggered by the shared auth middleware path only; the change adds a master-only Admin route and does not change POS route authorization.
- Public Storefront discovery — external partner pins and a server-resolved outbound redirect; no DGFY booking, checkout, dispatch, or application submission.

## Compliance Preconditions

- Only an authenticated master Platform Admin may configure a partner site or write/remove external pins. The route uses the existing Admin cookie and CSRF protection.
- The public redirect accepts a DGFY slug only, fetches an existing visible external listing, requires an enabled configured site, and substitutes an encoded source ID into one approved HTTPS template. It never accepts a caller-supplied destination URL.
- Public discovery omits the internal partner record ID. Existing native storefront routes and records are unchanged; a native slug cannot be overwritten by an external pin.
- `event_seed` cleanup deletes only temporary rows for the four configured partners. Manual external rows and Admin site configurations remain.
- The local request-time preflight completed with `no_breach` and the `PREFLIGHT-LOCAL-*` reference above. Production configuration and destination templates remain subject to operator verification after deployment.

## Verification Evidence

Focused API tests pass for template validation, ID encoding, disabled/hidden failures, stable links, legacy links, and input rejection. Storefront tests pass for all four partner pin types and actions. Admin and Storefront production builds, API JavaScript syntax, architecture and controller boundary checks, and docs/ADR lint pass. The migration passed an up/up/down round trip on a disposable MySQL 8 container. The local request-time preflight reported `no_breach`. Source exports were read only to generate an ignored, allow-listed local seed file; neither the exports nor that file is committed. No real partner destination has been configured and no deployed environment has been changed. The operator reviews the migration and declaration in the PR before merge.
