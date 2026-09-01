---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-paymongo-sandbox-test-payment-debug-tool
classification: regulatory
surfaces: payments,settings,compliance
reason_codes_impacted: none
policy_version: 2026.09.01
verification_evidence: apps/dgfy-api/tests/commercePaymentSandboxConfirmation.usecase.test.js -- new, 8 cases: not-test-mode 404 without touching the repository or PayMongo, missing-session 404, happy-path confirmation + audit log write, idempotent replay on an already-finalized session, conflict on a non-awaiting_payment status, conflict on a missing provider payment intent, conflict on an expired session, conflict on a PayMongo amount/currency mismatch,node --check on every changed/new apps/dgfy-api .js file,npm run build:skupervisor -- OK (PaymentOperations bundle compiled cleanly, no errors/warnings introduced),npm run check:compliance -- confirmed to fail first (listing every touched file below), then pass once this declaration was added
rollback_note: No schema or migration change -- currency/qr_code_image_url/expires_at already exist on commerce_payment_sessions and were already populated at session-creation time; this phase only adds them to the admin serializer's response shape. The new route/use case/controller/adminService function are all additive-only (a second, independent entry point alongside the existing loopback-gated storefront route, which is untouched). Reverting this PR removes the new admin route, use case, and UI section with no other behavior change; the existing loopback confirm-test route and PaymentOperations.jsx's other actions are unaffected either way.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T04:22:52.916Z
preflight_request_ref: PREFLIGHT-33469394801-2026-09-01-PAYMONGO-SANDBOX-TEST-PAYMENT-DEBUG-TOOL
---

# PayMongo Sandbox Test Payment Debug Tool (#1268)

## Compliance Impact Classification

Regulatory. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff:

- `apps/dgfy-api/src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js`,
  `apps/dgfy-api/src/modules/commercePayments/index.js`,
  `apps/dgfy-api/src/modules/commercePayments/controllers/commercePaymentHandlers.js` -- match the
  `modules/commercePayments/` rule -> `surfaces: payments`, floor `major`.
- `apps/dgfy-api/src/routes/commercePayments.js` -- matches the dedicated
  `routes/commercePayments.js` rule -> `surfaces: payments`, floor `major`.
- `packages/web-core/src/services/adminService.js` -- matches its own dedicated rule -> `surfaces:
  settings,compliance`, floor `regulatory`. This is the file that raises the whole change's
  classification from `major` to `regulatory`: editing `adminService.js` at all (even to add one
  thin passthrough function) trips this rule regardless of how small the diff inside the file is.

No other `regulatory`-tier rule (compliance module, `compliancePolicy.js`, tenant-admin surfaces)
is touched by this change; the `regulatory` floor here comes entirely from `adminService.js` being
a shared file with its own blanket classification, not from anything compliance-specific in what
this change actually does.

