---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-21
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-10-21-admin-storefront-visibility-authority
classification: regulatory
surfaces: settings,compliance,payments,pos,terminal
reason_codes_impacted: STORE_NOT_VISIBLE,STORE_VISIBILITY_EDIT_PLATFORM_CONTROLLED,AUTHORIZATION_FAILED
policy_version: 2026.10.16
verification_evidence: focused API Jest and frontend Vitest suites,API JavaScript syntax checks,Admin/IMS/POS/OPIS/Storefront builds,npm run check:architecture,npm run lint:docs,npm run check:compliance,node scripts/check-app-version-bump.js
rollback_note: Revert the API visibility gate, edit-authority policy and UI, tests, and ADR/API documentation together. Existing tenant settings rows may remain harmlessly unused; no migration or payment record is removed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-21T10:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2026-10-21-ADMIN-STOREFRONT-VISIBILITY-AUTHORITY
---

# Platform Admin storefront visibility and merchant edit authority (#2633)

## Compliance Impact Classification

Regulatory floor: `apps/dgfy-admin/Pages/TenantManager.jsx` is a settings and compliance
surface in the classification matrix. The public DGLaundry payment-session route is a
payments surface, and shared POS settings plus legacy IMS Settings affect settings,
POS, and terminal surfaces. The change restricts access and merchant authority; it
does not change payment capture, tax calculation, settlement, or terminal operations.

## Affected Surfaces

- `settings`, `compliance` — audited Platform Admin policy and Storefront / Maps controls;
  merchant Settings and onboarding writes.
- `payments` — deny creation of new Storefront/DGLaundry payment sessions when hidden;
  allow reads/cancellation of existing sessions and provider callbacks.
- `pos`, `terminal` — shared Storefront settings UI and IMS compatibility editor only;
  checkout and terminal operations are unchanged.

## Compliance Preconditions

- `store_is_visible` stays the only effective public state. The new tenant-local key
  controls merchant edit authority only and defaults to editable when missing.
- Public denials use `404 STORE_NOT_VISIBLE` with `Cache-Control: no-store` for known
  tokens and slugs. Existing-order and payment callbacks retain narrow access.
- Tenant Settings and onboarding reject changed visibility when locked; Platform Admin
  visibility writes remain audited and independent of the policy.
- The `NOT-EXECUTED-*` reference is the repository's develop-PR placeholder for the
  request-time preflight sweep. No live compliance preflight has been executed here;
  the sweep must reconcile it before production promotion.

## Verification Evidence

Focused API Jest suites passed for the public route gate, known-token router mount,
Settings and onboarding write guards, capability PATCH readback, validator, and
alias resolver. Admin capability Vitest passed (11 tests); the four selected
web-core/IMS Vitest files passed (91 tests). API JavaScript syntax checks,
the Admin, IMS, POS, OPIS, and Storefront production builds, architecture and
docs/ADR gates, staged compliance and app-version gates, and staged whitespace
check passed. Local mocked Admin browser proof passed at desktop and mobile viewports with
no page errors and the reason-required confirmation opening. Merchant OPIS
browser proof and STAGING Off/On checks remain for post-merge verification; no deployed environment was changed here.
The operator approved this classification and declaration on 2026-10-21 before commit.
