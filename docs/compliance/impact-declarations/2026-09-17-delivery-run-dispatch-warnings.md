---
status: draft_pr
owner: engineering
last_reviewed: 2026-09-17
declaration_id: 2026-09-17-delivery-run-dispatch-warnings
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: apps/dgfy-api/tests/deliveryRunDispatch.usecase.test.js,apps/dgfy-api/tests/deliveryRunRoutes.transport.test.js,packages/web-core/src/features/pos/__tests__/deliveryRunLoading.behavior.test.jsx,packages/web-core/src/features/pos/__tests__/deliveryRunDispatch.behavior.test.jsx,npm run check:architecture,npm run lint:docs,npm run check:compliance,npm run build:pos,npm run build:skupervisor,git diff --check
rollback_note: Revert the dispatch warnings wiring, POS summary rendering, docs, and this declaration; the legacy loading_warning surface and all dispatch behavior remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-17T08:00:00+00:00
preflight_request_ref: NOT-EXECUTED-ISSUE-1927-DELIVERY-RUN-DISPATCH-WARNINGS
---

# Delivery-run dispatch canonical warnings (#1927)

## Compliance Impact Classification

Major. The change touches `apps/dgfy-api/src/modules/pos/` (dispatch use case response shape)
and `packages/web-core/src/features/pos/` (dispatch summary rendering), which the repository
compliance guardrail classifies at the `major` floor for the `pos` and `terminal` surfaces. It
adds warn-only response information to an existing authenticated dispatch endpoint; it does not
change payment capture, fiscal records, tenant authorization boundaries, provider-owned delivery
behavior, order completion authority, permissions, or packing/dispatch gates.

## Affected Surfaces

1. Successful `POST /pos/delivery-runs/:deliveryRunId/dispatch` response: additive
   `data.warnings` array (`pos_transaction_id`, exact `loading_state`, `exception_reason` on
   `exception` entries only), derived from the dispatch-time member snapshot.
2. The preserved legacy `data.loading_warning` compat object and the `delivery_run_dispatched`
   audit event (gains an additive `warnings_count`).
3. POS shared dispatch summary (`DeliveryRunDispatchSummary`), which renders `warnings` when
   present and falls back to `loading_warning` for older responses.

## Compliance Preconditions

1. Dispatch remains warn-only per ADR 0034. Warnings never block dispatch, never turn a
   best-effort success into an error, and never reclassify `dispatched`/`skipped`/`failed`.
   `pending` stays distinct from `not_loaded`; no new 409 or error code is introduced.
2. No new route, permission, database column, or migration. The endpoint keeps its existing
   `pos:transact` authority, tenant/location scoping, audit events, and two-layer idempotency;
   same-key replays return the identical warnings payload.
3. The response exposes only operational loading facts already visible to the same actor via the
   run detail endpoint -- no tenant-internal storage details, credentials, or cross-tenant data.

## Verification Evidence

- Mixed `pending`/`not_loaded`/`exception`/`loaded` dispatch returns one warning per unresolved
  member with the exact state and exception reason; all-loaded dispatch returns `[]`.
- Warnings do not alter `failed`/`skipped` classification; same-key replay is identical; the
  transport envelope stays `success: true` with warning data under `data`.
- POS behavior tests cover canonical rendering, the empty case, and the legacy fallback.
- Architecture, docs/ADR lint, compliance impact, POS/SKUpervisor builds, and whitespace gates
  pass; deployed QA (mixed-state and all-loaded runs) is a later verification step owned by the
  repository's verifier flow, not this change.
