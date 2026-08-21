---
status: reference
owner: engineering
last_reviewed: 2026-08-21
related_adr: docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md
declaration_id: 2026-08-21-paymongo-commerce-webhook-idempotency
classification: regulatory
surfaces: payments,webhooks,commerce
reason_codes_impacted: PAYMENT_PROVIDER_EVENT_REPLAY
policy_version: 2026.08.21
verification_evidence: node --check changed backend payment files,npm --prefix apps/dgfy-api test -- --runTestsByPath tests/processVerifiedPaidCommerceSession.usecase.test.js tests/finalizePaidCommerceSession.usecase.test.js tests/commercePaymentReconciliation.usecase.test.js tests/commercePaymentRefunds.usecases.test.js tests/commercePaymentReadiness.usecases.test.js tests/commercePaymentSettlement.usecases.test.js tests/commercePaymentValidator.test.js tests/tenantRevenue.security.contract.test.js,npm run check:compliance
rollback_note: Revert the migration (removes uq_commerce_payment_sessions_provider_event), the model index entry, the repository method, and the two usecase changes together; the prior read-then-act state check remains functionally present underneath (this change only adds a lock and two guards around it), so a straight revert restores the pre-#476 behavior rather than leaving a broken intermediate state. No data migration or backfill is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-21T00:00:00+08:00
preflight_request_ref: ISSUE-476-COMMERCE-WEBHOOK-IDEMPOTENCY
---

# PayMongo Commerce Webhook Event-Level Idempotency

## Compliance Impact Classification

Regulatory, matching the classification already used for the declaration governing
this same module (`2026-05-19-paymongo-qrph-commerce-payments.md`). This is a
live-money-path hardening fix, not a feature: it closes a concurrency gap where two
concurrent/retried `payment.paid` deliveries for the same commerce payment session
could both pass a read-then-act state check and both trigger revenue posting and
order finalization, and it escalates an unknown-session `payment.paid` (money
collected, no local session) beyond a bare log warning. No payment-acceptance
behavior, fee policy, or settlement rule changes; no new user-facing surface.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/commercePayments/usecases/processVerifiedPaidCommerceSession.js`
   — the paid-session claim now runs inside a row-locked transaction, and rejects a
   provider event already recorded against a different session
   (`PAYMENT_PROVIDER_EVENT_REPLAY`, HTTP 409).
2. `apps/dgfy-api/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js`
   — an unknown-session `payment.paid`/`checkout_session.payment.paid` now raises an
   operational alert (Sentry + throttled log) in addition to the existing warn log;
   response shape/status for that case is unchanged (`200 {handled:false,
   reason:'session_not_found'}`).
3. `apps/dgfy-api/src/modules/commercePayments/repositories/commercePaymentRepository.js`
   — adds `findSessionByProviderEventId`, following the existing lookup pattern.
4. `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js` and a new additive
   migration — a unique index on `commerce_payment_sessions.provider_event_id`.
5. Tenant revenue posting and order finalization
   (`postPaidTenantRevenueTransactionUseCase`, `finalizePaidCommerceSession`) are
   unaffected in their own logic; this change only ensures they are invoked at most
   once per session claim.

## Compliance Preconditions

1. Finalization continues to run only after a verified, signature-checked
   `payment.paid` event, unchanged from ADR 0052's existing decision — this change
   hardens the existing invariant, it does not relax or replace it.
2. The claim transaction and the cross-database tenant order/finalization step
   remain deliberately separate (ADR 0052's accepted "post-commit, cross-database
   workflow"); this declaration does not introduce a distributed transaction across
   the landlord and tenant databases.
3. The unique index is additive only (`allowNull: true`, MySQL/InnoDB treats each
   `NULL` as distinct) — no backfill, no destructive migration, no change to any
   existing row.
4. The new migration targets `commerce_payment_sessions`, a **landlord**-database
   table (`apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js`), not a
   per-tenant schema. `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`
   governs `sync-tenant-schemas.js`'s per-tenant table/column repair and its
   crash-loop risk on a tenant preflight restart — it does not apply here; this
   migration has no deploy-order dependency on that tracker.
5. The webhook's HTTP response contract for an unknown-session event is unchanged,
   preserving PayMongo's retry semantics and the documented sandbox probe behavior
   in `docs/features/PAYMONGO_QRPH_COMMERCE_PAYMENTS.md`.
6. This declaration covers implementation and validation only; it does not
   authorize production credentials, deployment, or promotion to `main`.

## Verification Evidence

1. New unit coverage in `tests/processVerifiedPaidCommerceSession.usecase.test.js`
   (7 tests): first-delivery claim and finalization; an already-`finalized`
   session short-circuits without re-invoking downstream work; a retry landing
   while the session is merely `paid` (RF-1 review finding) resumes and
   completes processing rather than being swallowed as a stale idempotent
   replay; two deliveries both reaching that `paid` window each re-attempt
   downstream work but the revenue-posting mock's own `already_posted` guard
   proves no duplicate insert; a cross-session `provider_event_id` collision is
   rejected with `PAYMENT_PROVIDER_EVENT_REPLAY` (409); no false-positive when
   the "conflict" is the session's own prior event; the existing
   validation-mismatch hold path is unchanged.
2. New coverage in `tests/finalizePaidCommerceSession.usecase.test.js`'s "PayMongo
   webhook unknown session escalation" block: the operational alert fires for an
   unknown-session `payment.paid`, and does not fire for other unknown-session
   event types.
3. Existing `tests/finalizePaidCommerceSession.usecase.test.js`,
   `tests/commercePaymentReconciliation.usecase.test.js`,
   `tests/commercePaymentRefunds.usecases.test.js`,
   `tests/commercePaymentReadiness.usecases.test.js`,
   `tests/commercePaymentSettlement.usecases.test.js`,
   `tests/commercePaymentValidator.test.js`, and
   `tests/tenantRevenue.security.contract.test.js` all still pass unmodified in
   behavior (three pre-existing tests needed their mock repository extended with
   `runInTransaction`/`findSessionBySessionId`/`findSessionByProviderEventId` to
   match the new internal transaction wrapping, per Jest's exact-argument
   `toHaveBeenCalledWith` matching — no assertion's expected behavior changed).
4. `node --check` on every changed `.js`/`.cjs` file.
5. A true concurrent-DB-lock integration test (two real parallel connections
   against a live MySQL instance) was not run as part of this evidence — it is out
   of scope for local Tier 0 verification. The unit tests above simulate the
   post-lock-release sequencing (each transaction call resolves synchronously
   against a shared in-memory repository state, matching the same simulation
   pattern already used in `tests/tenantRevenue.usecases.test.js`) rather than
   proving true multi-connection lock contention end-to-end.
