# Milestones

## v2.1 Legacy Data Migration (Shipped: 2026-07-15)

**Scope:** Phases 12, 13, 13.5, 14 (4 phases, 25 plans). Continues numbering from v2.0; Phases 1–11 and the paused Phase 7 remain historical record.

**Delivered:** Legacy product/inventory and POS sales-history data migrate into the new `dgfy_*` schema with proven fidelity, validated by a real-volume rehearsal against a disposable production-parity environment — closing the gap where the earlier Accounts/Businesses/Tenancy migration left every tenant with zero products, inventory, and sales.

**Key accomplishments:**

1. **Scope unblock + additive schema extension (Phase 12)** — removed `items`/`item_folders`/`stock_movements`/`pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES` (ADR 0029 v2.1 amendment) and shipped the additive target schema (`products` +typed columns + `attributes` JSON, new `product_embeddings` 1:1 table, `inventory_movements` natural-key unique index), proven against real EC2 tenant DBs.
2. **Product/inventory mappers + rehearsal (Phase 13)** — pure legacy→DGFY mappers (`items`→`products` with 8 satellite tables folded into `attributes` JSON, `item_folders`→`product_folders`, `stock_movements`→`inventory_movements` with lossy-collapse findings, `item_embeddings`→`product_embeddings`) wired through dry-run/apply/idempotency-retry/verify.
3. **Staff-auth model correction (inserted Phase 13.5)** — tenant-local staff credentials with optional DGFY account linking (correcting ADR 0028's DGFY-mandatory assumption); real bcrypt password/PIN values migrate byte-for-byte, non-bcrypt values become reset-required, and dry-run reports redact credential-bearing fields into boolean evidence flags.
4. **Sales-history migration (Phase 14)** — `pos_transactions`→`availments` and `pos_transaction_lines`→`availment_items` with a new `source_system` provenance column, exact monetary fidelity (BigInt DECIMAL(14,4) by status), header/line provenance, and void-state fidelity; non-blocking attribution findings (location/terminal/cashier) governed per D-14-02/D-14-03.
5. **Full-milestone real-volume verification (Phase 14, VER-01/02/03)** — a disposable production-parity rehearsal on the authorized `dgfy-temp` EC2 (26 tenants) ran the six-entity sequence end-to-end with exact source=target counts, zero duplicate retry writes, and zero blocking findings; sanitized machine-checkable evidence (`14-REHEARSAL-EVIDENCE.json`) is enforced by a single shared validator and gated behind a blocking operator human-verify checkpoint.
6. **Durable carry-forward register** — `.planning/KNOWN-GAPS.md` consolidates unclosed items for the next milestone.

**Verification (override closeout):**
- Phases 12 and 13.5 carry formal `VERIFICATION.md` artifacts. **Phases 13 and 14 shipped without a separate `VERIFICATION.md`** and were instead verified through the Phase 14 real-volume rehearsal (14-10 machine-validated evidence) and the blocking operator human-verify checkpoint (14-11 approved 2026-07-15). All PIM-01..06, SHM-01..04, LDM-05, and VER-01..03 requirements are marked Complete. Recorded as a deliberate override, not an unverified gap.
- Phase 13 Plan 06 (product/inventory re-rehearsal gate) closed retroactively — its real-data proof was delivered by the superset 14-10 rehearsal.

**Known gaps carried forward (see `.planning/KNOWN-GAPS.md`):**
- **G-01 / G-02 (blocking-before-production):** compliance mode not demoted on rejected/revoked fiscal review, and non-transactional compliance verification+state writes. Surface early in frontend/checkout integration.
- **G-03:** `business_database_registry.business_id` lacks a unique constraint (defense-in-depth debt).
- **G-04:** `product_embedding` carry-over unproven on real vectors — source was zero across all tenants; accepted under exemption D-14-10-01 ("empty is truthful").
- **G-05 / G-06:** embedding-model metadata tagging (EMB-01) and per-tenant migration summary report (RPT-01) deferred to v2.x.

**Next milestone intent:** integrate `apps/dgfy-api` as the live API into the frontend apps (dgfy-storefront/pos/business) once the migration branch merges.

---

_Earlier milestones (v1.0, v2.0) predate this MILESTONES.md; see `.planning/milestones/` archives and PROJECT.md history._
