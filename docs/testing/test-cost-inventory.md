# Test Cost/Dependency Inventory (#438)

Status: reference (generated manifest is the machine-readable source of truth)
Last updated: 2026-10-23
Owner: #438

## What this is

One durable, repository-maintained answer to "what can I run safely by default?":

- Machine-readable manifest: `docs/testing/test-cost-inventory.json`
  (1701 records, 4 legacy exclusions — regenerate, don't hand-edit).
- Generator/check: `scripts/audit-test-cost-inventory.js`
  (`npm run audit:test-cost` / `npm run audit:test-cost:check` /
  `npm run test:audit-test-cost`).
- This guide: vocabulary, default subset, opt-in tiers, decision rules,
  refresh procedure, and the #378 cross-reference.

Consumers: the Worker `implement` skill's Tier 2 (#436) and the real-DB
testing work (#372) point here instead of re-deriving "which tests are safe
to run opportunistically" per session.

## Classification vocabulary (stable — do not rename without bumping the manifest schema)

| Classification | Meaning | Default or opt-in |
|---|---|---|
| `fast-pure` | No DB/Redis/network/browser signal; pure logic, copy, or contract assertions | default |
| `fast-mocked-external` | External boundary (fetch/axios/API client/router/redis) mocked; jsdom only | default |
| `db-required` | Needs a real MySQL connection | opt-in |
| `redis-required` | Needs a real Redis | opt-in (zero records today — see below) |
| `network/provider-required` | Unmocked live outbound call (fetch/axios/SDK/XHR/WebSocket to a provider) | opt-in (zero records today — see below) |
| `browser-e2e` | Needs a browser + running servers (Playwright, or Jest gated on `RUN_BROWSER_E2E`) | opt-in |
| `opt-in/legacy` | Excluded from the runner inventory; explicit legacy command only | opt-in |

Current totals by surface (generated 2026-09-23; counts drift — the manifest,
not this table, is current):

| Surface | fast-pure / fast-mocked (default) | db-required | browser-e2e | network/provider | redis |
|---|---|---|---|---|---|
| `apps/dgfy-api` (700 files) | 667 | 30 (+2 op records below) | 3 | 0 | 0 |
| `packages/web-core` via IMS (367) | 367 | 0 | 0 | 0 | 0 |
| `apps/dgfy-storefront` (233) | 219 | 0 | 14 | 0 | 0 |
| `apps/dgfy-ims` own (19) | 8 | 0 | 11 | 0 | 0 |
| `apps/dgfy-pos` own (13) | 1 | 0 | 12 | 0 | 0 |
| `apps/dgfy-migration-runner` | 0 | 2 (operational records) | 0 | 0 | 0 |

Two vocabulary values intentionally have zero records today, with evidence:

- `redis-required`: `apps/dgfy-api/tests/setup.js` replaces the Redis client
  with stateful in-memory semantics for the whole fast tier, so no backend
  file needs a live Redis — including `distributedLock.redis.test.js`, which
  the DB-manifest derivation explicitly keeps in the fast tier for this
  reason. Frontend tests never touch Redis.
- `network/provider-required`: every provider-named file in the active
  inventory either mocks its transport (axios/fetch/MSW/`MockAdapter`) or
  only mentions the provider in fixture literals (`payment_provider:
  'paymongo'`), disabled-contract copy, or static URL allowlists. The one
  genuinely live provider suite (`paypalSandboxCanary.e2e.legacy`) is excluded
  as `opt-in/legacy`. The vocabulary stays stable so a future live-provider
  file classifies correctly on discovery.

## Recommended default fast subset (no MySQL, no Redis, no network, no browser)

```bash
npm run test:backend:fast        # API fast tier (DB_HOST/DB_PORT guarded unreachable)
npm --prefix apps/dgfy-ims test -- --run          # IMS own + packages/web-core (config includes web-core)
npm --prefix apps/dgfy-pos test -- --run          # POS own (web-core runs from IMS, not here)
npm --prefix apps/dgfy-storefront test -- --run   # Storefront own
```

Notes:

- Root `npm test` / `npm run test:frontend` cover IMS (+ web-core) and
  Storefront only — POS has no root command, so Tier 2 must invoke POS
  explicitly as above.
- `packages/web-core` has no test runner of its own (no `node_modules`, by
  design — ADR 0071). Its 367 files run from `apps/dgfy-ims`; POS and
  Storefront do not run them.
- Every `default` record's `safe_command` in the manifest requires no
  DB/Redis/network/browser — enforced by the audit tool's own test
  ("emits a safe default subset...").

## Opt-in tiers (report as not executed, never as passing)

1. **DB tier** — `npm run test:backend:db` (30 files per
   `scripts/backend-db-dependent-tests.js`; needs MySQL — see #372).
   Backend execution source of truth stays `npm run test:backend:matrix`
   (fast tier + db tier); this inventory reuses that manifest, it does not
   fork it.
2. **Browser E2E** — per-app `npx playwright test` (`tests/e2e/**`, 37 files
   across IMS/POS/Storefront) plus 3 backend Jest journey files gated on
   `RUN_BROWSER_E2E=true`. Needs browsers + running dev/API servers.
3. **Migration/seed validation** — `cd apps/dgfy-migration-runner &&
   npm run migrate` / `npm run seed` against a disposable database.
   That package ships no unit suite; these are operational records, and this
   issue invents no migration tests.
4. **Legacy provider suites** — `test:legacy:payments` (4 excluded files),
   only for explicitly re-enabled payment workflows.
5. **Live provider** — no active file today; if a future file classifies
   `network/provider-required`, it joins this tier.

## Dependency decision rules (what the generator actually checks)

Backend (`apps/dgfy-api/tests/**/*.test.js` at any depth, mirroring `jest.config.cjs`
— verified against `jest --listTests`, which also finds `tests/helpers/*.test.js`
that a top-level directory read misses):

1. `RUN_BROWSER_E2E` gate or `frontend.*.e2e.test.js` name → `browser-e2e`.
2. Listed in `scripts/backend-db-dependent-tests.js` → `db-required`
   (reuse, not re-derivation).
3. Provider word **plus** a live-call shape (fetch/axios/node-http call,
   provider SDK construction/import, XHR, WebSocket) **minus** any mock
   signal → `network/provider-required`.
4. Redis import → `fast-mocked-external` (mocked by `tests/setup.js`).
5. Any mock signal (`jest.unstable_mockModule`, `jest.mock/fn/spyOn`,
   `MockAdapter`, nock, sinon, MSW, ...) → `fast-mocked-external`.
6. Otherwise → `fast-pure`.

Frontend (Vitest include semantics per app config; `tests/e2e/**` excluded):

1. Under `tests/e2e/` or importing `@playwright/test` → `browser-e2e`
   (Playwright owns it).
2. Unmocked live provider call (same shape rule as backend) →
   `network/provider-required`.
3. Any mock signal (`vi.mock/spyOn/fn`, MSW, `MockAdapter`, fetch stubs) →
   `fast-mocked-external`.
4. Otherwise → `fast-pure`.

Deliberate non-rules (evidence: the 2026-09-23 verification pass):

- Filename suffixes (`.integration`, `.contract`, `.unit`) are hints only;
  import/call-shape inspection decides.
- A provider word in a fixture literal, disabled-contract copy, or static
  URL allowlist is **not** network dependence (`storePaymentTruth`,
  `serviceWorkerCaching`, and 21 similar files verified by hand).
- A mocked `fetch`/Axios test never proves live provider behavior — the
  manifest's `safe_command` says so on every mocked record.

## Runtime buckets

Per-record `runtime_bucket` values are rough static estimates (file size +
case count) with `runtime_provenance.method: static-estimate` — not SLAs.
Runtime varies by machine, worker pool, cold cache, and test data. Anchoring
timed full-file samples (in-manifest `measurements`, with command,
environment, date, and scope):

- `apps/dgfy-api/tests/healthService.test.js` — 22 passed, Jest 0.188s
  (wall ~6s), darwin arm64 Node v24.14.0, 2026-09-23.
- `packages/web-core/.../tenantCapabilityMessages.test.js` (via IMS) —
  5 passed, Vitest 463ms (wall ~3s), Vitest v4.1.10, 2026-09-23.
- `apps/dgfy-storefront/.../customerAccess.test.js` — 12 passed, Vitest
  531ms (wall ~3s), Vitest v4.1.10, 2026-09-23.

Refresh the samples when a runner or configuration changes materially; record
buckets and provenance, never false-precision SLAs.

## #378 cross-reference (failures are not cost evidence)

All 13 pre-existing #378 failures match live manifest records, and **all 13
classify as default/fast** (`fast-pure` or `fast-mocked-external`) — none sits
in a heavy/opt-in category. The pre-existing failures were therefore *not*
explained by cost/dependency weight: the root-caused ones were stale-test
drift (e.g. the `adminService` cookie-session auth-model change), not infra
heaviness. `known_baseline_failure_378: true` on each record preserves the
link without reclassifying failures as dependency-related and without
excusing them. (`discoveryFlow.integration.test.jsx`, partially failing under
#378/#377, is likewise `fast-mocked-external`/default.)

Status note (verified 2026-09-23, from `apps/dgfy-ims`): all 13 files now
pass on this checkout (182/182 tests, Vitest ~18s) — the old baseline's
failures were fixed by intervening work, not by this issue. Failure state
drifts independently of cost classification, which is exactly why the two are
recorded in separate fields.

## Refresh / check

```bash
npm run audit:test-cost        # regenerate docs/testing/test-cost-inventory.json
npm run audit:test-cost:check  # fail on stale/missing entries or undiscovered files
npm run test:audit-test-cost   # the audit tool's own unit tests (no external services)
```

`--check` fails when: a discovered test file has no manifest record, a record
points at a file no longer discovered, a `#378` basename no longer matches
(rename forces an intentional list update), or a DB-manifest entry has no
discovered file. `generated_at` is provenance and is ignored by the
comparison, so checks are deterministic.

## Related material (supporting sources, not duplicated here)

- `docs/testing/backend-test-suite-value-audit.md` — keep/consolidate/delete
  value audit (explicitly excludes this issue's classification; do not merge).
- `docs/testing/backend-test-suite-inventory.json` — backend-only inventory
  backing the value audit.
- `scripts/run-backend-test-matrix.js` + `scripts/backend-db-dependent-tests.js`
  — backend execution source of truth for fast/db tiers.
- `docs/architecture/apps-layout-migration.md` — current path map
  (`apps/dgfy-web` references in #438/#378 are historical).
- ADR 0071 — three-app frontend topology (web-core runs from IMS).
