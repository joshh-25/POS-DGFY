---
status: authoritative
authority_level: authoritative
owner: infra
last_reviewed: 2026-09-01
applies_to: ci_runner_routing
topic: ci_runner_policy
---

# CI Runner Policy

## Purpose

The authoritative policy for which runner class (`self-hosted` Sieitz pool vs. GitHub-hosted
`ubuntu-latest`) executes each CI/CD job in this repo, what capability each job actually needs, and
the explicit, auditable switch used when a runner class becomes unavailable. Filed against #1364
(child of the runner-strategy epic, #1363).

**Scope note, stated once:** this doc answers *where a job runs*. It does not decide *what runs in
CI at all* — that's #1147's scope (moving `gate:release:local`'s 19 gates into CI), covered
separately below in "#1147 gate mapping" because #1364's own acceptance criteria calls for
reconciling with it, not duplicating it. This doc also does not implement any routing change itself
— that's #1365, deliberately kept out of the PR that introduces this doc (see "Status" below).

`docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md` remains the living change-log of every runner-hosting
decision made to date (2026-08-01 hosted → 2026-08-13 reverted to self-hosted on exhausted billing →
2026-08-18/19/23 self-hosted refinements). Read it for *how we got here*; read this doc for *the
policy going forward*. Don't duplicate its history here.

## Current state (as of this doc)

Both self-hosted runners are online:

| Runner | ID | Labels | Role |
|---|---|---|---|
| `vm-openproject` | 23 | `sieitz-sm`, `sieitz-runner` | Small box; also runs OpenProject, 3 buildx builders, cloudflared, yopass |
| `vm-sieitzstaging` | 25 | `sieitz-lg`, `sieitz-runner` | Large box; **also the live DEV + STAGING docker-compose host** |

Every workflow **without an explicit hosted exception** runs on one of these two labels today
(`docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md`, "Status as of 2026-08-13") — this is not a blanket "zero
hosted jobs" claim. Three pre-existing exceptions already run on `ubuntu-latest`, predate this
policy, and stay hosted regardless of it: `build-android-manual.yml` / `pr-android-build-checks.yml`
(no Android SDK on either self-hosted box) and `deploy-production.yml` (`workflow_dispatch`-only,
trimmed since its trigger workflow was archived). See the job-by-job inventory below for the full,
reconciled picture.

**GitHub-hosted availability — verified live, not assumed.** #1363's epic body asserts minutes are
available again; that assertion was independently confirmed today by dispatching an existing
`ubuntu-latest` workflow (`build-android-manual.yml`, run
[33540143272](https://github.com/Sieitzz/dgfy-platform/actions/runs/33540143272), 2026-09-01T17:50Z)
and watching it actually progress through `Set up job` → `Checkout` → `Set up JDK` → into
`Build release APK` on a real hosted runner, before being cancelled to avoid spending build minutes
needlessly. This is the opposite of the 2026-08-13 signature (every job failing in ~4s on "recent
account payments have failed or your spending limit needs to be increased"). A billing-API pull
would have been the more precise number, but this session's token lacks `admin:org` scope
(`gh api /orgs/Sieitzz/settings/billing/actions` → 404); a live dispatch is strictly more direct
evidence of "can a hosted job actually run right now" than a minutes count would have been anyway.
**This confirms hosted runners are reachable today. It is not a durable guarantee** — re-verify
before any real production-hosted cutover, the same way #1365's own preflight should (see below).

## Proposed runner matrix

Per #1363's epic table, the default policy going forward:

| Workflow class | Default runner | Rationale |
|---|---|---|
| PR checks, ordinary pushes to `develop` | Self-hosted (`sieitz-runner`/`sieitz-lg` per existing size split) | Frequent; conserve hosted minutes; #923's measured size-routing stays in force |
| `develop` → `staging` promotion, staging deploy | Self-hosted | Normal release cadence; preserve current cost model |
| `develop`/`staging` → production promotion, production deploy | GitHub-hosted (`ubuntu-latest`) | Infrequent; predictable clean environment; faster pacing |
| **Hotfix to `main`** (`incident-responder`'s monitor loop or `/hotfix` manual entry) | **GitHub-hosted** | Same `deploy-main.yml`/production-deploy path as an ordinary promotion — a hotfix is still "anything that deploys to prod," so it gets the same isolation/predictability rationale, if anything more so given it's already running under incident pressure. No separate routing decision needed: it rides the same job, the same runner class, because it dispatches the same workflow |
| Emergency/fallback | Explicit alternate strategy per the switch below | Never a silent, undocumented flip |

**Why prod specifically, stated once:** blast radius (a self-hosted-box failure competes with the
live DEV+STAGING traffic that box also serves — not a risk a hosted runner carries at all),
predictability (clean ephemeral image every run, no local state/cache drift, no leftover deploy-key
exposure since `vm-sieitzstaging` is persistent rather than ephemeral), and frequency (prod pushes
are infrequent enough that the hosted-minutes cost stays small — the opposite of PR/develop traffic,
which is exactly why that stays self-hosted).

### Job-by-job inventory and capability requirements

| Job / workflow | Current runner | Capabilities needed | Notes |
|---|---|---|---|
| `pr-*-build-checks.yml` (api/frontend/migration-runner) | `sieitz-runner`/`sieitz-lg` (per `RUNNER_LIGHT_JSON`/`RUNNER_HEAVY_JSON`) | Docker buildx; `frontend-build-check` is the one job with a measured size signal (OOM risk on the small box) | #923 measured split; `BUILD_CACHE_FROM` anchor disabled on self-hosted (#726 — `type=gha` cache costs 21x the build it's meant to skip at this pool's cache-service bandwidth) |
| `pr-android-build-checks.yml` / `build-android-manual.yml` | `ubuntu-latest` (hardcoded, not via the label indirection) | Android SDK + Gradle | Stays hosted regardless of policy — neither self-hosted box has the Android SDK installed (explicit comment in the workflow file) |
| `pr-migration-runner-build-checks.yml` | `sieitz-runner`/`sieitz-lg` | `docker/setup-qemu-action` for `linux/amd64,linux/arm64` — needs privileged Docker to register binfmt handlers | Flagged "not yet verified" in the migration handoff doc; re-confirm before relying on it |
| `promotion-quality-gate.yml` (`dgfy-api-quality`, `frontend-quality` ×3, `repository-quality`) | `sieitz-lg` (pinned) | 2 service containers (MySQL/Redis), `--max-old-space-size=4096`, `playwright install chromium`; known AVX gap on this box (`@napi-rs/canvas` → SIGILL, gated behind a real capability probe since #1035) | Heaviest jobs in the repo; competes with the live DEV+STAGING stacks on the same box (already flagged in #1018) |
| `deploy.yml` / `deploy-main.yml` (SSH publish) | `sieitz-runner` (generic) | SSH key material, network reach to DEV/STAGING/BETA/PROD, credential cleanup step (`if: always()`, since this box is persistent, not ephemeral) | `vpn_required: false` everywhere — both self-hosted boxes reach the DEV/STAGING LAN directly; VPN only matters from a hosted runner with no LAN path (see "VPN" below) |
| `verify-deployment.yml` | `sieitz-runner` | Read-only `docker compose ps`/`docker inspect`/in-container `curl`; `vpn_required` input, default `false` | No runner affinity needed post-#599 |
| `tenant-schema-report.yml`, `compliance-preflight-sweep.yml` | `sieitz-runner` | Read-only; the sweep runs against its own ephemeral CI-provisioned instance, no deployed environment touched | |
| `deploy-production.yml` | `ubuntu-latest` (hardcoded) | Currently `workflow_dispatch`-only, trimmed since its trigger workflow was archived | Pre-existing hosted exception, predates this policy |
| `build-android-manual.yml` | `ubuntu-latest` (hardcoded) | Android SDK + Gradle | Same as above — hosted regardless of self-hosted/hosted policy |

**SOPS/decrypted secrets, and other jobs that stay local-only regardless of runner class:**
anything that needs the promoter's own locally-decrypted secrets or the promoter's own git-branch
state (e.g. several of `gate:release:local`'s 19 gates — see the mapping table below) is out of
scope for *any* CI runner, hosted or self-hosted. Moving a job onto a different runner class doesn't
solve that; it needs a different design (SOPS age-key provisioning to CI, tracked separately under
the SOPS/age cutover work) before it can run in CI at all.

### VPN

No workflow needs the OpenVPN hop today on self-hosted (`vpn_required: false` everywhere, #598/#599)
— both self-hosted boxes reach the internal DEV/STAGING LAN directly. **A GitHub-hosted runner has
no path to that LAN at all** — if any job is routed to `ubuntu-latest` and needs to reach
DEV/STAGING (not BETA/PROD, which are public-internet SSH), `vpn_required: true` must be set for
that job specifically. Per the current matrix, only production promotion/deploy moves to hosted, and
production (BETA/PROD) is public-internet SSH — so this shouldn't bite under the matrix above, but
any future job added to the hosted tier that touches DEV/STAGING must set it explicitly, not assume
the self-hosted default carries over.

## The fallback switch

Reuses the four-way classification `AGENTS.md`'s Merge Safety carve-out already defines, rather than
inventing a second taxonomy:

- `runner_offline` — every self-hosted runner non-`online` (`gh api repos/:repo/actions/runners`).
- `queue_starvation` — runners online, but a job sits `queued`/`in_progress` past a threshold, or is
  `cancelled` with no conclusion.
- `billing_allocation_failure` — hosted runner requests fail with the spending-limit/payment
  signature (`scripts/collect-github-actions-unavailability.js`).
- `github_platform_outage` — gated on affirmative target-SHA evidence first: zero check-runs **and**
  zero check-suites for the target SHA (a completed check-run already proves the checks ran, and is
  never overridden by a global degraded status elsewhere). Only once that holds is
  `githubstatus.com`'s public status API consulted, matched to the Actions component specifically
  reporting an outage/degraded state (`scripts/pr-checks.js`'s `github_platform_outage` branch,
  #1077, RF-1 tightening per PR #1078).

**The switch itself, as a prospective requirement, not a current-state claim:** the
2026-08-01/2026-08-13 flips established the convention of a commented alternate-runner line directly
above each active `runner_labels_json`/`runs-on` site — but that convention has drifted since:
confirmed live, `tenant-schema-report.yml:54`, `deploy.yml:99`, `deploy-main.yml:99`,
`compliance-preflight-sweep.yml:84`, and every reusable workflow's `runs-on:
${{ fromJSON(inputs.runner_labels_json) }}` site carry **no** mirror comment today. This doc does
not claim the switch is currently executable everywhere — it isn't. #1365 must do two things, not
one: (a) add the GitHub-hosted routing itself at the production-only sites, and (b) restore the
mirror-comment convention at *every* active routing site repo-wide (not just the new hosted ones),
so the switch is actually auditable. Until that lands, treat the "comment/uncomment per site"
mechanism as aspirational at any site not already carrying the pair.

**Who may flip it, and when:** an operator (Promoter role, or Pat directly) may flip a *specific*
job class back to self-hosted on a *verified* classification from the four above — never on a
guess, never silently. The flip is logged (a comment on the tracking issue or PR, same evidentiary
bar `AGENTS.md`'s Merge Safety carve-out already holds `## Local CI` evidence to) and never weakens
which gates run — it only changes where they run. A pending/in-progress/queued check remains a hard
stop regardless of runner class (`AGENTS.md`'s Merge Safety rule is unconditional on this point).

**Minimum threshold before a hosted production run starts:** a live reachability check (the same
kind of dispatch-and-observe probe used above, or a real billing-minutes pull once `admin:org` scope
is available) immediately before a production promotion, not a cached assumption from a prior
session. This doc's own "Current state" section is evidence for *today*, not a standing guarantee.

## #1147 gate mapping

#1147's own body names this as its first, currently-missing deliverable: map each of
`gate:release:local`'s 19 gates (`scripts/gate-release-local.js`'s `GATE_NAMES`) to either an
existing CI job, a CI job still to be added, or a documented reason it stays local-only.

| Gate | Status | Notes |
|---|---|---|
| `release.target_sha` | Local-only | Needs the promoter's own git-branch state (which SHA is actually being promoted) |
| `dependencies.audit.prod` | Not yet in CI | Candidate for a cheap CI job; no blocking dependency identified |
| `dependencies.audit.full` | Not yet in CI | Same as above |
| `docs.lint` | **In CI** | `repository-quality` job, `promotion-quality-gate.yml` (since PR #1036) |
| `architecture.guardrails` | **In CI** | `repository-quality` job, same PR |
| `compliance.contracts` | Local-only (for now) | Structurally-cannot-fail on a clean checkout per `gate-release-local.js`'s own flag; low priority to move |
| `production.env.fixtures` | Not assessed | Needs a look — may need SOPS-decrypted secrets, would stay local if so |
| `runtime.doctor` | Not assessed | Needs a look |
| `backend.lint` | Likely in CI | Part of `dgfy-api-quality`'s job steps — confirm exact step coverage before marking fully done |
| `backend.test_matrix` | **In CI** | `dgfy-api-quality` job, `promotion-quality-gate.yml`, pinned `sieitz-lg` |
| `frontend.ims.lint` | **In CI** | `frontend-quality` (dgfy-ims) |
| `frontend.pos.lint` | **In CI** | `frontend-quality` (dgfy-pos) |
| `frontend.storefront.lint` | **In CI** | `frontend-quality` (dgfy-storefront) |
| `frontend.contracts` | Likely in CI | Confirm exact step coverage per app |
| `frontend.storefront.contracts` | Likely in CI | Same |
| `frontend.budgets` | Not assessed | Needs a look |
| `scroll.contracts` | Not assessed | Needs a look |
| `observability.evidence.report` | Local-only (for now) | Warns, never fails, unless run with `--enforce` (not passed in CI today) |
| `release.verdict.contract` | Local-only, auto-skips | Only fires if a prior local run already produced `release_verdict.json` — structurally tied to the local flow |

**Read plainly:** 6 of 19 gates are confirmed in CI today (`docs.lint`, `architecture.guardrails`,
`backend.test_matrix`, and the three `frontend.*.lint` gates — largely via PR #1036, tracked under
issue #1018, which is still open despite this work being merged 2026-08-25; flagged separately for
Pat to confirm and close). A further 3 (`backend.lint`, `frontend.contracts`,
`frontend.storefront.contracts`) are *likely* covered as sub-steps of jobs already in CI but need
explicit step-level confirmation, not just inferred from the job name. The remaining gates are
either genuinely not yet assessed, or structurally tied to the promoter's local state/secrets and
may never move. This table is the "doesn't exist today" deliverable #1147 names — it is **not** a
claim that #1147 is done; #1015 (fast/DB test-tier split) and #1124 (quality-gate trust audit) are
still open and gate the remaining work, per #1147's own body.

## Status

This doc lands #1364's matrix/capability/fallback-switch deliverable and #1147's gate-mapping
deliverable. It does **not** implement any routing change — no `runs-on:`/`runner_labels_json`
value in any real workflow changes as part of the PR that introduces this doc. That's #1365's scope,
to follow as a separate PR once this doc has been reviewed.

## Related

#1363 (epic), #1365 (implementation, not yet started), #1147 (gate umbrella), #1018 (fast-tier
subset — functionally merged via PR #1036, issue left open), #1015 (hard prerequisite for the
remaining DB-backed gates), #1124 (quality-gate trust, gates full #1147 closure), #724/#662 (local-
CI fallback evidence path), #715 (alternative CI provider exploration), #923 (runner size labeling),
`docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md` (full history), `AGENTS.md` (Merge Safety carve-out's
four-way unavailability classification, reused here rather than duplicated).
