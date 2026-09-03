---
status: reference
owner: engineering
last_reviewed: 2026-09-08
related_adr: docs/architecture/adr/0066-voucher-sale-time-price-resolution.md (Decision 3 --
  fail-closed checkout / fail-open display, inherited unchanged; Decision 4 -- the ledger stays
  authoritative and gains its first writer for dgfy_account_id; Decision 9 -- eligibility as
  first-class indexable structure, extended to a child table; Decision 10 -- absence must be
  unrepresentable, applied to the derived restriction flag. Amended in the same PR with a dated
  Amendments block.)
declaration_id: 2026-09-08-voucher-account-restricted-issuance
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: VOUCHER_ACCOUNT_REQUIRED,VOUCHER_ACCOUNT_NOT_ELIGIBLE,VOUCHER_ACCOUNT_GRANTS_UNRESOLVED,VOUCHER_ACCOUNT_RESTRICTED_NOT_PUBLICLY_LISTABLE
policy_version: 2026.09.08
verification_evidence: node --check on every changed/added apps/dgfy-api and apps/dgfy-migration-runner file (0 errors),apps/dgfy-api/tests/addVoucherAccountRestriction.migration.test.js (new -- 14 tests covering tenant fan-out, retype idempotence in both directions, DDL-string identity with sync-tenant-schemas.js for the column/table/index, and the corrected char(36) ledger snapshot),apps/dgfy-api/tests/voucherEligibilityPolicy.unit.test.js (extended -- 14 new account-restriction cases including the fail-closed unhydrated-allowlist branch and the POS no-identity case),apps/dgfy-api/tests/voucherUseCases.usecases.test.js (extended -- 14 new authoring cases: derived flag, present/absent update semantics, both directions of the publicly-listed conflict, activation re-check),apps/dgfy-api/tests/voucherRedemptionUseCases.usecases.test.js (extended -- 10 new cases: conditional hydration asserted by call order, ledger dgfy_account_id write, preview/redeem parity),apps/dgfy-api/tests/voucherValidator.test.js (extended -- 10 new cases: forbidden derived field, UUID format, create-default vs update-no-default, 200 ceiling),apps/dgfy-api/tests/voucherDisplayUseCases.usecases.test.js (extended -- 3 new cases: plain-catalog-price fallback and no hydration on the display path),full voucher-adjacent regression run (40 suites / 729 tests via `npm test -- tests/voucher tests/addVoucher tests/addDelivery tests/storeC tests/storefrontVouchers tests/pricelist tests/posVoucher tests/tenantSchemaSync`, all passing),npm run check:tenant-schema-coverage against the new migration (PASS),packages/web-core/src/features/pos/__tests__/voucherManagementPayload.test.js (extended -- 9 new cases, 21 total, run via apps/dgfy-ims vitest),full apps/dgfy-ims vitest run of packages/web-core/src/features/pos (172 files / 1079 tests),npm run build:skupervisor and npm run build:pos (both clean)
rollback_note: Revert this PR's diff, including the migration's down(). Three of the four schema
  changes are pure feature state -- dropping voucher_account_grants and vouchers.is_account_restricted
  returns every voucher to the unrestricted, shared-code behaviour it had before this phase, and
  dropping idx_voucher_redemptions_account removes an index nothing else reads. The fourth is
  narrower and is called out rather than buried: down() returns voucher_redemptions.dgfy_account_id
  from CHAR(36) to INT, which cannot hold a UUID, so any redemption recorded with a real account id
  after this ships loses that value on rollback. No money column, discount computation, persisted
  order total, or existing redemption amount is touched by any of the four.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-08T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-788-VOUCHER-ACCOUNT-RESTRICTED-ISSUANCE
---

# Account-restricted voucher issuance (Phase 269, #788)

## Compliance Impact Classification

