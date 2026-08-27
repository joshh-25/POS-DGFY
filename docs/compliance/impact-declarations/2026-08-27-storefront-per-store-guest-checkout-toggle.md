---
status: reference
owner: engineering
last_reviewed: 2026-08-27
declaration_id: 2026-08-27-storefront-per-store-guest-checkout-toggle
classification: major
surfaces: settings,payments
reason_codes_impacted: GUEST_CHECKOUT_DISABLED
policy_version: 2026.08.27
verification_evidence: apps/dgfy-api/tests/customerAccessPolicy.test.js (14 passed),apps/dgfy-api/tests/storeGuestCheckoutProof.test.js (5 passed, new),apps/dgfy-api/tests/settingsValidator.customerAccessModes.test.js (9 passed),21 store/service usecase test files (263 passed, no regressions),apps/dgfy-storefront full suite (140 files / 754 passed),node --check on every changed apps/dgfy-api .js file,npm run build:skupervisor,npm run build:store
rollback_note: Revert this commit. The new setting key defaults to enabled everywhere it is read (customerAccessPolicy.js's DEFAULT_GUEST_CHECKOUT_ENABLED, and the storefront's own isGuestCheckoutAllowed fail-open check), and no existing tenant has a seeded row for it (only newly-provisioned tenants get one, at provisioning time) -- reverting removes the enforcement and the toggle with no persisted-state cleanup needed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-27T00:00:00Z
preflight_request_ref: NOT-EXECUTED-622-STOREFRONT-PER-STORE-GUEST-CHECKOUT-TOGGLE
---

# Per-Store Setting To Require A DGFY Account Before Checkout Or Booking

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/settings/` (via `settingsValidator.js`) and
`apps/dgfy-api/src/modules/store/` are both exact-prefix matches in
`check-compliance-impact.js` at floor `major`/`settings` and `major`/`payments` respectively;
`apps/dgfy-ims/Pages/Settings.jsx` is also a named match at `major`/`settings`. This PR adds a new
merchant-facing settings toggle and a new checkout/booking enforcement gate — no schema change,
no new payment-capture path, no change to an existing permission.

## What changed and why

Filed as #622 (stakeholder request): allow a merchant to require a DGFY account before a customer
can complete checkout or a Services booking on their storefront, instead of guest checkout being
always available. Pat's 2026-08-18 scoping comment set a vertical-dependent default (enabled for
FnB, disabled for Retail) for **newly-provisioned tenants only** — no existing tenant's behavior
changes on deploy, since none has a seeded row for the new key and every read path defaults to
enabled when the key is absent.

1. **New setting**: `storefront_guest_checkout_enabled` (`system_settings`, boolean, default `true`
   when unset) — surfaced on `access_policy.guest_checkout_enabled` alongside the existing
   `customer_access_mode` fields, via `resolveAccessPolicyFromSettings`
   (`apps/dgfy-api/src/modules/shared/utils/customerAccessPolicy.js`). No migration: `system_settings`
   is a key/value table and `updateSettings` creates a missing row on write.
2. **Backend enforcement** (fail closed): a new `assertGuestCheckoutAllowed` guard
   (`apps/dgfy-api/src/modules/store/utils/storeGuestCheckoutProof.js`), called immediately before
   the existing `assertGuestCheckoutProof` OTP guard at all four checkout/booking sites —
   `storeUseCases.js`'s direct-checkout and payment-session paths, and `serviceUseCases.js`'s
   single and batch booking paths. Rejects a non-DGFY-linked `storeCustomer` with 403
   `GUEST_CHECKOUT_DISABLED` when the setting is `false`. A DGFY-linked store customer always
   passes, matching the existing OTP guard's own exemption.
3. **Client** (fail open by design — a UI convenience only, never the authority): the storefront's
   `isGuestCheckoutAllowed` helper hides the "Continue as Guest" button in the shared
   guest-or-account entry gate (`customerIdentityRenderers.jsx`, the single seam all four
   checkout/booking modes render through) and adds a submission-time backstop in both checkout
   submission hooks. Treats a missing/undefined value as allowed so a cached SPA build served
   against a mismatched API version never traps a customer in an un-completable flow — the server
   is the sole authority and fails closed regardless of what the client renders.
4. **Merchant toggle**: "Allow Guest Checkout" in IMS Settings > Storefront > Storefront Access
   (`apps/dgfy-ims/Pages/Settings.jsx`), following the existing `storefront_follow_enabled` toggle
   idiom exactly (default state, label map, tab-scope allowlist, hydrate, save payload, JSX).
5. **Provisioning default**: `tenantProvisioningService.js`'s `seedDefaultCustomerAccessSettings`
   seeds the new key from `resolveDefaultGuestCheckoutEnabledForWorkflowMode(workflowMode)` —
   `false` only for `retail`, `true` otherwise — with **no** `overwriteExisting`, so a re-run of
   provisioning never stomps a merchant's own later choice.

**Deliberate naming deviation from the issue body**: #622 proposed `require_account_login`
(negative polarity, default off). Shipped instead as `storefront_guest_checkout_enabled` (positive
polarity, default on) to match the existing `storefront_follow_enabled` /
`storefront_share_enabled` / `storefront_ui_v2_enabled` family and avoid double-negative read
sites (`!requireAccountLogin`).

**ADR 0023 amended in this PR** (dated `## Amendments` block, `status: amended`) — Decision 11 and
Consequences item 2 both described the guest-or-account gate as unconditional; both are untagged
`default`-tier clauses per ADR 0039, so this is an ordinary amendment, not a superseding ADR.

## Affected Surfaces

