---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-30
declaration_id: 2026-09-30-pos-remove-opis-backoffice-references
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.25
verification_evidence: POS unit 11 passed; OPIS unit 131 passed; focused shared boundary tests 3 passed; POS, OPIS, Storefront, and SKUpervisor builds passed; POS lint, architecture, ADR/docs, compatibility-seam, compliance, web-core reachability, frontend build-trigger, version-floor, and diff checks passed.
rollback_note: Revert the POS route and navigation cleanup, its boundary contracts, the compatibility-seam removal, ADR 0088, and this declaration together. No API, schema, migration, or production data changes are included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T17:58:06.019Z
preflight_request_ref: PREFLIGHT-36608223661-2026-09-30-POS-REMOVE-OPIS-BACKOFFICE-REFERENCES
---

# Remove OPIS Back Office References from POS

## Compliance Impact Classification

Major. The changed POS terminal frontend paths have a computed `major` floor for the `pos` and
`terminal` surfaces under `scripts/check-compliance-impact.js`. The change removes POS route and
navigation references to the Back Office and OPIS to match the current production baseline. It
does not alter POS permissions, transaction behavior, financial calculations, API behavior, or
tenant data.

## Affected Surfaces

- POS routes and the `/sales` handoff to SKUpervisor.
- POS terminal sidebar, lock drawer, and route-boundary contracts.
- OPIS remains independently accessible at its own app origin; its routes and session behavior do
  not change.

## Compliance Preconditions

- POS continues to use the existing POS app surface and session namespace.
- OPIS continues to use its independent app surface and session namespace.
- No API route, database schema, migration, payment, tax, receipt, shift, or compliance decision
  logic changes are included.
- No production environment or tenant data was changed.
- The live request-time preflight was not run for this develop-targeting PR. The `NOT-EXECUTED-*`
  reference is the expected PR-open state; the governed sweep reconciles it after merge to `develop`.

## Verification Evidence

- POS app unit suite: 11 passed; OPIS app unit suite: 131 passed.
- Focused shared POS boundary contracts: 3 passed.
- Production builds passed for POS, OPIS, Storefront, and SKUpervisor/IMS; POS lint passed.
- Architecture, ADR/docs lint, compatibility-seam, compliance, web-core reachability, frontend
  build-trigger, develop version-floor, and `git diff --check` gates passed.
- The complete `terminalViewModeContracts.test.js` file has 59 passing assertions and 6 existing
  checkout/workspace structural assertion failures unrelated to route navigation.
- No production environment or tenant data was changed.
