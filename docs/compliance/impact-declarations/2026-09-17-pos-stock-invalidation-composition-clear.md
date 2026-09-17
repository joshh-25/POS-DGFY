---
status: draft_pr
owner: engineering
last_reviewed: 2026-09-17
declaration_id: 2026-09-17-pos-stock-invalidation-composition-clear
classification: major
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: npm --prefix apps/dgfy-api test -- --runTestsByPath tests/inventoryItemRepository.test.js (79 passed),npm --prefix apps/dgfy-api test -- --runTestsByPath tests/posCheckoutFnbContracts.usecase.test.js (40 passed),npm --prefix apps/dgfy-api test -- --runTestsByPath tests/catalogChangeEventBus.test.js tests/posHandlers.transport.test.js tests/posVoid.route.transport.test.js (43 passed),128 pos/inventory/composition/fnb suites (127 passed, 1003 tests; 1 pre-existing env failure unrelated),node --check on every changed apps/dgfy-api file,npm run check:architecture (guardrails + controller boundaries, passed),web-core posCatalogRealtime contract test (2 passed; no frontend source changed),npm run check:compliance (confirmed to fail first, then pass once this declaration was added)
rollback_note: Pure behavior revert with no migration and no schema change -- revert the three source files, the two test files, the version bump, and this declaration; no data repair needed because already-corrupted composition rows are only cleared on a subsequent explicit edit/finalize, never by this change itself.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-17T09:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PR-1952-POS-STOCK-INVALIDATION
---

# POS finished-product stock: authoritative composition clear + post-commit catalog invalidation (#1952)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `apps/dgfy-api/src/modules/pos/**` (`usecases/posUseCases.js`, `index.js`) -- `surfaces:
  pos,terminal`, floor `major`.
- `apps/dgfy-api/src/modules/inventory/**`
  (`repositories/itemRepository.js`) -- `surfaces: inventory`, floor `major`.

Not `regulatory`: no `modules/compliance/`, compliance routes/validators, tenant-admin, or
settings surfaces are touched.

**The "not payments, not fiscal" paragraph, stated explicitly rather than left as a bare
frontmatter contradiction:** no money behavior changes in this change. Payment breakdowns,
discount/voucher computation, fiscal document hashing, receipt contracts, eSales events,
and the affiliate commission accrual/reversal paths are untouched -- the checkout and void
lifecycles commit exactly as before, and the new invalidation publishes only *after* the
respective commit (via `afterCommit` for caller-owned checkout transactions). A publisher
or Redis failure is logged best-effort and can never turn a committed sale or void into a
failed request. `pos,terminal` appear in `surfaces` because the compliance gate's
`modules/pos/` rule attaches those surfaces to *any* touched file in that folder, not
because tender, fiscal, or terminal-identity behavior changes.

## Affected Surfaces

- POS checkout -- after a successful internally-owned commit, one tenant-scoped
  `pos.catalog.changed` invalidation (`reason: pos_sale_stock_changed`) carrying the
  unique effect-bearing item IDs (direct finished items, recipe ingredients, F&B modifier
  SKUs). Caller-owned transactions defer through `transaction.afterCommit`. Quote-only,
  failed, and idempotent-replay checkouts publish nothing.
- POS void -- after a successful void commit, one tenant-scoped `pos.catalog.changed`
  invalidation (`reason: pos_void_stock_changed`) carrying the reversed movement item IDs.
  Idempotent void replays publish nothing. Void reversal math, locations, and
  once-only semantics are unchanged.
- Inventory composition persistence -- an explicitly supplied `ingredients: []` or
  `packaging_items: []` on create/update/finalize now clears the corresponding
  `ProductComposition` rows atomically in the caller's transaction (ingredient clear also
  resets `nesting_level`/`max_child_depth` to zero and invalidates the dependency-graph
  cache). Omitted fields preserve existing rows exactly as before.
- POS catalog SSE consumers -- no client change: the event remains a refresh prompt and
  the location-filtered `GET /pos/catalog` read remains the single authoritative source
  (ADR 0055). The web-core realtime contract test guards this path unchanged.

## Compliance Preconditions

- Inventory remains the sole stock writer (ADR 0029 `[binding]` untouched): POS issues and
  reversals still flow exclusively through `issueStockForPosSale` / `returnStockForVoidedSale`;
  selected-location scope, row locking, idempotency keys, and the service / untracked /
  toggle / Always Available exemptions are unchanged (pinned by non-regression cases
  asserting exempt lines issue nothing and publish nothing).
- F&B recipe/modifier consumption policy is unchanged: recipe lines still consume
  ingredients (never the finished item) and modifiers still consume linked SKUs; the
  invalidation collects exactly those effect-bearing IDs, never raw line IDs.
- No migration, no response-shape change, no new route, no SSE authentication change.
- Already-corrupted tenant composition data (stale rows from before this fix) is out of
  scope: it is repaired only when the merchant next edits/finalizes that product with an
  explicit array, never by backfill in this change.

## Verification Evidence

See frontmatter `verification_evidence` (all actually executed, not just syntax-checked).
Residual risks honestly stated: DB-backed suites (`posCheckout.db.integration.test.js`,
`posSalesReconciliation.db.integration.test.js`, `voidMovement`, `e2e-full-cycle`) were
not run locally (no local MySQL in this environment; failures observed are
`SequelizeConnectionRefusedError`, identical on the clean tree) and are left to CI; the
new `publishCatalogChange` builder dependency defaults to null-safe no-op so every
pre-existing direct builder caller is behaviorally unchanged; four non-DB suite failures
observed in the wider matrix (`billingFunnelTelemetry` legacy, `authTenantIsolation`,
`reproduce_import_bypass`, two cashier-attendance migration suites) reproduce identically
on the clean tree via `git stash` comparison.
