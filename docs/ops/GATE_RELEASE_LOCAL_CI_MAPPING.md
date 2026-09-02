---
status: reference
authority_level: reference
owner: infra
last_reviewed: 2026-09-03
applies_to: promotion_quality_gates
topic: gate_release_local_ci_mapping
---

# `gate:release:local` → CI Mapping

Refs #1147 (umbrella: move `gate:release:local`'s full gate set into promotion-triggered CI). This
document is that issue's first concrete deliverable — the mapping #1147's own scope calls out as
"this issue's first deliverable, not an implementation detail to skip." **It maps, it does not
migrate.** No gate is wired into CI by this document; full migration is blocked on #1015 (backend
test suite speed, hard prerequisite) and #1018 (the fast-tier CI wiring, first milestone), neither
of which has landed as of this writing.

## How to read this table

`scripts/gate-release-local.js`'s `GATE_NAMES` array (19 entries, in the order the script runs
them) is the source of truth for the left column — read it there before trusting a stale copy here.
Each gate maps to exactly one of:

- **(a) Covered** — an existing CI job already runs the same check.
- **(b) CI job to add** — no CI job runs this today; a concrete recommendation is given.
- **(c) Stays local-only** — a documented reason this gate cannot (or should not) move to CI, not
  merely "hasn't been done yet."

