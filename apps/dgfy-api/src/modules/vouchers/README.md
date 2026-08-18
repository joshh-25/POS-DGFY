# Vouchers Module

Tenant-local voucher campaign authoring, benefit/eligibility resolution, and admin CRUD boundary.
Phase 103 of the voucher initiative (epic #453, entity #455, authoring #614).

Flow:

`routes/vouchers.js -> voucher handlers -> voucher use cases -> voucher repository -> tenant models`

The `domain/` layer sits beside that chain rather than inside it: `voucherBenefitPolicy.js` and
`voucherEligibilityPolicy.js` are pure, zero-import functions that the use cases (and, from Phase 105,
the POS and storefront checkout paths) call. They touch no database, no clock, and no request.

## Rules

- **Folder scope includes descendants, resolved at redemption time — not here.** A
  `scope_type: 'item_folder'` row covers that folder *and every descendant* via `ItemFolder.parent_id`
  (ADR 0066 decision 11). Phase 103 deliberately does **not** build that tree traversal: no such code
  exists yet, and this phase's only job with scopes is validating that each `scope_ref_id` resolves to
  a real, non-soft-deleted `items(item_id)` or `item_folders(folder_id)` row. Phase 105 resolves the
  descendant set at redemption and snapshots the resulting item ids into `voucher_redemption_lines`,
  so a later folder move cannot retroactively change what a completed redemption meant.

- **`code` is immutable after creation, except while `status = 'draft'` and `redeemed_count = 0`.**
  Outside that window a `code` in a PUT body is refused with 422 `VOUCHER_CODE_IMMUTABLE`. Three
  reasons, all concrete: every ledger row carries a `code_snapshot`, so a rewrite divorces the ledger
  from the campaign; codes are distributed out of band (print, SMS, social) and cannot be recalled;
  and a freed code can be re-registered on a different campaign, silently re-pointing a code someone
  is already holding. The check lives in the use case, not the validator, because the validator cannot
  see the stored status or redemption count.

- **`expired` is derived and lazily materialized, never client-writable.** `deriveVoucherStatus`
  computes it from `status = 'active'` plus an elapsed `valid_until` in the tenant timezone; list and
  get responses then issue **one** guarded `UPDATE ... WHERE status = 'active'` for the affected ids,
  so the board stays honest without a cron job and re-running is a no-op. `status` is a `.forbidden()`
  field on both the create and update schemas — the only way to move status is
  `/activate`, `/pause`, `/archive`. `archived` is terminal; every write to an archived voucher is a
  409, and that is also why **there is no DELETE endpoint** — archive is the delete, and the ledger's
  parent campaign row has to survive for auditability.

- **The redemption-limit checks in the eligibility policy are PREVIEW ONLY.**
  `VOUCHER_REDEMPTION_LIMIT_REACHED`, `VOUCHER_BUDGET_EXHAUSTED`, and
  `VOUCHER_QUANTITY_LIMIT_REACHED` read `vouchers.redeemed_*`, which ADR 0066 decision 4 makes a
  *derived cache*, not the source of truth. They exist so an admin screen can show "this campaign is
  spent" without a ledger scan. Actual enforcement is Phase 105's single atomic conditional `UPDATE`.
  `redemption_stats.cache_in_sync` on the get/list response compares the raw ledger aggregate against
  the cache; it is a reconciliation signal, and `false` is *expected* once reversal or adjustment rows
  exist, since Phase 105 owns those sign conventions.

- **No `PERMISSIONS.VOUCHERS` group exists yet — this phase reuses `SYSTEM.VIEW_SETTINGS` /
  `SYSTEM.EDIT_SETTINGS` deliberately.** Tenant roles persist their permissions as a stored array, so
  a new permission string would require a data migration across every existing role before the API
  was usable at all. Reusing the pair `routes/tenantLocations.js` already uses keeps this phase to
  code. A dedicated voucher permission group plus that backfill is named follow-up work, not an
  oversight.

- **Time windows fail closed.** The wrap-around arithmetic in `voucherEligibilityPolicy.js` is adapted
  from `modules/shared/utils/commercialPromoPolicy.js`'s `isActiveTime`, with both of that function's
  fail-*open* branches inverted: a degenerate window (`start === end`) and an unresolvable timezone
  each block with their own reason code rather than waving the voucher through. ADR 0066 decision 3
  is `[binding]` that checkout fails closed.

See [`docs/architecture/adr/0066-voucher-sale-time-price-resolution.md`](../../../../../docs/architecture/adr/0066-voucher-sale-time-price-resolution.md).
