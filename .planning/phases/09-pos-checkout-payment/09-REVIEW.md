---
phase: 09-pos-checkout-payment
reviewed: 2026-07-14T02:04:21Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - apps/dgfy-api/src/config/architectureGuardrailsAllowlist.js
  - apps/dgfy-api/src/infra/deviceBridgeClient.js
  - apps/dgfy-api/src/infra/tenantConnector.js
  - apps/dgfy-api/src/models/Tenant/Availment.js
  - apps/dgfy-api/src/models/Tenant/AvailmentDiscount.js
  - apps/dgfy-api/src/models/Tenant/AvailmentItem.js
  - apps/dgfy-api/src/models/Tenant/ComplianceEvidence.js
  - apps/dgfy-api/src/models/Tenant/Payment.js
  - apps/dgfy-api/src/models/Tenant/Receipt.js
  - apps/dgfy-api/src/modules/availments/README.md
  - apps/dgfy-api/src/modules/availments/controllers/availmentController.js
  - apps/dgfy-api/src/modules/availments/entities/availmentEntity.js
  - apps/dgfy-api/src/modules/availments/index.js
  - apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js
  - apps/dgfy-api/src/modules/availments/repositories/complianceEvidenceRepository.js
  - apps/dgfy-api/src/modules/availments/routes.js
  - apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js
  - apps/dgfy-api/src/modules/availments/usecases/complianceEvidenceUseCases.js
  - apps/dgfy-api/src/modules/availments/usecases/money.js
  - apps/dgfy-api/src/modules/compliance/usecases/complianceGate.js
  - apps/dgfy-api/src/modules/inventory/index.js
  - apps/dgfy-api/src/modules/inventory/repositories/inventoryMovementRepository.js
  - apps/dgfy-api/src/modules/inventory/usecases/inventoryMovementUseCases.js
  - apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js
  - apps/dgfy-api/src/routes/index.js
  - apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js
  - apps/dgfy-api/tests/integration/availments/finalize.test.js
  - apps/dgfy-api/tests/integration/availments/finalizeLive.test.js
  - apps/dgfy-api/tests/integration/commerce/commerceModulesMount.test.js
  - apps/dgfy-api/tests/unit/modules/availments/availmentUseCases.test.js
  - apps/dgfy-api/tests/unit/modules/availments/money.test.js
  - apps/dgfy-api/tests/unit/modules/inventory/recordSale.test.js
  - apps/dgfy-api/tests/unit/modules/shifts/findOpenShift.test.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260713120000-create-availment-checkout.cjs
findings:
  critical: 2
  warning: 5
  info: 0
  total: 7
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-07-14T02:04:21Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

This is a retroactive review of Phase 9 (POS Checkout & Payment) — the money/tax/discount
engine, payment recording, and `finalizeAvailment` atomic-persist orchestration. The
transaction-atomicity discipline in `AvailmentRepository.finalizePersist` is solid: the row
lock (`transaction.LOCK.UPDATE`) correctly guards double-finalize, sale effects are recorded
inside the same transaction and any non-success result throws to roll everything back
(`WARNING-1` in the code's own comments), and the append-only triggers on `payments`/`receipts`
are backed by both application hooks and DB `SIGNAL` triggers.

However, two BLOCKER-class defects were found, both in the highest financial-correctness-stakes
path (discount application / finalize):

1. Several ENUM-backed usecase inputs (`discount_type`, `stock_effect_type` override,
   `requested_document_context`) are never validated against their allowed value sets before
   reaching the DB. An invalid value throws a Sequelize validation error that
   `AvailmentRepository.withModel`'s catch-all silently re-wraps into a misleading 503 "tenant
   database unreachable" instead of a 400. This is the *exact* bug class the codebase's own
   comments say was found and fixed for `fulfillmentMode` in the Phase 11 review (CR-01) — but
   the fix was never generalized to its sibling ENUM inputs introduced in this phase.
2. `buildApplyDiscountUseCase` / `money.js` never validate that a discount's `amount`/`percent`
   is non-negative or within a sane range, and the DB schema has no CHECK constraint either. A
   negative discount amount is not floored by `computeAvailmentTotals`'s `Math.min()` cap (which
   only bounds the *upper* end), so a caller can inflate a customer's total beyond the subtotal.
   Any active member (not just staff with manual-discount permission) can do this via
   `discountType: 'promo_code'` or `'sc_pwd'`, which require no reason/permission check at all.

## Critical Issues

### CR-01: ENUM-backed inputs reach the DB unvalidated and get masked as a 503 "tenant database unreachable" instead of a 400