**Critical caveat that applies to every "(a) Covered" row below — updated 2026-09-03 (#1431 Phase 1
PR-A/PR-B, Phase 2 P2-1/P2-2 PR #1447)**: `promotion-quality-gate.yml` (the CI workflow all "(a)"
rows point at) was **entirely advisory** as of #1063/#1066/#1253 — every step in every quality job
carried its own `continue-on-error: true`, so a red run never blocked a promotion PR's
`mergeStateStatus`. That is no longer true for 10 of the 16 "(a)" rows (4, 5, 7, 9, 11, 12, 13, 15,
17, plus 6 which is blocking only in the narrow PR-context sense its own row describes — see each
row's own updated Status below): those gates' CI steps are now blocking on the `release/*→main` leg
(and `staging→main`, and any `workflow_dispatch`/`workflow_call` run) — a real failure reds out the
check-run and trips `AGENTS.md`'s Merge Safety hard stop, same as any other required check. Rows 2,
3, 6, 8, 14, 16 stay **advisory in CI** (`continue-on-error: true`) pending real-promotion evidence
(P2-3), and row 10 (`backend.test_matrix`) stays fully advisory for a separate, named reason — see
each row's own updated note.

Per #1147's own "Must hold" bullet, a gate only moves from "local is authoritative" to "CI replaces
local" (i.e. drops out of `gate:release:local`'s required set) once its CI job has been verified
trustworthy against #1124's audit standard **and** proven blocking on a real promotion. That bar has
now been met for exactly **7** of the 10 blocking rows — **4, 5, 9, 11, 12, 13, 15 dropped out of
`gate:release:local`'s required set 2026-09-03 (PR-B)**, under the B-amended evidence standard Pat
confirmed (V1: a genuine negative dispatch run, `33650659451`, reds out `frontend-pos-quality`
alone; V2′: the existing green positive dispatch run, `33642893358`, cited in place of a not-yet-run
real `release/*→main` promotion PR; V3: local/CI command parity, confirmed exact or superset for all
7 — §2 of the #1431 Phase 1 PR-B plan), delegated to CI via `CI_ENFORCED_GATES` in
`scripts/gate-release-local.js`, cross-checked against `scripts/check-pr-quality-workflow.js`'s
`BLOCKING_STEP_IDS` so a future edit cannot silently regain `continue-on-error` on one of these
steps without failing that checker. **One residual gap, open and tracked, not closed by PR-B:** no
real `release/*→main` promotion PR has yet exercised these 7 steps — V2′ substitutes the existing
`workflow_dispatch` run on `develop` HEAD, which is command- and runner-identical (§0/§1 of the
plan) but cannot itself demonstrate that a red check-run on this workflow drives a promotion PR's
`mergeStateStatus` to `UNSTABLE`, only that the job's own check-run goes `failure` (V1). Closing
this gap needs a real `release/*→main` PR to run with intent to observe `mergeStateStatus`; #1431's
parent issue is where that close-out should be recorded once it happens.

**The remaining 3 blocking rows (7, 17, and 6's PR-context-only case) have NOT yet had this same
V1–V3 bar run against them** — they landed blocking in CI at P2-1 (2026-09-03, #1447) on the
strength of their own low-risk profile (no prerequisite, no flake surface, no external dependency),
not on a completed verification cycle, so they stay in `gate:release:local`'s required set for now;
their own delegation-out is a later, separate step (P2-4), not folded into PR-B's scope. `gate:
release:local` therefore still runs and requires all 12 gates PR-B left in its required set
(19 minus the 7 PR-B delegated), including 6/7/8/14/16/17, until each is individually verified and
delegated.

| # | Gate name | Local command (`gate-release-local.js`) | Status | CI job / detail |
|---|---|---|---|---|
| 1 | `release.target_sha` | `RELEASE_TARGET_SHA` env, else `git rev-parse HEAD` | **(c)** | The promoter's own checked-out git-branch state — exactly the example #1147's own body names. CI already has its own unambiguous SHA (`github.sha`); there is nothing to migrate. |
| 2 | `dependencies.audit.prod` | `node scripts/audit-dependencies.js --omit-dev` | **(a) — enforced in CI on release/\*→main since #1447 (advisory; local still required until PR-B)** | `repository-quality`'s "Run production dependency audit" step (`run_dependency_audit_prod`) runs the identical `npm run audit:dependencies:prod`. **Correction (#1431 Phase 2):** the script audits **7** lockfile trees, not 6 — `tests/frontend-cross-app` is the seventh (`scripts/audit-dependencies.js:32-43`), and it's the tree the `.full` variant (#3) actually surfaces the express/body-parser/qs advisories through. |
| 3 | `dependencies.audit.full` | `node scripts/audit-dependencies.js` | **(a) — enforced in CI on release/\*→main since #1447 (advisory, recommended to stay advisory permanently — Pat's call not yet made, flagged explicitly below; local still required until PR-B)** | `repository-quality`'s "Run full dependency audit" step (`run_dependency_audit_full`) runs the identical `npm run audit:dependencies`. Same script as #2, without `--omit-dev`; 7 lockfile trees (see #2's correction). **This variant's verdict depends on the npm registry, not the repo** — a new dev-only advisory can flip it red with zero code change here (its dev-only findings, e.g. `@lhci/cli`'s puppeteer chain, never ship) — so #1431 Phase 2's plan recommends keeping it advisory permanently, unlike every other gate in this batch. Not yet decided; needs Pat's explicit confirmation before P2-3 treats it as settled. |
| 4 | `docs.lint` | `node scripts/lint-docs.js && npm run check:adr` (via `npm run lint:docs`) | **(a) — enforced in CI on release/\*→main; dropped from `gate:release:local`'s required set 2026-09-03 (PR-B)** | `repository-quality`'s "Run governed documentation lint" step runs the identical `npm run lint:docs`; that step's `continue-on-error` was removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 5 | `architecture.guardrails` | `cd apps/dgfy-api && npm run check:architecture-guardrails && npm run check:controller-boundaries` (via `npm run check:architecture`) | **(a) — enforced in CI on release/\*→main; dropped from `gate:release:local`'s required set 2026-09-03 (PR-B)** | `dgfy-api-quality`'s "Enforce modular architecture guardrails" + "Enforce controller architecture boundaries" steps run the identical two subcommands; both steps' `continue-on-error` was removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 6 | `compliance.contracts` | `node scripts/check-compliance-impact.js && node scripts/check-compliance-api-contracts.js` (via `npm run check:compliance`) | **(a) — enforced in CI on release/\*→main since #1447 (advisory; local still required until PR-B)** | `repository-quality`'s "Run compliance contract checks" step (`run_compliance_contracts`) runs the identical `npm run check:compliance`. **PR-context only** (documented exception, #1431 Phase 2 plan §5): under `workflow_dispatch`/`workflow_call` there is no `GITHUB_BASE_REF`, so `resolveChangedFiles()` sees an empty diff and the step passes trivially — a green dispatch run must never be cited as verification of this gate; only a real promotion PR is. This gate's own prerequisite (#1442, docs-only fix to `2026-08-31-preflight-ephemeral-target.md`'s missing sections) landed first. |
| 7 | `production.env.fixtures` | `node scripts/check-production-env-fixtures.js` | **(a) — enforced in CI on release/\*→main since #1447 (blocking from its first PR — local still required until PR-B)** | `repository-quality`'s "Run production env fixture checks" step (`run_production_env_fixtures`) runs the identical `npm run check:production-env`. Pure/fixture-based — every value is a synthetic placeholder string, no live DB, no real secrets, no SOPS decryption — landed **blocking immediately**, no advisory round, since it has no prerequisite, no flake surface, and no external dependency. |
| 8 | `runtime.doctor` | `cd apps/dgfy-api && node scripts/doctor-runtime.js` (via `npm run doctor:runtime`) | **(a) — enforced in CI on release/\*→main since #1447 (advisory; local still required until PR-B)** | `dgfy-api-quality`'s "Run runtime schema doctor" step (`run_runtime_doctor`), added after "Prepare test schema". **Correction (#1431 Phase 2):** the original recommendation to ride `migration-runner-quality`'s fresh DB doesn't work — that job never runs `npm ci` in `apps/dgfy-api`, so `doctor-runtime.js` (ESM, imports `sequelize`/`dotenv` from the API tree) cannot run there. `dgfy-api-quality` is the correct home instead: it already installs the API deps *and* already migrates the same `mysql:8.0` container ("Prepare test schema"). |
| 9 | `backend.lint` | `npm --prefix apps/dgfy-api run lint` | **(a) — enforced in CI on release/\*→main; dropped from `gate:release:local`'s required set 2026-09-03 (PR-B)** | `dgfy-api-quality`'s "Run API lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 10 | `backend.test_matrix` | `node scripts/run-backend-test-matrix.js` (via `npm run test:backend:matrix`) | **(a)**† — **still advisory; #1432 resolved the underlying rot/OOM, the flip to blocking is a separate PR (PR-A2)** | `dgfy-api-quality`'s "Run dgfy-api test matrix" step runs the identical command. † This is the gate #1147's own body calls the "hard technical prerequisite": it already runs in CI today, advisory, at ~20-24min per the #1015 baseline measurement — moving it from advisory to blocking before #1015 lands would reproduce #345's per-run cost problem in a new place, which is exactly what #1147/#1018 are structured to avoid. **Root cause confirmed 2026-09-02 (#1431 Phase 1 plan, §1b) and resolved 2026-09-02 (#1432, Phase 249):** the failure was never "just slow" — it was genuinely failing, both a hosted-runner OOM and real, deterministic test/fixture/snapshot rot. The OOM's actual mechanism (also root-caused by #1432, correcting the #1431-era hypothesis that it was a routing/heap decision tied to #1365/#1015): `ubuntu-latest` on this private repo is a 2-vCPU runner, so Jest's own `getMaxWorkers()` resolves to 1 and `shouldRunInBand()` then runs the entire 616-file fast tier in one in-band process, whose single V8 heap accumulates every file's ESM module registry until it hits the 4096MB cap (`Ineffective mark-compacts`) — not a heap-size problem, extrapolates to ~10.5GB on a 7GB box. Fixed by forcing the fast tier into real worker-process parallelism (`BACKEND_TEST_MATRIX_FAST_MAX_WORKERS: 2` + `--workerIdleMemoryLimit=1G`, `promotion-quality-gate.yml`), not by raising `NODE_OPTIONS` or reversing #1365's routing cutover. The 6 stale files (stale ESM mock factories, a stale seeded-industry count, a stale `LOCK.UPDATE` mock — the snapshot missing a `laundry` entry was already fixed on `develop` by #1436) are fixed; the fast tier's local false-pass is closed with `--ci` on both the fast and db-tier Jest invocations in `scripts/run-backend-test-matrix.js`; `tenantSchemaBootstrap.integration.test.js`'s db-tier timeout was raised to 300s (measured: a 139-table `sync({force:true})` alone takes ~235s, a 30s budget was never achievable). Flipping this gate to blocking, and delegating it out of `gate:release:local`'s required set, remain PR-A2/PR-B2 — out of #1432's own scope, per the issue's own scoping and #1147's mapping. |
| 11 | `frontend.ims.lint` | `npm --prefix apps/dgfy-ims run lint` | **(a) — enforced in CI on release/\*→main; dropped from `gate:release:local`'s required set 2026-09-03 (PR-B)** | `frontend-ims-quality`'s "Run dgfy-ims lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 12 | `frontend.pos.lint` | `npm --prefix apps/dgfy-pos run lint` | **(a) — enforced in CI on release/\*→main; dropped from `gate:release:local`'s required set 2026-09-03 (PR-B)** | `frontend-pos-quality`'s "Run dgfy-pos lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 13 | `frontend.storefront.lint` | `npm --prefix apps/dgfy-storefront run lint` | **(a) — enforced in CI on release/\*→main; dropped from `gate:release:local`'s required set 2026-09-03 (PR-B)** | `frontend-storefront-quality`'s "Run dgfy-storefront lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 14 | `frontend.contracts` | `cd apps/dgfy-ims && npx vitest run contract.test integration.test` (via `npm run test:frontend:contracts`) | **(a) — enforced in CI on release/\*→main since #1447 (advisory; local still required until PR-B)** | `frontend-ims-quality`'s "Run frontend contract tests" step (id kept stable as `run_shared_fnb_contract_tests`) now runs the identical `npm run test:frontend:contracts`, replacing the old hand-picked 7-file list — **107 files / 552 tests measured 2026-09-02** (essentially all under `packages/web-core/src`), not the 103 previously estimated. Deliberately **not** broadened further to the full IMS suite (327 files, ~2min, 4 files flaky under 2-vCPU CPU contention) — this pattern is the intended scope, not a partial stand-in for it. |
| 15 | `frontend.storefront.contracts` | `cd apps/dgfy-storefront && npx vitest run contract.test integration.test` (via `npm run test:frontend:contracts:storefront`) | **(a)**† — **enforced in CI on release/\*→main; dropped from `gate:release:local`'s required set 2026-09-03 (PR-B)** | `frontend-storefront-quality`'s "Run storefront vitest suite" step runs unfiltered `npx vitest run`; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). Storefront's `vite.config.js` `test.exclude` only excludes `tests/e2e/**` (Playwright's own domain) — every other vitest file runs, which is a strict superset of the local gate's 26-file `contract.test`/`integration.test` pattern. † Superset, not identical command — flagged so a future edit to either side doesn't assume byte-for-byte parity. |
| 16 | `frontend.budgets` | `node scripts/check-frontend-budgets.js` (via `npm run check:frontend-budgets`) | **(a) — enforced in CI on release/\*→main since #1447 (advisory; local still required until PR-B)** | New `frontend-budgets-quality` job's "Check frontend budgets" step (`check_frontend_budgets`). **Correction (#1431 Phase 2):** the original recommendation — "add builds to `frontend-ims-quality`/`frontend-pos-quality` first" — does not work. `check-frontend-budgets.js` needs all three `dist/assets` dirs in **one job's own workspace**, and a build step in a *different* job is invisible to it; a build step added there would also be redundant, since `check-frontend-budgets.js` **already owns its own build by default** (`--skip-build` is opt-in and then *requires* `--built-after`). The actual fix: a dedicated job that builds all three apps **sequentially** (`npm --prefix <app> run build` × 3, not `check:frontend-budgets`'s own concurrent default — `pr-checks.yml`'s own comment records #923's measurement of exactly the concurrent shape's documented #662 exit-137 OOM on this box) and then runs `check:frontend-budgets -- --skip-build --built-after "$BUILD_STARTED_AT"` — **a different command shape than the local gate runs**, see the documented exception below. |
| 17 | `scroll.contracts` | `npm --prefix apps/dgfy-ims test -- --run <2-file scroll-contract suite>` | **(a) — enforced in CI on release/\*→main since #1447 (blocking from its first PR — local still required until PR-B)** | `frontend-ims-quality`'s "Run scroll contracts" step (`run_scroll_contracts`), mirroring the local gate's exact two-file list. **Correction (#1431 Phase 2):** the overlap claim was half wrong — `terminalResponsiveScroll.contract.test.js` already falls inside gate #14's broadened `contract.test`/`integration.test` pattern (its filename matches); only `scrollKeyControls.behavior.test.js` is genuinely outside it. Kept as its own step regardless (not folded into #14) so a future edit to #14's pattern can't silently drop the second file. Landed **blocking immediately**: 2 files, ~1s, green, no external dependency. |
| 18 | `observability.evidence.report` | `node scripts/gate-release-observability.js --evidence-dir <dir>` (via `npm run gate:release:observability`) | **(c)** | Probes a **live deployed environment** (`OBSERVABILITY_BASE_URL`/`PROD_BASE_URL`/`QA_BASE_URL`, hitting `/api/v1/health` and, if enabled, `/metrics`) — this is a post-deploy check, not a pre-merge static/build-time one. `STRUCTURALLY_CANNOT_FAIL` in the normal case (warns, never fails, unless run with `--enforce`, which `gate-release-local.js` never passes). Overlaps in spirit with `verify-deployment.yml`'s read-only health poll (dispatched by the Verifier role post-deploy) rather than with a promotion-PR-time gate — if this is ever wired anywhere, that's the more natural home, not `promotion-quality-gate.yml`. |
| 19 | `release.verdict.contract` | `node scripts/verify-release-verdict.js --file <verdict> --sha <sha>`, only if the file exists; else auto-skip | **(c)** | Auto-skips ("Skipped: verdict file not present") whenever no `release_verdict.json` exists for the target SHA — the normal case; also `STRUCTURALLY_CANNOT_FAIL` for the same reason. No CI pipeline in this repo currently produces that artifact for `promotion-quality-gate.yml` (or anything else) to consume. Revisit only if/when a governed release-verdict artifact pipeline exists — nothing to wire today. |

## Summary by status

- **(a) Covered**: 16 gates — #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16,
  #17. All run the same (or, for #15, a superset; for #16, a deliberately different build
  orchestration — see the documented exception below) command in `promotion-quality-gate.yml`
  today. Of these, **10 are blocking** on the `release/*→main` leg (#4, #5, #7, #9, #11, #12, #13,
  #15, #17, plus #6 which is blocking only in the narrow PR-context sense its own row describes —
  gate 6's actual CI step still carries `continue-on-error: true`, it is advisory like every other
  P2-1/P2-2 gate; "PR-context only" describes what the step *can* validate, not its blocking
  status) and **6 remain advisory in CI pending real-promotion evidence** (#2, #3, #6, #8, #14,
  #16 — #1431 Phase 2's P2-1/P2-2; flip to blocking is P2-3, gated on one real `release/*→main`
  promotion showing them green, per #1147's own "Must hold" bullet).

  Of the 10 blocking rows, **7 (#4, #5, #9, #11, #12, #13, #15) have also cleared the full "proven
  blocking on a real promotion" bar and dropped out of `gate:release:local`'s required set as of
  2026-09-03 (PR-B)** — see the caveat above for the evidence and the residual `mergeStateStatus`
  gap this leaves open. The remaining 3 blocking rows (#7, #17, and #6's PR-context case) landed
  blocking at P2-1 (2026-09-03, #1447) on their own low-risk profile, not a completed V1–V3 cycle,
  and stay in `gate:release:local`'s required set for now — their delegation-out is a later,
  separate step (P2-4). #10 (`backend.test_matrix`) stays advisory-only and locally required for a
  separate, named reason (its own row); it additionally carries #1147's own named hard dependency
  on #1015 (now resolved by #1432 — see row 10's own note — but the flip to blocking is a separate
  PR, PR-A2, out of PR-B's scope). #3 is recommended to stay advisory *permanently* (see the
  documented exception below), not just until P2-3 — the only gate in this batch on that path.
- **(b) CI job to add**: 0 gates. Every gate that was `(b)` at Phase 1 landed in Phase 2 (#1431
  P2-1/P2-2, PR #1447).
- **(c) Stays local-only**: 3 gates — #1, #18, #19. Each for a distinct, documented reason: the
  promoter's own git-branch state, a live-deployed-environment probe that's a different kind of
  check than a promotion-PR gate, and an artifact-dependent check with no producing pipeline.

None of the Phase 2 (P2-1/P2-2) work above drops any gate out of `gate:release:local`'s required
set — that's P2-4 (this issue's own analogue of PR-B, for gates 6/7/8/14/16/17), and it happens
only after P2-3 flips each still-advisory one of those to blocking on real promotion evidence, per
#1147's own "Must hold" bullet. **Separately, Phase 1's own PR-B (2026-09-03) already dropped 7
different gates (#4, #5, #9, #11, #12, #13, #15) out of the required set** — see the Critical
caveat above; `gate:release:local` currently requires 12 gates, not 19. See #1147's own scope for
the fuller sequencing history (#1015, #1018).

## Documented exceptions — gates that do not get a byte-for-byte-identical CI command

Three gates in this batch run a genuinely different command in CI than locally, for named,
deliberate reasons — flagged here the way row #15 already flags "superset, not identical command",
so a future edit to either side doesn't assume parity:

1. **#6 `compliance.contracts` is PR-context-only.** Under `workflow_dispatch`/`workflow_call` it
   passes trivially (no `GITHUB_BASE_REF` → empty diff → early exit). A green dispatch run is
   *narrower* evidence than "runs everywhere this workflow runs" and must never be cited as
   verification of this gate — only a real promotion PR is.
2. **#3 `dependencies.audit.full` is recommended to stay advisory permanently**, not just until
   P2-3 shows it green once. Its verdict depends on the npm registry rather than the repo — the
   only gate in this batch where that's true — and its findings are dev-only, never shipped. This
   is a recommendation from #1431 Phase 2's plan, **not yet Pat's confirmed decision** — flagged
   explicitly here rather than silently treated as settled.
3. **#16 `frontend.budgets` runs a different command in CI than locally**: `--skip-build
   --built-after "$BUILD_STARTED_AT"` plus three explicit serial build steps, vs. the local gate's
   own owned-concurrent-build default. Same assertions, same report shape, different build
   orchestration, for the documented #662/#923 OOM reason (see gate #16's row above).

## `develop` → `staging` leg: confirmed clear of `gate:release:local` (and its CI equivalent)

Verified live against the current tree, 2026-09-02, per this task's own second ask. **No gap or
ambiguity found** — this was already true and already doubly documented before this pass; nothing
below is a new guardrail, only a confirmation with the exact evidence cited.

1. **`.agents/skills/promoter/references/promotion-runbook.md`** states outright, in the
   `## Default: develop → staging → main` section: *"Do NOT run `npm run gate:release:local` on
   this leg... this leg's own CI-side check (`promotion-quality-gate.yml`) is also skipped entirely
   here (#1063)."* It also names the incident this guards against (#1097 — a live promotion once ran
   the local gate on this leg by mistake and stopped it on failures that were never this leg's gate
   to fail on).
2. **`.github/workflows/promotion-quality-gate.yml`** confirms the CI-side half live in the workflow
   file itself: the `gate` job sets `is_staging_leg=true` only for the `staging` base /
   `to-staging/*` head shape, and every quality job (`dgfy-api-quality`, `migration-runner-quality`,
   `frontend-ims-quality`, `frontend-pos-quality`, `frontend-storefront-quality`,
   `repository-quality`) gates on `if: needs.gate.outputs.is_promotion == 'true' &&
   needs.gate.outputs.is_staging_leg != 'true'` — i.e. every one of them is skipped entirely, not
   run advisory, on a `to-staging/*` → `staging` PR. The file's own 2026-08-31 (#1253) comment block
   is explicit that this is a deliberate, restored state (a brief 2026-08-29→2026-08-31 window where
   #1124/#1165 made this leg advisory-only was reverted by #1253 on Pat's call), not an accidental
   regression.
3. **`.github/workflows/pr-checks.yml`** — which does trigger on `staging`/`main` pull requests too
   (`branches: [develop, staging, main]`) — only runs Docker build-check jobs
   (`dgfy-api-build-check`, `dgfy-migration-runner-build-check`, and the three
   `frontend-*-build-check` jobs) gated on changed paths. No lint/test/quality job exists in this
   file at all; `quality-checks`/`android-build-check` were removed outright 2026-08-14 (#416), per
   that file's own comment.

Net effect, unchanged from #1097 and restated here rather than left to infer from silence: a
`to-staging/<label>` PR into `staging` is gated on nothing beyond `pr-checks.yml`'s Docker build
checks — no `gate:release:local`, and no `promotion-quality-gate.yml` run of any kind, advisory or
otherwise.

## Related

#1147 (this doc's parent, partially resolved by it — not closed), #1431 (Phase 1: PR-A flipped 7
CI steps to blocking; PR-B, this update, dropped the same 7 out of `gate:release:local`'s required
set — the `mergeStateStatus: UNSTABLE` residual gap named above lives against this issue until a
real `release/*→main` PR closes it), #1124 (pipeline-trust epic this mapping's advisory-caveat
depends on), #1018 (fast-tier CI wiring, first migration milestone), #1015 (hard prerequisite for
gate #10), #1016 (already-shipped `--only`/`--skip` tooling), #1097 (the develop→staging leg
incident this doc's second section confirms stays fixed), #1063/#1066/#1253 (the advisory-only
history of `promotion-quality-gate.yml`), #927 (the original "where does this run" question #1018
resolves for the fast subset).