**Major.** Changed files under `apps/dgfy-api/src/modules/vouchers/` and
`apps/dgfy-api/src/modules/store/` match `scripts/check-compliance-impact.js`'s
`COMPLIANCE_SENSITIVE_RULES` at a `major` floor on the `pos`/`terminal` and `payments` surfaces
respectively. Independently of that automated floor, this adds a **new eligibility dimension to a
discount-bearing checkout path** and a **new write path for buyer identity into a financial ledger**,
both of the class `AGENTS.md` requires a declaration for regardless.

Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs"
(#884/#1163/#1248): `preflight_request_ref` carries a `NOT-EXECUTED-*` placeholder, which is the
accepted, expected state for a PR targeting `develop` — the continuous compliance-preflight sweep
reconciles it to a real run after merge, not at PR time.

## Scope

#788 asks for a voucher to be redeemable only by one or more named DGFY accounts, rather than by
anyone holding the code (#454 decision 4's shared-code default). Two motivations, recorded in the
issue: anti-misuse of a leaked code, and a B2B roadmap signal (a voucher assignable to a specific
business's account).

**The issue's own stated non-goal — "not implementing anything here" — is deliberately overridden by
Pat.** This phase builds it.

- `apps/dgfy-api/src/models/VoucherAccountGrant.js` — **new**. The allowlist child table.
- `apps/dgfy-api/src/models/Voucher.js` — `is_account_restricted` (derived gate). No index; see
  "Affected Surfaces" item 6.
- `apps/dgfy-api/src/models/VoucherRedemption.js` — `dgfy_account_id` retyped INTEGER → UUID; new
  `idx_voucher_redemptions_account`.
- `apps/dgfy-api/src/models/index.js` — the `Voucher hasMany VoucherAccountGrant` association.
- `apps/dgfy-migration-runner/migrations/20260908000001-add-voucher-account-restriction.cjs` —
  **new**, tenant-fanned-out (same template as `20260906000002-add-voucher-order-value-and-audit-columns.cjs`).
- `apps/dgfy-api/scripts/sync-tenant-schemas.js` — new table entry, new column repair entry, new
  index repair entry, and the corrected `char(36)` in the `voucher_redemptions` CREATE TABLE snapshot.
- `apps/dgfy-api/src/modules/vouchers/domain/voucherEligibilityPolicy.js` — three reason codes and
  one check. Still pure, still zero-import.
- `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js` — the authoring-conflict reason code.
- `apps/dgfy-api/src/modules/vouchers/repositories/voucherRepository.js` — `listAccountGrants`
  (batched) and `replaceAccountGrants` (reconcile, not delete-and-recreate).
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherUseCases.js` — `account_grant_ids` on create
  and update, the derived flag, the publicly-listed conflict guard (create, update, and activate).
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js` — conditional
  hydration, and the ledger's `dgfy_account_id` write.
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherAutoApplyUseCases.js` — batched hydration for
  restricted auto-apply candidates.
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherDisplayUseCases.js` — the three account codes
  added to `DISPLAY_RELEVANT_REASON_CODES`.
- `apps/dgfy-api/src/validators/voucherValidator.js` — `account_grant_ids` (UUID array, max 200);
  `is_account_restricted` added to `FORBIDDEN_FIELDS`.
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` — `dgfyAccountId` onto the shared
  voucher context and into all four `redeemVoucherUseCase` call sites.
- `apps/dgfy-storefront/src/shared/model/storefrontErrorMessages.js`,
  `packages/web-core/src/features/pos/utils/posCheckoutErrorMessages.js`,
  `packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx` — buyer-, cashier-, and
  merchant-facing copy for the new codes.
- `packages/web-core/src/features/pos/components/voucherFormModel.js` / `VoucherManagementPanel.jsx`
  — the authoring field.
- `packages/web-core/src/features/pos/__tests__/deliveryCampaignPayload.test.js` — two keys added to
  an exhaustive `buildVoucherPayload` assertion. One is this phase's (`account_grant_ids`); the
  other (`max_order_value_centavos`) is **a pre-existing failure not introduced here** — Phase 262
  (#1490) added that key to `buildVoucherPayload` without updating this assertion, so the test has
  been red on `develop` since that PR merged. Verified by diffing the test file against
  `origin/develop` (untouched by this branch) while `develop`'s own `buildVoucherPayload` emits the
  key. Repaired here rather than filed separately because this phase touches the same assertion;
  fixing one key and leaving the other failing would have been worse than either.

**No route file, permission, or role preset is touched.** `account_grant_ids` rides the existing
`POST /vouchers` and `PUT /vouchers/:id` bodies through `validateCreateVoucher`/`validateUpdateVoucher`
exactly as `scopes` already does, so `routes/vouchers.js`'s existing `VOUCHERS.MANAGE` gate covers it
with no edit. (This also keeps the diff clear of the three files #1493 owns in parallel.)

## Affected Surfaces

1. **New checkout eligibility dimension** (`payments`, buyer-facing). A voucher carrying at least one
   grant is refused unless the checkout is made by an authenticated DGFY account on that list.
   Additive and opt-in: `is_account_restricted` defaults to `false`, and every voucher that exists
   today has no grant rows, so **no existing voucher changes behaviour**. The check only fires once a
   staff admin explicitly adds account IDs via `VoucherManagementPanel.jsx`.
2. **The guest / unlinked-customer answer is explicit, not silent** — the interaction #788 asks about
   by name. `storeAuth.js` sets `storeCustomer.dgfy_account_id` only for a DGFY-authenticated
   session; a #622 guest has no `storeCustomer` at all, and a native `store_customers` row created by
   email/password has a NULL `dgfy_account_id`. Both resolve to `null` and both receive a 422
   `VOUCHER_ACCOUNT_REQUIRED` naming the missing sign-in, with dedicated storefront copy alongside
   the existing `GUEST_CHECKOUT_DISABLED` branch. `VOUCHER_ACCOUNT_NOT_ELIGIBLE` is a **separate**
   code for a signed-in-but-ungranted buyer, because telling them to sign in would loop them.
   **An account-restricted voucher therefore effectively requires login for its own redemption even
   on a store where guest checkout is enabled** — #788 raises this as a design question and this is
   the answer taken: the restriction is per-voucher and does not require #622's toggle to be on.
3. **POS is out of scope by construction, not by a POS-specific rule.** Re-verified against current
   code rather than inherited from the wave plan: `posUseCases.js`'s `redeemVoucher` binding passes
   `storeCustomerId: null` and no account identity, and ADR 0066's 2026-08-20 amendment narrowed
   #454 decision 6 only as far as a free-typed customer *name* (`posDiscountPolicy.js`'s
   `DISCOUNT_CUSTOMER_NAME_REQUIRED`). A name is not an authenticated account. POS therefore reaches
   the shared eligibility check with no `dgfyAccountId` and fails closed on the same code path as a
   guest — **zero POS files changed**, and the behaviour cannot drift out of sync with a
   POS-specific rule someone forgets to update. Cashier-facing copy says the code is online-only
   rather than nonsensically telling a cashier to sign in.
4. **Display fails open to the plain catalog price; the public discovery index omits the voucher.**
   The three account codes are in `DISPLAY_RELEVANT_REASON_CODES`, which both
   `voucherDisplayUseCases.js` and `storefrontDiscoveryIndexService.js`'s public-listing projection
   consume. This preserves ADR 0066 Decision 3's asymmetry exactly — checkout blocks with a 422,
   display falls back to the plain price and never throws — and closes a real leak: that projection
   publishes each listed voucher's literal `code`, so a publicly-listed restricted voucher would
   broadcast the very code #788 exists to keep off the general public. Authoring **also** refuses that
   combination outright (`VOUCHER_ACCOUNT_RESTRICTED_NOT_PUBLICLY_LISTABLE`, 422) on create, update,
   and activate — two independent guards, deliberately.
   **Named limitation:** neither display surface receives a `storeCustomer`, so a *granted* buyer
   also sees no display price and learns the voucher applies only at checkout, where the account is
   known. Conservative in the safe direction; closing it means threading `storeCustomer` into the two
   catalog read paths, which is its own change.
5. **`voucher_redemptions.dgfy_account_id` gets its first writer, and its type corrected.** The
   column has existed since #455/Phase 102 declared as `INTEGER`, but `DgfyAccount.id` is a UUID —
   the declaration could never have held a real account id. Verified before changing it that
   **nothing in the repository has ever written the column** (`createRedemptionLedgerEntry` never
   passed it), so every existing row is NULL and the `MODIFY` is lossless on real data. This phase
   writes it on every storefront redemption, restricted or not: it is the per-customer half of
   #586's two-tier tracking model, and gating it on the restriction would leave the same gap open.
6. **`is_account_restricted` is derived and un-settable.** It is in the validator's
   `FORBIDDEN_FIELDS` (rejected, not stripped), absent from `WRITABLE_VOUCHER_COLUMNS`, and written
   only by the use case from the resolved allowlist inside the same transaction as the child rows —
   so the flag and the rows cannot drift, which is what lets the eligibility policy trust `false` to
   mean "no rows" without a `COUNT` on every checkout. It is deliberately **not** indexed: no query
   filters on it, and a two-valued index is near-useless to the optimizer. The high-cardinality
   `dgfy_account_id` on the ledger does get one.

## Compliance Preconditions

1. **ADR 0066 Decision 3 (`[binding]`) is inherited exactly, never inverted.** Checkout fails closed
   with a 422 + `reason_code`; catalog display falls back to the plain catalog price and logs
   nothing fatal. The new condition is routed through the same two mechanisms the existing
   conditions use (`evaluateVoucherEligibility` for the former, `DISPLAY_RELEVANT_REASON_CODES` for
   the latter) rather than a parallel path that could diverge.
2. **ADR 0066 Decision 4 (`[binding]`) is respected.** The eligibility check lives in the same
   domain layer that already reads and writes `voucher_redemptions` (`voucherRedemptionUseCases.js`
   → `voucherEligibilityPolicy.js`), not in a new parallel path, and no new counter or cache is
   introduced. The ledger stays authoritative.
3. **Fail-closed on an unevaluatable restriction, with a caller-defect code that cannot be mistaken
   for a buyer state.** A restricted voucher whose allowlist was never hydrated blocks with
   `VOUCHER_ACCOUNT_GRANTS_UNRESOLVED` rather than evaluating as unrestricted — the "eligible
   everywhere by omission" hazard ADR 0066 Decision 10 forbids, relocated from a column default to a
   caller convention. Ordered **after** the no-buyer check, so the two display surfaces (which have
   no buyer identity and legitimately do not hydrate) report the accurate `VOUCHER_ACCOUNT_REQUIRED`
   instead of a spurious server-defect code.
4. **Un-restricting is never something that happens by omission.** On update, an omitted
   `account_grant_ids` leaves the allowlist untouched (the same present/absent contract `scopes`
   uses, and the update schema deliberately carries no `.default()`); only an explicit empty array
   removes the restriction. Opening a voucher to everyone must be an action a merchant actively took.
5. **No cross-database foreign key is introduced.** `dgfy_accounts` is a landlord-database table and
   every `voucher*` table is tenant-scoped (ADR 0052), so `voucher_account_grants.dgfy_account_id`
   carries no FK and is format-validated only — the same posture `store_customers.dgfy_account_id`
   and `voucher_redemptions.dgfy_account_id` have always taken. An existence check was considered
   and rejected: even the tenant-local proxy (`store_customers`) would wrongly reject a B2B account
   that has never ordered from the store, which is precisely #788's motivating case.
6. **No allowlist contents are ever echoed to a buyer.** The 422 details for both buyer-facing codes
   carry no account identifiers — naming who *is* granted would leak the allowlist to whoever holds
   the code, the exact audience this feature excludes. Asserted directly by a unit test.
7. **One pre-existing red test repaired, and identified as pre-existing rather than absorbed
   silently.** See the last bullet of "Scope" above — `max_order_value_centavos` was missing from
   `deliveryCampaignPayload.test.js`'s exhaustive payload lock before this branch existed. No
   product behaviour changes from that repair; it is an assertion catching up to a payload key that
   shipped in Phase 262.
8. **Zero regression to the existing voucher benefit / eligibility / redemption surface.** Confirmed
   by running the full voucher-adjacent backend suite (40 files, 729 tests) and the whole
   `packages/web-core/src/features/pos` frontend suite (172 files, 1079 tests) alongside the
   extended files.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** — front matter carries
  `NOT-EXECUTED-788-VOUCHER-ACCOUNT-RESTRICTED-ISSUANCE`, expected on a `develop`-targeting PR per
  `docs/compliance/request-time-preflight-protocol.md`; the continuous sweep reconciles it post-merge.
- **`npm run gate:release:local` has not been run** — that gate is delegated to
  `promotion-quality-gate.yml` at promotion time (#1431 Phase C/D), not `implement`'s job at PR time.
  This PR's evidence is Tier 0 (syntax + both affected app builds) plus a broad targeted test subset.
- **The migration has not been executed against any database.** Its behaviour is covered by unit
  tests against a `queryInterface` double, including the retype guard in both directions, not by a
  live run. The `voucher_redemptions.dgfy_account_id` retype is the one step worth a human's eyes
  before it reaches a tenant DB, and it is flagged here rather than assumed routine.
- **`sync-tenant-schemas.js` has no repair path for the retype**, only for the new column, table, and
  index. That registry's repair pass is column-*presence* based and has no notion of a type mismatch
  on an existing column — the same documented limitation as the ENUM widenings already recorded in
  that file. A tenant that misses the migration keeps the pre-#788 INT column, where the new write
  fails loudly rather than silently mis-recording an account.