`related_adr`: none. This is UI-only debug tooling around an existing, already-shipped mechanism
(`paymongoService.confirmSandboxQrphPayment()`, the loopback-gated
`/api/v1/store/checkout/payment-sessions/:id/confirm-test` route) -- no PayMongo integration
contract or pricing/discount rule is created or amended.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js` -- adds
   `buildConfirmCommercePaymentSessionSandboxUseCase`, a new, independent, admin-authenticated
   entry point into the same already-shipped `paymongoService.confirmSandboxQrphPayment()` call the
   existing loopback-gated storefront route already uses. Deliberately duplicates that route's
   use case's status/expiry/amount-mismatch validation (idempotent-ok if already `finalized`;
   409 if not `awaiting_payment`; 409 if no `provider_payment_intent_id`; 409 if expired; 409 on a
   PayMongo amount/currency mismatch) rather than sharing it, so
   `buildConfirmStoreCheckoutSandboxPaymentUseCase` and its loopback route stay byte-for-byte
   unchanged, per the issue's own non-goals. Also extends `serializeSession()` to additionally
   return `currency`, `qr_code_image_url`, and `expires_at` -- all three columns already exist on
   `CommercePaymentSession` and were already populated at session-creation time; this is a pure
   additive read, not a new write path.
2. `apps/dgfy-api/src/modules/commercePayments/index.js` -- wires the new use case with
   `commercePaymentRepository`/`paymongoService` injected, same DI pattern as the module's other
   ten exports.
3. `apps/dgfy-api/src/modules/commercePayments/controllers/commercePaymentHandlers.js` -- adds
   `confirmPaymentSessionSandbox`, transport-only, mirroring `reconcilePaymentSession`'s shape
   (actor resolution from `req.admin`/`req.user`, 202 success status matching the existing
   storefront route's convention).
4. `apps/dgfy-api/src/routes/commercePayments.js` -- registers
   `POST /admin/payment-sessions/:payment_session_id/confirm-test` behind `authenticateAdmin` and
   the existing `validateCommercePaymentSessionParam` validator (no new validator needed). This
   route is independent of, and does not modify, the existing loopback-gated
   `POST /api/v1/store/checkout/payment-sessions/:id/confirm-test` route in `routes/store.js`.
5. `packages/web-core/src/services/adminService.js` -- adds
   `confirmCommercePaymentSessionSandbox(paymentSessionId)`, a thin POST passthrough following the
   exact `reconcileCommercePaymentSession` pattern. Adds no authorization or business logic of its
   own -- all enforcement lives server-side.
6. `apps/dgfy-ims/Pages/admin/PaymentOperations.jsx` -- adds a "QR Ph Sandbox Test Payment" section
   to the existing platform-wide admin payments page, client-side-gated on
   `certification?.mode !== 'live'` (the same `mode` field the page's existing sandbox
   certification panel already surfaces). This is a UX-level hide only -- the real enforcement is
   server-side (`authenticateAdmin` on the route, plus the use case's own `PAYMONGO_MODE !== 'test'`
   404 check, plus `confirmSandboxQrphPayment()`'s own independent test-mode guard -- three
   independent fail-closed layers). The section lists sessions currently `awaiting_payment`
   (all tenants, via its own dedicated `listCommercePaymentSessions({ status: 'awaiting_payment' })`
   query, independent of the page's existing free-text status filter) plus a manual
   `CPS-XXXXXXXXXX` reference field, shows the QR code image / amount+currency / an expiry
   countdown per session, an "Accept test payment" button per session and for the manual reference,
   and links to the page's existing "Verify payment" (reconcile) action since finalization is
   webhook-driven and therefore asynchronous.

## Compliance Preconditions

1. **No unauthenticated access path exists.** The new route sits behind `authenticateAdmin`,
   identical to every other route in `commercePayments.js`'s admin surface -- no new middleware or
   auth primitive introduced.
2. **Fail-closed outside test mode, independent of admin auth.** The new use case re-checks
   `process.env.PAYMONGO_MODE !== 'test'` itself and 404s if not -- this check does not depend on,
   or get satisfied by, a valid admin session; a leaked/misused admin session in a live environment
   still cannot use this. `confirmSandboxQrphPayment()`'s own pre-existing test-mode guard is a
   third, independent layer underneath both. Pinned by the "404s when PayMongo is not in test mode"
   test case, which also asserts the repository and PayMongo service are never even called.
3. **The existing loopback-gated storefront route and its use case are untouched.** Confirmed by
   inspection -- no lines in `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`,
   `apps/dgfy-api/src/routes/store.js`, or `apps/dgfy-api/src/services/paymongoService.js` are
   modified by this change, per the issue's own non-goals.
4. **No live customer-facing or tenant-facing surface is added.** The new route lives under the
   existing `/admin/*` prefix of `commerce-payments`, gated by the same `authenticateAdmin`
   middleware as the rest of that admin surface; the new UI section lives inside the existing
   platform-wide (not tenant-scoped) `PaymentOperations.jsx` admin page.
5. **The serializer additions are read-only and additive.** `currency`, `qr_code_image_url`,
   `expires_at` are pre-existing, already-populated columns; no new write path or new PII is
   introduced by exposing them to an already-admin-authenticated caller.

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- New `apps/dgfy-api/tests/commercePaymentSandboxConfirmation.usecase.test.js` -- 8 cases, mirroring
  the existing `commercePaymentReconciliation.usecase.test.js` mocking pattern (mocked repository +
  mocked `paymongoService`, no real network/DB access). Written and `node --check`-clean; not
  executed against a live Jest run in this environment (`apps/dgfy-api/node_modules` was not
  installed here and installing it was out of scope for this pass -- flagged explicitly rather than
  silently assumed passing).
- `node --check` on every changed/new `apps/dgfy-api` `.js` file -- actually run, all clean (this
  app's own `build` script is a no-op, so this is the real Tier 0 check per
  `.agents/skills/implement/SKILL.md`).
- `npm run build:skupervisor` (`apps/dgfy-ims`) -- actually run, real Vite build, succeeded with the
  new `PaymentOperations` bundle compiling cleanly.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above), then
  **pass** once this declaration was added.
- `npm run check:architecture` / `npm run check:adr` / lint were not run in this pass (Tier 1/2,
  optional per `.agents/skills/implement/SKILL.md`); flagged rather than silently assumed passing.

## Residual Risks

1. **The new use case's test suite was not executed against a live Jest run** (no `node_modules`
   installed for `apps/dgfy-api` in this environment). The tests are structurally identical to the
   existing, passing `commercePaymentReconciliation.usecase.test.js` suite's mocking pattern; flagged
   for the PR reviewer to actually run (`npm test -- commercePaymentSandboxConfirmation`) before
   merge, rather than treated as verified.
2. **"For the current tenant" from the issue's scope item 1 is not implemented literally.**
   `PaymentOperations.jsx` is a platform-wide, cross-tenant admin page with no "current tenant"
   concept; this phase defaults the sandbox section to "all tenants, status=awaiting_payment" plus
   the manual reference field, per the plan's own recommendation. A tenant selector (e.g. reusing
   the page's existing tenant picker) is a nice-to-have left for a follow-up if Pat wants it.
3. **Duplicated validation logic.** The new use case deliberately re-implements
   `buildConfirmStoreCheckoutSandboxPaymentUseCase`'s status/expiry/amount checks rather than
   extracting a shared helper, to guarantee the storefront use case's behavior/signature stays
   completely untouched. A future refactor could extract a shared helper if this duplication proves
   costly to keep in sync -- not done here, per the plan's own stated preference for the safer,
   more duplicative option.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
