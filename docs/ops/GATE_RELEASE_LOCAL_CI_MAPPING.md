---
status: reference
authority_level: reference
owner: infra
last_reviewed: 2026-09-02
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

**Critical caveat that applies to every "(a) Covered" row below — updated 2026-09-02 (#1431 Phase
1, PR-A)**: `promotion-quality-gate.yml` (the CI workflow all "(a)" rows point at) was **entirely
advisory** as of #1063/#1066/#1253 — every step in every quality job carried its own
`continue-on-error: true`, so a red run never blocked a promotion PR's `mergeStateStatus`. That is
no longer true for 7 of the 8 "(a)" rows (4, 5, 9, 11, 12, 13, 15 — see each row's own updated
Status below): those 7 gates' CI steps are now blocking on the `release/*→main` leg (and
`staging→main`, and any `workflow_dispatch`/`workflow_call` run) — a real failure reds out the
check-run and trips `AGENTS.md`'s Merge Safety hard stop, same as any other required check. Row 10
(`backend.test_matrix`) is the one "(a)" row this does **not** apply to; it stays fully advisory,
see its own updated note. Per #1147's own "Must hold" bullet, a gate only moves from "local is
authoritative" to "CI replaces local" (i.e. drops out of `gate:release:local`'s required set) once
its CI job has been verified trustworthy against #1124's audit standard **and** proven blocking on a
real promotion (V1–V3 in the #1431 Phase 1 plan) — that hasn't happened yet for any gate, so
`gate:release:local` still runs and requires all 19 gates locally, including these 7, until the
separate follow-up PR (PR-B) that verification gates.

| # | Gate name | Local command (`gate-release-local.js`) | Status | CI job / detail |
|---|---|---|---|---|
| 1 | `release.target_sha` | `RELEASE_TARGET_SHA` env, else `git rev-parse HEAD` | **(c)** | The promoter's own checked-out git-branch state — exactly the example #1147's own body names. CI already has its own unambiguous SHA (`github.sha`); there is nothing to migrate. |
| 2 | `dependencies.audit.prod` | `node scripts/audit-dependencies.js --omit-dev` | **(b)** | No CI job runs this. Dependency-free node script auditing 6 lockfile trees (root, `apps/dgfy-api`, `apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`, `apps/dgfy-migration-runner`); needs npm-registry reachability only, no secrets. Add as a step in `promotion-quality-gate.yml`'s `repository-quality` job. |
| 3 | `dependencies.audit.full` | `node scripts/audit-dependencies.js` | **(b)** | Same script, without `--omit-dev`. Same recommendation as #2 — the two could share one `npm ci` and run as two steps. |
| 4 | `docs.lint` | `node scripts/lint-docs.js && npm run check:adr` (via `npm run lint:docs`) | **(a) — enforced in CI on release/\*→main since PR-A (local still required until PR-B)** | `repository-quality`'s "Run governed documentation lint" step runs the identical `npm run lint:docs`; that step's `continue-on-error` was removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 5 | `architecture.guardrails` | `cd apps/dgfy-api && npm run check:architecture-guardrails && npm run check:controller-boundaries` (via `npm run check:architecture`) | **(a) — enforced in CI on release/\*→main since PR-A (local still required until PR-B)** | `dgfy-api-quality`'s "Enforce modular architecture guardrails" + "Enforce controller architecture boundaries" steps run the identical two subcommands; both steps' `continue-on-error` was removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 6 | `compliance.contracts` | `node scripts/check-compliance-impact.js && node scripts/check-compliance-api-contracts.js` (via `npm run check:compliance`) | **(b)** | The blocking-capable mechanism already exists (`shared-changed-paths.yml`'s "Enforce compliance impact declarations" step, dependency-free per that file's own comment) but is (i) disabled by default for ordinary `develop`/`staging`/`main` PRs (`enforce_compliance_declarations: false` since 2026-08-07) and (ii) never invoked at all by `promotion-quality-gate.yml`. `gate-release-local.js` itself flags this gate `STRUCTURALLY_CANNOT_FAIL` on a clean checkout, so the cost of wiring it in is low. Until it's added, `pr-reviewer`'s SKILL.md already runs `npm run check:compliance` by hand during review as the stopgap. |
| 7 | `production.env.fixtures` | `node scripts/check-production-env-fixtures.js` | **(b)** | No CI job runs this. Pure/fixture-based — every value is a synthetic placeholder string (`FIXTURE_ADMIN_PASSWORD_HASH`, etc.), no live DB, no real secrets, no SOPS decryption. Cheap; natural fit for `repository-quality` or `dgfy-api-quality`. |
| 8 | `runtime.doctor` | `cd apps/dgfy-api && node scripts/doctor-runtime.js` (via `npm run doctor:runtime`) | **(b)** | No CI job runs this. Needs a live DB connection with migrations already applied, to audit schema readiness (`auditRuntimeSchemaReadiness`). `migration-runner-quality` already stands up a fresh `mysql:8.0` container and applies migrations against it — add `doctor:runtime` (or an equivalent check against that same fresh schema) as a follow-up step there rather than standing up a second DB. |
| 9 | `backend.lint` | `npm --prefix apps/dgfy-api run lint` | **(a) — enforced in CI on release/\*→main since PR-A (local still required until PR-B)** | `dgfy-api-quality`'s "Run API lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 10 | `backend.test_matrix` | `node scripts/run-backend-test-matrix.js` (via `npm run test:backend:matrix`) | **(a)**† — **still advisory; #1432 resolved the underlying rot/OOM, the flip to blocking is a separate PR (PR-A2)** | `dgfy-api-quality`'s "Run dgfy-api test matrix" step runs the identical command. † This is the gate #1147's own body calls the "hard technical prerequisite": it already runs in CI today, advisory, at ~20-24min per the #1015 baseline measurement — moving it from advisory to blocking before #1015 lands would reproduce #345's per-run cost problem in a new place, which is exactly what #1147/#1018 are structured to avoid. **Root cause confirmed 2026-09-02 (#1431 Phase 1 plan, §1b) and resolved 2026-09-02 (#1432, Phase 249):** the failure was never "just slow" — it was genuinely failing, both a hosted-runner OOM and real, deterministic test/fixture/snapshot rot. The OOM's actual mechanism (also root-caused by #1432, correcting the #1431-era hypothesis that it was a routing/heap decision tied to #1365/#1015): `ubuntu-latest` on this private repo is a 2-vCPU runner, so Jest's own `getMaxWorkers()` resolves to 1 and `shouldRunInBand()` then runs the entire 616-file fast tier in one in-band process, whose single V8 heap accumulates every file's ESM module registry until it hits the 4096MB cap (`Ineffective mark-compacts`) — not a heap-size problem, extrapolates to ~10.5GB on a 7GB box. Fixed by forcing the fast tier into real worker-process parallelism (`BACKEND_TEST_MATRIX_FAST_MAX_WORKERS: 2` + `--workerIdleMemoryLimit=1G`, `promotion-quality-gate.yml`), not by raising `NODE_OPTIONS` or reversing #1365's routing cutover. The 6 stale files (stale ESM mock factories, a stale seeded-industry count, a stale `LOCK.UPDATE` mock — the snapshot missing a `laundry` entry was already fixed on `develop` by #1436) are fixed; the fast tier's local false-pass is closed with `--ci` on both the fast and db-tier Jest invocations in `scripts/run-backend-test-matrix.js`; `tenantSchemaBootstrap.integration.test.js`'s db-tier timeout was raised to 300s (measured: a 139-table `sync({force:true})` alone takes ~235s, a 30s budget was never achievable). Flipping this gate to blocking, and delegating it out of `gate:release:local`'s required set, remain PR-A2/PR-B2 — out of #1432's own scope, per the issue's own scoping and #1147's mapping. |
| 11 | `frontend.ims.lint` | `npm --prefix apps/dgfy-ims run lint` | **(a) — enforced in CI on release/\*→main since PR-A (local still required until PR-B)** | `frontend-ims-quality`'s "Run dgfy-ims lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 12 | `frontend.pos.lint` | `npm --prefix apps/dgfy-pos run lint` | **(a) — enforced in CI on release/\*→main since PR-A (local still required until PR-B)** | `frontend-pos-quality`'s "Run dgfy-pos lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 13 | `frontend.storefront.lint` | `npm --prefix apps/dgfy-storefront run lint` | **(a) — enforced in CI on release/\*→main since PR-A (local still required until PR-B)** | `frontend-storefront-quality`'s "Run dgfy-storefront lint" step, identical command; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). |
| 14 | `frontend.contracts` | `cd apps/dgfy-ims && npx vitest run contract.test integration.test` (via `npm run test:frontend:contracts`) | **(b)** | Partial coverage, not a match. The local gate's pattern matches **103** files under `apps/dgfy-ims/src` + `packages/web-core/src` (measured 2026-09-02). `frontend-ims-quality`'s "Run shared F&B contract tests" step instead runs a hand-picked **7-file** list — a different command, not a subset selected from the same pattern, and not full coverage. Recommend broadening that CI step to the same `contract.test integration.test` pattern the local gate uses, rather than maintaining a parallel hand-picked file list that can silently drift (the exact class of gap `gate-release-local.js:183-188`'s own comment already documents for `frontend.contracts` once before, re: storefront). |
| 15 | `frontend.storefront.contracts` | `cd apps/dgfy-storefront && npx vitest run contract.test integration.test` (via `npm run test:frontend:contracts:storefront`) | **(a)**† — **enforced in CI on release/\*→main since PR-A (local still required until PR-B)** | `frontend-storefront-quality`'s "Run storefront vitest suite" step runs unfiltered `npx vitest run`; `continue-on-error` removed 2026-09-02 (#1431 Phase 1, PR-A). Storefront's `vite.config.js` `test.exclude` only excludes `tests/e2e/**` (Playwright's own domain) — every other vitest file runs, which is a strict superset of the local gate's 26-file `contract.test`/`integration.test` pattern. † Superset, not identical command — flagged so a future edit to either side doesn't assume byte-for-byte parity. |
| 16 | `frontend.budgets` | `node scripts/check-frontend-budgets.js` (via `npm run check:frontend-budgets`) | **(b)** | No CI job runs this. Requires built `dist/assets/` output for all three frontend apps (`REQUIRED_APP_ASSET_DIRS`). `frontend-storefront-quality` already builds (`npm run build`), but `frontend-ims-quality` and `frontend-pos-quality` are lint-only today — no build step exists for either. Add production builds to those two jobs first (a real prerequisite, not just missing wiring), then add `check:frontend-budgets` as a step once all three builds exist in the same run. |
| 17 | `scroll.contracts` | `npm --prefix apps/dgfy-ims test -- --run <2-file scroll-contract suite>` | **(b)** | No CI job runs this. A small, fixed 2-file vitest suite (`terminalResponsiveScroll.contract.test.js`, `scrollKeyControls.behavior.test.js`) that overlaps with neither `frontend-ims-quality`'s 7-file F&B list nor gate #14's broader pattern — the second file's name doesn't even match `contract.test`/`integration.test`, so broadening #14 per its own recommendation still wouldn't catch it. Add as its own CI step (or fold explicitly into a broadened #14 step, mirroring the local gate's exact file list) rather than assuming either existing step already covers it. |
| 18 | `observability.evidence.report` | `node scripts/gate-release-observability.js --evidence-dir <dir>` (via `npm run gate:release:observability`) | **(c)** | Probes a **live deployed environment** (`OBSERVABILITY_BASE_URL`/`PROD_BASE_URL`/`QA_BASE_URL`, hitting `/api/v1/health` and, if enabled, `/metrics`) — this is a post-deploy check, not a pre-merge static/build-time one. `STRUCTURALLY_CANNOT_FAIL` in the normal case (warns, never fails, unless run with `--enforce`, which `gate-release-local.js` never passes). Overlaps in spirit with `verify-deployment.yml`'s read-only health poll (dispatched by the Verifier role post-deploy) rather than with a promotion-PR-time gate — if this is ever wired anywhere, that's the more natural home, not `promotion-quality-gate.yml`. |
| 19 | `release.verdict.contract` | `node scripts/verify-release-verdict.js --file <verdict> --sha <sha>`, only if the file exists; else auto-skip | **(c)** | Auto-skips ("Skipped: verdict file not present") whenever no `release_verdict.json` exists for the target SHA — the normal case; also `STRUCTURALLY_CANNOT_FAIL` for the same reason. No CI pipeline in this repo currently produces that artifact for `promotion-quality-gate.yml` (or anything else) to consume. Revisit only if/when a governed release-verdict artifact pipeline exists — nothing to wire today. |

## Summary by status

- **(a) Covered, advisory-only**: 8 gates — #4, #5, #9, #10, #11, #12, #13, #15. All run the same
  (or, for #15, a superset) command in `promotion-quality-gate.yml` today, but none of them block a
  merge yet (see the caveat above). #10 additionally carries #1147's own named hard dependency on
  #1015.
- **(b) CI job to add**: 8 gates — #2, #3, #6, #7, #8, #14, #16, #17. None of these are blocked on
  #1015/#1018 the way #10 is — most are cheap, dependency-free node scripts (#2, #3, #6, #7) that
  could be added to `repository-quality` with little cost; #8, #14, #16, #17 each carry a specific
  named prerequisite or correction (a DB already up, a broadened test pattern, a missing build step,
  a distinct file list) rather than being pure gaps.
- **(c) Stays local-only**: 3 gates — #1, #18, #19. Each for a distinct, documented reason: the
  promoter's own git-branch state, a live-deployed-environment probe that's a different kind of
  check than a promotion-PR gate, and an artifact-dependent check with no producing pipeline.

None of the above is implemented by this document — see #1147's own scope for the follow-up
sequencing (#1015 lands, #1018 lands as the first milestone, then this table's "(b)" rows are
revisited one at a time per #1018's own "CI-replaces-local vs. stay-complementary" open question,
gate by gate, not as one blanket policy).

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

#1147 (this doc's parent, partially resolved by it — not closed), #1124 (pipeline-trust epic this
mapping's advisory-caveat depends on), #1018 (fast-tier CI wiring, first migration milestone),
#1015 (hard prerequisite for gate #10), #1016 (already-shipped `--only`/`--skip` tooling), #1097
(the develop→staging leg incident this doc's second section confirms stays fixed), #1063/#1066/#1253
(the advisory-only history of `promotion-quality-gate.yml`), #927 (the original "where does this
run" question #1018 resolves for the fast subset).
