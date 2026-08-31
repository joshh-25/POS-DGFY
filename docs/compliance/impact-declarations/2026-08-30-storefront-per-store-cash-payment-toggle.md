---
status: reference
owner: engineering
last_reviewed: 2026-08-30
declaration_id: 2026-08-30-storefront-per-store-cash-payment-toggle
classification: major
surfaces: settings,payments,pos,terminal
reason_codes_impacted: STORE_CASH_DISABLED
policy_version: 2026.08.30
verification_evidence: apps/dgfy-api/tests/customerAccessPolicy.test.js (new cash-payment-enabled describe block, 4 new cases),apps/dgfy-storefront/src/__tests__/retailCheckoutOnlinePayments.contract.test.js (2 new cases: capability-disabled omission + fail-open regression guard),node --check on every changed apps/dgfy-api .js file,npm run build:store,npm run build:pos,npm run build:skupervisor
rollback_note: Revert this commit. The new setting key defaults to enabled everywhere it is read (customerAccessPolicy.js's DEFAULT_CASH_PAYMENT_ENABLED, and the storefront's own isEnabledStorefrontCheckoutPaymentType fail-open `!== false` check), and no existing tenant has a seeded row for it (only newly-provisioned tenants get one, at provisioning time, and always `true` there too) -- reverting removes the enforcement and the toggle with no persisted-state cleanup needed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-30T00:00:00Z
preflight_request_ref: NOT-EXECUTED-626-STOREFRONT-PER-STORE-CASH-PAYMENT-TOGGLE
---

# Per-Store Setting To Disable Cash/COD At Checkout

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/settings/` (via `settingsValidator.js`) and
`apps/dgfy-api/src/modules/store/` are both exact-prefix matches in
`check-compliance-impact.js` at floor `major`/`settings` and `major`/`payments` respectively;
`packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` is also a named
match at `major`/`pos,terminal`. This PR adds a new merchant-facing settings toggle and a new
checkout enforcement gate — no schema change, no new payment-capture path, no change to an
existing permission.

## What changed and why

Filed as #626 (Phase 203, scoped): #626's body describes three things — a per-store cash/COD
toggle (Gap 1, this PR), wiring Retail checkout to live `payment_capabilities` (Gap 2, already
shipped by Phase 142/#823, no work here), and making Surebiz card-only (out of scope, gated on
#477 — PayMongo card is still blocked/deferred for storefront). This PR delivers **only** the
cash-toggle mechanism. #626 stays open for its card half; this PR uses `Refs #626`, not
`Closes #626`.

Same shape as #622's `storefront_guest_checkout_enabled` (see
`docs/compliance/impact-declarations/2026-08-27-storefront-per-store-guest-checkout-toggle.md`
for the precedent this follows):

1. **New setting**: `storefront_cash_payment_enabled` (`system_settings`, boolean, default `true`
   when unset) — surfaced on `access_policy.cash_payment_enabled` via
   `resolveAccessPolicyFromSettings` (`apps/dgfy-api/src/modules/shared/utils/customerAccessPolicy.js`).
   No migration: `system_settings` is a key/value table and `updateSettings` creates a missing row
   on write.
2. **Advertise**: at the `listStoreCatalog` call site (`storeUseCases.js`), a `cash` key is merged
   into `payment_capabilities` after the existing `Promise.all` resolves — `{ enabled, environment:
   null, reason_code }`. Merged at the call site rather than inside
   `resolveStorefrontPaymentCapabilities`, which has six early `disabled(...)` returns for
   PayMongo-specific failure modes that must never gate cash (a tenant with no PayMongo account at
   all must still be able to take cash).
3. **Backend enforcement** (fail closed): immediately before the existing
   `assertGuestCheckoutAllowed` call in the order-placing path (`storeUseCases.js`, reached by
   both the direct handler and the webhook finalizer), a new check rejects
   `payment_type: 'cash'` with 422 `STORE_CASH_DISABLED` when `accessPolicy.cash_payment_enabled
   === false`. Hiding the option in the UI alone was not enforcement — a hand-crafted `POST` with
   `payment_type: 'cash'` would previously still place a COD order regardless of any UI state.
4. **Client** (fail open by design — same `!== false` shape as every capability-gated payment
   type): `isEnabledStorefrontCheckoutPaymentType`'s cash arm changed from unconditional to
   `paymentType === 'cash' && paymentCapabilities?.cash?.enabled !== false`
   (`apps/dgfy-storefront/src/shared/model/storefrontCheckoutPaymentOptions.js`). No call-site
   change needed — `payment_capabilities` is already passed through wholesale onto
   `selectedStore`.
