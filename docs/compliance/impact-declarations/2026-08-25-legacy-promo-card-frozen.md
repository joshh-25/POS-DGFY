---
status: reference
owner: engineering
last_reviewed: 2026-08-25
declaration_id: 2026-08-25-legacy-promo-card-frozen
classification: major
surfaces: settings,pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.08.23
verification_evidence: npm run build:skupervisor,npm run build:pos,npm run check:compliance,npm run check:adr,npm test (apps/dgfy-ims),do-not-commit/local-test rendered-bundle verification (docker context ch)
rollback_note: Revert this commit. The change disables inputs on two already-frozen (or partially-frozen) settings/POS editors and drops legacy promo keys from two settings save payloads; no schema, migration, redemption logic, or persisted-value shape changed, so rollback carries no data or compliance-state risk. A rollback restores the ability to edit an existing legacy promo code's discount/eligibility via either screen -- the same exposure that predates this PR, not a new one.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-25T00:00:00Z
preflight_request_ref: NOT-EXECUTED-695-LEGACY-PROMO-CARD-FROZEN
---

# Legacy Promo Card Frozen (#695)

## Compliance Impact Classification

Classified `major` for two independent, both-already-major reasons:

1. `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` hard-floors any change to
   `apps/dgfy-ims/Pages/Settings.jsx` at `major`/`settings` -- an exact-path match, independent of
   the diff's actual content, matching the same blunt-floor situation
   `2026-08-23-ims-settings-lint-entity-escape.md` already documents for this file.
2. `packages/web-core/src/features/pos/` is separately floored at `major`/`pos,terminal` -- this PR
   touches `TerminalOperationsWorkspace.jsx` (a shared POS/IMS settings component under that path)
   and its contract test.

**The actual content is a freeze, not a capability change**, expanded mid-review after a PR #988
review (see `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` Phase 155) correctly found the first cut
incomplete. Two editors write the legacy `storefront_promo(s)` keys that
`commercialPromoPolicy.js` still redeems on both POS and storefront checkout:

- **`apps/dgfy-ims/Pages/Settings.jsx`** ("Promo Card", singular `storefront_promo` key) -- every
  input and the Active switch are disabled; the load path is untouched so an existing tenant's card
  still displays. `storefront_promo` is dropped from this screen's save payload (`updatePayload`).
