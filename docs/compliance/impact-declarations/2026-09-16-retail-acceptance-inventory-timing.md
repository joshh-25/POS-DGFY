---
status: reference
owner: engineering
last_reviewed: 2026-09-16
declaration_id: 2026-09-16-retail-acceptance-inventory-timing
classification: major
surfaces: pos,terminal,payments,inventory,store
reason_codes_impacted: INVENTORY_REVERSAL_UNAVAILABLE
policy_version: 2026.09.16
verification_evidence: apps/dgfy-api/tests/posOnlineInventoryReservationLifecycle.unit.test.js -- actually executed (Jest): Retail accept issues once at placed -> confirmed (ASAP and scheduled-for-later), non-Retail accept issues nothing, completion skips when evidence set and still deducts for legacy orders without it, retry with a different idempotency key issues exactly once,apps/dgfy-api/tests/storeCancelInventoryReversal.unit.test.js -- actually executed (Jest): post-acceptance customer cancel reverses once with inventory_reversed_at, pre-acceptance cancel/non-Retail/already-reversed never reverse, reversal failure rolls back the whole cancel,apps/dgfy-api/tests/addRetailAcceptanceInventoryEvidence.migration.test.js -- actually executed (Jest): tenant fan-out adds both columns once per DB, idempotent, down drops exactly both,node --check on every changed apps/dgfy-api file and the new migration file,npm run build:store (real Vite build, succeeded),npm run build:pos (real Vite build, succeeded -- packages/web-core is the shared trunk),npm run check:architecture (guardrails + controller boundaries, passed),npm run lint:docs (passed),npm run check:compliance (confirmed to fail first, then pass once this declaration was added)
rollback_note: The two pos_transactions columns (inventory_issued_at, inventory_reversed_at) are nullable and additive -- down() is pure at the schema level for those, the only data loss on rollback is the evidence timestamps themselves. Do NOT roll back while post-deploy Retail orders exist in confirmed-or-later with these columns set: a rolled-back order reads as never-issued and re-issues at completion (double deduction). No ENUM widening in this change, so down() is symmetric unlike Phase 211.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-16T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1931-RETAIL-ACCEPTANCE-INVENTORY-TIMING
---

# Retail orders: deduct stock at acceptance and reverse once on post-acceptance cancel/reject (#1931)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `apps/dgfy-api/src/modules/pos/**` (`posUseCases.js`) -- `surfaces: pos,terminal`, floor `major`.
- `apps/dgfy-api/src/modules/store/**` (`storeUseCases.js`, `store/index.js`) -- `surfaces:
  payments`, floor `major`. **`payments` is listed in this declaration's frontmatter purely
  because the gate mechanically demands it for any touched `modules/store/` file** -- see the
  explicit "not a real money-path change" paragraph below.
- `apps/dgfy-api/src/modules/inventory/**` (`commands/stockCommandService.js`,
  `contracts/stockCommandService.contract.js`) -- `surfaces: inventory`, floor `major`.
- `packages/web-core/src/features/pos/**` (`pages/TerminalPage.jsx`) -- `surfaces:
  pos,terminal`, floor `major`.

`surfaces` also lists `store` (voluntary, not mechanically enforced) because
`apps/dgfy-storefront/**`'s Retail checkout now submits the customer's actual schedule choice
(`scheduled_for`) instead of silently submitting ASAP. Not `regulatory`: no
`modules/compliance/`, compliance routes, or tenant-admin surfaces are touched.

**The "not payments" paragraph, stated explicitly rather than left as a bare frontmatter
contradiction:** no money behavior changes in this change. The cancel path's
`commerceOrderLifecycleUseCase` trigger set (`completed`/`rejected`/`cancelled`) and the
affiliate-settlement outcome map are untouched -- a Retail accept never runs a refund,
capture, or settlement path, and the reversal moves only physical stock (goods-issue void),
never money. `payments` appears in `surfaces` only because the compliance gate's
`modules/store/` rule attaches that surface to *any* touched file in that folder.

`related_adr`: ADR 0029, amended in this same change (dated `## Amendment (2026-09-16)` block,
`status: amended`, `last_reviewed` refreshed) per ADR 0039/`ARCHITECTURE_GOVERNANCE.md` -- the
2026-08-21 Amendment's completion-time sentence is `[default]`-tier, so an amendment block (not
a superseding ADR, no tech-lead approval) is the correct path. No `[binding]` clause changes.

## Affected Surfaces

- POS terminal incoming-orders queue (staff Accept/Reject) -- Retail accept-time goods-issue,
  one-time `inventory_issued_at` evidence, one-time `inventory_reversed_at` evidence on
  post-acceptance reject, inventory-display refresh after a Retail accept.
- Storefront Retail checkout -- schedule toggle now writes the shared
  `fnbScheduleMode`/`fnbScheduledFor` state, so `scheduled_for` reaches quote, order
  submission, and the online-payment-session path (previously silent ASAP).
- Inventory ledger -- new `reverseOnlineOrderGoodsIssue` named command (void semantics with
  the batch-consumed-downstream guard, transaction-aware); `voidMovement` gains an optional
  caller-owned transaction parameter (default preserves current behavior for every existing
  caller).
- Tenant schemas -- two additive nullable `pos_transactions` columns
  (`inventory_issued_at`, `inventory_reversed_at`), via migration
  `20260916000001-add-retail-acceptance-inventory-evidence.cjs` kept in lockstep with
  `apps/dgfy-api/scripts/sync-tenant-schemas.js` (self-repair for restored/new tenants).

## Compliance Preconditions

- Cancellation/rejection eligibility windows are unchanged (`placed`/`confirmed`-only
  customer cancel; `placed -> rejected` / `confirmed -> rejected` staff reject). The reversal
  rides those windows; it does not widen them.
- Payment/refund rules are unchanged (see "not payments" above).
- Non-Retail workflow modes keep byte-for-byte completion-time behavior (pinned by
  non-regression test cases asserting no issue, no convert, and no evidence stamp on
  non-Retail accept/reject).
- Fail-closed everywhere: insufficient stock or any inventory failure rolls back the
  order-status change; any reversal failure rolls back the cancel/reject; a missing
  reversal command surfaces `INVENTORY_REVERSAL_UNAVAILABLE` (409) instead of silently
  skipping the restore.

## Verification Evidence

See frontmatter `verification_evidence` (all actually executed, not just syntax-checked).
Residual risks honestly stated: DB-backed suites (`voidMovement.test.js`,
`e2e-full-cycle.test.js`) and the Playwright storefront/POS suites were not run locally (no
local DB/browser in this environment) and are left to CI; the `voidMovement` transaction
parameter is additive-optional so existing callers are behaviorally unchanged; the POS
inventory-display refresh reuses the existing post-sale `refreshOperationalContext` call
rather than a new mechanism (no dedicated catalog invalidation exists after a sale to reuse
-- verified by code inspection, stated in the code comment).
