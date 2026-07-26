---
status: reference
owner: engineering
last_reviewed: 2026-07-26
related_adr: docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md
declaration_id: 2026-07-26-unified-product-domain-phase6c-pos-weight-entry
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.26
verification_evidence: backend jest --runInBand targeted sweep of the touched contract test (modeItemTaxonomy.contract.test.js: 13/13 passed, including 2 new allowsDecimalQuantity cross-layer assertions),frontend vitest full suite (993 tests: 976 passed, 17 pre-existing failures confirmed unchanged via git-stash A/B comparison against the pre-PR baseline - the same unrelated storefront-discovery/follow/service-worker-manifest suites already documented in the Phase 6a+6b declaration) plus 3 new POS weight-entry contract tests and re-confirmation that numericStepperPolicy.contract.test.js's locked step-by-1 cart-line stepper contract still passes untouched,npm run check:architecture,npm run lint:docs,build:pos and build:skupervisor (both succeed)
rollback_note: Revert this PR's diff. The only new export is allowsDecimalQuantity in packages/shared-constants/src/uomConverter.js (pure, additive, zero existing callers changed). Both POS terminal files gate their manual-entry paths on this predicate; every item whose unit_of_measure is not in the weight/volume UOM groups continues through the exact pre-PR integer-only path (typed input still strips non-digits, still floors on commit; Skupervisor's cart-line quantity field still rounds to a whole number). No schema or API contract change - quantity has always been DECIMAL(24,12) server-side and Joi has always accepted any positive number: this PR only changes what the POS *frontend* lets an operator type, not what the backend accepts.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-26T10:24:00Z
preflight_request_ref: PHASE6-6C-WEIGHT
---

# Unified Product Domain — Phase 6c: POS Weight Entry (Decimal Quantity)

## Compliance Impact Classification

Major, per the `pos`/`terminal` surface floor triggered by
`frontend/src/features/pos/components/POSCheckoutTerminal.jsx` and
`SkupervisorPOSCheckoutTerminal.jsx` being compliance-sensitive files this PR touches. This PR closes
a gap ADR 0037 named: the backend and the retail `weighed_goods`/`refill_product` presets have always
been decimal-capable, but every manual POS quantity-entry path was integer-only, making a weighed item
(e.g. loose vegetables sold per kg) impossible to ring up at its actual weight. It also fixes the
opposite defect discovered during this phase's re-verification - the Skupervisor terminal's cart-line
quantity field accepted an unconditional decimal, including on plain per-piece items, with no
unit-of-measure guard at all. None of this touches fiscal document classification, tax computation,
receipt numbering, payment-provider settlement, or terminal identity/authorization - the change is
scoped entirely to what quantity value a POS operator is allowed to type, not to pricing, VAT, or
checkout flow.

## Affected Surfaces

- `packages/shared-constants/src/uomConverter.js` (not itself compliance-sensitive per the current
  pattern list, included here since it's the shared predicate both terminals gate on): adds
  `allowsDecimalQuantity(uom)`, a pure, additive export - `['weight', 'volume'].includes(getUomGroup(uom))`.
  No existing export's behavior changes.
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` (`pos`, `terminal`): the single typed
  manual-quantity input (mobile catalog-card view) now accepts a decimal point when
  `allowsDecimalQuantity(item.unit_of_measure)` is true, via a new `sanitizeQuantityInput` helper that
  replaces the previous unconditional `.replace(/[^0-9]/g, '')` filter; the commit path
  (`commitManualCartQuantity`) uses `round4` instead of `Math.floor` for decimal-eligible items only.
  For every non-weight/volume item (the overwhelming majority of the catalog), both paths are
  byte-identical to before - confirmed by the new contract test asserting the digits-only branch is
  still reachable and by the unchanged `numericStepperPolicy.contract.test.js` assertions. The +/-1
  quantity steppers and the long-press quantity meter are **not** touched - they stay integer-only in
  both terminals, matching ADR 0037's "manual entry first, scale hardware later" decision; a precise
  weight is typed, not stepped or dragged.
- `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx` (`pos`, `terminal`): the
  cart-line `Qty` field's `min`/`step` now switch between `0.0001` and `1` based on
  `allowsDecimalQuantity(line.unit_of_measure)`, and its `onChange` handler now floors the typed value
  to a whole number for non-decimal items instead of accepting whatever was typed unconditionally. This
  is strictly a tightening (closes a pre-existing gap that let a `pcs`-unit line be saved as e.g.
  `3.5`), not a new capability grant.

## Compliance Preconditions

1. `allowsDecimalQuantity` must classify only the `weight` and `volume` UOM groups as decimal-eligible
   - verified by a new cross-layer test in `modeItemTaxonomy.contract.test.js` asserting `true` for
   `kg/g/mL/L/gal` and `false` for `pcs/serving/booking/bottle/pack/dozen` identically in both the
   backend and frontend copies of `uomConverter.js` (both re-export the same
   `packages/shared-constants` source, so this also guards against future drift if either wrapper is
   ever changed to something other than a pure re-export).
2. The DGFY terminal's cart-line `-1`/`+1` steppers must remain locked at step-by-1 - verified by
   `numericStepperPolicy.contract.test.js`, which this PR does not modify and which still passes.
3. `sale_price`, VAT fields, and every other `pos_transaction_lines` field remain untouched by this PR
   - confirmed by inspection of every diff hunk; the only field this PR changes what-can-be-typed for
   is `quantity`, and only its frontend entry surface, not its backend validation or persistence.

## Verification Evidence

1. Backend: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs
   --runInBand tests/modeItemTaxonomy.contract.test.js` - 13 passed, 0 failed (includes 2 new
   `allowsDecimalQuantity` cross-layer assertions added by this PR).
2. Frontend: `npx vitest run` full suite - 976 passed, 17 failed. All 17 failures were confirmed
   pre-existing via `git stash` A/B comparison and are identical to the set already documented in the
   Phase 6a+6b compliance declaration (`2026-07-26-unified-product-domain-phase6-composed-capabilities.md`)
   - none touch any file this PR changes.
3. `npm run check:architecture` - `[ArchitectureGuardrails] OK. Checked 37 modules and 362 code
   files.` / `[ControllerBoundary] OK. Checked 75 controller files with no unauthorized model
   imports.`
4. `npm run lint:docs` - `[docs-lint] OK. Validated 21 governed docs.`
5. `npm run build:pos` and `npm run build:skupervisor` - both complete successfully.