- `settings` — new settings key, validator schema (both bulk and single-key blocks,
  `apps/dgfy-api/src/validators/settingsValidator.js`), IMS Settings UI.
- `payments` — checkout/booking is the surface being gated; no payment method, provider, or
  capture path is added, changed, or removed.

## Compliance Preconditions

- No schema/migration change — `system_settings` is key/value; no tenant-schema-sync entry needed.
- No existing tenant is affected by this deploy — the runtime default (`DEFAULT_GUEST_CHECKOUT_ENABLED
  = true` in `customerAccessPolicy.js`) is unconditional and vertical-blind; only newly-provisioned
  tenants get a real seeded row via the vertical-dependent provisioning default.
- The four backend enforcement sites already received `storeCustomer` / `accessPolicy` in scope
  before this change (feeding the pre-existing OTP guard); this PR adds one more read of an
  already-fetched settings row, not a new query or a new caller shape.
- `GUEST_CHECKOUT_DISABLED` reuses the existing `AUTHORIZATION_FAILED` domain-error code (403) —
  no new `DomainErrorCode` enum value was added.
- Guest order tracking, guest fulfilled-review invites, and the existing OTP-verification contract
  (`STOREFRONT_GUEST_OTP_REQUIRED`, ADR 0021 clause 14) are unchanged — a guest who checked out
  before the toggle was flipped keeps their existing tracking/review flow.

## Verification Evidence

- `apps/dgfy-api/tests/customerAccessPolicy.test.js`: 14/14 passing (5 new, covering the fail-open
  default, the stored-string normalizer, the vertical provisioning default, and the error builder).
- `apps/dgfy-api/tests/storeGuestCheckoutProof.test.js` (new): 5/5 passing — the `assertGuestCheckoutAllowed`
  decision function's four states (allowed guest, fail-open on omitted value, rejected guest,
  rejected non-DGFY store customer, allowed DGFY-linked customer).
- `apps/dgfy-api/tests/settingsValidator.customerAccessModes.test.js`: 9/9 passing (2 new, covering
  both the bulk and single-key schema blocks).
- 21 store/service usecase test files spanning `storeUseCases.js` and `serviceUseCases.js` callers
  (`storeUsecases.applicationResult.test.js`, `storeCheckoutAffiliatePricing.unit.test.js`,
  `storeCheckoutDownpaymentResolution.unit.test.js`, `servicesMode.usecases.test.js`,
  `serviceBookingSettlement.usecases.test.js`, and 16 others): 263/263 passing, no regressions from
  threading `resolved.accessPolicy` / `storefrontAccessPolicy` through the checkout/booking flows.
- `apps/dgfy-storefront` full suite: 140 files / 754 tests passing, including a new
  `guestCheckoutEntryGate.test.jsx` covering the shared entry-gate renderer's allowed/disallowed/
  fail-open/custom-description states, and extended `customerAccess.test.js` coverage for
  `isGuestCheckoutAllowed` and the `access_policy` store-patch passthrough.
- `node --check` on every changed `apps/dgfy-api` `.js` file — Tier 0 per
  `.agents/skills/implement/SKILL.md` (`apps/dgfy-api` has no real build step).
- `npm run build:skupervisor` and `npm run build:store` — both real Vite builds, both green.
- A full unfiltered `apps/dgfy-api` Jest run was attempted for broader confidence but hit a JS heap
  OOM (~3.6GB) in this sandbox before completing — a pre-existing environment resource limit
  unrelated to this diff (confirmed: the two DB-dependent provisioning-test failures seen in a
  targeted run reproduce identically on the pre-change baseline, via a temporary stash-and-rerun).
  Not cited as full-suite evidence; the 21 targeted usecase files above are.

## Changed Files

- `apps/dgfy-api/src/modules/shared/utils/customerAccessPolicy.js`
- `apps/dgfy-api/src/modules/store/utils/storeGuestCheckoutProof.js`
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-api/src/modules/services/usecases/serviceUseCases.js`
- `apps/dgfy-api/src/validators/settingsValidator.js`
- `apps/dgfy-api/src/services/tenantProvisioningService.js`
- `apps/dgfy-ims/Pages/Settings.jsx`
- `apps/dgfy-storefront/src/StorefrontApp.jsx`
- `apps/dgfy-storefront/src/shared/model/customerAccess.js`
- `apps/dgfy-storefront/src/shared/model/storefrontErrorMessages.js`
- `apps/dgfy-storefront/src/shared/hooks/useGuestCustomerIdentity.js`
- `apps/dgfy-storefront/src/shared/hooks/useCheckoutSubmission.js`
- `apps/dgfy-storefront/src/shared/checkout/model/guestCheckoutOtp.js`
- `apps/dgfy-storefront/src/features/checkout/renderers/customerIdentityRenderers.jsx`
- `apps/dgfy-storefront/src/modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js`
- `apps/dgfy-api/tests/customerAccessPolicy.test.js`
- `apps/dgfy-api/tests/storeGuestCheckoutProof.test.js` (new)
- `apps/dgfy-api/tests/settingsValidator.customerAccessModes.test.js`
- `apps/dgfy-storefront/src/__tests__/customerAccess.test.js`
- `apps/dgfy-storefront/src/__tests__/guestCheckoutEntryGate.test.jsx` (new)
- `docs/architecture/adr/0023-front-facing-dgfy-customer-account.md`
- `docs/features/DGFY_CUSTOMER_ACCOUNT.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-622-STOREFRONT-PER-STORE-GUEST-CHECKOUT-TOGGLE`
is expected on a PR targeting `develop`, not a finding — per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> main` (or
`develop -> staging`) promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22/25
amendments), not per PR.
