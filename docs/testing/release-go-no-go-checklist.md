---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-08-12
applies_to: pre_promotion_quality_gate
topic: pre_promotion_local_gate
---

# Release Go/No-Go Checklist

## This is the pre-promotion gate

`npm run gate:release:local` (`scripts/gate-release-local.js`) **is** the pre-promotion quality
gate for this repository. The working model: junior-dev PRs get the cheap, path-filtered checks in
`pr-checks.yml`; Pat runs this full pass himself, on his own machine or VM, post-merge, before
promoting `develop` work to `staging` or `main`.

**Invoke this gate. Do not reinvent test execution or rebuild a parallel gate for this purpose.**
This document exists so that doesn't happen again — see #345 and #330, which is exactly the
proposal-to-rebuild failure mode this doc is meant to close off. #372 (a testing agent/skill) should
*invoke* this gate, not reimplement it.

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

```bash
docker run --rm --network dgfy-local-test -v "$PWD":/repo -w /repo \
  -e NODE_OPTIONS="--max-old-space-size=4096" -e NODE_ENV=test \
  -e DB_HOST=dgfy-mysql-test -e DB_PORT=3306 \
  -e DB_NAME=sku_inventory_manager_test -e DB_NAME_TEST=sku_inventory_manager_test \
  -e DB_USER=root -e DB_PASSWORD=testpassword \
  -e REDIS_URL=redis://dgfy-redis-test:6379 \
  -e JWT_SECRET=ci_jwt_secret_key_for_tests_only_123456 \
  -e REFRESH_TOKEN_SECRET=ci_refresh_secret_key_for_tests_only_123 \
  -e RELEASE_TARGET_SHA="$(git rev-parse HEAD)" \
  node:22-alpine npm run gate:release:local
```