**File:** `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js:379-399` (discount_type),
`apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js:180-241` and `:248-284`
(stock_effect_type override), `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js:608-655`
(requested_document_context)

**Issue:** `buildApplyDiscountUseCase` only checks that `discountType` is truthy
(`if (!discountType) { ... }`, line 382) — it never validates it against the DB's
`ENUM('promo_code', 'manual', 'sc_pwd')` (`AvailmentDiscount.js:52`,
migration `20260713120000-create-availment-checkout.cjs:270-273`). Likewise
`buildAddLineUseCase`/`buildUpdateLineUseCase` accept a caller-supplied `stockEffectType`
override with no check against `ENUM('inventory_issue', 'stock_exempt')`
(`AvailmentItem.js:83`), and `buildFinalizeAvailmentUseCase` accepts
`requestedDocumentContext` (defaulted from `body.requested_document_context` in
`availmentController.js:141`) with no check against `ENUM('fiscal', 'non_fiscal')`
(`Availment.js:161`) before it is written into `header.document_context` and persisted at
`availmentRepository.js:476`.

When any of these bad values reaches `Sequelize.create()`/`.update()`, Sequelize's own
attribute-level ENUM validation throws a `SequelizeValidationError`. That error is not one of
the five whitelisted domain errors `AvailmentRepository.withModel`'s catch clause checks for
(`availmentRepository.js:169-175`):

```js
} catch (error) {
    if (
        error instanceof TenantDatabaseUnavailableError
        || error instanceof AvailmentNotFoundError
        || error instanceof AvailmentFinalizedError
        || error instanceof AvailmentLineNotFoundError
        || error instanceof NoOpenShiftError
    ) {
        throw error;
    }
    throw new TenantDatabaseUnavailableError(
        'unreachable',
        'Unable to reach the tenant database for this business.'
    );
}
```

So it is silently rewrapped into `TenantDatabaseUnavailableError('unreachable', ...)`, which the
usecase layer's `mapTenantDatabaseError` then turns into a 503 Service Unavailable — a completely
misleading response for what is actually a 400 client input error. Note the code's own comment
at `availmentUseCases.js:642-655` explicitly documents this exact bug class being found and
fixed for `fulfillmentMode` in the Phase 11 review (11-REVIEW.md CR-01):

> "An out-of-set value used to surface as a misleading 503 'tenant database unreachable'
> ... instead of a clean 400."

That fix (an explicit `FULFILLMENT_MODES.includes(...)` allowlist check before the value is
threaded into the repository) was never applied to `discount_type`, `stock_effect_type`, or
`requested_document_context`, all of which are equally client-controlled ENUM-backed columns
introduced in this same phase.

**Fix:** Add explicit allowlist checks mirroring the `FULFILLMENT_MODES` pattern already used for
`fulfillmentMode`:

```js
// availmentUseCases.js
const DISCOUNT_TYPES = Object.freeze(['promo_code', 'manual', 'sc_pwd']);
const STOCK_EFFECT_TYPES = Object.freeze(['inventory_issue', 'stock_exempt']);
const DOCUMENT_CONTEXT_VALUES = Object.freeze([DOCUMENT_CONTEXTS.FISCAL, DOCUMENT_CONTEXTS.NON_FISCAL]);

// in buildApplyDiscountUseCase, after the existing `!discountType` check:
if (!DISCOUNT_TYPES.includes(discountType)) {
    return ApplicationResult.failure(validationError(
        `discountType must be one of: ${DISCOUNT_TYPES.join(', ')}.`
    ));
}

// in buildAddLineUseCase / buildUpdateLineUseCase, when stockEffectType is supplied:
if (stockEffectType && !STOCK_EFFECT_TYPES.includes(stockEffectType)) {
    return ApplicationResult.failure(validationError(
        `stockEffectType must be one of: ${STOCK_EFFECT_TYPES.join(', ')}.`
    ));
}

// in buildFinalizeAvailmentUseCase, alongside the existing fulfillmentMode check:
if (!DOCUMENT_CONTEXT_VALUES.includes(requestedDocumentContext)) {
    return ApplicationResult.failure(validationError(
        `requestedDocumentContext must be one of: ${DOCUMENT_CONTEXT_VALUES.join(', ')}.`
    ));
}
```

### CR-02: No validation of discount `amount`/`percent` sign or range — a caller can inflate a customer's total beyond the subtotal

**File:** `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js:364-426` (buildApplyDiscountUseCase),
`apps/dgfy-api/src/modules/availments/usecases/money.js:122-147, 172-229` (computeManualAndCodeDiscounts / computeAvailmentTotals)

