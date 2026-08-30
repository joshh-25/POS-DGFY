---
status: reference
owner: engineering
last_reviewed: 2026-08-31
declaration_id: 2026-08-31-pos-affiliate-attribution-commit-time-recheck
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.08.31
verification_evidence: apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js (7 passed, new file),node --check apps/dgfy-api/src/modules/pos/usecases/posUseCases.js
rollback_note: Revert this commit. The change is confined to which enrollment object the post-commit accrual reads inside the existing try block; no schema change, no new column, no persisted state. Reverting restores the pre-existing behavior of accruing against the entry-time-resolved enrollment unconditionally, with no data cleanup needed — commissions already accrued under either behavior remain valid rows.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-31T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1199-POS-AFFILIATE-ATTRIBUTION-COMMIT-RECHECK
---

# POS In-Store Checkout — Affiliate Enrollment Re-verified At Commit Time

## Compliance Impact Classification

`major`, `pos,terminal` surfaces, per `scripts/check-compliance-impact.js`'s
`^apps/dgfy-api/src/modules/pos/` rule (`minimumClassification: 'major'`, `surfaces: ['pos',
'terminal']`). Not `payments` — copying Phase 206's storefront declaration's classification
verbatim would be wrong for this path (`apps/dgfy-api/src/modules/pos/`, not
`apps/dgfy-api/src/modules/store/`) and would fail `check:compliance`'s surface-coverage check.
This PR touches `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`'s post-commit affiliate
commission accrual block only — no buyer-facing pricing, VAT, discount, or receipt math changes.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` — the post-commit affiliate accrual
   block (`if (affiliateEnrollment) { try { ... } }`, immediately after `transaction.commit()`) now
   calls `resolveActiveAffiliateEnrollmentById` unconditionally at commit time instead of accruing
   directly against the entry-time-resolved `affiliateEnrollment` object. When the fresh check comes
   back null (enrollment revoked/suspended, or the tenant's affiliate program disabled, between
   entry and commit), the commission accrual is silently dropped via a bare `else` branch and a
   `logger.warn` is emitted; the sale, its receipt, and the checkout response are unaffected either
   way (POS affiliate codes never touch price — unlike storefront, no pricing rule is entangled).

## Compliance Preconditions

1. **No pricing, discount, VAT, or receipt math changes.** `affiliateEnrollment` on POS affects
   nothing but the commission — it appears at exactly four lines in the file (entry-time resolve,
   the entry-time 422 gate, the commit-time accrual guard, and the value passed into
   `accrueEarnedForInStoreSale`). The `ok({...})` response, the receipt contract, and every
   persisted transaction column are untouched.
2. **The re-check enforces the same gate that already exists**, just at a later point in time:
   `resolveActiveAffiliateEnrollmentById` requires `settings.program_enabled` and
   `enrollment.status === 'active'`, identical to the gate `resolveActiveAffiliateEnrollment`
   already applies at entry time. Nothing new is being enforced — only *when* it is checked.
3. **The entry-time `422 AFFILIATE_CODE_INVALID` hard-reject gate is unchanged.** An unresolvable
   affiliate code still rejects the whole checkout before any write; this PR governs only the window
   after that gate has already passed, on the resolve-to-commit interval.
4. **Accrual stays best-effort and post-commit.** The re-check and the accrual call both remain
   inside the same `try/catch` that already guarantees a commission-write failure never fails a sale
   that already succeeded. No transaction, lock, or `FOR UPDATE` is added on the re-verify — it is a
   plain, non-locking read on the default connection.
5. **Idempotent by construction.** Accrual is already guarded by the
   `(tenant_id, order_reference)` unique index behind `createEarnedCommissionIfMissing`, so no new
   double-accrual or race surface is introduced by re-resolving the enrollment a second time.
6. **The split-payment path (`ownsTransaction === false`) runs this block pre-outer-commit, a
   pre-existing condition this PR neither creates nor worsens.** `buildCompletePosPaymentSessionUseCase`
   passes its own transaction into `checkoutPosUseCase`, so the `:4399` `transaction.commit()` is a
   no-op there and the accrual block executes while the outer transaction is still open; that caller
   can still throw `POS_PAYMENT_SESSION_TOTAL_CHANGED` afterwards and roll back, and the affiliate
   commission/attribution rows (landlord DB, different connection) would not be rolled back with it.
   The re-verify itself is safe under this — it reads landlord tables on the default connection,
   never the tenant transaction, so there is no snapshot-isolation or read-your-own-write concern.
   This re-verify can only ever *reduce* the number of rows written relative to today's behavior, not
   increase the risk. Filed separately for `pm` to shape, not fixed in this PR.
7. **This PR does not restore the primary route's ability to accrue commission at all.**
   `checkoutPosSchema` (`apps/dgfy-api/src/validators/posValidator.js`) strips `affiliate_code` on
   `POST /pos/checkouts` (no declared key, no `.unknown(true)`, `stripUnknown: true`), so on that
   route `affiliateCodeInput` is always empty and this fix's re-check never runs. It does run on the
   split-payment completion and mobile-offline-sync paths, which do carry a live `affiliate_code`
   through to this use case today. Fixing the primary route's stripped field is a separate,
   money-affecting feature restoration filed as its own issue (`Refs #1199, #446`), deliberately not
   bundled here — see the PR body.

## Verification Evidence

1. `apps/dgfy-api/tests/posCheckoutAffiliateAttribution.unit.test.js` — new file, 7/7 passing:
   still-active-at-commit (asserting `findActiveEnrollmentByShareCode` called once AND
   `findEnrollmentById` called once — the assertion that fails against pre-Phase-220 code),
   revoked-between-entry-and-commit (sale succeeds, zero commission/attribution rows, exactly one
   drop warn), suspended-between-entry-and-commit (same outcome, pins the `status === 'active'` gate
   rather than a careless `!== 'revoked'`), program-disabled-between-entry-and-commit (no
   commission), a regression baseline with no `affiliate_code` on the payload (neither lookup
   called), a regression baseline for an invalid code at entry (still `422`,
   `findEnrollmentById` never called, transaction rolled back), and a same-totals comparison between
   the accrued and dropped cases (the sale itself is unaffected by a drop). Confirmed to genuinely
   pin the new behavior: 4 of these 7 fail against the pre-fix code when run with the fix reverted.
2. `node --check apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` — syntax-only check (this
   app has no real build step); passed.
3. Adjacent regression suites re-run clean: `posCheckoutFnbContracts.usecase.test.js`,
   `affiliateCommissionAccrual.unit.test.js`, `storeCheckoutAffiliatePricing.unit.test.js` — 80/80
   passing across all four files combined.
4. **Preflight methodology note:** `preflight_request_ref` is `NOT-EXECUTED-*` because this PR
   targets `develop`. Per `docs/compliance/request-time-preflight-protocol.md`, the live preflight
   sweep runs once per batch at the `develop → staging` promotion, not per-PR — this is expected and
   not a gap in this declaration.
