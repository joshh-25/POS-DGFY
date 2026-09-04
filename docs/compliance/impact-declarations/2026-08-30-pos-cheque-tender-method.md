---
status: reference
owner: engineering
last_reviewed: 2026-08-30
related_adr: docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md,docs/architecture/adr/0077-pos-cheque-tender-method-scoped-supersession.md
declaration_id: 2026-08-30-pos-cheque-tender-method
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: BALANCE_SETTLEMENT_METHOD_UNSUPPORTED
policy_version: 2026.08.30
verification_evidence: apps/dgfy-api/tests/posOrderBalanceSettlement.usecase.test.js (24 passed -- extends the existing merchant-owned it.each with cheque, plus a dedicated cheque test asserting payment_reference/the cheque number reaches both the ledger row and the audit log),apps/dgfy-api/tests/posSplitPayment.schema.contract.test.js (6 passed -- PosPaymentAllocation.payment_method now asserts the six-value enum including cheque),packages/web-core/src/features/pos/__tests__/terminalBalanceSettlement.behavior.test.jsx (17 passed via apps/dgfy-ims's vitest runner -- cheque renders in the picker, selecting it shows the cheque-number label and presented-not-cleared copy, submit stays disabled until the attestation is ticked, and the attestation copy is cheque-specific),npm run build:pos (real Vite build, succeeded),node --check on every changed apps/dgfy-api file and the new migration file,npm run check:compliance (confirmed to fail first, then pass once this declaration was added),npm run check:architecture,npm run check:adr (confirms the ADR 0077 scoped-supersession route satisfies the [binding]-clause gate -- the actual proof this ADR route works, not just that it exists)
rollback_note: Reverting this PR's code diff while the ENUM stays widened is harmless -- cheque simply becomes unselectable again, and no other tender's behavior changes. Rolling the migration itself back is NOT a pure operation: 20260830000003-add-cheque-payment-method.cjs's down() refuses outright, per tenant database and per table, once any 'cheque' row exists on pos_order_payments.payment_method, pos_transactions.payment_type, or pos_payment_allocations.payment_method -- loud failure over silent financial-data mutation, matching the grab_pay/shopeepay precedent's own posture. A tenant with recorded cheque tenders cannot have the migration rolled back; the code-only revert is the correct rollback path in that case.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.393Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-30-POS-CHEQUE-TENDER-METHOD
---

# POS cheque tender method (#1085)

## Compliance Impact Classification

Major. The floor comes from the same two rules in `scripts/check-compliance-impact.js` the
extended feature's own declaration already recorded: `apps/dgfy-api/src/modules/pos/**` (`pos,
terminal`-surfaced, `major` floor) and `packages/web-core/src/features/pos/**` (same). The gate was
confirmed to **fail** first, then pass once this declaration was added.

Not `regulatory`: the fiscal/BIR treatment of a balance-settlement or split-tender event stays
deferred by ADR 0069 clause 9 `[default]` (carried forward verbatim by ADR 0070), and this phase
invents no fiscal document, e-sales figure, or VAT computation. Cheque is classified
`merchant_owned`, identically to the four other non-cash V1 tenders it joins (ADR 0077 Decision 2)
-- no new classification, no new provider integration.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260830000003-add-cheque-payment-method.cjs` (**new**) --
   widens three ENUM columns across every active tenant database:
   `pos_order_payments.payment_method`, `pos_transactions.payment_type`, and
   `pos_payment_allocations.payment_method`. Fans out per-tenant, guarded by `tableExists`, refuses
   to roll back once any `cheque` row exists -- same structure as
   `20260817000001-expand-storefront-paymongo-payment-methods.cjs` (the grab_pay/shopeepay
   precedent).
2. `apps/dgfy-api/src/models/PosOrderPayment.js`, `PosTransaction.js`, `PosPaymentAllocation.js` --
   the three Sequelize ENUM definitions widened to match the migration, landed in the same commit so
   model-layer validation never diverges from the database's accepted set.
3. `apps/dgfy-api/src/validators/posValidator.js` -- `SPLIT_PAYMENT_METHODS` (split-tender
   allocation schema) and the record-payment `Joi.valid(...)` list (Settle Balance) both gain
   `cheque`. `PAYMENT_TYPES` (the checkout method set) is deliberately untouched -- cheque is not a
   walk-in-checkout tender in this phase.
4. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` -- `BALANCE_SETTLEMENT_METHODS` gains
   `cheque`. No other line in `buildRecordOrderBalancePaymentUseCase` changes: the cash/non-cash
   discrimination, the exact-amount guard, the fail-closed confirmation, the ledger write, the audit
   log, and the response payload are all already method-agnostic.
5. `packages/web-core/src/features/pos/components/BalanceSettlementDialog.jsx` --
   `BALANCE_SETTLEMENT_METHOD_OPTIONS` gains a `Cheque` option; the existing optional reference-
   number field becomes method-aware (`Cheque number` label, presented-not-cleared copy for cheque);
   the attestation checkbox gets a cheque-specific variant (received a cheque, not an account
   transfer; not confirmation of clearance).
6. `apps/dgfy-api/scripts/sync-tenant-schemas.js` -- the tenant-schema drift-repair registry, kept
   in sync with the migration (same as the grab_pay/shopeepay precedent did): the `pos_order_payments`
   and `pos_payment_allocations` `CREATE TABLE` definitions in `REQUIRED_TENANT_SCHEMA_TABLES` widen
   their `payment_method` ENUM literal to include `cheque`, and `REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS`
   gains/widens the `ALTER ... MODIFY COLUMN` repair entries for all three columns so a tenant that
   drifts out of sync with the migration (missed run, restored from an older snapshot) still repairs
   to the correct six/ten-value enum rather than the pre-cheque set.

Governance: ADR 0063 clause 4 `[binding]` enumerated the V1 five-tender set closed. ADR 0077
scoped-supersedes clause 4 only -- adding `cheque` as a sixth tender -- and leaves every other clause
of ADR 0063 in force verbatim. `npm run check:adr` passes with both ADRs live, confirming the
scoped-supersession route actually satisfies the `[binding]`-clause gate rather than merely
asserting it does.

**Split tender is in scope, with a stated gap.** Cheque becomes selectable via the split-tender
allocation API (`SPLIT_PAYMENT_METHODS`, and both dependent ENUMs) in this same phase. **No dedicated
split-tender picker UI ships for it** -- `packages/web-core`'s split-tender component is not updated
to offer `cheque` as a selectable option. This is a stated, accepted gap (ADR 0077 Decision 5), not a
blocker: the API accepting a method the split-tender screen cannot yet select is intentional scope
for this phase, tracked as a UI follow-up rather than silently left undiscoverable. The Settle
Balance path (item 5 above) does get a picker and needs no follow-up.

**Cheque number is optional**, matching every other tender's `payment_reference` pattern exactly. No
`canSubmit` change and no new server guard -- cheque falls on the existing non-cash validation branch
by construction (`manual_payment_received` required, `payment_reference` optional ≤120 chars),
inheriting ADR 0063 clause 6's fail-closed attestation with zero new code.

No new database column anywhere. The cheque number is `payment_reference` under a properly-named
method (ADR 0077 Decision 3), exactly as #1085 frames it.

## Compliance Preconditions

1. **The five existing V1 methods are byte-identical in behavior.** Nothing about cash, gcash, maya,
   card, or bank_transfer's validation, ledger writes, or copy changes. Pinned by the pre-existing
   `it.each(['gcash', 'maya', 'card', 'bank_transfer'])` test continuing to pass unmodified alongside
   the new `cheque` case.
2. **Cheque never reaches a payment provider.** ADR 0069 clause 2 `[binding]` (carried forward
   verbatim by ADR 0070) and ADR 0063 clause 12 `[binding]`, both unaffected by ADR 0077. Cheque
   writes `payment_provider: 'merchant_owned'` and `provider_event_id: null`, identically to the
   other three merchant-owned digital tenders -- no new branch in the use case.
3. **A cheque settlement fails closed without an explicit attestation.** Same three independent
   layers as every other merchant-owned method: the Joi schema (`manual_payment_received` required
   for non-cash, forbidden for cash), the use case (`BALANCE_SETTLEMENT_CONFIRMATION_REQUIRED`), and
   the dialog's disabled submit -- pinned by a dedicated cheque test at both layers.
4. **The cheque number is presented-not-cleared, in copy.** ADR 0063 clause 7 `[default]`, carried
   forward by ADR 0077 Decision 3: the number proves a cheque was presented bearing it, not that it
   will clear, and not that DGFY verified anything. The dialog's reference-field caption and
   attestation checkbox both say so explicitly for cheque, distinct from the generic
   audit-aid/store-attested copy the other four methods show.
5. **The ENUM widening reaches every active tenant, not just the connected database.** The migration
   iterates `tenants WHERE status = 'active'`, guarded by `tableExists` per table per tenant --
   matching `20260817000001`'s fan-out exactly, the mechanism that avoids the #860/#639 crash-loop
   class. `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md` has no open entries with a
   deploy-order dependency on this migration; this migration introduces none of its own (additive
   ENUM widening only, no new table, no new required column).
6. **A rolled-back migration cannot silently destroy cheque data.** `down()` refuses per tenant per
   table once any `cheque` row exists, rather than truncating or reinterpreting it -- see
   `rollback_note`.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full command-level list. Summary:

- Extended `apps/dgfy-api/tests/posOrderBalanceSettlement.usecase.test.js` -- cheque added to the
  existing merchant-owned `it.each`, plus a dedicated test asserting the cheque number reaches both
  the ledger row and the audit log.
- Extended `apps/dgfy-api/tests/posSplitPayment.schema.contract.test.js` -- the
  `PosPaymentAllocation.payment_method` enum assertion now includes `cheque`.
- Extended `packages/web-core/.../terminalBalanceSettlement.behavior.test.jsx` -- cheque in the
  picker, the cheque-number label, the presented-not-cleared copy, and the fail-closed submit gate.
- `npm run build:pos` -- the real Vite build of the POS app that consumes the widened dialog.
- `npm run check:adr` -- the binding-clause gate itself; passes with ADR 0077 live alongside ADR
  0063, which is the actual proof the scoped-supersession route satisfies ADR 0039's process rather
  than merely a claim that it does.

## Residual Risks

1. **No split-tender picker UI for cheque yet** (ADR 0077 Decision 5). The API accepts it; the
   split-tender screen in `packages/web-core` does not yet offer it. Named explicitly, not silently
   assumed away -- tracked as a UI follow-up.
2. **Attestation is trust, by design** -- inherited from ADR 0063 clause 5, unchanged by this phase.
   A cashier can record a cheque that never arrived, or that later bounces; nothing in this phase (or
   the ADR it extends) claims otherwise. What it guarantees is that the record is labelled honestly.
3. **No reversal path for a mis-recorded cheque settlement**, same inherited gap ADR 0063 clause 10
   already names for merchant-owned settlements generally -- not resolved or widened by this phase.
4. **Fiscal treatment remains deferred** (ADR 0069 clause 9 `[default]`), unchanged by cheque's
   addition.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The live sweep runs once per batch at the `develop -> staging` promotion.
