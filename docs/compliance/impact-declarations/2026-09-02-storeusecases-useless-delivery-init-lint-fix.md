---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-storeusecases-useless-delivery-init-lint-fix
classification: major
surfaces: payments
reason_codes_impacted: NONE
policy_version: 2026.09.02
verification_evidence: npm --prefix apps/dgfy-api run lint -- 0 errors (previously 1 no-useless-assignment error on this line; the 8 pre-existing warnings elsewhere are unrelated and untouched),node --check apps/dgfy-api/src/modules/store/usecases/storeUseCases.js,npm run check:architecture,npm run check:compliance -- confirmed to fail first (listing storeUseCases.js as the sole sensitive file with no declaration), then pass once this declaration was added
rollback_note: Single-token revert -- `let delivery;` back to `let delivery = null;` on one line. No behavior, control flow, or return value changes: both branches of the immediately-following if/else already unconditionally reassign `delivery` (`delivery = Object.freeze({...})` / `delivery = await resolveStoreDeliveryFee({...})`) before it is ever read, so the removed initializer was dead code, not a default any caller could observe.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.396Z
preflight_request_ref: PREFLIGHT-33588602895-2026-09-02-STOREUSECASES-USELESS-DELIVERY-INIT-LINT-FIX
---

# Remove useless `delivery = null` initializer (backend.lint) (#1388 context)

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` is
`check-compliance-impact.js`'s exact-prefix floor at `major`/`payments` (the checkout use-case
module) — touching this file at all floors the declaration there regardless of how small the
actual change is. This change is a single-token, zero-behavior lint fix; no capture, refund,
settlement, or fiscal-document logic is touched, and no reason code is introduced or altered —
`reason_codes_impacted: NONE` reflects that.

## What this change does and does not do

`resolveCheckoutContext` declared `let delivery = null;` immediately above an `if`/`else` in which
**both** branches unconditionally reassign `delivery` before it is ever read: the `if` branch sets
`delivery = Object.freeze({...})` (the pinned-webhook-replay path) and the `else` branch sets
`delivery = await resolveStoreDeliveryFee({...})` (the fresh-resolution path). The `= null`
initializer is therefore dead — no code path ever observes it — and ESLint's
`no-useless-assignment` rule correctly flagged it as an error, which was failing
`apps/dgfy-api`'s `npm run lint` (the `backend.lint` gate in `gate:release:local`) and blocking the
in-progress `develop -> main` promotion (PR #1388).

The fix changes only the declaration: `let delivery = null;` -> `let delivery;`. Still `let`
(assigned conditionally in the two branches), just without the dead initializer. Nothing else in
this function or file was touched.

## Affected Surfaces

- `payments` — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`, one line, no logic
  change.

## Compliance Preconditions

- No refund, settlement, fiscal-document, or fee-computation code path is touched.
- The variable's value at every point it is read downstream (`delivery.outOfRange`,
  `delivery.baseFee`, `delivery.distanceMeters`, etc.) is unaffected: both assignment branches are
  unconditional and unchanged, so `delivery` is never actually `null` at any read site either
  before or after this change.

## Verification Evidence

- `npm --prefix apps/dgfy-api run lint` — 0 errors (previously exactly 1 error,
  `no-useless-assignment`, on the changed line); the pre-existing 8 warnings in unrelated files are
  untouched.
- `node --check apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` — no syntax errors.
- `npm run check:architecture` — passed.
- `npm run check:compliance` — confirmed to fail first, listing exactly
  `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` as the sensitive file with no
  declaration, then passed once this file was added.

## Changed Files

- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`

## Preflight Reconciliation

`NOT-EXECUTED-STOREUSECASES-LINT-2026-09-02` is expected on a PR targeting `develop`, not a finding
— per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually runs,"
the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers automatically
once this declaration lands on `develop` and reconciles this front matter within minutes, well
before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was made from this
session — no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend was available,
matching every other `develop`-targeting PR under this protocol.
