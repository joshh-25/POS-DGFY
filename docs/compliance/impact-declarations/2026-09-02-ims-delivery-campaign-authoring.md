---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-ims-delivery-campaign-authoring
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.02
verification_evidence: apps/dgfy-ims -- npm run build (vite, real build, catches syntax/unresolved-import/JSX errors) -- actually executed, green,apps/dgfy-pos -- npm run build (vite, real build) -- actually executed, green,packages/web-core/src/features/pos/__tests__/deliveryCampaignPayload.test.js -- actually executed (Vitest, via `cd apps/dgfy-ims && npx vitest run`), new, 20 passing (implicit voucher_kind/benefit_class/benefit_target on the delivery branch; whole-fee vs waive-up-to amount conversion; the item-benefit fields absent entirely from the payload; scopes always empty even from a stale draft; auto_apply round-trips; fulfillment_methods_mask always locked to 1 regardless of local flags; channels_mask force-includes storefront and forces POS off whenever auto_apply is true, stays freely editable when auto_apply is false; max_benefit_quantity always null; R6 is_publicly_listed forced false under auto_apply, honored otherwise; min_spend_centavos conversion; allow_below_cost/stackable_with_statutory always false; a promo_code regression asserting the exact byte-identical payload shape the shared buildVoucherPayload refactor must not disturb; applyVoucherKindDefaults both directions incl. the R6 forced-false case; suggestVoucherCode pattern-valid output incl. a degenerate-title fallback),packages/web-core/src/features/pos/__tests__/deliveryCampaignPanel.behavior.test.jsx -- actually executed (Vitest + Testing Library, jsdom), new, 6 passing (picking "Delivery campaign" hides the item-benefit picker/scope-picker and shows the waiver/auto-apply controls, Pickup never offered; creating an auto-applied campaign calls createVoucher once with the exact expected payload; the list Type filter sets voucher_kind and include_stats on the listVouchers call; the Performance block renders redemption_count and a peso-formatted total_discount_centavos from a stubbed getVoucher response and never surfaces cache_in_sync; a stubbed VOUCHER_BENEFIT_CONFIG_INVALID renders the server's own message instead of the generic reason-code copy; a stubbed 422 renders against the delivery_amount_off_centavos field),packages/web-core/src/features/pos/__tests__/voucherManagementPayload.test.js (#716 regression) -- actually executed (Vitest), unmodified, 6 passing (fixed_price XOR payload shape and is_publicly_listed independence both remain unaffected by the buildVoucherPayload/blankForm extraction into voucherFormModel.js),packages/web-core/Components/ui/__tests__/ConfirmActionDialog.test.jsx -- actually executed (Vitest), unmodified, passing (reads TerminalOperationsWorkspace.jsx as text -- confirms that file was not touched by this diff, per plan §4.6/R7),packages/web-core/src/features/pos/__tests__/itemDiscountEligibility.contract.test.js -- actually executed (Vitest), unmodified, passing (same file-content-assertion guard as above)
rollback_note: Frontend-only. No schema change, no new endpoint, no money column written by this
  diff -- the backend contract (voucher_kind/benefit_class/benefit_target/auto_apply/
  delivery_amount_off_centavos, the read/report surface) shipped and was verified unchanged by
  #1331/#1332 (Phases 241/244), already deployed. Reverting this diff restores the pre-existing
  promo-code-only authoring form; every delivery_campaign voucher already created through this UI
  stays valid and keeps applying/reporting exactly as before, since the backend that actually
  interprets and redeems it is untouched. There is no rollback mechanism for the container deploy
  path (#495 open), unchanged by this phase.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.395Z
preflight_request_ref: PREFLIGHT-33588602895-2026-09-02-IMS-DELIVERY-CAMPAIGN-AUTHORING
---

# IMS/POS delivery-campaign authoring + reporting UI (Phase 245, #1334, epic #1321)

## Compliance Impact Classification

Major. `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` entry for
`/^packages\/web-core\/src\/features\/pos\//` (`surfaces: ['pos', 'terminal']`,
`minimumClassification: 'major'`) floors this diff — every changed/new file in this PR except
`voucherService.js` (untouched) lives under that prefix:
`packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx` (modified) and the new
`voucherFormModel.js`. `SURFACE_MIN_CLASSIFICATION` independently floors both the `pos` and
`terminal` surfaces at `major`. Nothing in this diff touches `modules/compliance/`,
`middleware/compliancePolicy.js`, `routes/compliance.js`, `validators/complianceValidator.js`,
`controllers/complianceController.js`, `routes/adminTenants.js`,
`controllers/adminTenantController.js`, `packages/web-core/src/features/compliance/`,
`services/complianceService.js`, or `services/adminService.js` — the `regulatory` tier is not
reached. `apps/dgfy-ims/Pages/Settings.jsx` and `apps/dgfy-ims/Pages/admin/TenantManager.jsx` are
the only two `apps/dgfy-ims/` paths in the rule list and neither is touched.

The ticket's own premise undersold this: "IMS screen, likely UI-only, lower stakes" is wrong on
where the UI lives (it is not under `apps/dgfy-ims/` at all — see below) and, independently of the
mechanical floor, wrong on stakes: this screen is the authoring gate that lets a non-engineer
**create** a campaign that spends the merchant's own money on every qualifying order with no
shopper action at all, once `auto_apply` is turned on. The money-persistence and redemption path
itself is unchanged (Phase 244 owns it, already shipped) — this diff only adds the authoring
surface in front of an already-live, already-declared contract.

`reason_codes_impacted: ALLOWED` — this diff introduces no new reason code and no new server-side
validation. It is a client-only form that authors payloads already accepted by the merged
#1331/#1332 contract; the two reason codes it newly maps friendly copy for
(`VOUCHER_BENEFIT_TARGET_MISMATCH`, `VOUCHER_POS_REDEMPTION_DISABLED`) already existed server-side
and were simply unmapped in this panel's `REASON_CODE_MESSAGES` before now.

## Where the authoring UI actually lives — corrects the ticket's own premise

There is no voucher code under `apps/dgfy-ims/`. The merchant voucher authoring UI is
`packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx` (#614, Phase 103),
mounted inside `TerminalOperationsWorkspace.jsx` and routed via `TerminalPage` — a shared page
consumed by **both** `apps/dgfy-ims` (`/terminal`) **and** `apps/dgfy-pos` (`/`, `/terminal`,
`/login`). This is a `packages/web-core` change, not an `apps/dgfy-ims`-only change, which is why
Tier 0 for this PR is both `npm run build:skupervisor` **and** `npm run build:pos`, both reported
below, and why the compliance classification is `major`/`pos,terminal` rather than a
lower-stakes/UI-only read.

## What this change does and does not do

- **Zero backend changes.** Verified field-by-field against `apps/dgfy-api`'s merged #1331/#1332
  contract (`voucher_kind`, `benefit_class`, `benefit_target`, `delivery_amount_off_centavos`,
  `auto_apply`, the shared masks/caps, and the unconditional `redemption_stats` on both
  `GET /vouchers/:id` and `GET /vouchers?include_stats=true`) before writing any frontend code. If
  a gap had been found, this PR would have stopped and reconciled against the pre-approved plan
  rather than silently patching the backend as a side effect of a UI ticket.
- **Extends `VoucherManagementPanel.jsx` in place, kind-aware — does not fork a parallel
  component.** The pure payload/validation/kind-defaulting layer (`blankForm`, `voucherToForm`,
  `buildVoucherPayload`, `validateFormLocally`, the bitmask/money helpers, plus two new pure
  helpers — `applyVoucherKindDefaults`, `suggestVoucherCode`) was extracted into a new
  `voucherFormModel.js`, re-exporting `blankForm`/`buildVoucherPayload` from the panel file
  unchanged so #716's pre-existing regression test keeps importing from the same path and passes
  byte-identically.
- **`voucher_kind`/`benefit_class`/`benefit_target` are implicit**, never raw enum pickers.
  Picking "Delivery campaign" as the voucher type is the only control that sets all three; every
  server-rejectable combination (`fixed_price` targeting delivery, `auto_apply` on a non-delivery
  target, `auto_apply` carrying scopes) is unrepresentable from this branch of the form rather than
  merely caught after the fact.
- **Two forced mask bits, both real correctness fixes, not cosmetic:** fulfillment is locked to
  delivery-only (a pickup order has no delivery fee, so the pickup bit was a guaranteed no-op under
  the shared masks' default), and the channel mask force-includes storefront (and forces POS off)
  whenever `auto_apply` is true — the auto-apply selector (`storeUseCases.js`'s
  `resolveCheckoutContext`) only ever fires from storefront checkout; without this, a merchant
  could unwittingly author a campaign that can never fire.
- **`min_spend_centavos` is explicitly labeled "item subtotal," with helper text stating the
  delivery fee itself doesn't count toward it** — `voucherEligibilityPolicy.js` compares this value
  against the cart's item subtotal, not the order total; a generic "min spend" label would be a
  real merchant-comprehension bug on the ticket's own headline case ("free delivery over ₱X").
- **R6 (auto-apply + `is_publicly_listed` interaction) — decided narrowly for v1, flagged as an
  open question, not silently resolved either way:** `is_publicly_listed` is forced `false` for an
  auto-applied campaign (advertising a card for a code nobody needs to type is, at best, an
  unaudited storefront-discovery interaction this diff did not build or verify) and left available
  for a code-entered delivery campaign, unchanged from a regular promo code. **Open question,
  restated in the PR body:** whether an auto-applied campaign should instead surface as a plain
  storefront banner (a materially different, unbuilt feature) is left to a future ticket rather
  than guessed at here.
- **No new nav entry** — a `voucher_kind`/`auto_apply` type filter was added to the existing
  Vouchers list instead of a second sidebar item. `TerminalOperationsWorkspace.jsx` (9,590+ lines,
  read by two existing tests as raw text — `ConfirmActionDialog.test.jsx`,
  `itemDiscountEligibility.contract.test.js`) is untouched by this diff; both tests were run and
  pass unmodified as direct evidence.
- **No new tenant-wide aggregate reporting endpoint.** Per-campaign `redemption_stats`
  (redemption count + net-of-cancellation waived value, already returned unconditionally by the
  existing GET endpoints) is surfaced in the list and the edit form's new read-only "Campaign
  performance" block. A client-side sum across paginated list pages would produce a materially
  wrong tenant-wide number silently presented as right — deliberately not built. A real tenant-wide
  aggregate is a separate backend ticket for `pm` to file if wanted.
- **`voucher_kind` is read-only in the UI once a voucher exists** — rendered as a badge on edit,
  even though the backend column is technically writable. Converting an existing voucher's kind
  mid-lifecycle (nulling out item-benefit columns and clearing scopes against a voucher that may
  already have redemptions recorded under item semantics) is out of scope for this phase.

## Affected Surfaces

- `pos`, `terminal` — `packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx`
  (modified: kind-aware form, list type/auto-apply filters + report columns, the read-only Campaign
  performance block, the `VOUCHER_BENEFIT_CONFIG_INVALID` server-message pass-through and two new
  mapped reason codes), `packages/web-core/src/features/pos/components/voucherFormModel.js` (new,
  the extracted pure layer).
- Consumed by both `apps/dgfy-ims` (`/terminal`) and `apps/dgfy-pos` (`/`, `/terminal`, `/login`)
  via the shared `TerminalPage`/`TerminalOperationsWorkspace.jsx` mount — neither app-specific file
  is modified; only the shared component and its extracted model.
- Not touched, named for completeness: `packages/web-core/src/services/voucherService.js` (thin
  axios wrapper, already passes arbitrary list params through — no change needed),
  `apps/dgfy-api/**` (entire backend, zero changes), `apps/dgfy-storefront` (its only
  `features/pos` import is `utils/skupervisorHandoff.js`, unrelated to this diff, confirmed by
  grep before starting).

## Compliance Preconditions

- No refund, settlement, capture, or fiscal-document code path is touched — this is a create/read
  form over an already-declared, already-deployed backend contract.
- No money column is written by this diff. The client authors a request body; every dollar-value
  guard (masks non-zero, positive waiver amount, the four `applyBenefitConfig`/
  `assertAutoApplyHasNoScope` authoring guards) is enforced server-side, unchanged, and was proven
  unchanged by re-running the existing backend test suites that cover them (see #1332's own
  declaration, `2026-09-02-auto-applied-delivery-campaigns.md`, for that evidence — this diff adds
  no backend test coverage of its own because it changes no backend code).
- ADR 0066's invariants (Decision 1 no-mutated-unit-price, Decision 8 single discount slot,
  Decision 10 no-eligible-everywhere-by-omission) are all enforced server-side and unaffected by a
  client-only diff; this UI cannot construct a payload that violates any of them without the server
  also rejecting it (see "Layer 1" in the PR body — every server-rejectable combination is
  unrepresentable from this form, not merely translated after a 422).
- **Named limitation, not omitted**: the "Campaign performance" block's figures come from the
  ledger (`redemption_count`/`total_discount_centavos`), never the cached `redeemed_*` columns, and
  deliberately never surface `cache_in_sync` — per `voucherUseCases.js`'s own comment, `false` is
  EXPECTED once Phase 243's reversal rows exist, so showing it would be a permanent false alarm to
  a merchant, not a real signal.

## Verification Evidence

See `verification_evidence` in this file's front matter for the full, itemized list of suites and
pass counts actually executed.

## Preflight Reconciliation

`NOT-EXECUTED-1334-IMS-DELIVERY-CAMPAIGN-AUTHORING` is expected on a PR targeting `develop`, not a
finding — per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually
runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was
made from this session — no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend
was available, matching every other `develop`-targeting PR under this protocol.

## Residual Risks

1. **R6, open question, not resolved here**: whether an auto-applied campaign should instead
   surface as a plain storefront discovery banner rather than being hidden from public listing
   entirely. Forced `is_publicly_listed: false` for v1; restated in the PR body for a human call.
2. **Functional/deployed verification is outstanding** — this PR uses `Refs #1334`/`Refs #1321`,
   not `Closes`, precisely because the ticket's own acceptance criterion is a live, non-engineer
   deployed-verification walkthrough. Nothing in this declaration substitutes for that walkthrough.
3. **No tenant-wide aggregate reporting** — named above as a deliberate scope decision, not an
   oversight; a future ticket if Pat wants a real cross-campaign roll-up.
