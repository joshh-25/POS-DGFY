---
status: reference
owner: engineering
last_reviewed: 2026-07-24
related_adr: docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md
declaration_id: 2026-07-24-pos-affiliate-commission-checkout-and-back-office-panel
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.24
verification_evidence: npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert this PR's diff; the affiliate-code field in POSCheckoutTerminal.jsx is optional and additive to the existing checkout payload, the back-office panel is a net-new admin-gated view mode reachable only via a new sidebar entry, and posUseCases.js's affiliate accrual/reversal/settle calls are all best-effort post-commit hooks wrapped in try/catch/logger.warn - reverting removes them cleanly without touching existing checkout totals, tax, payment, discount, or permission logic.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-24T00:00:00+08:00
preflight_request_ref: POS-AFFILIATE-COMMISSION-PROGRAM-2026-07-24
---

# POS Affiliate Commission Checkout Field and Back-Office Panel

## Compliance Impact Classification

Major. This introduces an Affiliates Program surface to the POS mini-back-office and POS checkout:
an optional "Affiliate Code" field at checkout, a new admin-gated "Affiliates" settings panel, and a
post-commit commission-accrual hook on the existing checkout/void/online-status use cases. Classified
`major` per the `pos`/`terminal` surface floor since all touched files are POS-surface files; no
payments, settings, or compliance-classified file is touched anywhere in this PR.

## Affected Surfaces

- `backend/src/modules/pos/usecases/posUseCases.js`: `buildCheckoutPosUseCase` resolves an optional
  `payload.affiliate_code` to an active enrollment *before* the sale transaction commits (invalid code
  -> clean 422, no partial state); `buildVoidPosTransactionUseCase` and
  `buildUpdateOnlineOrderStatusUseCase` each add a non-blocking, try/catch-wrapped post-commit call to
  reverse/settle any associated affiliate commission row. None of these hooks read or write the sale's
  price, tax, discount, or payment fields.
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`: adds an optional affiliate-code input
  near the existing promo-code entry, threaded into the checkout payload; no existing cart/total/tax/
  payment calculation path is modified.
- `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` (new): admin-gated panel for
  program settings, affiliate provisioning/rate-override/suspend/revoke, QR/share-link, and a cashout
  approval queue (approve / mark-paid-with-reference / reject), gated by the existing
  `affiliates:*` permission set.
- `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`,
  `TerminalWorkspaceSidebar.jsx`, `frontend/src/features/pos/pages/TerminalPage.jsx`: add the
  "Affiliates" nav entry/view-mode wiring only; no existing view mode's behavior changes.
- `frontend/src/features/pos/services/affiliateService.js` (new): flat API-client wrapper for the
  affiliate admin/self-service endpoints; no existing service file is modified.

## Compliance Preconditions

1. Checkout totals, VAT breakdown, DGFY convenience fee calculation, discount/promo handling, payment
   method handling, and order submission behavior are unchanged - the affiliate code is validated and
   attributed independently of the sale's monetary calculation.
2. An invalid/unknown affiliate code fails checkout validation *before* any transaction commit
   (consistent with the existing promo-code validation pattern) - it can never partially commit a sale.
3. Commission accrual/reversal/settlement happens strictly after the POS transaction/void/status-update
   transaction has already committed, wrapped in try/catch + `logger.warn` - a bookkeeping failure can
   never fail or roll back a sale, void, or online order status change that already succeeded.
4. The Affiliates back-office panel and cashout-approval actions are gated by the existing
   `affiliates:view` / `affiliates:manage` / `affiliates:settings` / `affiliates:cashout_approve` /
   `affiliates:cashout_pay` permissions (`backend/src/config/permissions.js`), enforced server-side via
   `checkPermission(...)` on every admin route - no new unauthenticated or under-permissioned mutation
   path is introduced.
5. All new backend routes/tables/models (commission ledger, payout methods, cashouts) live in the
   landlord DB behind the existing `dgfyAffiliate*` domain trio and are unrelated to fiscal-document
   generation, stock/inventory records, or payment-provider (PayMongo) integration - see
   `docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md`.

## Verification Evidence

The commands listed in front matter must pass before deployment. This sandbox has no installed
`node_modules` for either workspace and no live MySQL database, so local verification for this PR was
limited to `node --check` on every changed backend file, a brace/paren/bracket-balance script on
changed frontend files, and direct local runs of `check-architecture-guardrails.js`,
`check-controller-boundaries.js`, and a hand-traced re-implementation of
`check-tenant-schema-registry-coverage.js`'s classification algorithm (all passing) - a real
`npm --prefix frontend run build:pos`, `npm run lint:docs`, and full `npm run check:compliance` run
must still be executed in a real dev/CI environment before merge, per the migration/test-suite caveat
already recorded in this branch's handoff doc.