5. **Merchant toggle**, in the POS app's terminal settings workspace
   (`packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`, rendered by
   `apps/dgfy-pos`/`apps/dgfy-ims`) — "Accept Cash on Delivery/Pickup", mirroring the existing
   "Allow Guest Checkout" toggle idiom exactly (default state, label map, hydrate, save, JSX).
6. **Provisioning default**: `tenantProvisioningService.js`'s `seedDefaultCustomerAccessSettings`
   seeds the new key `true` for **every** vertical, unlike #622's retail-specific default — the
   card-only motivation is Surebiz-specific and gated on #477, so a Retail-wide cash-off default
   here would break every other Retail tenant. No `overwriteExisting`, so a re-run of provisioning
   never stomps a merchant's own later choice.

## Affected Surfaces

- `settings` — new settings key, validator schema (both bulk and single-key blocks,
  `apps/dgfy-api/src/validators/settingsValidator.js`).
- `payments` — checkout is the surface being gated; no payment method, provider, or capture path
  is added, changed, or removed. Cash remains cash; this only adds an operator-controlled
  availability switch.
- `pos`, `terminal` — `TerminalOperationsWorkspace.jsx` gains the same toggle as a settings-form
  field. This is the POS/IMS terminal settings surface, not POS transaction logic — no in-person
  POS checkout/sale flow, hardware, or attendance behavior changes; this toggle governs the
  storefront (online) checkout path only.

## Compliance Preconditions

- No schema/migration change — `system_settings` is key/value; no tenant-schema-sync entry needed.
- No existing tenant is affected by this deploy — the runtime default
  (`DEFAULT_CASH_PAYMENT_ENABLED = true` in `customerAccessPolicy.js`) is unconditional and
  vertical-blind; only newly-provisioned tenants get a real seeded row, and that row is `true` for
  every vertical too.
- `STORE_CASH_DISABLED` is a new `reason_code` value carried in the existing 422
  `VALIDATION_FAILED` `DomainError` shape — no new `DomainErrorCode` enum value was added.
- **Known, deliberate residual gap** (stated in the plan, not silently accepted): turning cash off
  today leaves QRPh as the only online rail for a store, since card enablement is #477's and out of
  scope here. A Surebiz store flipping this toggle before #477 lands would leave customers with
  only QRPh. This PR does not flip the toggle for any tenant — it only builds the mechanism.

## Verification Evidence

- `apps/dgfy-api/tests/customerAccessPolicy.test.js`: new `cash payment enabled` describe block (4
  new cases) — the fail-open default, the stored-string normalizer, and
  `resolveAccessPolicyFromSettings` resolving `cash_payment_enabled: false` only for an explicit
  `false`, `true` for missing/null.
- `apps/dgfy-storefront/src/__tests__/retailCheckoutOnlinePayments.contract.test.js`: 2 new cases —
  `buildStorefrontCheckoutPaymentOptions({ cash: { enabled: false }, qrph: { enabled: true } })`
  omits cash, and an object with no `cash` key still includes it (fail-open regression guard).
- `node --check` on every changed `apps/dgfy-api` `.js` file — Tier 0 per
  `.agents/skills/implement/SKILL.md` (`apps/dgfy-api` has no real build step). Syntax-only; does
  not catch a bad `require`/import path or a missing export.
- `npm run build:store`, `npm run build:pos`, `npm run build:skupervisor` — three real Vite builds
  (`packages/web-core` is touched and is the shared trunk for all three apps).
- No `package.json` was touched — the lockfile-sync check does not apply.

## Changed Files

- `apps/dgfy-api/src/modules/shared/utils/customerAccessPolicy.js`
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-api/src/validators/settingsValidator.js`
- `apps/dgfy-api/src/services/tenantProvisioningService.js`
- `apps/dgfy-storefront/src/shared/model/storefrontCheckoutPaymentOptions.js`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-api/tests/customerAccessPolicy.test.js`
- `apps/dgfy-storefront/src/__tests__/retailCheckoutOnlinePayments.contract.test.js`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-626-STOREFRONT-PER-STORE-CASH-PAYMENT-TOGGLE` is
expected on a PR targeting `develop`, not a finding — per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> main` (or
`develop -> staging`) promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22/25
amendments), not per PR.
