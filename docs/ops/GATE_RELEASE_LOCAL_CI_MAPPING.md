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
document started as that issue's first concrete deliverable ("this issue's first deliverable, not
an implementation detail to skip") and has since tracked every gate through to closure. **As of
#1431 Phase C/D (2026-09-03), every one of the 16 remaining gates is closed or delegated: all 19
original gates now have a documented, closed resolution, and `gate:release:local`'s
required-locally count is 0.**

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

## Current state (2026-09-03, #1431 Phase C/D) — the short version

Every "(a) Covered" row is now **delegated** to `promotion-quality-gate.yml` via
`scripts/gate-release-local.js`'s `CI_ENFORCED_GATES` map (16 entries — every remaining gate),
cross-checked by `scripts/check-pr-quality-workflow.js`'s `checkCiEnforcedGatesAreBlocking()` so a
future edit cannot silently regain `continue-on-error` on a supposedly-blocking step without
failing that checker. Of those 16:

- **14 are genuinely blocking** on the `release/*→main` leg (and `staging→main`, and any
  `workflow_dispatch`/`workflow_call` run) — a real failure reds out the job's check-run and trips
  `AGENTS.md`'s Merge Safety hard stop, same as any other required check.
- **2 are deliberately, permanently-or-temporarily advisory**, named in
  `check-pr-quality-workflow.js`'s `ADVISORY_CI_ENFORCED_GATES` allowlist so
  `checkCiEnforcedGatesAreBlocking()` doesn't demand blocking coverage that will never exist for
  them:
  - `dependencies.audit.full` (row 3) — **permanently** advisory (Pat's call, settled this phase,
    superseding the "not yet decided" flag the Phase 2 version of this doc carried). Its verdict
    depends on the npm registry, not the repo; a fresh dev-only advisory can flip it red with zero
    code change here, and its findings never ship.
  - `backend.test_matrix` (row 10) — **temporarily** advisory, tracked by #1469, gated on #1015
    (fast/DB tier split) and #925 (hanging `beforeAll`). Confirmed still genuinely failing (not
    just slow) on every #1431 Phase A/C evidence run.

`gate:release:local`'s required-locally count is **0** — every gate that isn't one of the 3 retired
rows below is now delegated. `docs/testing/release-go-no-go-checklist.md` and
`.agents/skills/promoter/SKILL.md` have been updated to stop citing `gate:release:local` as a
pre-`main` step; `promotion-quality-gate.yml`'s own quality jobs are the sole remaining enforcement
mechanism.

## Evidence behind the Phase C flips

