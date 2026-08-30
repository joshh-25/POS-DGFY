# Phase 204 — Settle Balance: Proof-of-Payment Image Capture + Authed Serving (#965)

> **Status: PLAN ONLY.** No code, no branch, no commit was produced by this document. Every file
> path, line reference, and existing-behaviour claim below was re-verified against the live
> `origin/develop` tree at `c24b94264` (2026-08-30), *after* Phase 202 (#1085, cheque tender) merged
> — several statements in #965's own body are stale relative to that merge and are corrected inline.

- **Issue:** [#965](https://github.com/Sieitzz/dgfy-platform/issues/965) — *Settle Balance: attach
  proof-of-payment image alongside the reference ID*
- **Parent tracking issue:** #1183 (Surebiz Wave 2)
- **Phase number:** 204 (`docs/features/IMPLEMENTATION_PHASE_LEDGER.md` currently holds 202, 203,
  206, 207; **204 is free and is the number this work claims** — do not renumber)
- **Extends:** #825 (Phase 148, balance settlement), #1085 (Phase 202, cheque tender)
- **Governing ADRs:** 0063 (`amended`), 0077 (`accepted`), 0069→0070 (0069 is `superseded` — cite
  0070 for the carried-forward clauses, never 0069 directly for a new decision)

---

## 0. Resolved decision this plan is built on

**Pat, on #965, 2026-08-30:** the proof image is captured/uploaded by POS staff, is
*financial-evidence PII* (bank and cheque details may be visible, especially after Phase 202), and
**must be served through an authenticated streaming route — never a public/static `/uploads` path,
and never at a guessable or enumerable URL.**

That decision is load-bearing for §3 (storage root) and §4 (serving route) below and is not
re-litigated here.

---

## 1. Critical assessment — read before implementing

### 1.1 Corrections to #965's own scope text (post-#1085 drift)

| #965 says | Actual state on `develop` @ `c24b94264` | Consequence |
|---|---|---|
| `buildStrictImageUpload({...})` can be imported from `uploadConfig.js:87` | `buildStrictImageUpload` is a **module-local `const`, not exported**. Only pre-built instances are exported (`posCatalogImageUpload`, `storefrontAssetUpload`, …) | Add a **new exported instance** (`posPaymentProofUpload`) in `uploadConfig.js`. Do **not** export the factory — that widens the module's API for no reason. |
| Copy `TenantComplianceFinalReviewDocument.js`'s record shape | Fine as a *shape* reference, but it is a **landlord-DB** model. `pos_order_payments` is a **tenant** table | Do not copy its migration pattern. See §5's per-tenant fan-out rule. |
| `BalanceSettlementDialog.jsx:110,118` has the reference field | Line numbers moved; the field is now **method-aware** (`Cheque number` vs `Reference number`, two different helper captions, two different attestation strings) after #1085 | The new affordance must not flatten that branching. Anchor edits on the `isCheque` ternaries, not on line numbers. |
| `/uploads` "appears to have no auth middleware… not exhaustively traced" | **Confirmed traced.** `app.use('/uploads', express.static(...))` is at `server.js:722`, mounted *before* `csrfProtection` (`:740`) and *before* `app.use(tenantHandler)` (`:748`). It is unauthenticated, un-tenant-scoped, and path-enumerable | Settles the decision empirically. The public path was never viable for this payload. |
| "there is no authed file-serving route" (implied) | **There is one.** `downloadPlatformInvoiceArtifact` (`apps/dgfy-api/src/modules/platformInvoicing/controllers/platformInvoiceHandlers.js:40-51`) reads a private artifact from `storage/` and sends it with `Cache-Control: private, no-store` | Use it as the copy source for §4. This is *not* a first-of-its-kind mechanism; it is the first **tenant-scoped, POS-surfaced** one. |

### 1.2 Risks and hidden assumptions

1. **The POS app authenticates with a `Bearer` header, not a cookie.**
   `packages/web-core/src/services/api.js:413` sets `config.headers.Authorization`. A plain
   `<img src="/api/v1/pos/...">` will **not** carry it and will 401. The viewer must
   `fetch` → `blob` → `URL.createObjectURL`, and must `URL.revokeObjectURL` on unmount. Planning
   an `<img src>` here is the single most likely way this phase ships broken.
2. **`storeOptimizedImageAsset` is the wrong tool for this payload.** It writes every variant into
   the **public** uploads root and hardcodes `/uploads/...` URLs (`imageAssetStorage.js:150`,
   `:242`). Reusing it would silently republish the PII to the static mount — the exact outcome
   Pat's decision forbids. #965's "reuse existing upload infra" is still honoured: multer +
   `validateImageUploadFile` + `sharp` are reused; the *public asset writer* is not.
3. **Legibility is a functional requirement here, compression is not.** A GCash/cheque screenshot
   exists to be read by a human auditor. Aggressive re-encoding that smudges a reference number
   destroys the evidence value. Normalize (EXIF-rotate, strip metadata, cap dimension, single
   variant) — do not run the 3-variant/4-quality-step ladder.
4. **EXIF GPS is a second PII channel.** A phone camera capture can embed the store's coordinates.
   Stripping metadata is a requirement, not a nicety.
5. **Idempotent replay is *not* threatened, and must stay that way.** The proof is a **separate
   route**, so `hashPayload` (`posUseCases.js:8935-8943`) is untouched and the replay fingerprint
   is unchanged. Any temptation to fold the file into `/record-payment` reintroduces exactly the
   problem #965 warned about.
6. **`preserveTenantContext` is mandatory.** Without it the handler falls back to the default DB
   after multipart parsing (`uploadConfig.js:32-41`). Omitting it is a silent cross-tenant write.
7. **Deleting/replacing a proof is out of scope and must fail closed.** ADR 0063 clause 10
   `[binding]` establishes an append-only posture for correcting merchant-owned tender. A
   "replace the photo" affordance would need that same append-only treatment; this phase ships
   **attach-once**, and a second attach on a payment that already has one returns `409`.

### 1.3 Recommendation

**Proceed.** The scope is well-bounded, the serving decision is resolved, and every mechanism it
needs already exists in-repo. Two deviations from #965's literal text are recommended and stated
above: (a) do **not** reuse `storeOptimizedImageAsset`/the public uploads root, and (b) do **not**
import `buildStrictImageUpload`. Neither changes what the feature does.

---

## 2. Upload path

### 2.1 Route

```
POST /api/v1/pos/orders/:id/balance-payments/:payment_id/proof
```

Registered in `apps/dgfy-api/src/routes/pos.js`, immediately after the existing
`/orders/:id/record-payment` line (`pos.js:264`). Middleware chain, modelled on the catalog-image
route at `pos.js:176` **plus** the mutation guards the record-payment route already carries:

```js
router.post(
  '/orders/:id/balance-payments/:payment_id/proof',
  checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS),
  posController.requirePairedTerminal,
  validatePosBalancePaymentProofParams,          // NEW - :id + :payment_id, positive ints
  preserveTenantContext(posPaymentProofUpload.single('proof')),
  posController.requireActiveOperatorForMutation,
  posController.uploadOrderBalancePaymentProof   // NEW
);
```

Notes:
- `TRANSACT_POS`, `requirePairedTerminal`, and `requireActiveOperatorForMutation` mirror
  `/record-payment` exactly — attaching evidence to a payment is the same authority tier as
  recording it.
- The multer middleware sits **after** the param validator so a malformed id is rejected before a
  file is written to disk.
- CSRF (`server.js:740`) and `posLimiter` (`pos.js` router-level) already apply; nothing to add.

### 2.2 New multer instance

In `apps/dgfy-api/src/config/uploadConfig.js`, alongside the existing exports:

```js
export const PAYMENT_PROOF_SOURCE_MAX_BYTES = 15 * 1024 * 1024; // phone camera JPEG headroom
export const posPaymentProofUpload = buildStrictImageUpload({
  maxBytes: PAYMENT_PROOF_SOURCE_MAX_BYTES,
  maxFiles: 1
});
```

`buildStrictImageUpload` already filters on `SAFE_IMAGE_MIME_TYPES`
(`imageUploadValidation.js:3-10`) — JPEG/PNG/GIF/WebP/BMP/AVIF, which covers every phone screenshot
and camera capture without new type support.

### 2.3 Validator

`apps/dgfy-api/src/validators/posValidator.js` — a params-only schema (there is no JSON body; the
multipart body carries only the file):

```js
const balancePaymentProofParamsSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  payment_id: Joi.number().integer().positive().required()
});
export const validatePosBalancePaymentProofParams =
  validateSchema(balancePaymentProofParamsSchema, 'params', 'validatedParams');
```

`recordOrderBalancePaymentSchema` (`posValidator.js`, the `payment_reference` schema) is **not
touched**.

### 2.4 Use case — `buildAttachOrderBalancePaymentProofUseCase`

New export in `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, placed directly after
`buildRecordOrderBalancePaymentUseCase` (ends `:9172`). Ordered guard sequence — **every failure
path must `unlink` the multer temp file**, in a `finally`, or the temp dir leaks PII:

1. `parsePositiveInt` on `orderId`, `paymentId`, `user.user_id`; reject `422` if any fail.
2. `validateImageUploadFile({ file, maxBytes: PAYMENT_PROOF_SOURCE_MAX_BYTES })` —
   magic-byte sniff. On `!ok`, `422` with `reason_code:
   'BALANCE_PROOF_IMAGE_REJECTED'` and the validator's own `reason` echoed in `details`. This is
   #965's "rejects a mismatched/renamed file type" verify box.
3. Open a transaction; `posRepository.getOrderByIdForLifecycle(orderId, { transaction, lock: true })`.
   Not found or `order_source !== ONLINE_ORDER_SOURCE` → `404`.
4. `posRepository.findOrderPaymentEntryById(paymentId, { transaction, lock: true })` (**new repo
   method**, §5.3). Reject `404` unless the row exists **and** `pos_transaction_id === orderId`
   **and** `kind === 'balance'` — the ownership check that stops a caller attaching a proof to
   another order's ledger row.
5. If `proof_file_path` is already set → `409`, `reason_code:
   'BALANCE_PROOF_ALREADY_ATTACHED'`. Attach-once, per §1.2.7.
6. `posPaymentProofStorage.store(...)` (§3) → `{ storage_key, mime_type, size_bytes, sha256 }`.
7. `posRepository.updateOrderPaymentEntryProof(paymentId, {...}, { transaction })` (**new**, §5.3).
8. `posRepository.createAuditLog({ ..., action: 'UPDATE', changes: { event:
   'order_balance_payment_proof_attached', pos_order_payment_id, mime_type, size_bytes, sha256,
   terminal_id, attached_at } })` — in the same transaction, matching how the settlement's own
   audit row is written (`posUseCases.js:9106-9128`). **Never log the file bytes or a URL.**
9. Commit. On any throw after step 6, roll back **and** `posPaymentProofStorage.remove(storage_key)`
   so a rolled-back transaction cannot orphan a PII file on disk.

**No operation-replay entry.** `POS_OPERATION_KEYS.ORDER_BALANCE_SETTLEMENT` and its
`hashPayload` are untouched; step 5's `409` is the idempotency story for this route, and it is the
right one for a binary payload.

### 2.5 Handler

`apps/dgfy-api/src/modules/pos/controllers/posHandlers.js` — `uploadOrderBalancePaymentProof`,
structurally a merge of `recordOrderBalancePayment` (`:2051`) and `uploadCatalogImage` (`:2549`):
reads `req.validatedParams`, `req.file`, `posMutationUser(req)`, and the ip/user-agent audit
context; returns `200` via `sendUseCaseResult`. Re-export through
`apps/dgfy-api/src/controllers/posController.js` (three export lists — named import block, named
re-export block, and the `default` object; all three must be edited, per the existing file's
structure).

### 2.6 Frontend capture

- `packages/web-core/src/features/pos/components/BalanceSettlementDialog.jsx` — an
  **"Attach proof (optional)"** control rendered *beside* the existing reference field, inside the
  non-cash branch (`isCash ? … : …`). Additive, per Pat's "alongside not instead of".
  - `<input type="file" accept="image/*" capture="environment">` — `capture` gives the POS tablet
    the rear camera directly; desktop browsers ignore it and fall back to a file picker.
  - Local preview via `URL.createObjectURL`, revoked on clear/unmount.
  - New props: `proofFile`, `onProofFileChange`, `proofUploading`, `proofError`. **Do not**
    add the file to `canSubmit` — the proof is optional and must never gate the settlement.
  - Copy, extending ADR 0063 clause 7's framing verbatim rather than weakening it:
    *"An audit aid only. An attached photo is evidence the store captured at the counter — it is
    not proof that DGFY verified the payment."* For `isCheque`, the existing presented-not-cleared
    sentence stays and the same caveat is appended.
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx` — `handleSettleBalance` (`:5554`):
  after `recordOrderBalancePayment` resolves, read
  `result.settlement.pos_order_payment_id` and, **only if a file was chosen**, call the new
  service function. A proof-upload failure is a `toast.message` warning, **never** a thrown error
  and never a rollback — the balance is already settled and correct without it. Sequence-after,
  not before: this is what keeps the settlement's own idempotent replay untouched.
  Add the four `useState` hooks next to the existing `balanceSettlement*` ones and reset them in
  `handleOpenBalanceSettlement` (`:5542`), the same way `setBalanceSettlementConfirmed(false)`
  already prevents carry-over between orders.
- `packages/web-core/src/features/pos/components/TerminalPageDialogLayer.jsx:201` — thread the four
  new props.
- `packages/web-core/src/features/pos/services/posService.js` — after
  `recordOrderBalancePayment` (`:807`):

```js
export const uploadOrderBalancePaymentProof = async (posTransactionId, paymentId, file, { terminal_id } = {}) => {
  const form = new FormData();
  form.append('proof', file);
  const response = await api.post(
    `/pos/orders/${posTransactionId}/balance-payments/${paymentId}/proof`,
    form,
    { headers: getRegisteredTerminalHeaders(terminal_id) }   // let the browser set the multipart boundary
  );
  return response.data?.data;
};

export const fetchOrderBalancePaymentProof = async (posTransactionId, paymentId) => {
  const response = await api.get(
    `/pos/orders/${posTransactionId}/balance-payments/${paymentId}/proof`,
    { responseType: 'blob' }
  );
  return URL.createObjectURL(response.data);   // caller MUST revokeObjectURL
};
```

Do **not** hand-set `Content-Type: multipart/form-data` — omitting it is what lets the browser
attach the boundary. Add both to the module's default-export object (`posService.js:949` block).

---

## 3. Storage location

**Recommendation: `apps/dgfy-api/storage/pos-payment-proofs/<tenant>/<order_id>/<uuid>.<ext>` —
the private `storage/` root, NOT `uploads/`.**

Why this root and not another:

| Candidate | Verdict |
|---|---|
| `uploads/` (public) | **Rejected.** `express.static` at `server.js:722` serves the whole tree unauthenticated, pre-`tenantHandler`. Directly contradicts Pat's decision. |
| `uploads/private/` + a static-mount exclusion | **Rejected.** Security by a negative rule on a mount that defaults to serving everything — one refactor of the `setHeaders` block and the PII is public again. Fail-open by construction. |
| **`storage/`** | **Chosen.** Already a private root with a working precedent (`platformInvoiceArtifactStore.js:5` → `storage/platform-invoices`; `tempFileService.js:23` → `storage/temp-ai-exports`). Already a persistent Docker volume: `./data/dgfy-api/storage:/app/storage` (`infrastructure/docker/docker-compose.yml:128`) — **no new mount, no deploy change, no data-loss-on-redeploy risk.** No `express.static` mount points at it. |
| S3 / object storage | **Rejected.** No S3/Cloudinary/presigned path exists anywhere in the repo (confirmed). Introducing one is a separate architectural decision, not this phase. |

### 3.1 New adapter — `posPaymentProofStorage.js`

`apps/dgfy-api/src/modules/pos/repositories/posPaymentProofStorage.js`, structured on
`posCatalogImageStorage.js` (same directory, same tenant-segment sanitization) with
`platformInvoiceArtifactStore.js`'s `safePath` traversal guard:

```js
const ROOT = () => path.resolve(process.env.POS_PAYMENT_PROOF_ROOT
  || path.join(process.cwd(), 'storage', 'pos-payment-proofs'));
const safePath = (key) => { /* resolve + assert startsWith(`${ROOT()}${path.sep}`) */ };
```

- Tenant segment from `dbStore.getStore()?.tenantId`, sanitized identically to
  `posCatalogImageStorage.js:13-18`.
- Filename is `crypto.randomUUID()` — **never** `file.originalname`. This is both the
  directory-traversal guard the shared `storage` diskStorage lacks (see `uploadConfig.js`'s own
  comment on that hazard) and the non-enumerability Pat's decision requires.
- `store()` normalizes with `sharp` before writing: `.rotate()` (applies then discards EXIF
  orientation), no `withMetadata()` (so GPS/device EXIF is dropped), `.resize({ width: 2000, fit:
  'inside', withoutEnlargement: true })`, re-encode to WebP `quality: 82` — one file, one
  variant, chosen for legibility over size (§1.2.3). Records `sha256` of the written bytes for the
  same integrity check `platformInvoiceArtifactStore.read` performs.
- `read(storageKey)` returns a Buffer; `remove(storageKey)` unlinks, swallowing `ENOENT`.
- `.gitignore`: confirm `storage/` is ignored in `apps/dgfy-api` before the first local run — a
  committed proof image is an unrecoverable PII leak into git history.

### 3.2 Retention — stated gap, not solved here

No retention or purge job ships in this phase. The images persist for the life of the tenant's
volume. RA 10173 proportionality argues for a bounded retention window on financial-evidence
imagery; designing it (window length, who authorises a purge, interaction with BIR record-keeping)
is a product/compliance decision, not an implementation detail. **Named explicitly in the impact
declaration's Residual Risks and handed to `pm` as a follow-up issue — not silently omitted.**

---

## 4. Authed serving route

```
GET /api/v1/pos/orders/:id/balance-payments/:payment_id/proof
```

```js
router.get(
  '/orders/:id/balance-payments/:payment_id/proof',
  checkPermission(PERMISSIONS.POS.actions.VIEW_POS),
  validatePosBalancePaymentProofParams,
  posController.getOrderBalancePaymentProof
);
```

Design points, each with its reason:

- **`VIEW_POS`, not `TRANSACT_POS`.** Reading evidence is a read-tier action; a manager reviewing a
  settlement should not need transact rights.
- **No `requirePairedTerminal` on the GET.** Pairing is a *mutation* control on this router
  (`/record-payment`, drawer, void all carry it; the read routes at `pos.js:210-230` do not).
  Requiring it would block back-office review from a non-terminal browser for no security gain —
  tenant scope and permission already bound the read.
- **The URL is not the secret.** Authorization is enforced per request; the UUID filename is
  defence in depth against enumeration, not the control.
- **Tenant scoping is structural, not a filter.** The route sits behind `tenantHandler`
  (`server.js:748`), so `dbStore` resolves the caller's own tenant DB. The order→payment ownership
  re-check from §2.4 step 4 runs again on read: a `payment_id` from another tenant simply does not
  exist in this tenant's `pos_order_payments`.
- **Handler** — copy `downloadPlatformInvoiceArtifact`
  (`platformInvoiceHandlers.js:40-51`) with three changes:
  - `Content-Type` from the stored `proof_mime_type`, plus `X-Content-Type-Options: nosniff`.
  - `Content-Disposition: inline` (this is viewed, not downloaded) with **no filename** —
    a filename would echo tenant/order data into the header for no benefit.
  - `Cache-Control: private, no-store` — kept verbatim from the precedent. This is the header that
    keeps the PII out of shared/proxy caches, and it is the reason the response is served by a
    handler rather than by any static mechanism.
  - `404` (not `403`) when the row exists but has no proof, and when the payment is not this
    order's — do not leak existence.
- **Streaming vs buffer.** `fs.createReadStream(...).pipe(res)` is the strict reading of "streaming
  route"; the precedent buffers. Either satisfies the decision (the property that matters is *authed
  and non-static*). **Recommend `createReadStream`** — bounded memory under concurrent POS review,
  and the files are single-variant images, not the multi-MB PDFs the buffered precedent handles.
  Set `Content-Length` from `proof_file_size_bytes` and handle the stream's `error` event so a
  missing-on-disk file returns `500` rather than a half-written response.
- **Frontend viewer:** a small "View proof" affordance on the settled-order detail surface, using
  `fetchOrderBalancePaymentProof` → object URL → `<img>`, revoked on unmount (§1.2.1). Scope this to
  the smallest place the settled payment is already displayed; a full evidence-browser UI is not in
  this phase.

---

## 5. DB linkage

### 5.1 Decision: three nullable columns on `pos_order_payments`

**Recommended: columns on the existing ledger row.** Matches #965's own scope box.

```
proof_file_path        VARCHAR(255) NULL   -- storage key, relative to POS_PAYMENT_PROOF_ROOT
proof_mime_type        VARCHAR(60)  NULL
proof_file_size_bytes  INT          NULL
proof_sha256           CHAR(64)     NULL   -- integrity, matching the platform-invoice precedent
proof_attached_at      DATETIME     NULL
proof_attached_by      INT          NULL   -- FK -> users(user_id) ON DELETE SET NULL
```

(Five/six columns rather than #965's three: `sha256` and the attribution pair are what make this
*evidence* rather than an orphan file reference, and they cost nothing to add now versus a second
tenant-wide migration later.)

**Tradeoff, stated plainly:**

| | Columns on `pos_order_payments` (**chosen**) | New `pos_order_payment_proofs` child table |
|---|---|---|
| Multiple proofs per payment | **No** — one, by construction | Yes |
| Replace/supersede a proof, append-only | **No** — attach-once, `409` on a second attempt | Natural fit; matches ADR 0063 clause 10's append-only posture |
| Per-tenant rollout cost | Six additive nullable columns; `REQUIRED_TENANT_SCHEMA_COLUMNS` entries + one `CREATE TABLE` string edit in `sync-tenant-schemas.js` | A whole new `CREATE TABLE` + index + FK entries in `REQUIRED_TENANT_SCHEMA_TABLES`, on every tenant DB — the #860/#639 crash-loop surface |
| Read cost in the settlement response | Already loaded with the ledger row; zero extra query | Extra join/query on every settled-order read |
| Reversibility if requirements grow | Migrate to the child table later; the columns become the first row | n/a |

**Why chosen:** the actual requirement is *one photo per balance settlement*. The child table buys
multiplicity and append-only replacement that this phase explicitly does not ship, at the cost of
the highest-blast-radius operation this repo has (a new table across every tenant database). If a
later phase needs proof history or replacement, the child table is a clean forward migration and
these columns seed its first row. **Flagged as a knowingly-accepted constraint**, and recorded in
the impact declaration's Residual Risks rather than left implicit.

### 5.2 Migration + tenant-schema sync — the part that must not be gotten wrong

`pos_order_payments` is a **tenant** table. `apps/dgfy-migration-runner` **only ever touches the
landlord DB** (its own README, line 8). Two artifacts are therefore both required:

1. **`apps/dgfy-migration-runner/migrations/2026083100000X-add-pos-order-payment-proof-columns.cjs`**
   — must **fan out over `tenants WHERE status = 'active'`**, exactly like
   `20260830000003-add-cheque-payment-method.cjs` (Phase 202) does, *not* the bare-`queryInterface`
   shape of `20260821000002-add-pos-transaction-partial-payment-columns.cjs`. Guard each tenant
   with `tableExists` + `describeTable` so a re-run and a tenant missing the table are both no-ops.
   `down()` removes the columns; because every column is nullable and additive, a rollback is
   pure at the schema level — but it **orphans the files on disk**, which the `rollback_note` must
   say outright.
2. **`apps/dgfy-api/scripts/sync-tenant-schemas.js`** — kept in lockstep, both places:
   - `REQUIRED_TENANT_SCHEMA_COLUMNS.pos_order_payments` (**new key**, shape per `:42-56`) with one
     `ALTER TABLE … ADD COLUMN …` entry per column, so a tenant that missed the migration or was
     restored from an older snapshot self-repairs at API boot.
   - `REQUIRED_TENANT_SCHEMA_TABLES.pos_order_payments.sql` (`:1472-1501`) — the `CREATE TABLE`
     string gains the six columns, so a brand-new tenant is created correct rather than created
     stale-then-repaired.

   Skipping either half is the #860/#639 class of failure this repo has already had once. The
   reviewer will check for both.
3. **`apps/dgfy-api/src/models/PosOrderPayment.js`** — the six attributes, landed in the **same
   commit** as the migration so model validation never diverges from the database.
4. **`docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`** — read it before opening the PR and
   state in the PR body whether this migration has a deploy-order dependency on any open entry
   (`pr-reviewer` SKILL.md §5 will flag a migration PR that omits this).

### 5.3 Repository additions

`apps/dgfy-api/src/modules/pos/repositories/posRepository.js`, beside
`findOrderPaymentEntryByKind` (`:5736`):

```js
async findOrderPaymentEntryById(posOrderPaymentId, options = {}) { /* findByPk + lock */ },
async updateOrderPaymentEntryProof(posOrderPaymentId, payload = {}, options = {}) { /* row.update */ }
```

Both resolve `dbStore.get('PosOrderPayment')` — the use case must never import the model directly
(`check:architecture-guardrails` enforces this; `MODEL_IMPORT_PATTERN`).

### 5.4 Response surface

`buildRecordOrderBalancePaymentUseCase`'s `settlement` payload (`posUseCases.js:9130-9148`) already
returns `pos_order_payment_id` — the frontend needs nothing new from it. Where a settled payment is
serialized for display, add a boolean `has_payment_proof` derived from `proof_file_path != null`.
**Never serialize `proof_file_path` itself to a client** — the storage key is not a URL and
exposing it invites someone to build a static path from it.

---

## 6. Compliance impact declaration — **REQUIRED. `major`.**

**Yes, `npm run check:compliance` will fail without one.** Three separate rules in
`scripts/check-compliance-impact.js` fire on this diff, each with a `major` floor:

| Rule (`check-compliance-impact.js`) | Files this phase touches |
|---|---|
| `^apps/dgfy-api/src/modules/pos/` → `pos,terminal`, `major` | `usecases/posUseCases.js`, `controllers/posHandlers.js`, `repositories/posRepository.js`, `repositories/posPaymentProofStorage.js` |
| `^apps/dgfy-api/src/routes/pos\.js$` → `pos,terminal`, `major` | the two new routes |
| `^packages/web-core/src/features/pos/` → `pos,terminal`, `major` | `BalanceSettlementDialog.jsx`, `TerminalPage.jsx`, `TerminalPageDialogLayer.jsx`, `services/posService.js` |

Add `payments` to `surfaces` as well, matching Phase 202's declaration
(`docs/compliance/impact-declarations/2026-08-30-pos-cheque-tender-method.md`, `surfaces:
pos,terminal,payments`) — this is payment-evidence data.

**Why `major` and not `regulatory`, argued rather than assumed:** the `regulatory` floor in that
script attaches to `modules/compliance/`, `routes/compliance.js`, `compliancePolicy.js`, and the
tenant-admin surfaces — none of which this phase touches. Fiscal/BIR treatment of a
balance-settlement event stays deferred by ADR 0070's carried-forward clause 9 `[default]`, and
this phase invents no fiscal document, e-sales figure, or VAT computation.

**However — and this is the part that deserves a tech lead's eye rather than a silent `major`:**
this is the **first phase in the repo to store and serve an uploaded, PII-bearing image through an
authenticated route**, on a `privacy`-labelled issue (RA 10173 / NPC). Two things follow:

1. The declaration's **Compliance Preconditions** section must carry, as first-class numbered
   preconditions: no unauthenticated access path exists; the file is written outside every
   `express.static` root; EXIF/GPS metadata is stripped; `Cache-Control: private, no-store` is set;
   the storage key is never serialized to a client; and the filename is non-enumerable.
2. The **Residual Risks** section must name, not bury: no retention/purge policy (§3.2); no
   replace/delete path (attach-once, §1.2.7); a rolled-back migration orphans files on disk
   (§5.2.1); and attestation-is-trust, inherited unchanged from ADR 0063 clause 5 — **a photo is
   not verification**, and nothing here claims otherwise.

Model the file on `2026-08-30-pos-cheque-tender-method.md` — same frontmatter keys, same
`preflight_request_ref: NOT-EXECUTED-965-POS-BALANCE-PAYMENT-PROOF-IMAGE` convention. Per #884, a
`NOT-EXECUTED-*` ref on a `develop`-targeting PR is expected and is **not** a review finding; the
live sweep runs once per batch at promotion.

**Confirm the gate empirically:** run `npm run check:compliance` *before* adding the declaration
(it must fail), then again after (it must pass), and record both in `verification_evidence` — the
same proof Phase 202's declaration recorded.

### 6.1 ADR governance

**ADR 0063 clause 7 is `[default]`.** Per ADR 0039's tier rules, the cheapest correct route is a
dated `## Amendments` block appended to
`docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md` **in the same
PR**, with `status: amended` (already set — the ADR carries a 2026-08-13 amendment block at `:99`).
No new superseding ADR is needed; #965's own guess was right, and the `[default]` tag is verified
live at `0063:57-59`.

The amendment must say, in clause form:

1. A proof-of-payment image may be attached to a recorded merchant-owned settlement. It **extends**
   the clause-7 audit aid; it does **not** become independent verification. `[default]`
2. Clause 5 `[binding]` is **unweakened**: an attached image is cashier-captured operational
   evidence and must never be presented, in UI copy or in any serialized field, as DGFY having
   verified the payment against a provider. `[binding]` — restated, not amended.
3. Proof imagery is served only through an authenticated, tenant-scoped route; no public or static
   path may serve it. `[binding]`
4. Attach-once in this phase; replacement/deletion is not authorized and is deferred. `[default]`

Run `npm run check:adr` (`--strict`) after the edit — it is the gate that proves the amendment
route satisfies ADR 0039, and Phase 202's declaration cites it for exactly that reason.

**Per #965: confirm the amendment route with Pat/a tech lead before landing it.** Clause 3 above
touches a `[binding]`-adjacent guarantee even though it is new text, and #965 explicitly asked for
that confirmation rather than an assumption.

---

## 7. Files touched (execute-step inventory)

**New (6):**
```
apps/dgfy-migration-runner/migrations/2026083100000X-add-pos-order-payment-proof-columns.cjs
apps/dgfy-api/src/modules/pos/repositories/posPaymentProofStorage.js
apps/dgfy-api/tests/posBalancePaymentProof.usecase.test.js
packages/web-core/src/features/pos/__tests__/balanceSettlementProof.behavior.test.jsx
docs/compliance/impact-declarations/2026-08-31-pos-balance-payment-proof-image.md
(+ the `## Amendments` block on ADR 0063 — an edit, listed under Modified)
```

**Modified (13):**
```
apps/dgfy-api/src/config/uploadConfig.js                              (posPaymentProofUpload)
apps/dgfy-api/src/models/PosOrderPayment.js                           (6 attributes)
apps/dgfy-api/src/validators/posValidator.js                          (params schema)
apps/dgfy-api/src/routes/pos.js                                       (POST + GET)
apps/dgfy-api/src/controllers/posController.js                        (3 export lists)
apps/dgfy-api/src/modules/pos/controllers/posHandlers.js              (2 handlers)
apps/dgfy-api/src/modules/pos/usecases/posUseCases.js                 (2 use cases)
apps/dgfy-api/src/modules/pos/repositories/posRepository.js           (2 methods)
apps/dgfy-api/scripts/sync-tenant-schemas.js                          (COLUMNS + TABLES, both)
packages/web-core/src/features/pos/components/BalanceSettlementDialog.jsx
packages/web-core/src/features/pos/components/TerminalPageDialogLayer.jsx
packages/web-core/src/features/pos/pages/TerminalPage.jsx
packages/web-core/src/features/pos/services/posService.js
docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md
docs/features/IMPLEMENTATION_PHASE_LEDGER.md                          (Phase 204 entry)
```

---

## 8. Verification plan

Maps 1:1 onto #965's `## Verify` boxes plus the Tier-0 requirement in
`.agents/skills/implement/SKILL.md`.

**Tier 0 — required, before the PR opens:**
- `node --check` on every changed `apps/dgfy-api` `.js` file and the new `.cjs` migration
  (`apps/dgfy-api` has no real build step — its `build` script is a literal no-op).
- `npm run build:pos` — the real Vite build of the app that consumes the widened dialog.
  `packages/web-core` is the shared trunk; only `dgfy-pos` renders this surface, so `build:pos`
  alone is the affected-app build. No `package.json` is touched, so no lockfile check applies.

**Tests:**
- `apps/dgfy-api/tests/posBalancePaymentProof.usecase.test.js` (**new**):
  1. Happy path — file stored, row updated, audit row written, one transaction.
  2. **Magic-byte rejection** — a `.png`-named file with JPEG bytes and a mismatched reported mime
     is rejected `422` and the temp file is unlinked (#965 verify box 2, *"confirm it fires on this
     new route too"*).
  3. Ownership — a `payment_id` belonging to a different order → `404`.
  4. Attach-once — a second attach → `409 BALANCE_PROOF_ALREADY_ATTACHED`.
  5. Rollback — a forced repository failure after storage leaves **no** file on disk.
- `apps/dgfy-api/tests/posOrderBalanceSettlement.usecase.test.js` (**existing, must stay green
  unmodified**) — this is the proof of #965 verify box 1: the settlement's `hashPayload` and its
  replay behaviour are untouched by construction. Add one assertion that a repeat-submit **with a
  proof already attached** still returns the durable replay and does not duplicate the ledger row
  or re-write the proof columns.
- `packages/web-core/.../balanceSettlementProof.behavior.test.jsx` (**new**) — the affordance
  renders only on the non-cash branch; choosing a file does not enable/disable submit; the
  audit-aid copy is present; a proof-upload failure surfaces a warning and does **not** revert the
  settled toast.
- `packages/web-core/.../terminalBalanceSettlement.behavior.test.jsx` (**existing**) — must pass
  unmodified, pinning that Phase 202's cheque behaviour is byte-identical.

**Gates:** `npm run check:compliance` (fail-then-pass, both recorded),
`npm run check:architecture`, `npm run check:adr`.

**#965 verify box 3 — "access to a stored proof is scoped to authenticated, tenant-appropriate
roles"** — covered by a route-level test asserting `401` unauthenticated and `403` without
`VIEW_POS`, plus the `404`-not-`403` cross-order case above.

**Manual, on a deployed environment (Verifier/QA, not Worker):** confirm the stored file is
**not** reachable at any `/uploads/...` path, and that the GET response carries
`Cache-Control: private, no-store`.

---

## 9. Execute-step conventions (`.agents/skills/implement/SKILL.md`)

- **Branch:** `feature/965-balance-payment-proof-image`, cut from **fresh `origin/develop`**
  (`git fetch` first). Never commit to a local `develop`.
- **Base:** `develop`. Always — never `staging`, never `main`.
- **Linkage:** `Refs #965` (not `Closes`) — this needs deployed verification before it is done, so
  the issue must stay open for the `For QA` → Verifier transition. Board `Status`: `In progress` at
  branch time, `For Review` at PR-open.
- **Checkpoint triggers this phase trips** — both are on Worker's stop-and-ask list, and both are
  **pre-cleared by Pat's standing instruction** (`skip-checkpoint-confirmation-go-to-pr`: draft,
  self-verify, go straight to commit/push/PR, since he reviews every PR himself):
  1. a new file under `apps/dgfy-migration-runner/migrations/`;
  2. a required compliance impact declaration.
  Both are still called out **explicitly in the PR body** so the reviewer sees them named rather
  than discovered.
- **Commits, batched by domain**, Conventional Commits per `docs/ai/PR.md`:
  1. `feat(db): add proof-of-payment columns to pos_order_payments` — migration + model +
     `sync-tenant-schemas.js`
  2. `feat(api): attach and serve balance-payment proof images` — uploadConfig, validator, storage
     adapter, repository, use cases, handlers, routes
  3. `feat(pos): attach proof of payment in the Settle Balance dialog` — the four `web-core` files
  4. `test: cover balance-payment proof upload and serving`
  5. `docs(compliance): impact declaration for balance-payment proof imagery` — declaration + ADR
     0063 amendment + ledger entry
- **Pre-commit:** `rg "DO NOT COMMIT"` across changed files. Also confirm no proof image or
  `storage/` artifact is staged.
- **PR body:** `## Summary` (with the `Opened by (…, worker)` attribution line first, per
  `scripts/ai-attribution.js`) + `## Testing Evidence` carrying Tier-0 results, per
  `.github/pull_request_template.md`.
- **Ledger:** add `## Phase 204 - Settle Balance: Proof-of-Payment Image Capture and Authed Serving
  (#965)` to `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` with all seven required fields
  (status `in_progress` at PR-open). 204 is unclaimed; 202/203/206/207 exist — do not renumber.
- **Out of scope, hand to `pm` rather than improvising:** the retention/purge policy (§3.2), a
  replace/delete path for an attached proof (§1.2.7), a proof affordance on the split-tender or
  Collect-Cash surfaces, and any back-office evidence-browser UI beyond the single "View proof"
  control in §4.

