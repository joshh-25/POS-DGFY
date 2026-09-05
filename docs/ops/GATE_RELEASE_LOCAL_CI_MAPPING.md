---
status: reference
authority_level: reference
owner: infra
last_reviewed: 2026-09-05
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

`scripts/gate-release-local.js`'s `GATE_NAMES` array (17 entries, in the order the script runs
them, as of #1278 PR 2 / Phase 298 — see "A new gate after the mapping closed" below) is the source
of truth for the left column — read it there before trusting a stale copy here.
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
`scripts/gate-release-local.js`'s `CI_ENFORCED_GATES` map (17 entries as of #1278 PR 2 / Phase 298
— 16 from the original 19-gate mapping, plus `release.notes`, the first gate added after this
umbrella closed; see "A new gate after the mapping closed" below), cross-checked by
`scripts/check-pr-quality-workflow.js`'s `checkCiEnforcedGatesAreBlocking()` so a future edit cannot
silently regain `continue-on-error` on a supposedly-blocking step without failing that checker. Of
those 17:

- **14 are genuinely blocking** on the `release/*→main` leg (and `staging→main`, and any
  `workflow_dispatch`/`workflow_call` run) — a real failure reds out the job's check-run and trips
  `AGENTS.md`'s Merge Safety hard stop, same as any other required check.
- **3 are deliberately advisory**, named in `check-pr-quality-workflow.js`'s
  `ADVISORY_CI_ENFORCED_GATES` allowlist so `checkCiEnforcedGatesAreBlocking()` doesn't demand
  blocking coverage that will never (yet) exist for them:
  - `dependencies.audit.full` (row 3) — **permanently** advisory (Pat's call, settled this phase,
    superseding the "not yet decided" flag the Phase 2 version of this doc carried). Its verdict
    depends on the npm registry, not the repo; a fresh dev-only advisory can flip it red with zero
    code change here, and its findings never ship.
  - `backend.test_matrix` (row 10) — **temporarily** advisory, tracked by #1469, gated on #1015
    (fast/DB tier split) and #925 (hanging `beforeAll`). Confirmed still genuinely failing (not
    just slow) on every #1431 Phase A/C evidence run.
  - `release.notes` — **temporarily** advisory by deliberate rollout design (ADR 0082 Decision 8),
    not a prerequisite or flake exception like the two above: it ships advisory on first landing and
    flips blocking only once a later, dedicated phase finds clean-run evidence (ADR 0082 Follow-up
    1), mirroring `check:app-versions`' own advisory-to-blocking rollout (ADR 0081 Decision 9). See
    "A new gate after the mapping closed" below.

`gate:release:local`'s required-locally count is **0** — every gate that isn't one of the 3 retired
rows below is now delegated. `docs/testing/release-go-no-go-checklist.md` and
`.agents/skills/promoter/SKILL.md` have been updated to stop citing `gate:release:local` as a
pre-`main` step; `promotion-quality-gate.yml`'s own quality jobs are the sole remaining enforcement
mechanism.

## A new gate after the mapping closed (#1278 PR 2, Phase 298)

