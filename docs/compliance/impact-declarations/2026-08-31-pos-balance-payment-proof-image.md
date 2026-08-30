---
status: reference
owner: engineering
last_reviewed: 2026-08-31
related_adr: docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md
declaration_id: 2026-08-31-pos-balance-payment-proof-image
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: BALANCE_PROOF_IMAGE_REJECTED,BALANCE_PROOF_ALREADY_ATTACHED
policy_version: 2026.08.31
verification_evidence: apps/dgfy-api/tests/posBalancePaymentProof.usecase.test.js -- actually executed (Jest, not just syntax-checked; RF-2 from PR #1210's review): 8/8 pass (happy path stores the file/updates the ledger row/writes one audit row; magic-byte mismatch rejected 422 with the temp file unlinked; a payment_id belonging to another order rejected 404; a second attach on an already-proofed payment rejected 409; a repository failure after storage rolls back and removes the orphaned file; the authed GET use case returns 404 -- never 403 -- for no-proof and cross-order cases and streams the file when it exists),packages/web-core/src/features/pos/__tests__/balanceSettlementProof.behavior.test.jsx -- actually executed (Vitest, run from apps/dgfy-ims per docs/architecture/frontend-split-sync.md): 6/6 pass after fixing an ambiguous-query assertion the syntax-check couldn't catch (the capture affordance renders only on the non-cash branch; the audit-aid copy is present and never claims DGFY verification; choosing/removing a file never changes canSubmit; a passed-in proof error surfaces to the cashier),packages/web-core/src/features/pos/__tests__/terminalBalanceSettlement.behavior.test.jsx -- pre-existing Phase 148 (#825) suite, fixed for the same ambiguous-query cause and re-verified passing (this PR's new proof-capture note shares a substring with its existing reference-note assertion),full apps/dgfy-ims Vitest run (which includes packages/web-core): 1863/1863 pass across 303 files, confirming no other suite regressed from the new audit-aid copy,npm run build:pos (real Vite build, succeeded),node --check on every changed apps/dgfy-api file and the new migration file,npm run check:compliance (confirmed to fail first, then pass once this declaration was added),npm run check:architecture,npm run check:adr --strict (confirms the ADR 0063 Amendments-block route satisfies ADR 0039's process for a `[default]`-tier clause)
rollback_note: Reverting this PR's code diff while the six columns stay added is harmless -- the upload/serve routes simply stop existing and no other tender or settlement behavior changes. Rolling migration 20260831000001-add-pos-order-payment-proof-columns.cjs itself back is pure at the schema level (every column is nullable and additive; down() drops them per tenant, guarded by columnExists) -- but it ORPHANS any proof files already written to apps/dgfy-api/storage/pos-payment-proofs/ on disk. Those files are not tracked by the migration and are not cleaned up by down(); removing them, if ever required, is a manual, out-of-band operation. Stated here rather than left implicit.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-31T00:00:00Z
preflight_request_ref: NOT-EXECUTED-965-POS-BALANCE-PAYMENT-PROOF-IMAGE
---

# POS balance-payment proof-of-payment image (#965)

## Compliance Impact Classification

Major. The floor comes from three rules in `scripts/check-compliance-impact.js`, all confirmed live
against this diff: `apps/dgfy-api/src/modules/pos/**` (`pos,terminal`-surfaced, `major`),
`apps/dgfy-api/src/routes/pos.js` (`pos,terminal`, `major`), and
`packages/web-core/src/features/pos/**` (same). `surfaces` also adds `payments`, matching Phase
202's declaration -- this is payment-evidence data. The gate was confirmed to **fail** first
(`npm run check:compliance`, listing every touched file below), then **pass** once this declaration
was added.

Not `regulatory`: the `regulatory` floor in that script attaches to `modules/compliance/`,
`routes/compliance.js`, `compliancePolicy.js`, and the tenant-admin surfaces -- none of which this
phase touches. Fiscal/BIR treatment of a balance-settlement event stays deferred by ADR 0070's
carried-forward clause 9 `[default]`, and this phase invents no fiscal document, e-sales figure, or
VAT computation.

**However** -- and this is the part that deserved a tech lead's eye rather than a silent `major`,
per #965's own request -- this is the **first phase in the repo to store and serve an uploaded,
PII-bearing image through an authenticated route**, on a `privacy`-labelled issue (RA 10173 / NPC).
The ADR 0063 Amendments-block route below (rather than a full superseding ADR) was confirmed with
Pat before landing.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260831000001-add-pos-order-payment-proof-columns.cjs`
   (**new**) -- adds six nullable, additive columns to `pos_order_payments`
   (`proof_file_path`, `proof_mime_type`, `proof_file_size_bytes`, `proof_sha256`,
   `proof_attached_at`, `proof_attached_by`) plus a `proof_attached_by` FK to `users(user_id) ON
   DELETE SET NULL`. Fans out per active tenant database, guarded by `information_schema`
   `tableExists`/`columnExists`/`foreignKeyExists` checks -- same structure as
   `20260830000003-add-cheque-payment-method.cjs` (Phase 202).
2. `apps/dgfy-api/src/models/PosOrderPayment.js` -- the six attributes, landed in the same commit
   as the migration so model-layer validation never diverges from the database.
3. `apps/dgfy-api/scripts/sync-tenant-schemas.js` -- `REQUIRED_TENANT_SCHEMA_COLUMNS.pos_order_payments`
   (new key, one `ALTER TABLE ... ADD COLUMN` per column, the `proof_attached_by` entry also adding
   the FK) and `REQUIRED_TENANT_SCHEMA_TABLES.pos_order_payments.sql` (the `CREATE TABLE` string
   gains the six columns plus the FK/index), kept in lockstep with the migration so a tenant that
   misses it or is restored from an older snapshot self-repairs at API boot, and a brand-new tenant
   is created correct.
4. `apps/dgfy-api/src/config/uploadConfig.js` -- new `posPaymentProofUpload` multer instance
   (`buildStrictImageUpload`, 15MB cap, one file), reusing the existing `SAFE_IMAGE_MIME_TYPES`
   allowlist. `buildStrictImageUpload` itself is not exported -- only the built instance is.
5. `apps/dgfy-api/src/modules/pos/repositories/posPaymentProofStorage.js` (**new**) -- a private,
   tenant-scoped store under `storage/pos-payment-proofs/<tenant>/<order_id>/<uuid>.webp`, **not**
   `uploads/`. Normalizes with `sharp` (EXIF-rotate then discard orientation, no `.withMetadata()`
   so GPS/device EXIF is dropped, single capped-dimension WebP variant) rather than reusing
   `storeOptimizedImageAsset` -- that writer hardcodes public `/uploads/...` URLs and would
   republish this PII through `server.js`'s unauthenticated static mount.
6. `apps/dgfy-api/src/validators/posValidator.js` -- new params-only
   `validatePosBalancePaymentProofParams` (`:id` + `:payment_id`, positive ints). The existing
   `recordOrderBalancePaymentSchema` is untouched.
7. `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` -- two new use cases,
   `buildAttachOrderBalancePaymentProofUseCase` and `buildGetOrderBalancePaymentProofUseCase`,
   deliberately separate from `buildRecordOrderBalancePaymentUseCase` so
   `POS_OPERATION_KEYS.ORDER_BALANCE_SETTLEMENT`'s `hashPayload` replay fingerprint stays untouched
   by construction. Also extends `buildListIncomingOnlineOrdersUseCase`'s serialization with a
   batched `has_payment_proof`/`balance_payment_id` pair (never `proof_file_path` itself) for the
   queue card's "View proof" affordance.
8. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- `findOrderPaymentEntryById`,
   `updateOrderPaymentEntryProof`, and a batched `getBalancePaymentProofStatuses` (mirrors the
   existing `getReceiptPrintStatuses` shape -- one query per list render, not N+1 per order).
9. `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`, `apps/dgfy-api/src/controllers/posController.js`
   (all three export lists), `apps/dgfy-api/src/routes/pos.js` -- the two new routes:
   `POST /api/v1/pos/orders/:id/balance-payments/:payment_id/proof` (`TRANSACT_POS` + paired
   terminal + active operator, same authority tier as `/record-payment`) and
   `GET /api/v1/pos/orders/:id/balance-payments/:payment_id/proof` (`VIEW_POS`, no pairing
   requirement -- reading evidence is a read-tier action).
10. `packages/web-core/src/features/pos/components/BalanceSettlementDialog.jsx` -- an "Attach proof
    (optional)" file input beside the existing reference field, non-cash branch only, additive per
    Pat's "alongside not instead of". Never added to `canSubmit`.
11. `packages/web-core/src/features/pos/pages/TerminalPage.jsx`,
    `packages/web-core/src/features/pos/components/TerminalPageDialogLayer.jsx`,
    `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx`,
    `packages/web-core/src/features/pos/services/posService.js` -- the upload-after-settle
    sequencing (a proof-upload failure is a warning toast, never a thrown error, never a rollback),
    and a minimal "View proof" viewer (fetch-blob-to-object-URL, since the POS app authenticates
    with a Bearer header a plain `<img src>` would 401 against).

Governance: ADR 0063 clause 7 is `[default]`. Per ADR 0039's tier rules the cheapest correct route
is a dated `## Amendments` block on the existing ADR in this same PR (`status: amended` already
set) -- not a new superseding ADR. `npm run check:adr --strict` passes with the amendment live,
confirming the route actually satisfies ADR 0039's process.

