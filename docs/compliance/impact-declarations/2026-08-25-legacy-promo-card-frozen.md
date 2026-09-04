---
status: reference
owner: engineering
last_reviewed: 2026-08-25
declaration_id: 2026-08-25-legacy-promo-card-frozen
classification: major
surfaces: settings,pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.08.23
verification_evidence: npm run build:skupervisor,npm run build:pos,npm run check:compliance,npm run check:adr,npm run check:architecture,npm test (apps/dgfy-ims),do-not-commit/local-test rendered-bundle verification (docker context ch)
rollback_note: Revert this commit. The final state of this PR removes both legacy promo settings sections (the singular editor in apps/dgfy-ims/Pages/Settings.jsx and the plural editor in packages/web-core/.../TerminalOperationsWorkspace.jsx) and their now-fully-dead supporting code entirely, rather than merely disabling inputs. Rollback restores both editors exactly as they were before PR #988/#695 (fully editable, no freeze) -- no schema, migration, or redemption-path change is involved, so rollback carries no data or compliance-state risk. commercialPromoPolicy.js and every existing redemption/read path are untouched by this PR either way.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.390Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-25-LEGACY-PROMO-CARD-FROZEN
---

# Legacy Promo Card Removed (#695)

## Compliance Impact Classification

Classified `major` for two independent, both-already-major reasons:

1. `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` hard-floors any change to
   `apps/dgfy-ims/Pages/Settings.jsx` at `major`/`settings` -- an exact-path match, independent of
   the diff's actual content.
2. `packages/web-core/src/features/pos/` is separately floored at `major`/`pos,terminal` -- this PR
   touches `TerminalOperationsWorkspace.jsx` and its tests.

**This PR's scope evolved during review and a follow-up conversation with Pat, in three stages, all
landing in the same PR before merge:**

1. **Freeze** (original scope) -- disabled every input on both legacy promo editors so a new promo
   could no longer be authored or an existing one edited, while leaving both editors visible.
2. **Production verification** -- a direct, read-only check against production (`ssh dgfy`, all 45
   tenant DBs) found exactly one real, live, un-migrated legacy promo (`storefront_promo` on
   `sku_tenant_digistore_07dc0023`, code `STOREKO`, 5% off, active, valid until 2026-08-31). Per
   Pat's call: `digistore` is a test store, so losing this code on removal is acceptable -- it can
   be manually recreated as a voucher if ever needed. No other tenant has a real, live legacy promo.
