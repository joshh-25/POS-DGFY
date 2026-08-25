---
status: reference
owner: engineering
last_reviewed: 2026-08-25
declaration_id: 2026-08-25-legacy-promo-card-frozen
classification: major
surfaces: settings
reason_codes_impacted: NONE
policy_version: 2026.08.23
verification_evidence: npm run build:skupervisor,npm run check:compliance,npm run check:adr,npm test (apps/dgfy-ims)
rollback_note: Revert this commit. The change disables inputs on an already-frozen settings card and drops one key from the settings save payload; no schema, migration, redemption logic, or persisted-value shape changed, so rollback carries no data or compliance-state risk. A rollback restores the ability to author a new legacy promo code via this one screen -- the same exposure that existed before #776's parallel freeze on the plural editor, not a new one.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-25T00:00:00Z
preflight_request_ref: NOT-EXECUTED-695-LEGACY-PROMO-CARD-FROZEN
---

# Legacy Promo Card Frozen (#695)

## Compliance Impact Classification

Classified `major` because `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`
hard-floors any change to `apps/dgfy-ims/Pages/Settings.jsx` at `major` with surface `settings` --
an exact-path match on the file, independent of the diff's actual content, matching the same
blunt-floor situation `2026-08-23-ims-settings-lint-entity-escape.md` already documents for this
file.

**The actual content is a freeze, not a capability change.** The "Promo Card" block in the
Storefront Page settings tab is the last remaining surface anywhere in the codebase that can author
a new legacy `storefront_promo` discount code -- the sibling plural editor
(`packages/web-core/.../TerminalOperationsWorkspace.jsx`, `storefront_promos`) was already frozen by
#776/#695. This change:

- Relabels the section "Promo Card (Legacy)" and adds copy pointing merchants at Vouchers.
- Adds `disabled` to every input and the Active switch in that block. Existing values still load
  and render (the load path, `:1017`/`:1101-1111`, is untouched) so a tenant's current card stays
  visible; nothing can be newly authored or edited.
- Drops the `storefront_promo` key from this screen's settings-save payload
  (`updatePayload` at `:2002`). This editor only ever knew 11 of the fields the promo engine
  persists -- it has no `target_item_ids`, `valid_from`/`valid_until`, or the
  `channels`/`fulfillment_methods`/`order_timing` eligibility maps the fuller web-core editor can
  set. Before this change, every save on this screen silently rebuilt `storefront_promo` from just
  those 11 fields (narrowing a richer record) and would re-create the key after the #695 migration
  deletes it. `settingsRepository.updateSettings` only touches keys present in the request body, so
  omitting the key here leaves whatever is stored on that key strictly alone.

No new discount capability, redemption path, validation rule, or persisted data shape is
introduced. `commercialPromoPolicy.js` and every existing redemption/read path
(`posDiscountPolicy.js`, `storeUseCases.js`, the storefront discovery projections) are unchanged --
per Pat's standing call, the legacy engine's actual retirement stays deferred until the voucher-
based system is prod-proven.

## Affected Surfaces

`settings` (via the exact-path rule above). No `pos`, `terminal`, `payments`, or `compliance`
surface logic changed -- this file's compliance floor is a blanket rule on the whole Settings page,
not a marker that this specific change touches settings *logic*.

## Compliance Preconditions

None apply -- no reason code, compliance policy, tenant lifecycle, or settings persistence *rule*
changed. `reason_codes_impacted: NONE` reflects that no reason-code-bearing decision path was
touched. This declaration is paired with a same-PR amendment to ADR 0066 Consequences item 4 (an
untagged, non-strictness-tiered clause, per ADR 0039), which reconciles the ADR's text with the
promo-to-voucher migration behavior already shipped in PR #778 -- that amendment records a fact
about already-merged code, it does not itself change any runtime behavior.

## Verification Evidence

- `npm run build:skupervisor`: real Vite production build of `apps/dgfy-ims`, succeeded.
- `npm run check:compliance`: PASS, confirming this declaration validates against the gate's
  frontmatter/section requirements.
- `npm run check:adr`: PASS (79 ADRs validated), confirming the ADR 0066 amendment's shape is
  correct.
- `npm test` in `apps/dgfy-ims`: new `legacyPromoCardFrozen.test.jsx` contract test passes,
  asserting every promo input and the Active switch are disabled, the relabel/copy are present, and
  `storefront_promo` is absent from the save payload.
- Manual diff review: the load path (`:1017`, `:1101-1111`) is untouched; the only behavioral
  change is the added `disabled` attributes and the removed `storefront_promo` payload key.

## Changed Files

- `apps/dgfy-ims/Pages/Settings.jsx`
- `apps/dgfy-ims/Pages/__tests__/legacyPromoCardFrozen.test.jsx`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-695-LEGACY-PROMO-CARD-FROZEN` is expected on a
PR targeting `develop`, not a finding -- per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`
promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment), not per PR.
