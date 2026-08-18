---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-pos-voucher-master-switch
classification: major
surfaces: pos,terminal
reason_codes_impacted: VOUCHER_POS_REDEMPTION_DISABLED
policy_version: 2026.08.18
verification_evidence: node --check (settingsValidator.js, voucherErrors.js, voucherRedemptionUseCases.js, voucherPosRedemptionSettingCache.js), npm run check:compliance, npm run build:pos, npm run check:architecture
rollback_note: Revert the setting/validator/cache/guard/UI changes together. Nothing to unwind server-side -- the setting defaults to off (an absent system_settings row reads false), and the guard this PR adds currently has no live caller (POS voucher redemption itself is not built), so no in-flight redemption path is affected by a revert.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: PR-604-POS-VOUCHER-MASTER-SWITCH
---

# POS Voucher Redemption Master Switch

## Compliance Impact Classification

Major. Adds a tenant-wide setting (`voucher_pos_redemption_enabled`, default off), its read path, and
a fail-closed guard in the voucher redemption domain use case, plus a toggle in the existing POS Setup
settings pane -- matching the `pos,terminal` minimum classification this repo already applies to any
POS/Terminal settings-adjacent change. **This PR currently gates nothing at runtime**: POS voucher
redemption itself has not been built (Phase 105 was storefront checkout only). This ships the gate
first so redemption ships pre-gated once it exists, rather than the gate being retrofitted after an
unguarded POS redemption path already shipped.

## Affected Surfaces

- Tenant setting definition and validation (`apps/dgfy-api/src/validators/settingsValidator.js`).
- New tenant-scoped, short-TTL read cache
  (`apps/dgfy-api/src/modules/vouchers/usecases/voucherPosRedemptionSettingCache.js`), modeled
  directly on the existing `inventoryAuthoritySettingsCache.js` pattern.
- New fail-closed reason code (`VOUCHER_POS_REDEMPTION_DISABLED`,
  `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js`) and guard, added to
  `buildRedeemVoucherUseCase` (`apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js`)
  -- the one function every future POS redemption caller must go through.
- POS Setup settings pane toggle (`apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`).

## Compliance Preconditions

- **Default is off, and needs no seeding.** `system_settings` rows are auto-created on first write;
  an absent row reads falsy in every consumer, including the new cache module here. A tenant that
  never touches this toggle gets the safe default with no migration and no provisioning-time seed.
- **The guard is tenant-wide and channel-aware, not bolted onto a specific POS checkout path.** It
  lives in `buildRedeemVoucherUseCase` itself, gated on `channel === 'pos'`, so it cannot be
  bypassed by a future second POS-side caller the way a guard placed in one checkout use case could
  be.
- **Orthogonal to a voucher's own `channels` mask** (`VOUCHER_CHANNEL_BITS.pos`, evaluated separately
  inside `evaluateVoucherEligibility`) -- this setting can disable POS redemption tenant-wide even
  for a voucher whose own channels already include `pos`. Both controls are independent and neither
  substitutes for the other, per #604's own issue body.
- **No live caller exists yet.** No test coverage was added for the `channel === 'pos'` branch beyond
  what a `node --check` syntax pass confirms, since nothing in the codebase currently constructs a
  call with `channel: 'pos'` to exercise it end-to-end. This is stated plainly rather than implying
  integration coverage that doesn't exist; the guard will get its first real exercise when POS
  redemption itself is built.

## Verification Evidence

- `node --check` on all four touched/new backend files -- OK.
- `npm run build:pos` -- real Vite production build of the touched POS/Terminal settings surface.
- `npm run check:compliance` -- re-run after adding this declaration, expected PASS.
- `npm run check:architecture` -- architecture boundary check against the merge-result tree.
- Local Jest could not be run in this worktree (no `node_modules` installed under `apps/dgfy-api`)
  for a full regression pass -- stated here rather than silently omitted; the PR body carries the
  same note.
