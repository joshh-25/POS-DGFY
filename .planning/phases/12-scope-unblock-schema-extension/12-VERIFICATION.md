---
phase: 12-scope-unblock-schema-extension
verified: 2026-07-14T11:49:45Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 12: Scope Unblock + Schema Extension Verification Report

**Phase Goal:** The ADR-level and schema-level blockers preventing any legacy `items`/`item_folders`/`stock_movements`/`pos_transactions` mapper from being written are removed, and the extended target schema exists and is verified before mapper code starts.
**Verified:** 2026-07-14T11:49:45Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ADR 0029's `OUT_OF_SCOPE_LEGACY_TABLES` no longer includes `items`, `item_folders`, `stock_movements`, `pos_transactions` | ✓ VERIFIED | Ran `isInScopeLegacyTable()` directly against `mappings.js`: `{"inScope":true,"stillGated":true,"folderOk":true}` — `items`/`stock_movements`/`pos_transactions` return `true`, `pos_transaction_lines` still `false`, `item_folders` (never in the array) returns `true`. Grep of the frozen array confirms the 3 names are absent and `item_folders` was never present. |
| 2 | ADR 0029 and migration-map §10 amended in lockstep, documenting the tables as unblocked | ✓ VERIFIED | ADR 0029 contains dated `## Amendment (v2.1 Legacy Data Migration, 2026-07)` section (line 125) with `status: accepted` preserved and `last_reviewed: 2026-07-14`. Migration-map §10 (line 268-282) has a matching "v2.1 amendment (Phase 12, ADR 0029 Amendment)" note; `pos_transaction_lines` retained. `npm run lint:docs` → `OK. Validated 21 governed docs.` |
| 3 | `products` carries the 6 new typed columns + `attributes` JSON, confirmed via schema verification against a real tenant DB | ✓ VERIFIED | `dgfyBusinessContract.js` declares all 7 columns; migration `20260716100000` adds them with guarded `addColumn`; live `verify` report (`2026-07-14T10-47-56-096Z-verify.json`) shows `products: {"ok":true,"missing_columns":[]}` across `dgfy_business_r0001/r0002/r0003`. |
| 4 | A committed design doc captures the 1:1-vs-1:many satellite-folding shape (incl. BOM) before mapper code | ✓ VERIFIED | `docs/database/legacy-product-attributes-folding-design.md` exists, committed in `b416f980` (before Phase 13 exists). Contains all 10 namespace keys (7×1:1 objects incl. `costBreakdown`, 3×1:many arrays incl. `composition`/BOM and `barcodes`), the omit-key-when-absent rule (D-04), BOM-in-scope decision (D-01), and defers `legacy_id_map` ingredient resolution to Phase 13 (D-02). |
| 5 | A new `product_embeddings` table exists (1:1 per product), confirmed via schema verification | ✓ VERIFIED | `dgfyBusinessContract.js` declares `product_embeddings` with `unique_product_embeddings_product` in both `indexes`/`uniqueConstraints` and a `product_id → products.id` FK. Live `verify` report confirms `product_embeddings: {"ok":true,"exists":true,"missing_columns":[],"missing_indexes":[],"missing_unique_constraints":[]}` across all 3 tenant DBs. Model `ProductEmbedding.js` loads cleanly (`node --input-type=module` import returns `function`) and is registered in `tenantConnector.js`'s `modelDefiners`. |
| 6 | `inventory_movements` carries a natural-key unique index confirmed via schema verification; re-running migration is idempotent, no duplicate-index error, no data loss, no drift | ✓ VERIFIED | Original 3-column index `(business_id, reference_type, reference_id)` was found broken by this phase's own code-review gate (CR-01: breaks any multi-product order because Phase 9/10 write one `InventoryMovement` row per product line sharing the same tuple). Fixed (commit `4a83f1e7`) to the corrected 4-column composite `(business_id, product_id, reference_type, reference_id)` — a superset/refinement that still satisfies the idempotency intent. Verified consistently landed in: migration file (`20260716100000...cjs` line ~175-182), `InventoryMovement.js` (lines 111-120), and `dgfyBusinessContract.js` (`indexes`/`uniqueConstraints`). Directly re-verified against the real tenant DBs via `SHOW INDEX FROM inventory_movements` — supplementary proof file `2026-07-14T11-41-38-152Z-cr01-index-composition-proof.txt` shows all 3 tenant DBs (`dgfy_business_r0001/r0002/r0003`) carrying the corrected 4-column composite. Idempotency proven twice: first idempotency re-run (`2026-07-14T10-49-03-413Z-schema-migrate.json`, `total_pending:0, executed:0`) and post-CR01-fix re-run (`2026-07-14T11-41-12-415Z-schema-migrate.json`, same clean no-op). `legacy_non_mutation.unchanged: true` in both idempotency-check `verify` reports. |
| 7 | The compliance review usecase writes verification metadata + state atomically (FSC-01 hardening, folded todo) | ✓ VERIFIED | `recordVerificationAndState()` exists in `complianceModeStateRepository.js` (line 316), performs one `sequelize.transaction()` with `lock: transaction.LOCK.UPDATE`, one `record.update()` writing all 4 fields; missing row throws `ComplianceStateNotFoundError` (no `findOrCreate`). `buildReviewComplianceStateUseCase` calls it exactly once (line 321), replacing the old 2-write block. Ran the actual test suites (not just trusting SUMMARY): `complianceModeStateRepository.test.js` — 14/14 passed; `complianceReviewDemotion.test.js` — 5/5 passed, including the reject/revoke-demotes-to-non_compliant_active and verified-outcome-via-single-call cases. |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dgfy-migration-runner/src/data/mappings.js` | 3 entries removed from `OUT_OF_SCOPE_LEGACY_TABLES` | ✓ VERIFIED | Confirmed via direct function call + array grep |
| `docs/architecture/adr/0029-...md` | Dated v2.1 amendment section | ✓ VERIFIED | Present, `status: accepted` preserved |
| `docs/database/dgfy-data-migration-map.md` | §10 amended in lockstep | ✓ VERIFIED | v2.1 amendment note present, `pos_transaction_lines` retained |
| `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs` | Additive migration, `meta.targetKind: 'business'`, `destructive: false` | ✓ VERIFIED | Present, correct meta, guarded/idempotent operations, includes CR-01 fix |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` | products/inventory_movements/product_embeddings entries | ✓ VERIFIED | All declared, matches migration + CR-01 fix |
| `apps/dgfy-api/src/models/Tenant/Product.js` | 7 new fields + non-unique index | ✓ VERIFIED | Present, matches migration |
| `apps/dgfy-api/src/models/Tenant/InventoryMovement.js` | Corrected 4-col unique index | ✓ VERIFIED | Present, matches CR-01 fix |
| `apps/dgfy-api/src/models/Tenant/ProductEmbedding.js` (NEW) | 1:1 model | ✓ VERIFIED | Loads cleanly via `node --input-type=module` in main repo (resolves prior worktree `node_modules`-blocked verification gap from 12-02-SUMMARY D4) |
| `apps/dgfy-api/src/infra/tenantConnector.js` | ProductEmbedding registered | ✓ VERIFIED | Import + `modelDefiners` entry present |
| `docs/database/legacy-product-attributes-folding-design.md` (NEW) | Satellite-folding design doc | ✓ VERIFIED | All 10 namespace keys, D-01/D-02/D-04 present |
| `apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js` | `recordVerificationAndState()` | ✓ VERIFIED | Present, atomic, row-locked |
| `apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js` | Review usecase switched to atomic call | ✓ VERIFIED | Single call confirmed, old 2-write path gone from review path |
| `apps/dgfy-migration-runner/reports/*` | schema-migrate + verify JSON/summary reports | ✓ VERIFIED | 10 report files present, real DB-backed evidence (not fabricated — includes the initial blocked local attempt, the successful EC2 run, and the CR-01 fix re-verification) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `isInScopeLegacyTable()` | `OUT_OF_SCOPE_LEGACY_TABLES` | array membership check | WIRED | Confirmed functionally |
| migration `20260716100000` | `dgfyBusinessContract.js` | contract declares every column/table/index the migration adds | WIRED | Cross-checked column lists, index names match exactly |
| `ProductEmbedding` model | `tenantConnector.js` `modelDefiners` | import + registration | WIRED | Confirmed present; model resolves at runtime |
| `buildReviewComplianceStateUseCase` | `repository.recordVerificationAndState` | single method call | WIRED | Confirmed via source read + passing demotion test asserting single-call behavior |
| `schema migrate` (targetKind=business) | `dgfy_business_*` tenant DBs | live CLI run against EC2 rehearsal host | WIRED | Confirmed via `schema-migrate.json` reports — migration landed on business targets (`dgfy_business_r0001/r0002/r0003`), not `dgfy_core` |
| `verify` `checkContractSchema` | live tenant schema | DB introspection against declared contract | WIRED | `business_schemas_ok: true`, zero `missing_*` for `products`/`product_embeddings`/`inventory_movements` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Scope gate returns true for the 3 unblocked tables, false for `pos_transaction_lines`, true for `item_folders` | `node --input-type=module -e "import('./apps/dgfy-migration-runner/src/data/mappings.js')..."` | `{"inScope":true,"stillGated":true,"folderOk":true}` | ✓ PASS |
| `npm run lint:docs` (ADR 0029 validation) | `npm run lint:docs` | `OK. Validated 21 governed docs.` | ✓ PASS |
| `recordVerificationAndState()` atomic/not-found/duplicate/shape behaviors | `node --experimental-vm-modules .../jest --config jest.config.cjs complianceModeStateRepository` | 14/14 tests passed | ✓ PASS |
| Review usecase demotion (reject/revoke → `non_compliant_active`; verified → computed `newState`) via single atomic call | `node --experimental-vm-modules .../jest --config jest.config.cjs complianceReviewDemotion` | 5/5 tests passed | ✓ PASS |
| `ProductEmbedding.js` module loads cleanly (resolves 12-02-SUMMARY's environment-blocked D4 item) | `node --input-type=module -e "import('./src/models/Tenant/ProductEmbedding.js')..."` (run from main repo with node_modules present, not the isolated worktree) | `function` (default export present) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention used by this phase; the migration-runner's own `schema migrate` / `verify` CLI commands serve the equivalent role and were independently re-inspected (JSON report contents parsed directly, not re-run — the reports are DB-backed artifacts from Plan 04's live EC2 run, which this verification cannot re-execute without tenant DB access, but the JSON/txt evidence files were read and cross-checked field-by-field rather than trusted from SUMMARY prose).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LDM-01 | 12-01 | ADR 0029 amended, scope gate unblocked | ✓ SATISFIED (code) / ⚠️ STALE (REQUIREMENTS.md) | Functionally verified in code (see Truth #1-2). **However, `.planning/REQUIREMENTS.md` line 136 checkbox is unchecked (`[ ]`) and line 285's traceability table shows `LDM-01 \| Phase 12 \| Pending`, despite `12-01-SUMMARY.md` completing it on 2026-07-14 and ROADMAP.md marking Phase 12 `[x]` complete. LDM-02/03/04 in the same table are correctly marked `Complete`/checked — only LDM-01 was missed. This is a documentation-traceability gap, not a functional gap; recommend updating REQUIREMENTS.md lines 136 and 285 to reflect completion.** |
| LDM-02 | 12-02 | products schema extension + folding design doc | ✓ SATISFIED | REQUIREMENTS.md correctly shows `[x]`/`Complete`. Verified in code + live DB (Truth #3-4). |
| LDM-03 | 12-02 | product_embeddings table | ✓ SATISFIED | REQUIREMENTS.md correctly shows `[x]`/`Complete`. Verified in code + live DB (Truth #5). |
| LDM-04 | 12-02, 12-04 | inventory_movements natural-key index + idempotency | ✓ SATISFIED | REQUIREMENTS.md correctly shows `[x]`/`Complete`. Verified in code + live DB, including the CR-01 post-hoc fix (Truth #6). |
| FSC-01 | 12-03 | Compliance review atomicity hardening | ✓ SATISFIED (additional scope) | FSC-01 itself was already `Complete` from Phase 8 in REQUIREMENTS.md; this phase's 12-03 plan closes a separately-tracked "folded todo" hardening its atomicity guarantee, not a re-implementation of the base requirement. Not a Phase-12-listed ROADMAP requirement but explicitly pulled into scope per 12-03-PLAN.md's own stated objective. Verified via passing tests (Truth #7). |

**Orphaned requirements check:** No requirement IDs map to Phase 12 in REQUIREMENTS.md beyond LDM-01..04, all of which are accounted for in the plans. No orphans found.

### Anti-Patterns Found

None. Scanned all 12 phase-touched source/doc files for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` — zero matches. No stub returns, no hardcoded-empty stubs found in the schema/scope-gate/compliance code paths.

**Unresolved code-review findings (12-REVIEW.md), informational — not blocking this phase's must-haves:**
- CR-01 (critical): Fixed and re-verified (see Truth #6) — not a remaining gap.
- WR-01 (`guardBusinessAccess` silently skips role check when `requestingAccountId` falsy), WR-02 (`withModel()` overly-broad catch masks bugs as 503), WR-03 (`normalizeBranchId` doesn't reject `NaN`), WR-04 (`buildSubmitComplianceEvidenceUseCase` still non-atomic — same architectural gap class as the one 12-03 fixed, but in a different usecase not in 12-03's must-haves scope), IN-01/IN-02/IN-03 (minor model/code consistency items) — none of these are in Phase 12's `must_haves` (ROADMAP success criteria only cover LDM-01..04; 12-03's must-haves scoped specifically to `buildReviewComplianceStateUseCase`, not the evidence-submission usecase WR-04 concerns). None are filed as `.planning/todos/` items yet. Recommend filing WR-01..04/IN-01..03 as follow-up todos so they aren't lost, but they do not block Phase 12 goal achievement.

### Human Verification Required

None. All success criteria were verifiable programmatically: scope-gate function calls, doc-lint, live DB-backed JSON verify/migrate reports (already captured with operator approval per 12-04-SUMMARY's human checkpoint), a direct `SHOW INDEX` proof file for the CR-01 fix, and actually-executed (not merely SUMMARY-claimed) Jest test runs for the compliance atomicity work.

### Gaps Summary

No blocking gaps. One non-blocking documentation-traceability discrepancy: **`.planning/REQUIREMENTS.md` was not updated for LDM-01** (still shows `[ ]` / `Pending` at lines 136 and 285) even though the ADR/scope-gate work is functionally complete and verified, ROADMAP.md marks Phase 12 done, and the sibling requirements LDM-02/03/04 were correctly marked complete. This should be reconciled (update the checkbox to `[x]` and the traceability-table status to `Complete`) but does not represent a functional defect in the delivered schema/scope-gate work and does not block Phase 13 from proceeding.

---

_Verified: 2026-07-14T11:49:45Z_
_Verifier: Claude (gsd-verifier)_
