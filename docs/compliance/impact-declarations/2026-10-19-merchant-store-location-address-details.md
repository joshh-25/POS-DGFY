---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-19
declaration_id: 2026-10-19-merchant-store-location-address-details
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.19
verification_evidence: focused dgfy-api tenant-location validator, use-case, registration materialization, tenant-schema registry and fan-out migration tests; web-core helper, field, onboarding and Storefront settings controller tests; Storefront registration tests; IMS, POS, Storefront and OPIS production builds; architecture, docs/ADR and tenant-schema coverage gates; eslint on changed frontend files
rollback_note: Revert the store-location details field, its helpers, the tenant-location API acceptance, registration materialization copy, tenant-schema registry entry, focused tests, docs and this declaration together. The nullable tenant_locations.address_details column may stay in place (unused) or be removed with the migration's down step; address_line already holds the full display address, so no reader depends on the column.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-19T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2026-10-19-MERCHANT-STORE-LOCATION-ADDRESS-DETAILS
---

# Merchant store-location street number, unit and building

## Compliance Impact Classification

Major because the change touches shared POS paths (`packages/web-core/src/features/pos/`) that
carry the repository's major classification floor for the `pos` and `terminal` surfaces. The
change adds a required "Street no., unit, floor or building" field to the store-location editors
(POS tenant setup and Storefront settings, plus onboarding and business registration) and stores
it in a new nullable `tenant_locations.address_details` column. It does not touch payments,
pricing, inventory, permissions, terminal identity, shift or cash-drawer behavior.

## Affected Surfaces

- `pos` — POS tenant setup's business-location step and the Storefront settings branch editor
  show and require the details field, and save it with the location.
- `terminal` — no terminal behavior changes; listed because the shared POS path floor names it.

## Compliance Preconditions

- `address_line` stays the full display address (`<details>, <location>`), so every existing
  reader (Storefront, discovery, receipts, POS lists) is unchanged.
- The API keeps `address_details` optional (at most 255 characters, trimmed, blank stored as
  `null`); older clients and locations saved before the column existed stay valid.
- Map and search suggestions fill only the location part and never write the details, so ADR
  0013's binding rule that a suggestion must not overwrite merchant-edited address text holds.
- The schema change is additive and nullable with no backfill. It is applied to the landlord
  connection and every active tenant schema by a reviewed migration and is registered in
  `sync-tenant-schemas.js`; no tenant DDL runs without the existing approval controls.
- No permission, route classification, payment, or audit behavior changes.
- A live compliance preflight was not run in this local PR workspace; the `NOT-EXECUTED-*`
  reference is the repository's accepted PR-open state and is expected to be reconciled by the
  compliance sweep after the declaration reaches `develop`.

## Verification Evidence

- dgfy-api: tenant-location validator, create normalization, tenant-schema registry entry, fan-out
  migration (landlord plus tenants, idempotent, unsafe identifier rejected, down drops only where
  present) and approved-registration copy — 9 new tests; related tenant-location, registration and
  tenant-schema suites 156/156 passed.
- web-core: combine/split helpers, the details field (required, errors, disabled, preview),
  onboarding save blocked without details, and the Storefront settings controller split on edit
  all passed; no new failures against the `develop` baseline.
- Storefront business registration tests passed with the new required field.
- IMS, POS, Storefront and OPIS production builds passed.
- Architecture, docs/ADR lint and tenant-schema registry coverage gates passed.
