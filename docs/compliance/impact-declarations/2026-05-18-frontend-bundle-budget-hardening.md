---
status: reference
owner: engineering
last_reviewed: 2026-05-18
declaration_id: 2026-05-18-frontend-bundle-budget-hardening
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.05.18
verification_evidence: npm --prefix frontend run build,npm run check:frontend-budgets,npm run check:compliance
rollback_note: Revert the frontend chunking and POS copy compaction changes. No backend state or POS transaction contract changes are introduced by this slice.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-18T00:00:00+08:00
preflight_request_ref: FRONTEND-BUNDLE-BUDGET-HARDENING-2026-05-18
---

# Frontend Bundle Budget Hardening

## Compliance Impact Classification

Regulatory.

This declaration covers frontend-only release hardening that isolates the lazy MapLibre bundle, keeps bundle warnings meaningful, and shortens visible POS terminal helper copy so the checkout route remains within the governed route budget. Because the enforced branch-wide compliance gate also includes the already-committed registration and Settings changes on this release branch, the declaration carries the computed `settings` and `compliance` footprint as well. It does not change checkout calculations, compliance decisions, receipt contracts, payment routing, or persisted transaction data.

## Affected Surfaces

- The POS terminal keeps the same checkout behavior while using shorter helper and feedback messages.
- Frontend bundling isolates the lazy MapLibre dependency from the main vendor chunk.
- The frontend budget script keeps the dedicated MapLibre chunk exempt only within the governed lazy-load ceiling and still warns on other large chunks.

## Compliance Preconditions

1. POS checkout calculations, idempotency, receipt behavior, and compliance policy decisions remain unchanged.
2. Any MapLibre size allowance must stay scoped to the lazy `vendor-maplibre-*` chunk rather than muting broader vendor growth.
3. The release still passes the frontend build, frontend budget gate, and compliance gate before deployment.

## Verification Evidence

- `npm --prefix frontend run build`
- `npm run check:frontend-budgets`
- `npm run check:compliance`
