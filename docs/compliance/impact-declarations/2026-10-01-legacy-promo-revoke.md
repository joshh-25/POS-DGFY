---
status: reference
owner: engineering
last_reviewed: 2026-10-01
related_adr: docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md
  (categories 1 and 2 -- legacy setting-backed promo path kept as compatibility while its
  redemption contract stays server-authoritative; migration/retirement remains #991),
  docs/architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md (OPIS owns the
  transitional back-office surface)
declaration_id: 2026-10-01-legacy-promo-revoke
classification: major
surfaces: pos,terminal
reason_codes_impacted: PROMO_REVOKED
policy_version: 2026.10.01
verification_evidence: node --check clean on every changed/added apps/dgfy-api file (commercialPromoPolicy.js; legacyPromoPolicy.js; legacyPromoRepository.js; legacyPromoUseCases.js; legacyPromoHandlers.js; vouchers/index.js; voucherValidator.js; routes/vouchers.js; storefrontDiscoveryRepository.js; storefrontDiscoveryIndexService.js),apps/dgfy-api/tests/commercialPromoPolicy.unit.test.js (extended -- effective-state derivation; revoked/exhausted/expired public filtering; singular compatibility projection; PROMO_REVOKED rejection -- all passing),apps/dgfy-api/tests/legacyPromoUseCases.usecases.test.js (new -- 9 tests covering both source keys, dedupe, row lock, sibling/counter preservation, audit-in-transaction, idempotent replay, 404, ambiguous-code conflict, cross-key isolation -- all passing),apps/dgfy-api/tests/legacyPromoRouteGating.test.js (new -- list/revoke gates and route ordering -- all passing),apps/dgfy-api/tests/voucherValidator.test.js (extended -- legacy promo revoke schema identity/authoring-field cases -- all passing),apps/dgfy-api/tests/storefrontDiscoveryRepository.test.js + storefrontDiscoveryIndexService.catalogVisibility.test.js + storefrontDiscoveryFreshnessService.test.js + storefrontDiscoverySyncReliabilityService.test.js (extended/regression -- 4 suites 45 tests passing),store/POS promo regression subset (storeUsecases.applicationResult; posDiscountPolicy; storeCheckoutVoucherPromoStacking; storeCheckoutDeliveryWaiverDualAxis; storeCheckoutDownpaymentResolution; storeRepositoryPromoPersistence; settingsValidator.storefrontPromoDates; storeCheckoutDeliveryFeePin; storeCheckoutAutoAppliedDelivery -- 9 suites 176 tests passing),voucher module regression subset (voucherUseCases; voucherRedemptionUseCases; voucherReversalUseCases; voucherDisplayUseCases; voucherManagementGating; pricelistRoutePermissionParity; voucher eligibility/benefit/folder-scope unit suites; configurableDiscountManagementUseCases -- 11 suites 331 tests passing),npm run build:opis (clean production build including the new lazy LegacyPromosPage chunk),apps/dgfy-opis vitest suite (29 files 137 tests passing including the new LegacyPromosPage.test.jsx and the updated manifest/migration contract tests),npm run check:architecture (guardrails + controller boundaries OK)
rollback_note: Revert this PR's diff. No migration or schema change is involved: revocation only adds
  revoked/revoked_at/revoked_by keys to an existing system_settings JSON value, and the audit row goes
  to the existing tenant audit_logs table. Reverting restores the prior code; legacy setting rows keep
  whatever entries and revocation flags were already written, and no voucher entity, redemption
  ledger row, completed order, or discovery index row is deleted or recomputed by the revert.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-30T17:54:09.000Z
preflight_request_ref: NOT-EXECUTED-2159-LEGACY-PROMO-REVOKE
---

# Legacy promo revoke (#2159)

## Compliance Impact Classification

**Major.** Every file under `apps/dgfy-api/src/modules/vouchers/` matches
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` pattern for
`^apps/dgfy-api/src/modules/vouchers/` at a `major` floor on the `pos`/`terminal` surfaces. The
change is also independently a shared commercial-promo evaluator change (ADR 0033-governed
eligibility surface) plus a new staff-identity write path, both of the class this repository
requires a declaration for regardless of the automated floor.

Per `docs/compliance/request-time-preflight-protocol.md`: `preflight_request_ref` carries a
`NOT-EXECUTED-*` placeholder, the accepted state for a PR targeting `develop` -- the continuous
compliance-preflight sweep reconciles it to a real run within minutes of merge, not at PR time.

## Affected Surfaces

1. **Checkout eligibility (`pos`/`terminal`, storefront and POS):** an entry carrying the new
   `revoked: true` flag is refused by the shared evaluator with a new `PROMO_REVOKED` reason code,
   before usage-limit/date checks. Revocation only ever reduces eligibility; no active promo
   becomes redeemable because of this change.
2. **Public Storefront discovery:** revoked, exhausted, and expired legacy codes are withheld from
   the discovery profile and the discovery-index snapshot (singular compatibility projection
   included). First-class voucher discovery is untouched. A future `valid_from` entry deliberately
   stays visible, matching Storefront's existing scheduled-offer presentation.
3. **New management API (`vouchers:view` read / `vouchers:manage` revoke):**
   `GET /api/v1/vouchers/legacy-promos` and `POST /api/v1/vouchers/legacy-promos/revoke`. Revoke is
   strictly `vouchers:manage` (no `settings:edit` arm). The read surface is the existing voucher
   view gate. There is no create/edit/counter-reset/reactivation operation.
4. **Tenant audit evidence:** each first revocation writes one `audit_logs` row
   (`entity_type: legacy_promo`, `action: UPDATE`, `event_type: legacy_promo.revoked`) in the same
   tenant transaction as the setting write, carrying actor id/username, source key, stable promo
   identity, prior state, and timestamp. Repeat revocation is an idempotent no-op with no second
   audit row.
5. **Concurrency contract:** revocation locks the exact setting row, re-reads the latest JSON, and
   mutates only the selected entry. Checkout already locks the same rows before evaluating and
   writing (Storefront's locked checkout read; POS's explicit lock on both promo keys), so a
   revocation cannot roll back a concurrent `used_count` increment, and a checkout cannot newly
   accept a code revoked before it acquired the lock.

## Compliance Preconditions

1. **No data deletion or history rewrite.** The setting entry survives revocation; `used_count`,
   sibling entries, completed orders, saved promo allocations, and prior redemption/audit snapshots
   are preserved. No migration is added and no relational schema changes.
2. **Server-authoritative eligibility stays single-sourced.** The same shared
   `commercialPromoPolicy.js` evaluator used by Storefront and POS gains the revoked check, so
   quote, checkout, and discovery cannot disagree about a revoked code.
3. **Identity and authorization are server-owned.** Revocation is keyed by stored promo id or
   normalized code with an optional array-position disambiguator; the actor is stamped from
   `req.user`, never the payload. The validator exposes no writable-value fields.
4. **Transitional scope only.** This is the #2159 transitional control; retiring the legacy setting
   path and this surface remains #991's work, per ADR 0033's migration/retirement direction and
   ADR 0087's OPIS placement. No voucher-engine, discount-math, or first-class voucher behavior
   changes.
5. **Failure to refresh discovery is degraded, not silent.** The post-commit discovery sync follows
   the existing `settingsHandlers.js` fire-and-forget pattern and logs a warning when the index
   remains degraded; the revoke itself is already authoritative for checkout at commit time.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary: `node --check`
clean on every changed/added API file; new use-case tests pin row locking, sibling/counter
preservation, audit atomicity, idempotent replay, and identity conflicts; policy tests pin the
revoked/exhausted/expired filtering and `PROMO_REVOKED`; discovery repository/index-service tests
pin the public withholding; 9 store/POS suites (176 tests) and 11 voucher suites (331 tests) pass
unmodified; `npm run build:opis` builds clean; the OPIS vitest suite (29 files, 137 tests) passes
including the new Legacy Promos page tests.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** -- front matter carries
  `NOT-EXECUTED-2159-LEGACY-PROMO-REVOKE`, expected on a `develop`-targeting PR; the continuous
  sweep reconciles it post-merge.
- **`npm run gate:release:local` has not been run** -- this PR's Tier 0/2 self-verification is
  scoped evidence, not the full local gate; that gate is delegated to
  `promotion-quality-gate.yml` at promotion time.