3. **Full removal** (final scope, this declaration) -- given that finding, Pat asked to remove both
   legacy promo sections from the settings UI entirely rather than leave them frozen-but-visible.
   This PR now deletes:
   - The "Promo Card" section (`apps/dgfy-ims/Pages/Settings.jsx`): its JSX block, its
     `storefrontPromo*` default-state keys, its `storefront_promo` hydration, and the local
     `storefrontPromo` const that fed it. The `storefront_promo`/`storefront_promos` display-label
     map entries and the settings-key allowlist entry are left untouched -- those describe a
     setting key that still exists in the DB/backend (its full retirement is #991), not this
     screen's own UI.
   - The "Promo Codes (Legacy)" section (`packages/web-core/.../TerminalOperationsWorkspace.jsx`):
     the entire JSX block, every handler/state/memo that existed solely to serve it
     (`selectStorefrontPromo`, `addStorefrontPromo`, `removeStorefrontPromo`,
     `addStorefrontPromoTargetItem`/`removeStorefrontPromoTargetItem`,
     `mergeCurrentStorefrontPromoList`, `loadStorefrontPromoIntoForm`,
     `serializeCurrentStorefrontPromo`, `loadStorefrontPromoItems` and its mount effect, four
     `useMemo`s, three `useState`s), the module-level helpers it alone depended on
     (`createBlankStorefrontPromo`, `normalizeStorefrontPromoConfig`, `normalizeStorefrontPromoList`,
     `normalizePromoEligibilityMap`, `hasMeaningfulStorefrontPromo`, `getStorefrontPromoDate`,
     `isStorefrontPromoExpired`, `isPlainObject`, `createStorefrontPromoId`,
     `normalizePositiveIntegerList`, the promo date/time formatters), the save handler's
     duplicate-code/schedule-validation loop (its resolution path -- the UI -- no longer exists,
     so leaving it would have blocked an unrelated storefront save with no way to fix the flagged
     promo), and the now-fully-orphaned `storefrontPromoSchedule.js` utility + its test (verified
     zero remaining consumers before deletion).
   - Both contract tests (`legacyPromoCardFrozen.test.jsx`,
     `legacyPromoAuthoringFrozen.contract.test.js`) rewritten to assert absence instead of
     disabled-presence. `storefrontPromoEligibility.contract.test.js` deleted -- it asserted
     behavior of the now-removed eligibility-checkbox UI.

**What is deliberately NOT removed, tracked by #991 instead:** the `storefront_promo`/
`storefront_promos` settings keys themselves, `commercialPromoPolicy.js` and every consumer
(`posDiscountPolicy.js`, `storeUseCases.js`, the storefront discovery projections), and
`posCommercialPromoConfig.js` (still live -- consumed by `POSCheckoutTerminal.jsx`'s actual
checkout-time promo redemption, a different code path from the settings-authoring UI removed here).
This PR only removes the *authoring/settings* surface; the *redemption* path is untouched and keeps
working exactly as before for any tenant that still has a stored legacy promo.

## Affected Surfaces

- `settings` -- `apps/dgfy-ims/Pages/Settings.jsx`'s exact-path floor.
- `pos`, `terminal` -- `packages/web-core/src/features/pos/`'s path-prefix floor.

No `payments` or `compliance` surface logic changed.

## Compliance Preconditions

None apply -- no reason code, compliance policy, tenant lifecycle, or settings persistence *rule*
changed; only a settings-authoring UI and its dead supporting code were deleted. `#991` is filed and
parented under epic #453 to track the actual backend retirement (settings keys,
`commercialPromoPolicy.js`) this PR does not attempt. This declaration is also paired with a same-PR
amendment to ADR 0066 Consequences item 4 (untagged, no strictness tier, per ADR 0039) -- see that
amendment's own text for detail, unrelated to this UI-removal change itself.

## Verification Evidence

- `npm run build:skupervisor` and `npm run build:pos`: real Vite production builds of both apps
  that consume `TerminalOperationsWorkspace.jsx`, succeeded. Both bundles shrank measurably
  (Settings: 229.45kB -> 226.20kB; TerminalOperationsWorkspace: 586.68kB -> 564.61kB in the IMS
  build), confirming real dead code was removed, not just hidden.
- `npm run check:compliance`, `npm run check:adr`, `npm run check:architecture`: all PASS.
- `npm test` in `apps/dgfy-ims` (includes `packages/web-core/**`): 286 files / 1679 tests, all
  passing -- includes both rewritten contract tests asserting the sections and their supporting
  code no longer exist.
- Exhaustive grep verification before and after: zero remaining references to any removed
  `storefrontPromo*`-named identifier, and zero remaining consumers of `storefrontPromoSchedule.js`,
  confirmed before deleting it.
- `npm run lint` in `apps/dgfy-ims`: 0 errors, 27 pre-existing warnings, unchanged by this diff.
- Manual diff review: neither settings screen's *other* sections (Storefront tagline, hours,
  reviews, gallery, etc.) were touched; `commercialPromoPolicy.js` and its 8 read/redemption call
  sites are completely untouched.

## Changed Files

- `apps/dgfy-ims/Pages/Settings.jsx`
- `apps/dgfy-ims/Pages/__tests__/legacyPromoCardFrozen.test.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/__tests__/legacyPromoAuthoringFrozen.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/storefrontPromoEligibility.contract.test.js` (deleted)
- `packages/web-core/src/features/pos/utils/storefrontPromoSchedule.js` (deleted)
- `packages/web-core/src/features/pos/utils/storefrontPromoSchedule.test.js` (deleted)
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (2026-08-25 amendment)
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-695-LEGACY-PROMO-CARD-FROZEN` is expected on a
PR targeting `develop`, not a finding -- per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`
promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment), not per PR.
