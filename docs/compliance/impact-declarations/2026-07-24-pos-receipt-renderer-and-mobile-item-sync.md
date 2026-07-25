---
status: reference
owner: engineering
last_reviewed: 2026-07-24
related_adr: docs/architecture/adr/0036-shared-pos-receipt-renderer.md
declaration_id: 2026-07-24-pos-receipt-renderer-and-mobile-item-sync
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.24
verification_evidence: npm run lint -- --quiet,cd backend && npm run check:architecture-guardrails,cd backend && npm run check:controller-boundaries,node --check backend/src/modules/pos/usecases/posDeviceUseCases.js,node --check backend/src/validators/posValidator.js,cd backend && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/mobilePosHandlers.transport.test.js tests/mobilePosItemSync.usecases.test.js,shared @sieitzz/pos-receipt renderer smoke test for escaped HTML and thermal text
rollback_note: Revert routes/mobilePos.js (drop the `sync/items` route); revert modules/pos/index.js (drop syncMobilePosItemsUseCase wiring and the itemRepository/createItemUseCase/updateItemUseCase/deleteItemUseCase imports it added); revert modules/pos/usecases/mobilePosUseCases.js (drop buildSyncMobilePosItemsUseCase and buildSyncSummary's includeLimitPolicy option); revert modules/pos/controllers/mobilePosHandlers.js (drop syncItems); revert validators/posValidator.js (drop mobilePosItemSyncSchema and paper_width on devicePrintReceiptSchema); revert posDeviceUseCases.js paper-width threading through buildPrintPosReceiptUseCase; revert ReceiptPrintView.jsx to its single inline-JSX export and drop the @sieitzz/pos-receipt dependency. No migration, no stored-data shape change.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-24T00:00:00Z
preflight_request_ref: https://github.com/Sieitzz/dgfy-platform/pull/78
---

# Shared POS Receipt Renderer and Mobile Item Sync

## Compliance Impact Classification

Regulatory. This change touches the `pos`, `terminal`, `settings`, and
`compliance` surfaces: (1)
a new mobile batch sync endpoint for catalog item create/update/delete, and
(2) receipt rendering/printing now carrying an explicit paper width and
sharing its HTML template with the standalone native POS via the
`@sieitzz/pos-receipt` package (see ADR 0036). No fiscal (BIR), payment, or
PII data shape changes are introduced; no new capability is exposed to any
tenant that could not already reach the equivalent operation through the
existing interactive `/api/v1/pos/*` and item-management APIs. Classified
`regulatory` because the merged receipt contract includes fiscal and
statutory-discount presentation behavior and the merged change set also
updates governed settings and compliance declarations.

## Affected Surfaces

### 1. Mobile item sync (`routes/mobilePos.js`, `modules/pos/index.js`, `modules/pos/usecases/mobilePosUseCases.js#buildSyncMobilePosItemsUseCase`, `modules/pos/controllers/mobilePosHandlers.js#syncItems`, `validators/posValidator.js#mobilePosItemSyncSchema`)

`POST /api/v1/mobile-pos/sync/items` accepts a batch of `create`/`update`/
`delete` entries and dispatches each to the same `createItemUseCase`/
`updateItemUseCase`/`deleteItemUseCase` already used by the interactive item
management API — no new business logic for the CRUD operations themselves.
The route carries no route-level `checkPermission` and is not behind
`mobilePosFreeSyncLimiter` (unlike checkout/shift/hardware sync): a single
batch can mix create/update/delete entries, so permission
(`items:create`/`items:edit`/`items:delete`) is enforced per-entry inside
the use case instead of gating the whole route, and item/catalog CRUD has
never been plan-tier gated anywhere else in the app (folding it into the
2/day free-tier sync budget would make catalog management unusable for
free-tier tenants). Retried entries are handled idempotently: a 409 SKU
conflict on `create` is treated as a replay of the pre-existing item (looked
up by SKU), and a 404 on `delete` is treated as a replay of the
already-achieved deleted state — no entry is silently double-applied or
duplicated.

### 2. Receipt paper width and shared renderer (`posDeviceUseCases.js#buildPrintPosReceiptUseCase`, `posValidator.js#devicePrintReceiptSchema`, `ReceiptPrintView.jsx`)

`paper_width` (`80mm` default, `57mm` alternative, validated server-side via
Joi) now flows from the device print-receipt request through the receipt
payload, the device-bridge print job, and the audit log entry. This is
metadata for how the receipt is formatted/projected to a thermal printer,
not a change to receipt content, totals, or fiscal fields. The browser
`ReceiptPrintView` now renders through the shared, dependency-free
`@sieitzz/pos-receipt` package's `renderPosReceiptHtml` (dynamic values
HTML-escaped before DOM injection, per ADR 0036's guardrails) instead of an
inline JSX template, so the browser preview and the standalone native POS's
Expo DOM preview stay byte-for-byte consistent. The prior inline JSX
implementation is retained as `LegacyReceiptPrintView` (unused by any
current call site) rather than deleted, so the pre-existing template remains
available for direct comparison/diffing during rollout.

## Compliance Preconditions

1. `authenticate` and per-entry `checkPermission`-equivalent logic
   (`items:create`/`items:edit`/`items:delete` via `hasPermission`) are
   unchanged in spirit and still enforced for every item-sync entry — this
   change relocates the check from route-level to per-entry, it does not
   remove it.
2. No fiscal/BIR receipt fields, payment provider fields, or PII fields are
   added, removed, or reshaped by either change; `paper_width` only affects
   physical/thermal formatting.
3. The shared `@sieitzz/pos-receipt` renderer HTML-escapes all dynamic
   transaction/business data before DOM injection (verified by the shared
   renderer's own smoke test), matching the escaping guarantee the prior
   inline JSX template already provided.
4. A missing or unpaired device bridge never blocks receipt preview or
   transaction completion — printing remains an optional, explicit
   dispatch (ADR 0036 guardrail), unaffected by this change.
5. Item-sync idempotent-replay handling (409/404 → `replayed`) means a
   retried mobile sync entry cannot create a duplicate item or resurrect a
   deleted one.

## Verification Evidence

The commands listed in front matter must pass before deployment. `npm run
lint -- --quiet` (frontend and backend) is clean. `check:architecture-
guardrails` and `check:controller-boundaries` confirm no module-boundary or
controller/model-import violations were introduced by the new item-sync
wiring in `modules/pos/index.js`. `node --check` on
`posDeviceUseCases.js` and `posValidator.js` confirms syntactic validity of
the paper-width changes. The Jest suites
(`mobilePosHandlers.transport.test.js`, `mobilePosItemSync.usecases.test.js`)
cover: the new `syncItems` handler wiring, per-entry permission enforcement
for each op, 409/404 idempotent-replay handling, and unsupported-op
rejection. The shared `@sieitzz/pos-receipt` package includes its own smoke
test asserting HTML-escaped output for dynamic fields and correct thermal
text projection.
