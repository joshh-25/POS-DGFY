# Deferred Items — Phase 10 (discovered during 10-07 execution)

Out-of-scope discoveries logged per the executor's SCOPE BOUNDARY rule: real
issues found while executing 10-07, but not directly caused by 10-07's own
changes, so not auto-fixed here.

## 1. `ApplicationResult.error` does not exist (10-02 bug)

**File:** `apps/dgfy-api/src/modules/inventory/usecases/inventoryReservationUseCases.js`

Every failure path in this file (all six reservation usecase builders) calls
`ApplicationResult.error(...)`, but `ApplicationResult`
(`apps/dgfy-api/src/shared/contracts/applicationResult.js`) only defines
`static success()` and `static failure()` — there is no `static error()`
method. Every failure branch (validation errors, `TenantDatabaseUnavailableError`
mapping, `InsufficientStockError` mapping, membership-forbidden, etc.) throws
a `TypeError: ApplicationResult.error is not a function` at runtime instead of
returning a graceful `ApplicationResult.failure(...)`.

**Why deferred, not fixed here:** the file belongs to Phase 10 Plan 02
(already committed by a separate wave). 10-07's own SCOPE BOUNDARY excludes
pre-existing failures in unrelated files.

**Why it's still safe for 10-07:** `finalizeStorefrontOrder`
(`availmentRepository.js`) calls the injected `commitReservation` port
directly inside a `sequelize.transaction()` callback and does not swallow
any exception from it — if the port throws (whether via a deliberate
`ApplicationResult.failure(...)` path working correctly, or via this masked
`TypeError`), the thrown error propagates out of the transaction callback,
Sequelize rolls the transaction back, and the error continues to propagate
to the caller unmodified. The masked `TypeError` therefore still produces
correct rollback behavior — only the surfaced error *message* is wrong
(a confusing "ApplicationResult.error is not a function" instead of the
real reason, e.g. "insufficient stock" or "tenant database unreachable").

**Recommended fix (future plan or gap-closure):** add
`static error(error, message) { return ApplicationResult.failure(error, message); }`
to `ApplicationResult`, or change every `ApplicationResult.error(...)` call
in `inventoryReservationUseCases.js` to `ApplicationResult.failure(...)`.
This will also improve error messages for 10-06 (`placeOrder`'s `reserveStock`
call) and 10-08 (webhook release/expire paths), which inject the SAME broken
usecase builders.

## 2. `dgfyBusinessContract.js` missing 4 of 6 Phase 9 table entries

**File:** `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`

`09-01-SUMMARY.md` claims six table entries were added to this contract
(`availments`, `availment_items`, `availment_discounts`, `payments`,
`receipts`, `compliance_evidence`). Git history shows no Phase 9 commit ever
touched this file (`git log -- apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js`
has no `09-*` commit) — the claimed changes were apparently lost from an
uncommitted working tree (see `42ae30f4`'s "catch-up commit" message).

10-07 backfilled the two entries it directly needed (`availments`,
`payments` — both gained new columns in this plan). The other four
(`availment_items`, `availment_discounts`, `receipts`, `compliance_evidence`)
are still missing from the contract. This does not block anything currently
— `verify` only checks tables that ARE listed in the contract, it does not
fail closed on undocumented-but-existing tables — but it means
migration-runner's `verify` command cannot currently attest to those four
tables' shape for release evidence.

**Recommended fix:** a small gap-closure task (mirrors 08-09/08-13's
pattern) adding the remaining four `dgfyBusinessContract.tables` entries,
matching `20260713120000-create-availment-checkout.cjs`'s actual
column/index/FK shapes (already documented per-table in that migration's
inline comments and 09-01-SUMMARY.md's column/index/FK counts, which — while
never committed to the contract — were accurate for the migration itself).

## 3. `finalizePersist()` (Phase 9) has the same error-masking issue 10-07 avoided

**File:** `apps/dgfy-api/src/modules/availments/repositories/availmentRepository.js`
(`finalizePersist`, not `finalizeStorefrontOrder`)

`finalizePersist` is wrapped in `this.withModel(businessId, async (Availment) => {...})`.
`withModel`'s catch-all re-wraps any thrown error that is not one of the five
whitelisted domain-error classes into `TenantDatabaseUnavailableError('unreachable', ...)`.
When a POS sale-effect fails (`throw new Error('Sale effect failed for
product ${...}: ${...}')`), that plain `Error` gets re-wrapped the same way
— so a genuine "insufficient stock" POS checkout failure currently surfaces
to the client as a 503 "tenant database unreachable" instead of the real
reason, contradicting the intent documented in `availmentUseCases.js`'s own
WARNING-1 comment ("Propagate as-is, no downgrade").

10-07's `finalizeStorefrontOrder` avoids this by not using `withModel()` at
all (calls `resolveDatabaseName()` directly instead — see the method's own
NOTE comment). `finalizePersist` was NOT changed, since it is Phase 9 code
outside 10-07's file scope.

**Recommended fix:** either add a whitelisted `SaleEffectFailedError` class
Phase 9 throws instead of a plain `Error`, or have `finalizePersist` follow
the same non-`withModel` pattern `finalizeStorefrontOrder` now uses.
