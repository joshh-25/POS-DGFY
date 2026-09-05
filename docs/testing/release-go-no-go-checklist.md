---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-09-04
applies_to: pre_promotion_quality_gate
topic: pre_promotion_local_gate
---

# Release Go/No-Go Checklist

## This is no longer a pre-`main` step (updated 2026-09-03, #1431 Phase C/D)

`npm run gate:release:local` (`scripts/gate-release-local.js`) was the pre-promotion quality gate
for this repository through 2026-09-02. As of #1431 Phase C/D (2026-09-03), every one of its 16
remaining gates is delegated to `promotion-quality-gate.yml`'s own quality jobs. A 17th gate,
`release.notes` (ADR 0082 Decision 8), was added by #1278 PR 2 / Phase 297 — see the table below.
`CI_ENFORCED_GATES` now carries **17** entries, `required_gate_count: 0` on a default run. **A
promoter no longer runs this script before a `develop -> main` (or `staging -> main`) promotion** —
the workflow's own blocking check-runs (14 of the 17 gates) plus its three deliberately advisory
ones (`dependencies.audit.full`, permanently; `backend.test_matrix`, temporarily, tracked by #1469;
`release.notes`, temporarily by deliberate rollout design, tracked by ADR 0082 Follow-up 1) are the
enforcement mechanism now. `docs/ops/RELEASE_CANDIDATE_POLICY.md` and
`.agents/skills/promoter/SKILL.md` no longer list this script as a promotion gate.

This document stays as **a runbook for what the 17 gates mean and how to run one manually** — via
`--only <name>`/`--include-ci-enforced` (see "How to run it" below) — for local debugging of a
specific check, not as a mandatory promotion step. #372 (a testing agent/skill), if built, should
still prefer invoking a gate's own command over reimplementing it.

This gate is one rung of a larger verification ladder — the compliance preflight sweep and the
live-credential-dependent payment checks are separate rungs with their own placement and are not
folded into this gate. See `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment,
"Compliance verification ladder," for the full picture and why nothing on this ladder is a
production precondition.

This document is a runbook: how to run the gate and what its 16 checks mean. It is not a release
ledger — dated pass/fail evidence for individual releases belongs in
`.tmp/release-gates/<sha>/local_readiness.json` and, if worth keeping past that SHA's lifetime, a
dated file under `docs/archive/testing/`. The prior 100-entry evidence log that used to live in this
file was archived on 2026-08-12; see `docs/archive/testing/2026-08/`.

## How to run it

The gate needs `node` and a real MySQL 8 + Redis for the backend test matrix — the darwin-arm64 host
has neither by default, so on that host run it inside Docker against the already-provisioned test
containers (`dgfy-mysql-test` / `dgfy-redis-test` on the `dgfy-local-test` network, or spin up fresh
ones with the same shape):

Earlier versions of this command bind-mounted `$PWD` directly; the container's own
`npm run install:all` step (needed because the fresh image has no `node_modules`) rewrote
lockfiles in the real working tree during the 2026-09-01/02 promotion (#1358) — this scratch-copy
step exists to make that impossible, not just unlikely:

```bash
# The container's own `npm run install:all` needs somewhere to write `node_modules` (and, if npm's
# lockfile normalization kicks in on a version mismatch, rewritten lockfiles) — never let that land
# in this checkout. Copy the repo into a disposable scratch directory next to it and mount that
# instead of `$PWD` directly (#1358). Using a sibling of the repo, not /tmp, guarantees the path is
# already inside whatever Docker Desktop file-sharing root makes `$PWD` itself mountable today.
GATE_SCRATCH=$(mktemp -d "$(dirname "$PWD")/.dgfy-gate-scratch-XXXXXX")
rsync -a --exclude='node_modules' --exclude='**/node_modules' --exclude='.tmp' "$PWD"/ "$GATE_SCRATCH"/