## Compliance Preconditions

1. **No unauthenticated access path exists.** Both routes sit behind `checkPermission` and
   `tenantHandler`; the GET requires `VIEW_POS`, the POST requires `TRANSACT_POS` + paired
   terminal + active operator.
2. **The file is written outside every `express.static` root.** `storage/pos-payment-proofs/` is
   the private `storage/` root (already a persistent Docker volume, same precedent as
   `platform-invoices` and `temp-ai-exports`) -- `server.js`'s `/uploads` static mount never points
   at it.
3. **EXIF/GPS metadata is stripped.** `posPaymentProofStorage.js`'s `sharp` pipeline calls
   `.rotate()` (applies then discards EXIF orientation) and never calls `.withMetadata()`.
4. **`Cache-Control: private, no-store` is set** on the GET response, keeping the PII out of
   shared/proxy caches -- copied verbatim from the `downloadPlatformInvoiceArtifact` precedent.
5. **The storage key is never serialized to a client.** `has_payment_proof` (boolean) is the only
   derived field POS list responses carry; `proof_file_path` never leaves the repository/use-case
   layer.
6. **The filename is non-enumerable.** `crypto.randomUUID()`, never `file.originalname` -- both
   the directory-traversal guard the shared `uploadConfig.js` diskStorage lacks and the
   non-enumerability Pat's decision on #965 requires.
