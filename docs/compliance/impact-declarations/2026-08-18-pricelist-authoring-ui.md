---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-pricelist-authoring-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: VOUCHER_PRICELIST_CONFLICT,VOUCHER_PRICELIST_REF_NOT_FOUND,VOUCHER_PRICELIST_NOT_ACTIVE,PRICELIST_NOT_FOUND,PRICELIST_VERSION_CONFLICT,PRICELIST_ARCHIVED_IMMUTABLE,PRICELIST_ITEM_REF_NOT_FOUND,PRICELIST_NOT_PUBLISHABLE
policy_version: 2026.08.18
verification_evidence: npm run build:pos,npx vitest run src/features/pos/,npm run check:compliance,npm run check:architecture
rollback_note: Revert the new PricelistManagementPanel.jsx / pricelistService.js / pricelistDraftStore.js files, the Pricelists tab wiring in TerminalOperationsWorkspace.jsx, and the pricelist-attach toggle in VoucherManagementPanel.jsx together. No server-side write is unique to this PR -- it is a client of #696's already-shipped API. Reverting leaves any pricelist already created via this UI intact and manageable only via direct API calls until re-shipped.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: PR-698-PRICELIST-AUTHORING-UI
---

# Pricelist Authoring UI

## Compliance Impact Classification

Major. Adds a new settings-tab surface (`apps/dgfy-web/src/features/pos/`) that lets authorized
staff create, bulk-edit, publish, and archive per-item wholesale pricelists, and attach one to a
`fixed_price` voucher in place of its single pinned price -- money-discounting configuration,
matching the `pos,terminal` minimum classification this repo already applies to any
settings-adjacent POS-tab change (same classification `2026-08-18-voucher-merchant-authoring-ui.md`
used for the Vouchers tab itself). It is a merchant-facing admin UI, not a checkout or
payment-capture change: it never processes a transaction, moves money, or touches the POS drawer.

## Affected Surfaces

- New `Pricelists` settings tab (`TerminalOperationsWorkspace.jsx`), alongside the existing
  `Vouchers` tab -- standalone, not a sub-section of it (explicit product decision). Gated the same
  way as Vouchers: reaching the settings workspace already implies `settings:view`; only
  create/edit/lifecycle actions are gated on `canManageVouchers` (`settings:edit` / the
  `PERMISSIONS.VOUCHERS.MANAGE` group). No new permission is introduced -- pricelists reuse the
  Vouchers gate end to end, both client- and server-side (`routes/pricelists.js`, #696).
- New `PricelistManagementPanel.jsx` and its thin API client `services/pricelistService.js`.
- New `services/pricelistDraftStore.js` -- localStorage-only autosave buffer, modeled on the
  existing `posCartDraftStore.js` precedent. Client-side only; nothing here reaches the network
  until the merchant presses Save.
- `VoucherManagementPanel.jsx` -- the `fixed_price` benefit form gains a "Price source" toggle
  (single price vs. pricelist), mirroring the XOR the backend (`applyBenefitConfig`, #696) already
  enforces authoritatively.

## Compliance Preconditions

- **The same clobber-prevention discipline the Vouchers panel already documents applies here.**
  Every save resends the pricelist's own `version` (optimistic lock, 409
  `PRICELIST_VERSION_CONFLICT` on a stale value) and builds its outgoing payload field-by-field from
  exactly the writable fields -- never a spread of local component state -- so a server-owned field
  can never leak into a request no matter what ends up in local state.
- **The pricelist-attach toggle never lets a merchant submit both a single price and a pricelist.**
  The form's own `fixedPriceSource` state makes the two mutually exclusive client-side, matching
  (not replacing) the server's authoritative XOR check.
- **Autosave is local-only and stated as such in the UI.** A restore-draft banner appears on
  reopening an in-progress edit; the banner and the code both make clear this buffer lives in one
  browser and does not survive a device switch or cleared site data -- no claim of cross-device
  draft resume is made anywhere in the UI copy.
- **SRP-drift mitigation is implemented, not just documented.** Every row is prefilled with the
  item's current `default_sale_price` as a real editable value (accepted product tradeoff: an
  untouched row sits at SRP, contributing zero discount). Because `Item.default_sale_price`
  auto-updates from Dispatch Order dispatches, a row saved once can drift into granting an
  unintended discount later. `is_manual_override` (already part of #696's schema) distinguishes a
  deliberately-typed price from an untouched SRP snapshot, and the editor surfaces a "N rows are
  still at an older SRP snapshot -- refresh?" banner with a bulk-refresh action rather than shipping
  the prefill silently.
- **Below-cost is warned, never enforced, at authoring time.** `allow_below_cost` lives on the
  voucher (#697), and a pricelist is authored before it is necessarily attached to one -- the editor
  warns per row when a typed price is below the item's `cost_per_unit`, but the actual enforcement
  happens server-side at redemption (#697's guard), not here.

## Verification Evidence

- `npm run build:pos` -- real Vite production build of the POS/Terminal app surface this panel
  ships in; clean, no new warnings beyond the repo's pre-existing large-chunk warnings.
- `npx vitest run src/features/pos/` (from `apps/dgfy-web/`) -- 594/596 passing; the 2 failures
  (`terminalViewModeContracts.test.js`, receipt-print-view PHP-formatting assertions) are
  pre-existing and unrelated to this change -- confirmed by reproducing the identical failure
  against a clean checkout of `develop` before this branch's changes.
- **Gap, stated explicitly rather than silently omitted:** neither `VoucherManagementPanel.jsx` nor
  the new `PricelistManagementPanel.jsx` has component-level (React Testing Library) test coverage
  -- there is no existing test file for the former either, so this PR follows the file's own
  pre-existing precedent rather than introducing a new testing pattern unilaterally. Coverage here
  is the build gate plus the full backend test suite (#696/#697, 420/420 passing) this UI is a
  client of.
- `npm run check:compliance` -- to be re-run after this declaration is added (self-referential
  gate, same as every other declaration in this directory).
- `npm run check:architecture` -- OK.

## Notes for review

Third PR in a 3-PR stack: #699 (#697) → #700 (#696) → this PR. Base is #700's branch. #698's own
issue names CSV bulk import and folder-level bulk pricing as explicitly out of scope for v1; neither
is implemented here.
