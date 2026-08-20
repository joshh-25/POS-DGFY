---
status: reference
owner: engineering
last_reviewed: 2026-08-20
declaration_id: 2026-08-20-voucher-public-listing
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.20
verification_evidence: tenantSchemaSyncScripts.test.js,voucherValidator.test.js,voucherUseCases.usecases.test.js,voucherManagementPayload.test.js,voucherDisplayUseCases.test.js,storefrontDiscoveryIndexService.catalogVisibility.test.js,fnbPromoModel.test.js,POS production build,Skupervisor production build
rollback_note: Revert this commit series to remove is_publicly_listed entirely. The migration is additive-only (ADD COLUMN ... DEFAULT false, idempotent, guarded by tableExists/columnExists) and the sync-tenant-schemas.js repair entry follows the pricelist_id precedent exactly -- a rollback (DROP COLUMN, in the migration's down()) is safe because no other code path reads is_publicly_listed for anything but the new storefront discovery projection; channels_mask (the field that actually gates redemption usability) is untouched. Defaulting to false means no existing voucher is advertised on any storefront until a merchant explicitly opts in.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-20T00:00:00+08:00
preflight_request_ref: ISSUE-713-VOUCHER-PUBLIC-LISTING
---

# Voucher Public Listing

## Compliance Impact Classification

Major because this touches `apps/dgfy-api/src/modules/vouchers/`'s use cases (`voucherUseCases.js`,
`voucherDisplayUseCases.js`) and `apps/dgfy-web/src/features/pos/`'s voucher authoring UI
(`VoucherManagementPanel.jsx`), both matching `scripts/check-compliance-impact.js`'s
`surfaces: pos,terminal`, `minimumClassification: major` rules. `apps/dgfy-api/src/services/
storefrontDiscoveryIndexService.js` and `apps/dgfy-api/scripts/sync-tenant-schemas.js` live outside
`modules/`/`routes/`/`validators/` entirely and match none of the sensitive-file rules on their own;
they're covered here because they're part of the same change, not because either independently
triggers the gate.

## Affected Surfaces

1. `vouchers.is_publicly_listed` (new column, `BOOLEAN NOT NULL DEFAULT false`) -- a second,
   independent visibility flag alongside the existing `channels_mask`. `channels_mask` keeps
   controlling where a code is *usable* (storefront/POS); this new flag controls only whether a
   voucher is *advertised* on a storefront discovery listing. Neither flag implies the other -- a
   voucher can be POS-usable and never listed, or listed and still gated by the existing eligibility
   checks at redemption time.
2. `apps/dgfy-api/src/services/storefrontDiscoveryIndexService.js` -- new `storefront_vouchers` array
   in the discovery snapshot: active, `is_publicly_listed`, storefront-channel-eligible vouchers only,
   reusing `voucherDisplayUseCases.js`'s existing `DISPLAY_RELEVANT_REASON_CODES` fail-open catalog-
   display filter (now exported, unmodified in behavior) rather than a new listing-specific filter.
3. `VoucherManagementPanel.jsx` -- new "List on public storefront" checkbox in the authoring form,
   independent of the existing channel checkboxes.
4. `apps/dgfy-web/apps/store/src/modes/fnb/promos/model/fnbPromoModel.js` -- `getPromoCandidates`
   gains `storefront_vouchers` as a second candidate source, adapted to the existing promo-entry
   shape (`adaptVoucherToPromoEntryShape`) so all five FNB storefront pages that already consume
   `buildFnbPromoSectionModel` pick up publicly-listed vouchers with no per-page change. A voucher
   sharing a code with a promo is deduped in the promo's favor (existing precedence order).
5. `apps/dgfy-api/scripts/sync-tenant-schemas.js` -- `is_publicly_listed` added to
   `REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers` (column-repair registry only, matching the `pricelist_id`
   precedent) so existing tenants receive the column via the repair path; the base `CREATE TABLE`
   snapshot is deliberately untouched, since table creation always runs before column repair for
   every tenant.

## Compliance Preconditions

1. Default `false` -- no existing voucher becomes publicly listed as a side effect of this migration;
   a merchant must explicitly opt in per voucher.
2. Listing is display-only. Redemption eligibility is unchanged: `evaluateVoucherEligibility` and its
   16 reason codes, the `voucher_pos_redemption_enabled` master switch, and `channels_mask` are none
   of them read or modified by this change. A listed voucher can still be refused at redemption time
   for any existing reason (expired, exhausted, channel-ineligible, etc.) -- listing is advertising,
   not a bypass.
3. Cache-key concern checked (matching #671's affiliate-attribution class of bug): the storefront
   discovery snapshot's voucher listing depends only on `now`/tenant timezone (page-level state), not
   on any per-visitor identity, session, or cart contents -- so no new per-visitor cache variance is
   introduced by adding `storefront_vouchers` to the snapshot.
4. Fail-open, not fail-closed, on a missing dependency: if the `Voucher` model is unavailable for a
   tenant, `storefront_vouchers` is omitted from the snapshot rather than failing the whole discovery
   response -- verified by a dedicated test (see Verification Evidence).
5. No new PII collected -- `is_publicly_listed` is a merchant-authored boolean on the voucher record
   itself; no customer or visitor data is newly captured, stored, or exposed by this change.

## Verification Evidence

1. `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js` -- new test confirming the
   `vouchers.is_publicly_listed` column-repair entry is registered, defaulting to `false`. Full suite
   (23 tests) passes.
2. `apps/dgfy-api/tests/voucherValidator.test.js` -- extended defaults test plus a new dedicated test
   accepting an explicit `true` on both create and update. Full suite (90 tests) passes.
3. `apps/dgfy-api/tests/voucherUseCases.usecases.test.js` -- `is_publicly_listed` added to the
   `VOUCHER_DEFAULTS` fixture, confirming it round-trips through the writable-column allowlist. Full
   suite (152 tests) passes.
4. `apps/dgfy-web/src/features/pos/__tests__/voucherManagementPayload.test.js` -- new describe block
   "#713 buildVoucherPayload -- is_publicly_listed independent of channelFlags" (2 new tests),
   proving the new flag round-trips through the authoring form independently of the channel
   checkboxes. Full suite (6 tests) passes.
5. `apps/dgfy-api/tests/storefrontDiscoveryIndexService.catalogVisibility.test.js` -- 2 new tests:
   "lists only active, publicly-listed, storefront-eligible vouchers" and "omits storefront_vouchers
   without failing the whole snapshot when the Voucher model is unavailable" (the fail-open
   precondition above). Full suite (6 tests) passes.
6. `apps/dgfy-web/apps/store/src/modes/fnb/promos/model/fnbPromoModel.test.js` -- new describe block
   "#713 storefront_vouchers" (4 tests): percent_off adaptation, non-percent_off adaptation with no
   fabricated discount label, dedup against a promo sharing the same code, and an inactive voucher
   being dropped. Full suite (7 tests) passes.
7. `apps/dgfy-api/src/modules/vouchers/usecases/voucherDisplayUseCases.js`'s existing 16 tests
   unaffected by exporting `DISPLAY_RELEVANT_REASON_CODES` (no behavior change, only a visibility
   change on an existing constant).
8. `npm run build:pos` and `npm run build:skupervisor` both pass.
9. `GITHUB_BASE_REF=develop node scripts/check-compliance-impact.js`,
   `npm run check:architecture`, `npm run check:adr`, `npm run lint:docs` all pass.