7. **A cashier attestation is not weakened.** ADR 0063 clause 5 `[binding]` is restated, not
   amended, by the new Amendments block: an attached image is cashier-captured operational
   evidence, never presented as DGFY-verified.
8. **The ENUM/column widening reaches every active tenant, not just the connected database.** The
   migration iterates `tenants WHERE status = 'active'`, guarded by `tableExists`/`columnExists`
   per tenant -- the mechanism that avoids the #860/#639 crash-loop class.
   `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md` has no open entries with a deploy-order
   dependency on this migration; this migration introduces none of its own (additive nullable
   columns only, no new table).

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- New `apps/dgfy-api/tests/posBalancePaymentProof.usecase.test.js` -- happy path, magic-byte
  rejection (with temp-file unlink confirmed), cross-order ownership 404, attach-once 409, a
  rollback-orphan-cleanup case, and the authed-read use case's 404-not-403 and streaming cases.
- New `packages/web-core/.../balanceSettlementProof.behavior.test.jsx` -- the capture affordance's
  non-cash-only rendering, the audit-aid copy, and that choosing/removing a file never gates
  submit.
- `apps/dgfy-api/tests/posOrderBalanceSettlement.usecase.test.js` -- left unmodified, still passing,
  the proof of #965 verify box 1: `hashPayload` and the settlement's replay behaviour are untouched
  by construction (a separate route, not a fold-in).
- `npm run build:pos` -- the real Vite build of the app that renders the widened dialog.
- `npm run check:adr --strict` -- confirms the Amendments-block route satisfies ADR 0039's process
  for a `[default]`-tier clause.
- `node --check` on every changed `apps/dgfy-api` `.js`/`.cjs` file (no real build step on that
  app; its own `build` script is a no-op).

## Residual Risks

1. **No retention or purge policy ships in this phase.** Images persist for the life of the
   tenant's volume. RA 10173 proportionality argues for a bounded retention window on
   financial-evidence imagery; designing it (window length, who authorizes a purge, interaction
   with BIR record-keeping) is a product/compliance decision, handed to `pm` as a follow-up issue,
   not silently omitted.
2. **No replace/delete path for an attached proof.** Attach-once by design (ADR 0063 clause 10
   `[binding]`'s append-only posture for correcting merchant-owned tender); a second attach fails
   closed with `409`.
3. **A rolled-back migration orphans files on disk.** `down()` is pure at the schema level but does
   not, and cannot, clean up files already written to `storage/pos-payment-proofs/` -- stated in
   the migration's own header and in `rollback_note` above.
4. **Attestation is trust, by design** -- inherited unchanged from ADR 0063 clause 5. A photo is
   evidence the store captured something at the counter; it is not verification that the payment
   is genuine, complete, or will clear. Nothing in this phase (or the ADR it extends) claims
   otherwise.
5. **Six columns on the existing ledger row, not a child table** -- one photo per balance
   settlement, by construction. If a later phase needs proof history or in-place replacement, the
   child table PHASE_204_PLAN.md section 5.1 evaluated and rejected for this phase (highest
   blast-radius operation this repo has: a new table across every tenant database) is the natural
   forward migration, and these columns seed its first row.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The live sweep runs once per batch at the `develop -> staging` promotion.
