---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-voucher-pricelist-entity
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: VOUCHER_PRICELIST_CONFLICT,VOUCHER_PRICELIST_REF_NOT_FOUND,VOUCHER_PRICELIST_NOT_ACTIVE,PRICELIST_NOT_FOUND,PRICELIST_VERSION_CONFLICT,PRICELIST_ARCHIVED_IMMUTABLE,PRICELIST_ITEM_REF_NOT_FOUND,PRICELIST_NOT_PUBLISHABLE
policy_version: 2026.08.18
verification_evidence: node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucher*.test.js tests/pricelist*.test.js tests/tenantSchemaSyncScripts.test.js,npm run check:compliance,npm run check:architecture,npm run check:adr,npm run check:tenant-schema-coverage
rollback_note: Revert this PR's files together, on top of #697's PR staying in place (this PR stacks on it). The new migration (20260818000001-create-pricelists.cjs) has a real down() that drops both new tables and the vouchers.pricelist_id column -- run it before reverting code if the migration already applied to a shared environment. No production tenant data is affected by a revert; pricelists is a new, empty aggregate with no prior callers.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: PR-696-VOUCHER-PRICELIST-ENTITY
---

# Voucher Pricelist Entity

## Compliance Impact Classification

Major. Adds a new tenant-scoped entity (`pricelists` / `pricelist_items`) and a new admin API
surface (`/api/v1/pricelists`) that lets authorized staff set per-item wholesale prices a voucher
can carry — money-discounting configuration, matching the `pos,terminal` minimum classification
this repo already applies to `modules/vouchers/` and the `payments` surface `modules/store/`
carries. Not a checkout or payment-capture change on its own: no persisted unit price is ever
written (ADR 0066 decision 1, `[binding]`, explicitly restated as untouched in this PR's ADR
amendment), and resolution happens entirely inside the existing voucher benefit/redemption seam.

## Affected Surfaces

- New tables `pricelists`, `pricelist_items`; new column `vouchers.pricelist_id` (migration
  `20260818000001-create-pricelists.cjs`, registered in `sync-tenant-schemas.js` for existing-tenant
  repair, `TENANT_SCHEMA_CAPABILITY_VERSION` bumped).
- New models `Pricelist.js`, `PricelistItem.js`; `Voucher.js` gains `pricelist_id`.
- New `modules/vouchers/repositories/pricelistRepository.js`,
  `modules/vouchers/usecases/pricelistUseCases.js`, `modules/vouchers/controllers/pricelistHandlers.js`.
- New `validators/pricelistValidator.js`, new route `routes/pricelists.js` mounted at
  `/api/v1/pricelists`, gated on the existing `PERMISSIONS.VOUCHERS` group (no new permission
  introduced).
- `voucherUseCases.js` — the fixed_price/pricelist XOR (`applyBenefitConfig`), pricelist
  existence/status validation (`assertPricelistRef`), and the scope requirement now accepts an
  attached pricelist in place of `voucher_scopes` rows.
- `voucherValidator.js` — schema-level XOR conditionals mirroring the use-case-level enforcement.
- `voucherBenefitPolicy.js` — `calculateVoucherBenefit` gains an optional
  `fixedUnitPriceByItemId` map alongside the existing scalar; benefit-class math and allocation are
  otherwise unchanged.
- `voucherRedemptionUseCases.js` / `voucherDisplayUseCases.js` — when a voucher carries
  `pricelist_id`, the pricelist's own item rows supply the eligible item set and per-item price
  instead of `voucher_scopes` / the scalar price. No behavior change for any voucher without one.
- `voucherErrors.js` — 8 new reason codes (listed in frontmatter above), zero renamed or removed.

## Compliance Preconditions

- **XOR enforced at two independent layers.** `voucherUseCases.js`'s `applyBenefitConfig` is the
  authoritative check (re-run on create, update, and activation); `voucherValidator.js`'s Joi
  conditionals catch the same violation at the schema layer before it reaches the use case. Neither
  layer alone is trusted as sufficient — both are tested directly.
- **A voucher may only attach an `active` pricelist**, validated inside the same transaction as the
  voucher write, before the write commits (mirrors `assertScopeRefsExist`'s existing attach-time
  contract). A `draft` pricelist (possibly mid-autosave once #698 ships) or an `archived` one cannot
  be attached to a new or updated voucher.
- **Draft → publish is transactional and never rewrites `vouchers.pricelist_id`.** Publishing a
  draft revision swaps its items into the published parent's row (same `pricelist_id`) inside one
  transaction, then deletes the draft — a buyer mid-checkout against the live pricelist never sees
  an in-progress edit, and no voucher foreign key is ever rewritten by a publish.
- **No persisted unit price is ever written.** `pricelist_items.unit_price_centavos` is intent,
  resolved into an order-level discount at redemption time exactly like the pre-existing
  `fixed_unit_price_centavos` scalar — ADR 0066 decision 1 `[binding]` is unchanged and explicitly
  restated as such in this PR's ADR amendment.
- **Deploy-order risk, named explicitly:** `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`
  is `Reopened` with four production tenants carrying unresolved FK drift (`OPS-TSYNC-001`). Per
  #539, a tenant missing a required table crash-loops the entire shared API under
  `NODE_ENV=production` — the preflight is unconditional and all-or-nothing. This PR's migration
  must not deploy ahead of resolving or explicitly accepting that residual risk for the affected
  tenants.

## Verification Evidence

- Full voucher + pricelist + tenant-schema-sync suite, from `apps/dgfy-api/`:
  `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/voucher*.test.js tests/pricelist*.test.js tests/tenantSchemaSyncScripts.test.js`
  — **354/354 passing**, including 19 new `pricelistUseCases` cases, 11 new `pricelistValidator`
  cases, new XOR/attach-validation cases in `voucherUseCases`/`voucherValidator`, new
  pricelist-scope cases in `voucherRedemptionUseCases`/`voucherDisplayUseCases`, 4 new fixture cases
  in `voucherBenefitCases.json`, and 4 new model↔registry parity assertions in
  `tenantSchemaSyncScripts.test.js` for the two new tables plus the `vouchers.pricelist_id`
  column-repair entry.
- `node --check` on every changed/new `.js` file — clean.
- `npm run check:compliance`, `npm run check:architecture`, `npm run check:adr` — to be re-run
  after this declaration is added (self-referential gate, same as every declaration in this
  directory).
- `npm run check:tenant-schema-coverage` — ADR 0066's own validation item 4, extended to cover the
  two new tables.

## Architecture Impact

ADR 0066 amended a second time in this same PR stack: Decision 5 (`[default]`) widened from a
single scalar to an XOR between the scalar and a per-item pricelist reference. Decision 1
(`[binding]`, no persisted unit-price write) and Decision 7 (`[default]`, affiliate refusal) are
both explicitly restated as inherited unchanged.

## Notes for review

- Second PR in a 3-PR stack: #697 (below-cost guard) → this PR → #698 (authoring UI, not yet
  built). #694 (storefront voucher button) is an independent 4th PR with no dependency on this one.
- The migration is a checkpoint per `.agents/skills/implement/SKILL.md` — approved by Pat before
  this PR opened.
