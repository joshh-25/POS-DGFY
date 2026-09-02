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

`scripts/gate-release-local.js`'s `GATE_NAMES` array (16 entries, in the order the script runs
them) is the source of truth for the left column — read it there before trusting a stale copy here.
This table still lists all 19 original gates, including the 3 retired ones, for historical
continuity — the retired rows (#1, #18, #19) no longer appear in `GATE_NAMES` or the artifact.
Each gate maps to exactly one of:

- **(a) Covered** — an existing CI job already runs the same check.
- **(b) CI job to add** — no CI job runs this today; a concrete recommendation is given.
- **(c) Resolved without a CI job — the local gate row is retired.** CI needs no equivalent,
  because the gate asserted something CI already has for free, or something anchored to a
  pipeline stage that is not promotion-PR time. Retirement, not "stays local": per #1431's own
  End-goal, *"'outsourced' means the local requirement is dropped because CI doesn't need an
  equivalent, not that an equivalent gets built."* Each (c) gate's closeout record — reason,
  residual capability, evidence — is in **"Retired gates — closed resolutions"** below; a bare
  auto-skip or a `structurally_cannot_fail` flag is *not* a closed resolution, it is an open
  question with a green badge.

**Critical caveat that applies to every "(a) Covered" row below — updated 2026-09-03 (#1431 Phase 1
PR-A/PR-B, Phase 2 P2-1/P2-2 PR #1447)**: `promotion-quality-gate.yml` (the CI workflow all "(a)"
rows point at) was **entirely advisory** as of #1063/#1066/#1253 — every step in every quality job
carried its own `continue-on-error: true`, so a red run never blocked a promotion PR's
`mergeStateStatus`. That is no longer true for 9 of the 16 "(a)" rows (4, 5, 7, 9, 11, 12, 13, 15,
17 — see each row's own updated Status below): those gates' CI steps are now blocking on the
`release/*→main` leg (and `staging→main`, and any `workflow_dispatch`/`workflow_call` run) — a real
failure reds out the check-run and trips `AGENTS.md`'s Merge Safety hard stop, same as any other
required check. Rows 2, 3, 6, 8, 14, 16 stay **advisory in CI** (`continue-on-error: true`) pending
real-promotion evidence (P2-3), and row 10 (`backend.test_matrix`) stays fully advisory for a
separate, named reason — see each row's own updated note. **Row 6 is squarely in this advisory
group, not the blocking one** — `run_compliance_contracts` carries `continue-on-error: true` and is
absent from both `BLOCKING_STEP_IDS` and `BLOCKING_STEP_NAMES`, so a `compliance.contracts` failure
does not block a promotion PR's merge today, full stop. "PR-context only" (row 6's own note)
describes a *narrower scope of what the step can validate* under `workflow_dispatch`/
`workflow_call` versus a real PR — it is not a second, qualified kind of "blocking" and must not be
read as one.

Per #1147's own "Must hold" bullet, a gate only moves from "local is authoritative" to "CI replaces
local" (i.e. drops out of `gate:release:local`'s required set) once its CI job has been verified
trustworthy against #1124's audit standard **and** proven blocking on a real promotion. That bar has
now been met for exactly **7** of the 9 blocking rows — **4, 5, 9, 11, 12, 13, 15 dropped out of
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

**The remaining 2 blocking rows (7 and 17) have NOT yet had this same V1–V3 bar run against
them** — they landed blocking in CI at P2-1 (2026-09-03, #1447) on the strength of their own
low-risk profile (no prerequisite, no flake surface, no external dependency), not on a completed
verification cycle, so they stay in `gate:release:local`'s required set for now; their own
delegation-out is a later, separate step (P2-4), not folded into PR-B's scope. Row 6 stays fully
advisory in CI (see above) and is not part of either the "already delegated" or the "blocking,
pending delegation" groups — its own delegation question doesn't arise until P2-3 first flips it to
blocking. `gate:release:local` therefore still runs and requires all 12 gates PR-B left in its
required set (19 minus the 7 PR-B delegated), including 6/7/8/14/16/17 — **12 minus the 3 more
retired by #1431 Phase 3 below (#1, #18, #19), leaving 9 actually required today** — until each of
6/7/8/14/16/17 is individually verified and delegated. PR-B's 7 delegations and Phase 3's 3
retirements subtract from the same 19-gate starting point for different reasons (CI now enforces
the same check vs. CI needs no equivalent at all); neither phase blocks the other.

| # | Gate name | Local command (`gate-release-local.js`) | Status | CI job / detail |
|---|---|---|---|---|
| 1 | `release.target_sha` | *(retired — was: `RELEASE_TARGET_SHA` env, else `git rev-parse HEAD`)* | **(c) — RETIRED 2026-09-02 (#1431 Phase 3, Phase 250)** | A tautology as a gate: it could only fail outside a git checkout, where the evidence dir itself is already broken. CI has `github.sha` unambiguously and for free. **The SHA *resolution* is kept** — it still names `.tmp/release-gates/<sha>/` and populates `local_readiness.json`'s `target_sha`, which the `## Local CI` commit-binding (#725 RF-2) traces back to; only the scored gate row is gone. No residual capability lost. |
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
| 18 | `observability.evidence.report` | *(retired — was: `npm run gate:release:observability -- --evidence-dir <dir>`)* | **(c) — RETIRED 2026-09-02 (#1431 Phase 3, Phase 250)** | A post-deploy probe wearing a pre-merge gate's clothing: at `release/<label>`-PR time there is no running environment and no deployed SHA to probe. In a promoter's actual run, 5 of its 8 checks `warn` (no `OBSERVABILITY_BASE_URL`/`PROD_BASE_URL`/`QA_BASE_URL`, no server-side `.deploy-state/last_deployed_commit`, no `release_verdict.json`/`qa_deploy_summary.txt`), and `verdict: 'fail'` is unreachable without `--enforce`, which `gate-release-local.js` never passes. **The tool is kept, not deleted** — `npm run gate:release:observability` stays the post-deploy/incident tool `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md` already invokes. **Named residual gap:** `verify-deployment.yml` (#514) polls container health/`RestartCount`/in-container `/health` but does **not** check `services.observability.runtime_sha` parity against the promoted SHA, nor the `x-request-id`/`x-trace-id` round-trip — tracked as #1443, not silently absorbed. |
| 19 | `release.verdict.contract` | *(retired — was: `node scripts/verify-release-verdict.js --file <verdict> --sha <sha>`, else auto-skip)* | **(c) — RETIRED 2026-09-02 (#1431 Phase 3, Phase 250)** | **Corrects this row's earlier claim that "no pipeline produces that artifact":** a producer does exist — `scripts/gate-release-no-staging.js` (`npm run gate:release:no-staging`) writes `release_verdict.json`. It is dead for a stronger reason. That script is the gate of `docs/ops/NO_STAGING_RELEASE_STANDARD.md`, which is `status: superseded` / `authority_level: historical`, retired by #1019 and ADR 0074 Decision 10; `docs/testing/release-go-no-go-checklist.md` (authoritative) states outright that it and its wrappers "are not part of this gate and are not must-pass here." The governed promotion flow never invokes it, so the artifact never exists for a `release/<label>` head and the gate auto-passed as `Skipped` on every real run. Reviving the producer is forbidden by `AGENTS.md`'s Prohibited Behavior (`superseded_by` target exists). `scripts/verify-release-verdict.js` and `scripts/gate-release-no-staging.js` are **not** deleted — `scripts/gate-release-dgfy-evidence.js` still uses the verdict contract. No residual capability lost. |

## Summary by status

- **(a) Covered**: 16 gates — #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16,
  #17. All run the same (or, for #15, a superset; for #16, a deliberately different build
  orchestration — see the documented exception below) command in `promotion-quality-gate.yml`
  today. Of these, **9 are blocking** on the `release/*→main` leg (#4, #5, #7, #9, #11, #12, #13,
  #15, #17) and **7 remain advisory in CI pending real-promotion evidence** (#2, #3, #6, #8, #14,
  #16 — #1431 Phase 2's P2-1/P2-2; flip to blocking is P2-3, gated on one real `release/*→main`
  promotion showing them green, per #1147's own "Must hold" bullet). **Row 6 belongs squarely in
  the advisory group**: `run_compliance_contracts` carries `continue-on-error: true` and is absent
  from both `BLOCKING_STEP_IDS` and `BLOCKING_STEP_NAMES`, so a `compliance.contracts` failure
  does not block a promotion PR's merge today. Its own "PR-context only" note (row 6 above)
  describes a narrower scope of *what the step can validate* under `workflow_dispatch`/
  `workflow_call` versus a real PR — it is not a qualified or partial form of "blocking", and
  promotion reviewers should not read it that way.

  Of the 9 blocking rows, **7 (#4, #5, #9, #11, #12, #13, #15) have also cleared the full "proven
  blocking on a real promotion" bar and dropped out of `gate:release:local`'s required set as of
  2026-09-03 (PR-B)** — see the caveat above for the evidence and the residual `mergeStateStatus`
  gap this leaves open. The remaining 2 blocking rows (#7, #17) landed blocking at P2-1
  (2026-09-03, #1447) on their own low-risk profile, not a completed V1–V3 cycle, and stay in
  `gate:release:local`'s required set for now — their delegation-out is a later, separate step
  (P2-4). #10 (`backend.test_matrix`) stays advisory-only and locally required for a separate,
  named reason (its own row); it additionally carries #1147's own named hard dependency on #1015
  (now resolved by #1432 — see row 10's own note — but the flip to blocking is a separate PR,
  PR-A2, out of PR-B's scope). #3 is recommended to stay advisory *permanently* (see the documented
  exception below), not just until P2-3 — the only gate in this batch on that path.
- **(b) CI job to add**: 0 gates. Every gate that was `(b)` at Phase 1 landed in Phase 2 (#1431
  P2-1/P2-2, PR #1447).
- **(c) Resolved without a CI job, gate row retired**: 3 gates — #1, #18, #19, retired 2026-09-02
  by #1431 Phase 3 (Phase 250). `GATE_NAMES` is now 16 entries. Closeout records below. Each was
  structurally incapable of failing on a governed promotion checkout — a tautology, a warn-only
  post-deploy probe, and an auto-skip whose producer belongs to a superseded standard. Two of the
  three (#18, #19) carried `structurally_cannot_fail: true`; #1 did not, which was itself an
  inconsistency the retirement removes.

None of the Phase 2 (P2-1/P2-2) work above drops any gate out of `gate:release:local`'s required
set on its own — that's P2-4 (this issue's own analogue of PR-B, for gates 6/7/8/14/16/17), and it
happens only after P2-3 flips each still-advisory one of those to blocking on real promotion
evidence, per #1147's own "Must hold" bullet. **Phase 1's own PR-B (2026-09-03) dropped 7 different
gates (#4, #5, #9, #11, #12, #13, #15) out of the required set** via delegation — see the Critical
caveat above — **and Phase 3 (this update) retired 3 more gates outright (#1, #18, #19)**:
`gate:release:local` currently requires **9** gates, not 19 (19 − 7 delegated − 3 retired). See
#1147's own scope for the fuller sequencing history (#1015, #1018).

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

## Retired gates — closed resolutions

#1431's Definition of Done requires every one of the 19 original gates to reach "a documented,
closed resolution." For the three (c) gates that is retirement, and this section is the record —
kept here rather than only in the phase ledger, so the mapping table and its closeouts stay in one
place. A gate is only *closed* when all five columns below are filled; an auto-skip, a
`structurally_cannot_fail: true` flag, or a warning telling readers not to cite the row are each
evidence of the opposite.

| Gate | Resolution | Reason (one line) | Residual capability, and where it lives now | Closing evidence |
|---|---|---|---|---|
| `release.target_sha` | Retired from `GATE_NAMES`; SHA resolution kept as script setup | Tautology — CI has `github.sha` for free | None lost. `local_readiness.json`'s `target_sha` and `.tmp/release-gates/<sha>/` are unchanged | `GATE_NAMES.length === 16`; `local_readiness.json` still carries a correct `target_sha`; `scripts/gate-release-local.test.js` asserts the name is absent |
| `observability.evidence.report` | Gate row retired; `npm run gate:release:observability` kept as a post-deploy/incident tool | Post-deploy probe, not a promotion-PR-time check; `fail` unreachable without `--enforce` | `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md` invokes the tool directly. `runtime_sha` parity + trace round-trip are **not** in `verify-deployment.yml` — tracked as #1443 | `scripts/gate-release-observability.js` and `apps/dgfy-api/tests/observabilityReleaseGateScript.test.js` unchanged and passing; #1443 open |
| `release.verdict.contract` | Retired from `GATE_NAMES` | Sole producer belongs to `NO_STAGING_RELEASE_STANDARD.md`, `status: superseded` (#1019, ADR 0074 Decision 10) | None in the governed flow. `scripts/verify-release-verdict.js` kept for `scripts/gate-release-dgfy-evidence.js` | `docs/testing/release-go-no-go-checklist.md`'s own authoritative exclusion of the no-staging wrappers; `scripts/gate-release-local.test.js` asserts the name is absent |

**Not retired here, and not to be confused with these three:** `compliance.contracts` (#6) is still
flagged `structurally_cannot_fail: true` on a clean checkout, but it is an **(a)** row now (wired
into CI advisory since #1447, #1431 Phase 2) — it has a real CI destination, and a real diff *can*
fail it. It stays in `GATE_NAMES`.

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
CI steps to blocking; PR-B dropped the same 7 out of `gate:release:local`'s required set — the
`mergeStateStatus: UNSTABLE` residual gap named above lives against this issue until a real
`release/*→main` PR closes it; Phase 3, this update, retired 3 more gates outright — the (c) rows
above), #1124 (pipeline-trust epic this mapping's advisory-caveat depends on), #1018 (fast-tier CI
wiring, first migration milestone), #1015 (hard prerequisite for gate #10), #1016 (already-shipped
`--only`/`--skip` tooling), #1097 (the develop→staging leg incident this doc's second section
confirms stays fixed), #1063/#1066/#1253 (the advisory-only history of `promotion-quality-gate.yml`),
#927 (the original "where does this run" question #1018 resolves for the fast subset), #1019 / ADR
0074 Decision 10 (the superseded standard gate 19 depended on), #514 (`verify-deployment.yml`, gate
18's residual-gap home), #1443 (the filed follow-up for gate 18's residual gap).