docker run --rm --network dgfy-local-test -v "$GATE_SCRATCH":/repo -w /repo \
  -e NODE_OPTIONS="--max-old-space-size=4096" -e NODE_ENV=test \
  -e DB_HOST=dgfy-mysql-test -e DB_PORT=3306 \
  -e DB_NAME=sku_inventory_manager_test -e DB_NAME_TEST=sku_inventory_manager_test \
  -e DB_USER=root -e DB_PASSWORD=testpassword \
  -e REDIS_URL=redis://dgfy-redis-test:6379 \
  -e JWT_SECRET=ci_jwt_secret_key_for_tests_only_123456 \
  -e REFRESH_TOKEN_SECRET=ci_refresh_secret_key_for_tests_only_123 \
  -e RELEASE_TARGET_SHA="$(git rev-parse HEAD)" \
  node:22-alpine sh -c 'npm run install:all && npm run gate:release:local'
GATE_EXIT=$?

# Copy the evidence artifact back — it's the only output anyone needs out of the scratch copy —
# then discard the rest. Capture the exit code above first: without it, this cleanup's own exit
# status would silently overwrite a real gate failure.
mkdir -p .tmp/release-gates
cp -R "$GATE_SCRATCH"/.tmp/release-gates/. .tmp/release-gates/ 2>/dev/null
rm -rf "$GATE_SCRATCH"
exit $GATE_EXIT
```

`node_modules` is deliberately excluded from the copy, not just for `.gitignore` parity — copying
host-built `node_modules` in would let npm treat dependencies as already satisfied and skip
reinstalling them for Linux/musl, silently reproducing the exact "eslint: not found"/"Jest binary
not found" failure the container-install step exists to prevent. The evidence copy-back step is
required, not optional — `.tmp/release-gates/<sha>/local_readiness.json` is what the rest of this
doc (and the promotion runbook, which pastes its result into the promotion PR) points at as *the*
evidence location; skipping the copy-back would silently make that path stop existing for
Docker-run gates.

On a host with node, MySQL, and Redis already configured (e.g. Pat's own VM), plain
`npm run gate:release:local` is enough — it reads `RELEASE_TARGET_SHA` from the environment and
falls back to `git rev-parse HEAD`.

The only env var the script itself reads is `RELEASE_TARGET_SHA`. Everything else (DB/Redis
connection, JWT secrets) is read by the child processes it spawns, exactly as in CI.

## The 17 gates

`scripts/gate-release-local.js` runs these in order — a failing gate does not stop the run, and
every gate's result is recorded. Exit code is `2` if any gate failed, `0` if all passed; the JSON
artifact is written either way. Since #1016, `--only <name,name>` / `--skip <name,name>` filter
which gates actually run (everything else is recorded `status: "skipped"`, `duration_ms: 0`), and
the artifact carries `run_mode: "full"|"partial"` plus per-gate `duration_ms` — a partial run's
`verdict: "pass"` is not evidence of a full pass; check `run_mode` first.

Three gates (`release.target_sha`, `observability.evidence.report`, `release.verdict.contract`
— formerly #1, #18, #19) were retired 2026-09-02 by #1431 Phase 3. Their closeout records are
in `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`, "Retired gates — closed resolutions."

**Delegation, completed 2026-09-03 (#1431 Phase 1 PR-B through Phase C/D) for the original 16, and
extended 2026-09-06 (#1278 PR 2 / Phase 297) with a 17th: none of the gates below "run" here by
default.** Every one runs an identical command as a step in `promotion-quality-gate.yml`; 14 are
blocking on the `release/*→main` leg, and 3 (`dependencies.audit.full`, `backend.test_matrix`,
`release.notes`) are deliberately advisory (see `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s
"Current state" and "A new gate after the mapping closed" sections for exactly which and why).
Each is recorded `status: "delegated_to_ci"`, `ok: true`, `duration_ms: 0`, and logged as
`[CI] <gate> :: enforced by promotion-quality-gate.yml / <job> / <step(s)>`. This does **not** flip
`run_mode` to `"partial"` — a default run that delegates all 17 is still `"full"`; `run_mode` tracks
whether the caller passed `--only`/`--skip`, not whether a gate ran locally or in CI. Two escape
hatches: `--include-ci-enforced` runs every gate locally anyway; naming a delegated gate explicitly
via `--only` also runs it (an explicit `--only` is an explicit request, never silently delegated).
A delegated gate's `ok: true` must not be over-read as "this ran and passed" — see the artifact's
`required_gate_count`/`delegated_gate_count`/`ci_enforced_gates` fields below, which exist
specifically so a reader doesn't have to infer delegation from an unusually-fast `duration_ms: 0`.
`scripts/check-pr-quality-workflow.js`'s `checkCiEnforcedGatesAreBlocking()` is the compensating
control that keeps `CI_ENFORCED_GATES` and `promotion-quality-gate.yml`'s actual blocking-step ids
in sync (via a three-name `ADVISORY_CI_ENFORCED_GATES` allowlist for the 3 deliberately-advisory
gates) — a future edit that silently regains `continue-on-error` on one of the other 14 steps fails
that check rather than silently reopening a coverage hole on both sides at once. Combined with the
3 gates retired by Phase 3 above, the **original** 19-gate mapping's own required set is **0**
(19 − 3 retired − 16 delegated) — see `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md` for the full
gate-by-gate closeout. `release.notes` (gate 17 below) sits outside that original count entirely —
it was added after the mapping closed, not one of the 19.

| # | Gate name | Command | Notes |
|---|---|---|---|
| 1 | `dependencies.audit.prod` | `npm run audit:dependencies:prod` | `scripts/audit-dependencies.js --omit-dev` audits every tree unconditionally and independently: root, `apps/dgfy-api`, `apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`, `apps/dgfy-migration-runner`, `tests/frontend-cross-app`. `packages/web-core` has no lockfile and no `node_modules`, so it is not an audit tree of its own. **[CI, delegated + blocking 2026-09-03, Phase C/D]** |
| 2 | `dependencies.audit.full` | `npm run audit:dependencies` | Same runner and same seven trees, including dev dependencies. **[CI, delegated, PERMANENTLY advisory 2026-09-03, Phase C/D — registry-dependent, findings never ship]** |
| 3 | `docs.lint` | `npm run lint:docs` | Validates every doc in `docs/_meta/document-registry.json` (this doc included) plus `check:adr`. **[CI, delegated + blocking 2026-09-03 PR-B]** |
| 4 | `architecture.guardrails` | `npm run check:architecture` | `check:architecture-guardrails` + `check:controller-boundaries` inside `apps/dgfy-api`. **[CI, delegated + blocking 2026-09-03 PR-B]** |
| 5 | `compliance.contracts` | `npm run check:compliance` | `check-compliance-impact.js` + `check-compliance-api-contracts.js`. **[CI, delegated + blocking 2026-09-03, Phase C/D]** |
| 6 | `production.env.fixtures` | `npm run check:production-env` | Validates production env-var fixture coverage (hosting profiles, PayMongo, etc.). **[CI, delegated + blocking 2026-09-03, Phase C/D]** |
| 7 | `runtime.doctor` | `npm run doctor:runtime` | `apps/dgfy-api`'s migration/column drift check. **[CI, delegated + blocking 2026-09-03, Phase C/D]** |
| 8 | `backend.lint` | `npm --prefix apps/dgfy-api run lint` | ESLint on `apps/dgfy-api/src`. **[CI, delegated + blocking 2026-09-03 PR-B]** |
| 9 | `backend.test_matrix` | `npm run test:backend:matrix` | The full chunked Jest matrix (`scripts/run-backend-test-matrix.js`) — needs real MySQL + Redis. The expensive gate; see cost below. **[CI, delegated, TEMPORARILY advisory 2026-09-03, Phase C/D — tracked by #1469, gated on #1015/#925]** |
| 10 | `frontend.ims.lint` | `npm --prefix apps/dgfy-ims run lint` | ESLint on `apps/dgfy-ims`. **[CI, delegated + blocking 2026-09-03 PR-B]** |
| 11 | `frontend.pos.lint` | `npm --prefix apps/dgfy-pos run lint` | ESLint on `apps/dgfy-pos`. **[CI, delegated + blocking 2026-09-03 PR-B]** |
| 12 | `frontend.storefront.lint` | `npm --prefix apps/dgfy-storefront run lint` | ESLint on `apps/dgfy-storefront`. Each app lints separately since the frontend split (ADR 0071); there is no single frontend lint gate anymore. **[CI, delegated + blocking 2026-09-03 PR-B]** |
| 13 | `frontend.contracts` | `npm run test:frontend:contracts` | `vitest run` filtered to `contract.test`/`integration.test`, run from `apps/dgfy-ims`. Because that workspace's Vitest `include` also covers `packages/web-core/**`, this gate exercises the shared trunk's contract suites as well as IMS's own. It does **not** cover POS-only or Storefront-only contract specs — run those from their own workspaces. **[CI, delegated + blocking 2026-09-03, Phase C/D]** |
| 14 | `frontend.storefront.contracts` | `npm run test:frontend:contracts:storefront` | The Storefront-workspace equivalent of gate 13 — added alongside the per-app lint fan-out (#322) but never added to this table (RF-3, PR #513); this row closes that gap. **[CI, delegated + blocking 2026-09-03 PR-B]** |
| 15 | `frontend.budgets` | `npm run check:frontend-budgets -- --report <dir>/frontend-budgets/frontend_budget_report.json` | Defaults to `owned-build` mode — builds all three apps itself (`npm --prefix apps/dgfy-ims run build`, then `apps/dgfy-pos`, then `apps/dgfy-storefront`) and reads `apps/<app>/dist/assets`. This is why the gate is slow even beyond the test matrix. **[CI, delegated + blocking 2026-09-03, Phase C/D — CI runs a different command shape (`--skip-build --built-after`, three separate serial build steps), see `GATE_RELEASE_LOCAL_CI_MAPPING.md`'s documented exceptions]** |
| 16 | `scroll.contracts` | `npm --prefix apps/dgfy-ims test -- --run <2 POS scroll-contract spec files>` | Narrow, named-file regression pin on `packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js` and `packages/web-core/src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js`, invoked from the IMS workspace because `packages/web-core` has no test runner of its own. **[CI, delegated + blocking 2026-09-03, Phase C/D]** |
| 17 | `release.notes` | `npm run check:release-notes` | ADR 0082 Decision 8 (#1278 PR 2, Phase 297): validates a `release/<candidate_id>-rN` head carries a matching `docs/releases/notes/<candidate_id>.md` (schema, candidate_id, production_date, production_commit — `pending` or a real 40-hex SHA — the app version table, and required `## Included`/`## Operational notes` sections). Resolves "not applicable" (exit 0) on any other head, including a `main` hotfix's `fix/*` branch. Added after the original 19-gate mapping closed — not one of that count. **[CI, delegated, TEMPORARILY advisory 2026-09-06 by deliberate rollout design — flips blocking once a later phase finds clean-run evidence, ADR 0082 Follow-up 1]** |

One gate is structurally incapable of failing on a clean promotion checkout —
`compliance.contracts` (no compliance-relevant diff to flag) — and the artifact marks it
`structurally_cannot_fail: true` (#1016) so a green result on it is never cited as evidence.
`release.notes` (gate 17) carries the same flag for a different reason: outside a real
`release/<candidate_id>-rN` head it resolves "not applicable," so a local run never exercises its
actual validation logic. Neither flag prevents genuine blocking coverage in CI where it applies —
`compliance.contracts` is confirmed blocking by PR #1458's fault-probe run; `release.notes` stays
advisory regardless (see the table row above). The other two gates that used to carry that flag
(`observability.evidence.report`, `release.verdict.contract`) were retired outright by #1431
Phase 3 rather than left green and un-citable.

Evidence: `.tmp/release-gates/<sha>/local_readiness.json` — `generated_at`, `target_sha`, `run_mode`
(`full`/`partial`), `selection` (`{only, skip}`), `verdict` (`pass`/`fail`), `gate_count` (17),
`failed_gate_count`, `skipped_gate_count`, `required_gate_count` (gates that actually ran locally,
excluding delegated and skipped — **0** on a default run since 2026-09-03, #1431 Phase C/D),
`delegated_gate_count` (all 17 gates, recorded `delegated_to_ci` by default), and
`ci_enforced_gates` (the 17 gate names `CI_ENFORCED_GATES` covers) — plus each gate's
`{name, ok, status, detail, duration_ms, structurally_cannot_fail}` (`status` now also takes the
value `"delegated_to_ci"`, alongside `"pass"`/`"fail"`/`"skipped"`). Since nothing runs locally by
default any more, the promotion PR's own `promotion-quality-gate` check-run is the evidence a
promoter cites — this artifact is now primarily useful for `--only`/`--include-ci-enforced` local
debugging runs, not as promotion evidence.

## Measured cost (2026-08-12, target SHA `df5e72b0`, `develop`)

> **Read as a dated measurement, not as current gate shape.** This run predates two changes:
> `scripts/audit-dependencies.js` replaced the `&&`-chained audit (#381), so the short-circuit
> described below no longer happens; and the frontend split (ADR 0071) replaced the single
> `apps/dgfy-web` workspace with `apps/dgfy-ims` / `apps/dgfy-pos` / `apps/dgfy-storefront` +
> `packages/web-core`, taking the gate from 16 checks to 18. Gate numbers and workspace names in
> this section are preserved as recorded on the day of the run; use the table above for the
> current shape.

Run end-to-end against the already-warm `dgfy-mysql-test` / `dgfy-redis-test` Docker containers (no
`npm ci` needed — all three `node_modules` trees were already populated). Full evidence:
`.tmp/release-gates/df5e72b01a0e5d082ae68eae0330c519285cb44c/local_readiness.json`.

**Total wall-clock: ~24-25 minutes. Verdict: `fail` — 5 of 16 gates failed, all for real reasons, none
flakiness.** `backend.test_matrix` alone took **19.6 minutes** (491 active tests, 65 chunks) — slower
than #345's ~14.2min measurement, plausibly Docker-Desktop bind-mount I/O overhead on this host rather
than a repo-side regression; worth re-measuring on Pat's actual VM. This answers the issue's question
directly: yes, the same order-of-magnitude cost #345 found shows up here too, and it is the single
largest contributor to total gate time.

Gates 1 (`release.target_sha`), 4–11 (`docs.lint` through `backend.test_matrix`), and 15–16
(`observability.evidence.report`, `release.verdict.contract`) passed clean. The 5 failures, on
current `develop` HEAD:

1. **`dependencies.audit.prod` / `dependencies.audit.full`** — a real high-severity `axios` advisory
   in the root dependency tree (`axios@^1.16.1`, fix available). Confirms the `&&`-chain note above
   concretely: because the root tree failed first, **`apps/dgfy-api` and `apps/dgfy-web` were never
   even reached** by either audit command in this run.
2. **`frontend.contracts`** — 64 of 524 tests failed across 14 of 99 test files (85 files fully
   passed). Failures cluster in `TenantManager.*.integration.test.jsx` (5 files) and POS/admin
   contract specs; not evenly spread.
3. **`frontend.budgets`** — 2 real chunk-size budget violations: `POSCheckoutTerminal-*.js` at
   232.25KB against a 154KB limit, `TerminalPage-*.js` at 120.24KB against a 116KB limit. Also 2
   warn-only oversized chunks (`index-*.js` 2713.55KB, `TerminalOperationsWorkspace-*.js` 1349.5KB).
4. **`scroll.contracts`** — fails for the same underlying reason as one of the `frontend.contracts`
   failures: `src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js` is one of the two
   files this gate runs directly.

None of this is a gate problem — the gate correctly caught real, current gaps on `develop`. Fixing
them is separate work, not in scope for this doc's rewrite; this run is the evidence that the gate
itself is trustworthy and worth running before every promotion. The issue's stated Definition of Done
("`gate:release:local` has been proven to run clean end-to-end") is met on the "runs to completion and
produces a trustworthy verdict" reading, not on a literal "returns pass" reading — an honest run on
`develop` HEAD found real problems, which is the outcome a pre-promotion gate exists to surface.

## What actually gates a release today

The authoritative document for release flow is `docs/ops/RELEASE_CANDIDATE_POLICY.md`. Summary
(**updated 2026-08-25, ADR 0074/#980 — `staging` dropped from the default path**):

```text
feature branch -> develop -> release/<label> -> main                              (default)
feature branch -> develop -> to-staging/<label> -> staging -> release/<label> -> main   (optional soak)
```

Merging a PR into `main` no longer deploys production by itself (as of 2026-08-14, #417) —
production deploys only when someone manually dispatches `deploy-main.yml` (renamed from
`build-main.yml`, which lost its `push: [main]` trigger) from the Actions tab. There is still no
separate approval step beyond dispatch access. Treat every PR into `main` as "the next
`deploy-main.yml` dispatch will ship this," and run this checklist before that dispatch, not before
the merge.

`.github/workflows/pr-checks.yml`'s `quality-checks` job — the blocking API/frontend test coverage —
was removed entirely 2026-08-14 (#416, after sitting paused over #345's ~14min unfiltered run). An
ordinary `develop`-bound PR is still gated only by path-filtered Docker build checks. **Since #1018
(2026-08-25)**, the full test matrix also runs automatically in CI — `promotion-quality-gate.yml`
(renamed from `pr-quality-checks.yml`) triggers itself on `release/*` promotion PRs into `main`
(the default path since ADR 0074), and still also on `to-staging/*` PRs into `staging` for anyone
using the optional soak (skipped entirely on that leg, per #1253 — see
`GATE_RELEASE_LOCAL_CI_MAPPING.md`'s confirmation section). **As of 2026-09-03 (#1431 Phase C/D),
this workflow is the sole enforcement mechanism** — `gate:release:local` is no longer run as part of
a promotion; its `required_gate_count` is 0 by design. A promoter's evidence for the release
go/no-go decision is `gh pr checks <N>` / `gh pr view <N> --json mergeStateStatus,mergeable` against
the promotion PR (per `AGENTS.md`'s Merge Safety hard stop), not a locally-generated
`local_readiness.json`. The #1007 phrase-gated expedited override, which used to name
`gate:release:local` as one of the things it could skip, is unaffected by this change in substance
(there is nothing local left to skip) — see `AGENTS.md`'s own amendment on this.

### Authorization boundary

GitHub branch protection, rulesets, private environment secrets, and required deployment reviewers
are genuinely unavailable on this private GitHub Free repository — GitHub checks remain candidate
evidence only, not an enforced gate. What is **not** true: a signed release controller, GPG
authorization tags, or a `master`-branch promotion model. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md`
describes that model but was never implemented for this repository and is registered
`status: superseded` / `authority_level: historical` — do not cite it, and do not re-add its gates
here. `docs/ops/RELEASE_CANDIDATE_POLICY.md` explicitly supersedes it. For the same reason,
`docs/ops/NO_STAGING_RELEASE_STANDARD.md` (also ADR-0030-dependent, and — as of 2026-08-25, #1019 —
formally marked `status: superseded`) and its associated PowerShell gate wrappers
(`gate:release:no-staging:qa-env`, `gate:release:prod-contracts:env`, drill/deploy scripts under
`scripts/*.ps1`) are not part of this gate and are not must-pass here.

## Remaining Non-Technical Blockers (Go/No-Go)

1. Cashier/admin UAT signoff evidence completed and reviewed.
2. Source-separation parity proof reviewed.
3. Strict location-binding operational acceptance logged.
4. Visual browser QA evidence for Storefront marker placement across zoom levels and touch/desktop
   interactions, captured against seeded or production pins.
5. Seeded DGFY company-access UAT evidence for founder-owned company, invited accepted member,
   pending invitation, rejected invitation, legacy unlinked user, linked legacy user, POS cashier
   with allowed terminal, and POS terminal-policy denial.

## Evidence Artifacts

1. Local readiness artifact: `.tmp/release-gates/<sha>/local_readiness.json`
2. Canonical readiness tracking: `docs/testing/pos-readiness-status.md`

## Historical Snapshots

Date-specific snapshots are archived under:
1. `docs/archive/testing/2026-04/` — dated 2026-04-21 checklist snapshot.
2. `docs/archive/testing/2026-08/` — the pre-2026-08-12 evidence log removed from this document.

## Per-app version gates (ADR 0081, epic #1548 Wave 4, #1588)

Two mechanisms register here that are neither part of the 17-gate `gate:release:local` mapping
above nor `check:app-versions`'s own PR-time flip-readiness track (`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s
own "`check:app-versions` flip-readiness" section covers that one) — both are promotion-time-only,
run by `promoter` directly, not by any CI workflow:

1. **Promoter pre-cut floor step** (ADR 0081 Decision 6). Before cutting
   `to-staging/<candidate_id>`, `node scripts/check-app-version-bump.js --floor --base
   origin/staging --head origin/develop` confirms every app whose files changed since `staging` has
   at least a minor bump over `staging`'s current version for that app. Anything below floor gets
   one `chore(release): bump <apps> to X.(Y+1).0 for candidate <id>` PR merged into `develop` first
   — an ordinary `develop`-base PR, not a new gate class. Full procedure:
   `.agents/skills/promoter/references/promotion-runbook.md`'s "Default: `develop` → `staging` →
   `main`" section; obligation text: `.agents/skills/promoter/SKILL.md`'s "Frozen candidate and
   repair loop" section.
2. **Promotion parity gate** (ADR 0081 Decision 8). After `deploy-main.yml` publishes the PROD
   image, `node scripts/check-image-version-parity.js --manifest <candidate.json>` (default flow) or
   `--source-sha <develop SHA>` (the #1007-gated exception, which never produces a candidate
   manifest — RF-2, PR #1590 review) confirms each app's PROD image traces back to the candidate it
   should — the frozen candidate's own tracked SHA, resolved **per app** since #1610 (ADR 0081
   Decision 8 amendment: `scripts/check-promotion-candidate.js`'s `resolveCandidateSourceShaByApp()`
   — an app never touched by a staging repair keeps its earlier identity rather than being compared
   against `current_staging_sha`, or the raw develop-cut SHA uniformly in `--source-sha` mode),
   stamped by `deploy-api.yml`/`deploy-migration-runner.yml`/`deploy-frontend.yml` into the
   `org.dgfy-platform.candidate-source-sha` OCI label — not `org.opencontainers.image.revision`,
   which differs across the `to-staging → staging` and `release/* → main` merge commits even for
   byte-identical candidate content. A PROD image with no matching STAGING predecessor (or, in
   `--source-sha` mode, no candidate-source-identity label at all) under this identity — a #1007
   expedited promotion or a main hotfix — is expected evidence, not a defect. An *existing* STAGING
   image whose label is missing or inconsistent, by contrast, is a real failure (`staging-unreadable`)
   — the normal promotion path always stamps it, so its absence there signals a label-stamping
   regression, not a legitimate untracked build. Read-only, runs after `deploy-main.yml`, not
   before — it cannot run pre-merge, since the PROD image it inspects does not exist until then. Full
   procedure and timing: `.agents/skills/promoter/references/promotion-runbook.md`'s "Deploy
   dispatch" section; `.agents/skills/promoter/SKILL.md`'s "Pre-`main` gates" section.

**The `IMAGE_TAG` contract #495 must honor** (ADR 0081's own Non-goals, restated here per #1588's
own acceptance criteria — this document records the contract, it does not implement #495's per-service
`IMAGE_TAG` compose split): whatever `IMAGE_TAG`-shaped variable(s) #495 introduces per service must
resolve to a real, pullable version tag of the shape `X.Y.Z[-channel]` (`1.5.2`, `1.5.2-staging`,
`1.5.2-dev`) — the tags this ADR's builders already publish alongside the pre-existing moving
channel tags (`develop`/`staging`/`latest`) and `sha-<7>`, unaffected by this ADR. #495 is free to
choose which of those tag families a given service pins to; it may not invent a tag shape these
builders don't actually publish.

## Known gaps (tracked elsewhere, not fixed by this document)

- `.github/workflows/deploy-production.yml`, which targeted a `master` branch that never existed in
  this repository (#339), was deleted 2026-08-14 (#417) — no longer applicable.
- `docs/ops/RELEASE_CANDIDATE_POLICY.md` still describes `quality-checks` as blocking (it isn't,
  currently — see above); worth a follow-up correction there.
- **Resolved 2026-08-25 (#1019):** `docs/ops/NO_STAGING_RELEASE_STANDARD.md` is now formally
  `status: superseded` (previously had no frontmatter at all), pointing at
  `docs/ops/RELEASE_CANDIDATE_POLICY.md`, so it no longer contradicts the actual override mechanisms
  (`incident-responder`'s and `promoter`'s #1007 override) by asserting "there is no unsigned
  emergency bypass."
- #238 proposes promoting `npm run audit:dependencies` from this local gate into PR CI — that would
  move cost back onto the cheap per-PR tier this doc's two-tier model depends on. Needs an explicit
  decision from Pat, not a default.