- **`packages/web-core/.../TerminalOperationsWorkspace.jsx`** ("Promo Codes (Legacy)", plural
  `storefront_promos` key) -- #776 had already frozen the "Add Promo" *creation* button, but
  **editing an existing card was still fully live**: code, discount percent, usage limit, time
  window, and channel/fulfillment/timing eligibility were all mutable, the Remove button worked,
  and `handleStorefrontSave` wrote both `storefront_promo` and `storefront_promos` on *every*
  storefront settings save regardless of whether a promo field changed. This PR disables every
  remaining input/button in that section (Title, Badge, Subtitle, Validity Text, Promo Code,
  Discount Percent, Usage Limit, From/To date pickers, the three eligibility checkbox groups, the
  Active checkbox, Remove, the promo-item picker/Add Item, and each item's remove chip) and drops
  both `storefront_promo` and `storefront_promos` from that save handler's payload.

No new discount capability, redemption path, validation rule, or persisted data shape is
introduced -- both changes only remove write/edit surface. `commercialPromoPolicy.js` and every
existing redemption/read path (`posDiscountPolicy.js`, `storeUseCases.js`, the storefront discovery
projections) are unchanged -- per Pat's standing call, the legacy engine's actual retirement stays
deferred until the voucher-based system is prod-proven.

## Affected Surfaces

- `settings` -- `apps/dgfy-ims/Pages/Settings.jsx`'s exact-path floor.
- `pos`, `terminal` -- `packages/web-core/src/features/pos/`'s path-prefix floor
  (`TerminalOperationsWorkspace.jsx` is the shared POS settings workspace both `dgfy-ims` and
  `dgfy-pos` build against).

No `payments` or `compliance` surface logic changed -- both floors are blanket rules on the whole
file/directory, not a marker that this diff touches payments or compliance decision logic.

## Compliance Preconditions

None apply -- no reason code, compliance policy, tenant lifecycle, or settings persistence *rule*
changed. `reason_codes_impacted: NONE` reflects that no reason-code-bearing decision path was
touched. This declaration is paired with a same-PR amendment to ADR 0066 Consequences item 4 (an
untagged, non-strictness-tiered clause, per ADR 0039), which reconciles the ADR's text with the
promo-to-voucher migration behavior already shipped in PR #778 -- that amendment records a fact
about already-merged code, it does not itself change any runtime behavior.

## Verification Evidence

- `npm run build:skupervisor`: real Vite production build of `apps/dgfy-ims` (consumes
  `TerminalOperationsWorkspace.jsx`), succeeded.
- `npm run build:pos`: real Vite production build of `apps/dgfy-pos` (also consumes
  `TerminalOperationsWorkspace.jsx`), succeeded.
- `npm run check:compliance`: PASS, confirming this declaration's `surfaces` now cover both changed
  paths.
- `npm run check:adr`: PASS (79 ADRs validated), confirming the ADR 0066 amendment's shape is
  correct.
- `npm test` in `apps/dgfy-ims` (which also runs `packages/web-core/**` tests per that workspace's
  vitest config): `legacyPromoCardFrozen.test.jsx` (IMS singular editor) and the extended
  `legacyPromoAuthoringFrozen.contract.test.js` (web-core plural editor) both pass, asserting every
  promo control in each editor is disabled and both legacy keys are absent from each save payload.
- Manual diff review: both editors' load/display paths are untouched -- an existing tenant's promo
  card still renders on both screens; the only behavioral change is the added `disabled` attributes
  and the removed payload keys.
- **Rendered-UI proof (Architecture Governance item 8): done**, against Pat's own real
  `do-not-commit/local-test/` restored-production stack (docker context `ch`). Both
  `dgfy-ims` and `dgfy-pos` images were rebuilt from this branch (`docker compose --env-file
  .env.compose build dgfy-ims dgfy-pos`, then `up -d`) and recreated cleanly
  (`healthy` status). Verified two ways, without logging into any real tenant account (this
  stack's DB is a restored production snapshot with real merchant data, and no test credentials
  were available or guessed at):
  1. **Served-bundle proof**, stronger than a screenshot for a minification-sensitive change:
     fetched the actual compiled JS served through nginx (`curl localhost:5173/assets/Settings-*.js`,
     `curl localhost:5173|5174/assets/TerminalOperationsWorkspace-*.js`) and confirmed the exact
     source fixes survived minification -- `disabled:!0` present on every frozen control, the
     corrected copy strings present verbatim, and `storefront_promo:`/`storefront_promos:` present
     only in the pre-existing display-label map, never inside the `handleStorefrontSave`/
     `updatePayload` object literals.
  2. **Rendered page check**: both apps' login/terminal screens (`localhost:5173/login`,
     `localhost:5174/`) load nonblank, with correct page identity (`SKUpervisor IMS`, `DGFY POS`
     titles) and zero console errors. This confirms the containers, nginx routing, and `dgfy-api`
     backend (already `healthy`, "Database connection established successfully") are all wired
     correctly for this branch's build.
  This does not include a logged-in screenshot of the actual disabled Settings/Terminal Operations
  screen -- that would require a real merchant's credentials, which this session does not have and
  will not guess at. The served-bundle proof above is the substitute: it verifies the same DOM
  attributes a logged-in screenshot would show, read from what is actually served, not from source.

## Changed Files

- `apps/dgfy-ims/Pages/Settings.jsx`
- `apps/dgfy-ims/Pages/__tests__/legacyPromoCardFrozen.test.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/__tests__/legacyPromoAuthoringFrozen.contract.test.js`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-695-LEGACY-PROMO-CARD-FROZEN` is expected on a
PR targeting `develop`, not a finding -- per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`
promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment), not per PR.