**Issue:** `buildApplyDiscountUseCase` forwards `amount`/`percent` straight from the request body
to `repository.recordDiscount` with zero validation of sign or magnitude (only `discountType`
truthiness and, for `manual` only, `reason` + permission are checked). The DB schema also has no
CHECK constraint on `availment_discounts.amount`/`.percent`
(`20260713120000-create-availment-checkout.cjs:279-281`) — negative values persist without error.

At finalize time, `money.js`'s `computeAvailmentTotals` folds every discount term into a single
sum and caps only the *upper* bound:

```js
const appliedDiscount = Math.min(totalDiscountCentavos, discountBase); // never negative
const totalCentavos = subtotalCentavos - appliedDiscount;
```

The inline comment `// never negative` is incorrect: `Math.min()` only prevents the discount
from *exceeding* `discountBase`; it does nothing to prevent `totalDiscountCentavos` (and
therefore `appliedDiscount`) from being negative when a term's `amount` is negative. A negative
`appliedDiscount` makes `totalCentavos = subtotalCentavos - appliedDiscount` *exceed* the
subtotal — i.e. a "discount" can act as an undisclosed surcharge that inflates the customer's
bill above the sum of line items.

Critically, this is reachable without any elevated permission: `buildApplyDiscountUseCase` only
gates `discountType === 'manual'` behind `hasManualDiscountPermission` + a mandatory `reason`
(lines 390-399). `discountType === 'promo_code'` and `discountType === 'sc_pwd'` require **no**
permission check and **no** `reason` at all — any active member can call
`POST /v1/availments/:id/discounts` with `{ discountType: 'promo_code', amount: -500 }` (or an
arbitrarily large positive `amount`/`percent`, capped only at 100% of the base) and have it
silently accepted, persisted, and later folded into the server-computed, "never trust the
client" total that `finalizeAvailment` treats as authoritative.

Separately, `discountType: 'sc_pwd'` also carries no requirement that `scPwdIdNumber` be
supplied (statutory SC/PWD discounts require ID verification), so the same unpermissioned path
can apply an SC/PWD-labeled discount with no ID at all.

**Fix:** Validate sign/range in `buildApplyDiscountUseCase` before calling
`repository.recordDiscount`, and floor (not just cap) the discount in `money.js`:

```js
// availmentUseCases.js — buildApplyDiscountUseCase
if (amount !== null && amount !== undefined) {
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
        return ApplicationResult.failure(validationError('amount must be a non-negative number.'));
    }
}
if (percent !== null && percent !== undefined) {
    const percentNum = Number(percent);
    if (!Number.isFinite(percentNum) || percentNum < 0 || percentNum > 100) {
        return ApplicationResult.failure(validationError('percent must be between 0 and 100.'));
    }
}
if (discountType === 'sc_pwd' && (!scPwdIdNumber || scPwdIdNumber.trim() === '')) {
    return ApplicationResult.failure(validationError('scPwdIdNumber is required for an SC/PWD discount.'));
}
```

```js
// money.js — computeAvailmentTotals, defense-in-depth even after the above
const appliedDiscount = Math.max(0, Math.min(totalDiscountCentavos, discountBase));
```

## Warnings

### WR-01: VAT is computed independent of discount, producing internally inconsistent receipts for large/full discounts

**File:** `apps/dgfy-api/src/modules/availments/usecases/money.js:172-229`

**Issue:** `computeAvailmentTotals` computes `vat_amount` purely from the undiscounted per-line
gross (`decomposeVatInclusiveLine` on each line, lines 196-204), while `total_amount` is
`subtotal - appliedDiscount`. Because the two are computed independently, a discount that
consumes the full (or near-full) subtotal produces a receipt where `total_amount` can be `0` (or
close to it) while `vat_amount` remains positive — e.g. a 100%-off promo code on a
₱112.00/12%-VAT item yields `total_amount: '0.0000'` alongside `vat_amount: '12.0000'`, which is
not a coherent VAT breakdown for a ₱0 sale.

**Fix:** Either (a) document this as an intentional Philippine BIR convention (discounts other
than SC/PWD do not reduce the VATable base) if that is confirmed correct, or (b) proportionally
reduce `vat_amount` when `appliedDiscount` approaches `subtotalCentavos`, and add a golden test
covering the 100%-discount edge case so the intended behavior is pinned down and regression-safe.

### WR-02: Ambiguous dual-type contract in `computeManualAndCodeDiscounts` is a maintenance landmine

**File:** `apps/dgfy-api/src/modules/availments/usecases/money.js:122-147`