Five steps flipped from advisory to blocking this phase, on the strength of a real evidence pass
(not just "low-risk profile," the P2-1/P2-2 standard) — workflow_dispatch runs on scratch branches
plus one throwaway PR against `main` (deleted, never merged), read via each job's own
`record_outcomes`/`real_failures` mechanism (the pre-override `steps.<id>.outcome`, not the Actions
Jobs API's post-override `steps[].conclusion` — see `promotion-quality-gate.yml`'s own #1066 RF-1
note for why that API can't be trusted here):

| Step (job) | Clean run | Fault run | Verdict |
|---|---|---|---|
| `run_dependency_audit_prod` (repository-quality) | pass | real fail | **flip blocking** |
| `run_dependency_audit_full` (repository-quality) | **real fail** (npm-registry finding, pre-existing) | real fail | **stay advisory permanently** |
| `run_compliance_contracts` (repository-quality) | pass (real PR-context run) | real fail (real PR-context run) | **flip blocking** |
| `run_runtime_doctor` (dgfy-api-quality) | pass | real fail | **flip blocking** |
| `run_shared_fnb_contract_tests` (frontend-ims-quality) | pass | real fail | **flip blocking** |
| `check_frontend_budgets` (frontend-budgets-quality) | pass | real fail | **flip blocking** |
| `run_production_env_fixtures` (repository-quality) | already blocking, unfaulted | — | already blocking, no change |
| `run_scroll_contracts` (frontend-ims-quality) | already blocking | real fail (bonus confirmation) | already blocking, no change |

Run IDs: positive `33667140889`, negative-probe `33670723624` (migration/budget/contract/audit/
doctor faults), gate-6 PR-context evidence `33667879656` (clean) / `33670845561` (fault, PR #1458,
closed unmerged). `backend.test_matrix` (`run_test_matrix`) was confirmed still failing for real on
every one of these runs, independent of which fault was being probed — consistent with #1432's own
root-cause finding that this was never "just slow" (see row 10 below and #1469).

| # | Gate name | Local command (`gate-release-local.js`) | Status | CI job / detail |
|---|---|---|---|---|
| 1 | `release.target_sha` | *(retired — was: `RELEASE_TARGET_SHA` env, else `git rev-parse HEAD`)* | **(c) — RETIRED 2026-09-02 (#1431 Phase 3, Phase 250)** | A tautology as a gate: it could only fail outside a git checkout, where the evidence dir itself is already broken. CI has `github.sha` unambiguously and for free. **The SHA *resolution* is kept** — it still names `.tmp/release-gates/<sha>/` and populates `local_readiness.json`'s `target_sha`, which the `## Local CI` commit-binding (#725 RF-2) traces back to; only the scored gate row is gone. No residual capability lost. |
| 2 | `dependencies.audit.prod` | `node scripts/audit-dependencies.js --omit-dev` | **(a) — CLOSED: blocking in CI + delegated out of `gate:release:local` since 2026-09-03 (#1431 Phase C/D)** | `repository-quality`'s "Run production dependency audit" step (`run_dependency_audit_prod`) runs the identical `npm run audit:dependencies:prod`; `continue-on-error` removed 2026-09-03 (Phase C). Audits **7** lockfile trees, not 6 — `tests/frontend-cross-app` is the seventh (`scripts/audit-dependencies.js:32-43`). |
| 3 | `dependencies.audit.full` | `node scripts/audit-dependencies.js` | **(a) — CLOSED: delegated, PERMANENTLY advisory (Pat's call, settled 2026-09-03, #1431 Phase C/D)** | `repository-quality`'s "Run full dependency audit" step (`run_dependency_audit_full`) runs the identical `npm run audit:dependencies`. Same script as #2, without `--omit-dev`; 7 lockfile trees (see #2). **This variant's verdict depends on the npm registry, not the repo** — a new dev-only advisory can flip it red with zero code change here (its dev-only findings, e.g. `@lhci/cli`'s puppeteer chain, never ship), and Phase A/C evidence confirmed it real-failing on both the clean and fault-probe runs for exactly that pre-existing reason. Named in `check-pr-quality-workflow.js`'s `ADVISORY_CI_ENFORCED_GATES` allowlist — settled permanently advisory, not a P2-3-style pending case. |
| 4 | `docs.lint` | `node scripts/lint-docs.js && npm run check:adr` (via `npm run lint:docs`) | **(a) — CLOSED: blocking + delegated 2026-09-03 (PR-B)** | `repository-quality`'s "Run governed documentation lint" step runs the identical `npm run lint:docs`; that step's `continue-on-error` was removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 5 | `architecture.guardrails` | `cd apps/dgfy-api && npm run check:architecture-guardrails && npm run check:controller-boundaries` (via `npm run check:architecture`) | **(a) — CLOSED: blocking + delegated 2026-09-03 (PR-B)** | `dgfy-api-quality`'s "Enforce modular architecture guardrails" + "Enforce controller architecture boundaries" steps run the identical two subcommands; both steps' `continue-on-error` was removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 6 | `compliance.contracts` | `node scripts/check-compliance-impact.js && node scripts/check-compliance-api-contracts.js` (via `npm run check:compliance`) | **(a) — CLOSED: blocking in CI + delegated out of `gate:release:local` since 2026-09-03 (#1431 Phase C/D)** | `repository-quality`'s "Run compliance contract checks" step (`run_compliance_contracts`) runs the identical `npm run check:compliance`; `continue-on-error` removed 2026-09-03 (Phase C), confirmed via a real PR-context run (PR #1458, closed unmerged), not just a `workflow_dispatch` early-exit. **PR-context caveat still applies to what the step can *validate*, not whether it blocks**: under `workflow_dispatch`/`workflow_call` there is no `GITHUB_BASE_REF`, so `resolveChangedFiles()` sees an empty diff and the step passes trivially — that's a narrower scope of coverage on those triggers, not a qualified form of "blocking." This gate's own prerequisite (#1442, docs-only fix to `2026-08-31-preflight-ephemeral-target.md`'s missing sections) landed first. |
| 7 | `production.env.fixtures` | `node scripts/check-production-env-fixtures.js` | **(a) — CLOSED: blocking + delegated 2026-09-03 (#1431 Phase C/D)** | `repository-quality`'s "Run production env fixture checks" step (`run_production_env_fixtures`) runs the identical `npm run check:production-env`. Pure/fixture-based — every value is a synthetic placeholder string, no live DB, no real secrets, no SOPS decryption — landed **blocking immediately** at P2-1, no advisory round, since it has no prerequisite, no flake surface, and no external dependency. |
| 8 | `runtime.doctor` | `cd apps/dgfy-api && node scripts/doctor-runtime.js` (via `npm run doctor:runtime`) | **(a) — CLOSED: blocking in CI + delegated out of `gate:release:local` since 2026-09-03 (#1431 Phase C/D)** | `dgfy-api-quality`'s "Run runtime schema doctor" step (`run_runtime_doctor`), added after "Prepare test schema"; `continue-on-error` removed 2026-09-03 (Phase C). `dgfy-api-quality`, not `migration-runner-quality`, is the correct home: that other job never runs `npm ci` in `apps/dgfy-api`, so `doctor-runtime.js` (ESM, imports `sequelize`/`dotenv` from the API tree) cannot run there; `dgfy-api-quality` already installs the API deps *and* already migrates the same `mysql:8.0` container ("Prepare test schema"). |
| 9 | `backend.lint` | `npm --prefix apps/dgfy-api run lint` | **(a) — CLOSED: blocking + delegated 2026-09-03 (PR-B)** | `dgfy-api-quality`'s "Run API lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 10 | `backend.test_matrix` | `node scripts/run-backend-test-matrix.js` (via `npm run test:backend:matrix`) | **(a) — CLOSED: delegated, TEMPORARILY advisory, tracked by #1469 (gated on #1015/#925), 2026-09-03 (#1431 Phase C/D)** | `dgfy-api-quality`'s "Run dgfy-api test matrix" step runs the identical command. This is the gate #1147's own body calls the "hard technical prerequisite" — it already runs in CI today, advisory, at ~20-24min per the #1015 baseline measurement. **Root cause confirmed 2026-09-02 (#1431 Phase 1 plan, §1b) and resolved 2026-09-02 (#1432, Phase 249):** the failure was never "just slow" — it was genuinely failing, both a hosted-runner OOM and real, deterministic test/fixture/snapshot rot. The OOM's actual mechanism: `ubuntu-latest` on this private repo is a 2-vCPU runner, so Jest's own `getMaxWorkers()` resolves to 1 and `shouldRunInBand()` then runs the entire 616-file fast tier in one in-band process, whose single V8 heap accumulates every file's ESM module registry until it hits the 4096MB cap — fixed by forcing real worker-process parallelism (`BACKEND_TEST_MATRIX_FAST_MAX_WORKERS: 2` + `--workerIdleMemoryLimit=1G`). #1431 Phase A/C's own evidence runs reconfirmed this step still failing for real on every run checked (independent of which fault was being probed) — consistent with the rot never having been fully closed. Flipping this gate to blocking is #1469, gated on #1015 (fast/DB tier split) and #925 (hanging `beforeAll`) — named in `check-pr-quality-workflow.js`'s `ADVISORY_CI_ENFORCED_GATES` allowlist in the meantime. |
| 11 | `frontend.ims.lint` | `npm --prefix apps/dgfy-ims run lint` | **(a) — CLOSED: blocking + delegated 2026-09-03 (PR-B)** | `frontend-ims-quality`'s "Run dgfy-ims lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 12 | `frontend.pos.lint` | `npm --prefix apps/dgfy-pos run lint` | **(a) — CLOSED: blocking + delegated 2026-09-03 (PR-B)** | `frontend-pos-quality`'s "Run dgfy-pos lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 13 | `frontend.storefront.lint` | `npm --prefix apps/dgfy-storefront run lint` | **(a) — CLOSED: blocking + delegated 2026-09-03 (PR-B)** | `frontend-storefront-quality`'s "Run dgfy-storefront lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 14 | `frontend.contracts` | `cd apps/dgfy-ims && npx vitest run contract.test integration.test` (via `npm run test:frontend:contracts`) | **(a) — CLOSED: blocking in CI + delegated out of `gate:release:local` since 2026-09-03 (#1431 Phase C/D)** | `frontend-ims-quality`'s "Run frontend contract tests" step (id kept stable as `run_shared_fnb_contract_tests`) runs the identical `npm run test:frontend:contracts` — **107 files / 552 tests measured 2026-09-02** (essentially all under `packages/web-core/src`); `continue-on-error` removed 2026-09-03 (Phase C). Deliberately **not** broadened further to the full IMS suite (327 files, ~2min, 4 files flaky under 2-vCPU CPU contention) — this pattern is the intended scope, not a partial stand-in for it. |
| 15 | `frontend.storefront.contracts` | `cd apps/dgfy-storefront && npx vitest run contract.test integration.test` (via `npm run test:frontend:contracts:storefront`) | **(a)**† — **CLOSED: blocking + delegated 2026-09-03 (PR-B)** | `frontend-storefront-quality`'s "Run storefront vitest suite" step runs unfiltered `npx vitest run`; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). Storefront's `vite.config.js` `test.exclude` only excludes `tests/e2e/**` (Playwright's own domain) — every other vitest file runs, which is a strict superset of the local gate's 26-file `contract.test`/`integration.test` pattern. † Superset, not identical command — flagged so a future edit to either side doesn't assume byte-for-byte parity. |
| 16 | `frontend.budgets` | `node scripts/check-frontend-budgets.js` (via `npm run check:frontend-budgets`) | **(a) — CLOSED: blocking in CI + delegated out of `gate:release:local` since 2026-09-03 (#1431 Phase C/D)** | New `frontend-budgets-quality` job's "Check frontend budgets" step (`check_frontend_budgets`); `continue-on-error` removed 2026-09-03 (Phase C). `check-frontend-budgets.js` needs all three `dist/assets` dirs in **one job's own workspace** — a dedicated job builds all three apps **sequentially** (`npm --prefix <app> run build` × 3, avoiding #923's documented concurrent-build OOM) and then runs `check:frontend-budgets -- --skip-build --built-after "$BUILD_STARTED_AT"` — **a different command shape than the local gate runs**, see the documented exception below. |
| 17 | `scroll.contracts` | `npm --prefix apps/dgfy-ims test -- --run <2-file scroll-contract suite>` | **(a) — CLOSED: blocking + delegated 2026-09-03 (#1431 Phase C/D)** | `frontend-ims-quality`'s "Run scroll contracts" step (`run_scroll_contracts`), mirroring the local gate's exact two-file list. `terminalResponsiveScroll.contract.test.js` already falls inside gate #14's broadened `contract.test`/`integration.test` pattern; only `scrollKeyControls.behavior.test.js` is genuinely outside it. Kept as its own step regardless (not folded into #14) so a future edit to #14's pattern can't silently drop the second file. Landed **blocking immediately** at P2-1: 2 files, ~1s, green, no external dependency. |
| 18 | `observability.evidence.report` | *(retired — was: `npm run gate:release:observability -- --evidence-dir <dir>`)* | **(c) — RETIRED 2026-09-02 (#1431 Phase 3, Phase 250)** | A post-deploy probe wearing a pre-merge gate's clothing: at `release/<label>`-PR time there is no running environment and no deployed SHA to probe. In a promoter's actual run, 5 of its 8 checks `warn` (no `OBSERVABILITY_BASE_URL`/`PROD_BASE_URL`/`QA_BASE_URL`, no server-side `.deploy-state/last_deployed_commit`, no `release_verdict.json`/`qa_deploy_summary.txt`), and `verdict: 'fail'` is unreachable without `--enforce`, which `gate-release-local.js` never passes. **The tool is kept, not deleted** — `npm run gate:release:observability` stays the post-deploy/incident tool `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md` already invokes. **Named residual gap:** `verify-deployment.yml` (#514) polls container health/`RestartCount`/in-container `/health` but does **not** check `services.observability.runtime_sha` parity against the promoted SHA, nor the `x-request-id`/`x-trace-id` round-trip — tracked as #1443, not silently absorbed. |
| 19 | `release.verdict.contract` | *(retired — was: `node scripts/verify-release-verdict.js --file <verdict> --sha <sha>`, else auto-skip)* | **(c) — RETIRED 2026-09-02 (#1431 Phase 3, Phase 250)** | **Corrects this row's earlier claim that "no pipeline produces that artifact":** a producer does exist — `scripts/gate-release-no-staging.js` (`npm run gate:release:no-staging`) writes `release_verdict.json`. It is dead for a stronger reason. That script is the gate of `docs/ops/NO_STAGING_RELEASE_STANDARD.md`, which is `status: superseded` / `authority_level: historical`, retired by #1019 and ADR 0074 Decision 10; `docs/testing/release-go-no-go-checklist.md` (authoritative) states outright that it and its wrappers "are not part of this gate and are not must-pass here." The governed promotion flow never invokes it, so the artifact never exists for a `release/<label>` head and the gate auto-passed as `Skipped` on every real run. Reviving the producer is forbidden by `AGENTS.md`'s Prohibited Behavior (`superseded_by` target exists). `scripts/verify-release-verdict.js` and `scripts/gate-release-no-staging.js` are **not** deleted — `scripts/gate-release-dgfy-evidence.js` still uses the verdict contract. No residual capability lost. |

## Summary by status

- **(a) Covered, all closed**: 16 gates — #2 through #17. All run the same (or, for #15, a
  superset; for #16, a deliberately different build orchestration — see the documented exception
  below) command in `promotion-quality-gate.yml`, and every one is delegated out of
  `gate:release:local`'s required set (`CI_ENFORCED_GATES`, 16 entries — `required_gate_count: 0`
  on a default run). Of these:
  - **14 are blocking**: #2, #4, #5, #6, #7, #8, #9, #11, #12, #13, #14, #15, #16, #17.
  - **2 stay deliberately advisory**, named in `ADVISORY_CI_ENFORCED_GATES`: #3
    (`dependencies.audit.full`, **permanent** — registry-dependent, findings never ship) and #10
    (`backend.test_matrix`, **temporary** — tracked by #1469, gated on #1015/#925).
- **(b) CI job to add**: 0 gates.
- **(c) Resolved without a CI job, gate row retired**: 3 gates — #1, #18, #19, retired 2026-09-02
  by #1431 Phase 3 (Phase 250). `GATE_NAMES` is now 16 entries. Closeout records below. Each was
  structurally incapable of failing on a governed promotion checkout — a tautology, a warn-only
  post-deploy probe, and an auto-skip whose producer belongs to a superseded standard. Two of the
  three (#18, #19) carried `structurally_cannot_fail: true`; #1 did not, which was itself an
  inconsistency the retirement removes.

**`gate:release:local` currently requires 0 gates** (19 original − 16 delegated − 3 retired). Every
one of the 19 original gates now has a documented, closed resolution — the mapping this doc set out
to build is complete. `promotion-quality-gate.yml`'s own quality jobs, not the local script, are
the enforcement mechanism a `release/*→main` promotion depends on.

## Documented exceptions — gates that do not get a byte-for-byte-identical CI command

Two gates in this batch run a genuinely different command in CI than locally, for named, deliberate
reasons — flagged here the way row #15 already flags "superset, not identical command", so a
future edit to either side doesn't assume parity:

1. **#6 `compliance.contracts` validates a narrower diff under `workflow_dispatch`/
   `workflow_call`.** Under those triggers there is no `GITHUB_BASE_REF`, so `resolveChangedFiles()`
   sees an empty diff and the step passes trivially. That's a narrower scope of what the step can
   *validate* on those triggers, not a qualified form of "blocking" — it is unconditionally blocking
   (no `continue-on-error`) on every trigger, and a real promotion PR (the `pull_request` trigger)
   always exercises the real diff.
2. **#16 `frontend.budgets` runs a different command in CI than locally**: `--skip-build
   --built-after "$BUILD_STARTED_AT"` plus three explicit serial build steps, vs. the local gate's
   own owned-concurrent-build default. Same assertions, same report shape, different build
   orchestration, for the documented #662/#923 OOM reason (see gate #16's row above).

**#3 `dependencies.audit.full` is no longer in this list** — Phase C settled it as permanently
advisory (Pat's call), not a byte-for-byte-command exception; its row above and the Current-state
section carry the full reasoning.

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

**Not retired, and not to be confused with these three:** `compliance.contracts` (#6) is still
flagged `structurally_cannot_fail: true` on a clean checkout, but it is an **(a)** row, closed and
blocking — it has a real CI destination, a real diff *can* fail it (confirmed via PR #1458's
fault-probe run), and it stays in `GATE_NAMES`, delegated but not retired.

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
   `repository-quality`, `frontend-budgets-quality`) gates on `if:
   needs.gate.outputs.is_promotion == 'true' && needs.gate.outputs.is_staging_leg != 'true'` — i.e.
   every one of them is skipped entirely, not run advisory, on a `to-staging/*` → `staging` PR. The
   file's own 2026-08-31 (#1253) comment block is explicit that this is a deliberate, restored state
   (a brief 2026-08-29→2026-08-31 window where #1124/#1165 made this leg advisory-only was reverted
   by #1253 on Pat's call), not an accidental regression.
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

#1147 (this doc's parent, now fully resolved by it), #1431 (Phase 1: PR-A flipped 7 CI steps to
blocking, PR-B delegated the same 7 out of `gate:release:local`'s required set; Phase 2: P2-1/P2-2
wired the remaining 8 gates into CI; Phase 3: retired 3 gates outright; Phase C/D, this update:
flipped 5 more steps blocking, settled #3 permanently advisory, and delegated all remaining 9 gates
out of `gate:release:local`'s required set, closing the umbrella), #1124 (pipeline-trust epic this
mapping's evidence standard depends on), #1018 (fast-tier CI wiring, first migration milestone),
#1015 / #925 / #1469 (prerequisites and tracking for gate #10's eventual flip to blocking), #1016
(already-shipped `--only`/`--skip` tooling), #1097 (the develop→staging leg incident this doc's
second section confirms stays fixed), #1063/#1066/#1253 (the advisory-only history of
`promotion-quality-gate.yml`), #927 (the original "where does this run" question #1018 resolves for
the fast subset), #1019 / ADR 0074 Decision 10 (the superseded standard gate 19 depended on), #514
(`verify-deployment.yml`, gate 18's residual-gap home), #1443 (the filed follow-up for gate 18's
residual gap).