`release.notes` (ADR 0082 Decision 8, `scripts/check-release-notes.js` / `npm run
check:release-notes`) is **not** one of the 19 original gates this document otherwise maps — it was
born directly in CI, advisory, after #1431 Phase C/D already closed that mapping at 16 remaining
gates. It is registered in `GATE_NAMES`/`CI_ENFORCED_GATES` anyway (unlike `check:app-versions`,
which uses its own separate `shared-changed-paths.yml`/`pr-checks.js` toggle mechanism — see that
gate's own section below) because its CI destination lives inside `promotion-quality-gate.yml`
itself (the `run_release_notes` step, `repository-quality` job), exactly the surface
`CI_ENFORCED_GATES`/`BLOCKING_STEP_IDS`/`ADVISORY_CI_ENFORCED_GATES` already track — reusing that
apparatus means a future flip to blocking (ADR 0082 Follow-up 1) is validated by the same
`checkCiEnforcedGatesAreBlocking()`/`checkStepLevelAdvisory()` machinery every other gate's flip
already goes through, rather than inventing a second toggle. `STRUCTURALLY_CANNOT_FAIL` also lists
it: outside a real `release/<candidate_id>-rN` head, the check resolves "not applicable" and exits
0, so a local `gate:release:local` run never exercises its actual validation logic — same shape as
`compliance.contracts`' own entry in that set. Validates: `docs/releases/notes/<candidate_id>.md`
exists, its frontmatter (`schema`, `candidate_id`, `production_date`, `production_commit` — either
`pending` or a real 40-hex SHA), its per-app version table against `apps/<app>/package.json` at
head, and its required `## Included`/`## Operational notes` sections. Does not cover a `main`
hotfix's `fix/*` branch — that path's obligation stays procedural, via
`.agents/skills/incident-responder/SKILL.md`, per ADR 0082 Decision 8's own "path coverage"
paragraph.

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

- **(a) Covered, all closed**: 16 gates — #2 through #17 (this doc's own original-19 numbering).
  All run the same (or, for #15, a superset; for #16, a deliberately different build orchestration
  — see the documented exception below) command in `promotion-quality-gate.yml`, and every one is
  delegated out of `gate:release:local`'s required set. Of these:
  - **14 are blocking**: #2, #4, #5, #6, #7, #8, #9, #11, #12, #13, #14, #15, #16, #17.
  - **2 stay deliberately advisory**, named in `ADVISORY_CI_ENFORCED_GATES`: #3
    (`dependencies.audit.full`, **permanent** — registry-dependent, findings never ship) and #10
    (`backend.test_matrix`, **temporary** — tracked by #1469, gated on #1015/#925).
  `CI_ENFORCED_GATES` itself now carries **17** entries, `required_gate_count: 0` on a default run
  — the 16 above, plus `release.notes` (also advisory, not one of the original 19; see "A new gate
  after the mapping closed" above).
- **(b) CI job to add**: 0 gates.
- **(c) Resolved without a CI job, gate row retired**: 3 gates — #1, #18, #19, retired 2026-09-02
  by #1431 Phase 3 (Phase 250). `GATE_NAMES` stood at 16 entries at that point (17 now — see "A new
  gate after the mapping closed" above). Closeout records below. Each was
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

## `check:app-versions` flip-readiness (#1569, epic #1548 Wave 2) — separate mechanism, not one of
the 19 gates above

`check:app-versions` (`scripts/check-app-version-bump.js`, shipped advisory by #1560/PR #1562) is
not part of the 19-gate `gate:release:local` mapping this document otherwise tracks — it's a
`shared-changed-paths.yml`/`pr-checks.js` PR-time check, not a `gate-release-local.js` gate. It gets
its own short section here because it follows the same advisory-to-blocking shape this document's
gates do, and #1569 asked this status be recorded in both this doc and
`docs/ops/RELEASE_CANDIDATE_POLICY.md` — that doc's 2026-09-04 dated Amendments entry recorded the
mechanism being built (still advisory), and its 2026-09-05 dated Amendments entry recorded the flip
itself (the current status below); both kept in sync with this section, not a duplicate to maintain
independently.

**Current status: BLOCKING, flipped 2026-09-05 (#1592, epic #1548, Phase 283).** Per
[ADR 0081](../architecture/adr/0081-per-app-container-semantic-versioning.md) Decision 9, the check
flips to blocking only once real evidence exists — either 10 merged `develop`-base PRs since PR
#1562's merge commit with `check:app-versions` recorded pass/warn (not a crash), or one full
`develop → staging → main` promotion cycle green throughout. `scripts/check-version-bump-flip-
readiness.js` measures that threshold live from GitHub's own check-run/job-log history via `gh api`
(no local counter file) — run it by hand (`npm run check:version-bump-flip-readiness`) before ever
touching the toggle below.

The PR-count path was re-confirmed live at #1592's implementation time (not reused from that
issue's 2026-09-05 filing-time snapshot, which itself was already a re-confirmation of an earlier
count): `10 of 10 qualifying develop-base PRs` since PR #1562's merge commit
(`5eb17c3426251990d364544e3ad5fbb1a839a35e`) — 7 `pass` (#1591, #1583, #1582, #1581, #1580, #1579,
#1578) + 3 `warn` (#1586, #1567, #1566), promotion-cycle evidence still `none yet`. #1592 also found
and fixed a bug the flip would otherwise have shipped silently broken: `scripts/pr-checks.js`'s own
`app version bump` check hardcoded its result to `'pass'`/`'warn'` regardless of the `blocking`
argument, so `computeOverallResult()` could never actually reach `FAIL` for it (a `'warn'` only ever
degrades `PASS` to `PARTIAL`) — see `scripts/pr-checks.js`'s `resolveAppVersionsCheckResult()` and
its own header comment for the fix. The `shared-changed-paths.yml` surface had no equivalent bug —
its `continue-on-error:` expression already read the toggle's boolean output directly.

**The toggle mechanism** — deliberately not this document's own gate-table pattern (edit the
workflow YAML's `continue-on-error:` literal directly, PR #1550/#1551's Phase 272 precedent), and
not `scripts/lib/runner-routing-state.js`'s declared-constant-plus-checker pattern either (that one
exists because a `runs-on:` site can't be computed from a JS module at workflow-parse time, so two
hand-edited surfaces are kept in sync by a validator script instead). This toggle has a single
source that both consumers read directly at runtime, since a step's `continue-on-error:` CAN take a
`${{ }}` expression against a prior step's output:

- `scripts/lib/version-bump-gate-toggle.js` exports one constant, `BLOCKING` (currently `true`,
  flipped 2026-09-05 — see the "Armed" paragraph below).
- `.github/workflows/shared-changed-paths.yml`'s "Load check:app-versions gate toggle" step reads it
  via `node -e` and exposes it as a step output; the "Enforce per-app version bump on source
  changes" step's own `continue-on-error:` reads that output.
- `scripts/pr-checks.js` requires the same module directly for the same check's `blocking` argument
  to `addCheck()`.

**Armed** (#1592, 2026-09-05, a later, separate, human-confirmed PR — not part of #1569's own
scope): confirmed `node scripts/check-version-bump-flip-readiness.js` reported the threshold met,
then flipped exactly one line — `version-bump-gate-toggle.js`'s `BLOCKING` constant, `false → true`.
Both consumers move together from that one edit alone — `scripts/pr-checks.js` needed a small,
separate fix alongside it (see above) to actually honor the toggle's value, but that fix lives in
the consuming surface itself, not as a second hand-kept-in-sync toggle; there is still no separate
"keep two files in sync" checker to maintain, unlike the runner-routing convention this section
explicitly avoided.

## Promotion-time per-app version gates (#1588, epic #1548 Wave 4) — separate mechanisms, not one of
the 19 gates above

Two more ADR 0081 mechanisms that get their own short section here for the same reason
`check:app-versions` does immediately above: they follow the same "register the status here and in
`docs/ops/RELEASE_CANDIDATE_POLICY.md`" pattern #1569 established, but neither is a
`gate-release-local.js` gate or a `pr-checks.js` PR-time check — both run only at promotion time,
invoked by `promoter` directly against a specific candidate, never by CI.

**Promoter pre-cut floor step** (ADR 0081 Decision 6) — `node scripts/check-app-version-bump.js
--floor --base origin/staging --head origin/develop`, run before cutting
`to-staging/<candidate_id>`. Reuses `check-app-version-bump.js`'s existing floor logic (already
shipped by #1560/PR #1562 for the PR-time check above); this is a second, standalone entry point
into the same script (`--floor` mode), not a new script. **Status: live from this PR (#1588) on** —
unlike `check:app-versions` itself, there is no advisory-to-blocking rollout here to track; the
floor check either exits clean or the promoter opens a bump PR before cutting, every time.

**Promotion parity gate** (ADR 0081 Decision 8) — `scripts/check-image-version-parity.js` (new),
comparing the `org.dgfy-platform.candidate-source-sha` OCI label (also new, stamped by
`deploy-api.yml`/`deploy-migration-runner.yml`/`deploy-frontend.yml` at build time from a
`candidate_source_sha` input the promoter threads through `deploy.yml`/`deploy-main.yml`) between
each app's `X.Y.Z-staging` and bare `X.Y.Z` published images. **Resolved per app since #1610 (ADR
0081 Decision 8 amendment)** — an app never touched by a staging repair keeps its earlier candidate
identity for the life of the candidate rather than being compared against whatever the latest repair
advanced `current_staging_sha` to; see that ADR's matching 2026-09-04 Amendment for the full
mechanism. **Correction this PR made, worth
recording here since Phase 277's own ledger entry claimed otherwise:** Phase 277 (#1575/PR #1577)
did not actually add this label — only `org.opencontainers.image.version` and the `version_tag`
output. This PR adds the label-stamping step Phase 277's own text (and ADR 0081 Decision 8's
original wording) assumed already existed. `docs/architecture/adr/0081-per-app-container-semantic-versioning.md`'s
own `## Amendments` block records the same correction on the ADR side.

Both mechanisms are read-only/unattended, same tier as `verify-deployment.yml`/
`tenant-schema-report.yml` — see `.agents/skills/promoter/SKILL.md`'s checkpoint table. Full
procedure: `.agents/skills/promoter/references/promotion-runbook.md`. Neither has yet been exercised
against a real `to-staging`/`release` promotion — see #1588's own PR for what was and wasn't tested
(unit tests + shape checks against synthetic fixtures and this repo's real workflow files, no live
GHCR push/build).

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
residual gap), #1569 / #1548 / #1560 / ADR 0081 Decision 9 (the `check:app-versions` flip-readiness
mechanism, a separate advisory-to-blocking check this document also tracks — see the section above,
not part of the 19-gate mapping itself).