**Issue:** A discount term's `amount` field is interpreted differently depending on its runtime
type: a `string` is parsed as *pesos* (`parseAmountToCentavos`), a `number` is assumed to
already be *centavos*:

```js
if (typeof term.amount === 'string') {
    discountCentavos = parseAmountToCentavos(term.amount);
} else {
    discountCentavos = term.amount;
}
```

The current call sites are internally consistent (DB-sourced string amounts vs.
pre-resolved-to-centavos numeric amounts), but this is a silent, type-driven behavior switch
with a 100x magnitude difference and no runtime guard — a future caller passing a plain JS
number meaning pesos (e.g. `{ amount: 50 }` intending ₱50.00) would silently produce a discount
of ₱0.50 instead, with no error or warning anywhere.

**Fix:** Replace the implicit type-driven branch with an explicit, self-describing shape, e.g.
`{ amountCentavos: number }` vs `{ amountDecimal: string }`, or add a runtime assertion/JSDoc
`@throws` when a number is supplied outside the expected internal call sites.

### WR-03: Falsy-zero footguns in `availmentController.js` silently null out legitimate zero values

**File:** `apps/dgfy-api/src/modules/availments/controllers/availmentController.js:57, 143`

**Issue:** `quantity: body.quantity || null` (line 57, `updateLine`) and
`cashReceived: body.cash_received || null` (line 143, `finalize`) both use `||`, which treats a
legitimate `0` the same as `undefined`/`null`. For `cashReceived`, a fully-discounted (₱0.00
total) cash sale where the client correctly submits `cash_received: 0` would be silently
converted to `null`, causing `buildFinalizeAvailmentUseCase` to reject it with "cashReceived is
required for cash payment" even though the customer legitimately owes and paid nothing.

**Fix:** Use explicit `undefined`/`null` checks instead of `||`:

```js
cashReceived: body.cash_received !== undefined && body.cash_received !== null ? body.cash_received : null,
quantity: body.quantity !== undefined && body.quantity !== null ? body.quantity : null,
```

### WR-04: `AvailmentRepository` resolves the tenant database name twice per write call

**File:** `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js:253-254, 292-293, 330-331, 363-365, 397-398, 454-455`

**Issue:** Every mutating method (`addLine`, `updateLine`, `cancelLine`, `restoreLine`,
`recordDiscount`, `finalizePersist`) calls `this.withModel(businessId, async (Availment) => {...})`
— which itself calls `resolveDatabaseName(businessId)` — and then, inside that same callback,
calls `await this.resolveDatabaseName(businessId)` again to fetch the rest of the models via
`tenantConnector.getModels(databaseName)`. This is a redundant extra registry lookup on every
write path, and (more importantly) the two lookups are not guaranteed to observe the same
registry state — a registry status change between the two calls could in principle diverge
between the `Availment` model resolved by `withModel` and the sibling models resolved by the
second call.

**Fix:** Have `withModel` pass `databaseName` (not just the resolved model) to the callback, and
have callers derive the other models from that same `databaseName` instead of re-resolving it:

```js
async withModel(businessId, fn) {
    const databaseName = await this.resolveDatabaseName(businessId);
    try {
        const models = this.tenantConnector.getModels(databaseName);
        return await fn(models);
    } catch (error) { /* ... */ }
}
```

### WR-05: `discountType: 'sc_pwd'` requires no ID number and no permission gate, and multiple SC/PWD rows can stack on one availment

**File:** `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js:364-426, 690-712`

**Issue:** `buildApplyDiscountUseCase` only special-cases `discountType === 'manual'` for the
reason/permission check (lines 390-399); `discountType === 'sc_pwd'` is treated the same as an
unrestricted `promo_code` discount — any active member can apply it, with no requirement that
`scPwdIdNumber` be supplied. Separately, `buildFinalizeAvailmentUseCase` uses
`discountRows.find((row) => row.discount_type === 'sc_pwd')` (line 691) to pick a single row for
`sc_pwd_id_number`/`sc_pwd_metadata` on the availment header, but `discountLines` (line 697) maps
*every* discount row including multiple `sc_pwd` rows into the stacked discount total — nothing
prevents two (or more) `sc_pwd` rows from being recorded on the same availment, each
independently discounting the net base (bounded only by the overall `Math.min` cap in
`computeAvailmentTotals`).

**Fix:** Require `scPwdIdNumber` (non-empty) whenever `discountType === 'sc_pwd'`, and either gate
it behind the same (or a dedicated) permission as `manual`, or add a repository-level check that
rejects a second `sc_pwd` row for an availment that already has one in a non-cancelled state.

---

_Reviewed: 2026-07-14T02:04:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