On a host with node, MySQL, and Redis already configured (e.g. Pat's own VM), plain
`npm run gate:release:local` is enough — it reads `RELEASE_TARGET_SHA` from the environment and
falls back to `git rev-parse HEAD`.

The only env var the script itself reads is `RELEASE_TARGET_SHA`. Everything else (DB/Redis
connection, JWT secrets) is read by the child processes it spawns, exactly as in CI.

## The 16 gates

`scripts/gate-release-local.js` runs these in order, unconditionally — a failing gate does not stop
the run, and every gate's result is recorded. Exit code is `2` if any gate failed, `0` if all passed;
the JSON artifact is written either way.

| # | Gate name | Command | Notes |
|---|---|---|---|
| 1 | `release.target_sha` | — | Passes iff a target SHA resolved (env var or `git rev-parse HEAD`). |
| 2 | `dependencies.audit.prod` | `npm run audit:dependencies:prod` | Chains `npm audit --omit=dev` across root, `apps/dgfy-api`, `apps/dgfy-web` with `&&` — one advisory in an earlier tree short-circuits the rest. |
| 3 | `dependencies.audit.full` | `npm run audit:dependencies` | Same `&&`-chained shape, including dev dependencies. |
| 4 | `docs.lint` | `npm run lint:docs` | Validates every doc in `docs/_meta/document-registry.json` (this doc included) plus `check:adr`. |
| 5 | `architecture.guardrails` | `npm run check:architecture` | `check:architecture-guardrails` + `check:controller-boundaries` inside `apps/dgfy-api`. |
| 6 | `compliance.contracts` | `npm run check:compliance` | `check-compliance-impact.js` + `check-compliance-api-contracts.js`. |
| 7 | `production.env.fixtures` | `npm run check:production-env` | Validates production env-var fixture coverage (hosting profiles, PayMongo, etc.). |
| 8 | `runtime.doctor` | `npm run doctor:runtime` | `apps/dgfy-api`'s migration/column drift check. |
| 9 | `backend.lint` | `npm --prefix apps/dgfy-api run lint` | ESLint on `apps/dgfy-api/src`. |
| 10 | `backend.test_matrix` | `npm run test:backend:matrix` | The full chunked Jest matrix (`scripts/run-backend-test-matrix.js`) — needs real MySQL + Redis. The expensive gate; see cost below. |
| 11 | `frontend.lint` | `npm --prefix apps/dgfy-web run lint` | ESLint on `apps/dgfy-web`. |
| 12 | `frontend.contracts` | `npm run test:frontend:contracts` | `vitest run` filtered to `contract.test`/`integration.test` in `apps/dgfy-web`. |
| 13 | `frontend.budgets` | `npm run check:frontend-budgets -- --report <dir>/frontend-budgets/frontend_budget_report.json` | Defaults to `owned-build` mode — runs `npm --prefix apps/dgfy-web run build:all` itself. This is why the gate is slow even beyond the test matrix. |
| 14 | `scroll.contracts` | `npm --prefix apps/dgfy-web test -- --run <2 POS scroll-contract spec files>` | Narrow, named-file frontend regression pin. |
| 15 | `observability.evidence.report` | `npm run gate:release:observability -- --evidence-dir <dir>` | Warns (does not fail) if `OBSERVABILITY_BASE_URL`/`PROD_BASE_URL`/`QA_BASE_URL` is unset; only fails under `--enforce`, which this gate does not pass. Expect a pass with warnings in a plain local run. |
| 16 | `release.verdict.contract` | `node scripts/verify-release-verdict.js --file <dir>/release_verdict.json --sha <sha>` | **Conditional and easy to over-read: this gate auto-passes with "Skipped" if `release_verdict.json` doesn't already exist for the target SHA** — the normal case on a fresh run. It only does real verification when a prior no-staging run already produced that file for the same SHA. |

Evidence: `.tmp/release-gates/<sha>/local_readiness.json` — `generated_at`, `target_sha`, `verdict`
(`pass`/`fail`), `gate_count` (16), `failed_gate_count`, and each gate's `{name, ok, detail}`.

## Measured cost (2026-08-12, target SHA `df5e72b0`, `develop`)

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

The authoritative document for release flow is `docs/ops/RELEASE_CANDIDATE_POLICY.md`. Summary:

```text
feature branch -> develop -> staging -> release/<label> -> main
```

A push to `main` **is** the production deploy (`build-main.yml` fires on `push: [main]` and
dual-deploys `beta.dgfy.ph` + `dgfy.ph` immediately — no separate approval step). Treat every PR into
`main` accordingly.

`.github/workflows/pr-checks.yml`'s `quality-checks` job — the blocking API/frontend test coverage —
is currently hard-disabled (`if: false`, paused over #345's ~14min unfiltered run). Today a PR is
gated only by path-filtered Docker build checks. **This makes `gate:release:local` the only place
the full test matrix runs at all, CI or local**, until #345 is resolved. Run it before every
`staging`/`main` promotion; it is not optional polish on top of CI.

### Authorization boundary

GitHub branch protection, rulesets, private environment secrets, and required deployment reviewers
are genuinely unavailable on this private GitHub Free repository — GitHub checks remain candidate
evidence only, not an enforced gate. What is **not** true: a signed release controller, GPG
authorization tags, or a `master`-branch promotion model. `docs/architecture/adr/0030-free-tier-signed-release-authorization.md`
describes that model but was never implemented for this repository and is registered
`status: superseded` / `authority_level: historical` — do not cite it, and do not re-add its gates
here. `docs/ops/RELEASE_CANDIDATE_POLICY.md` explicitly supersedes it. For the same reason,
`docs/ops/NO_STAGING_RELEASE_STANDARD.md` (also ADR-0030-dependent) and its associated PowerShell
gate wrappers (`gate:release:no-staging:qa-env`, `gate:release:prod-contracts:env`, drill/deploy
scripts under `scripts/*.ps1`) are not part of this gate and are not must-pass here.

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

## Known gaps (tracked elsewhere, not fixed by this document)

- `.github/workflows/deploy-production.yml` targets a `master` branch that does not exist in this
  repository (#339) and cannot currently run.
- `docs/ops/RELEASE_CANDIDATE_POLICY.md` still describes `quality-checks` as blocking (it isn't,
  currently — see above); worth a follow-up correction there.
- `docs/ops/NO_STAGING_RELEASE_STANDARD.md` still assumes the ADR-0030 signed controller model.
- #238 proposes promoting `npm run audit:dependencies` from this local gate into PR CI — that would
  move cost back onto the cheap per-PR tier this doc's two-tier model depends on. Needs an explicit
  decision from Pat, not a default.
