---
status: authoritative
authority_level: authoritative
owner: infra
last_reviewed: 2026-09-03
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
CI at all* — that's #1147's scope (moving `gate:release:local`'s 16 gates into CI), covered
separately below in "#1147 gate mapping" because #1364's own acceptance criteria calls for
reconciling with it, not duplicating it. The PR that originally introduced this doc deliberately
implemented no routing change itself — that was left to #1365, which has since shipped its live
cutover (Phase 234 Wave 3, 2026-09-02); see "Status" below for the current state.

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

A property of the self-hosted class that GitHub-hosted runners don't share: each box reuses one
persistent `_work` git workspace across every job that lands on it, from every workflow. State one
job leaves in that workspace can affect the next, unrelated job that lands there — see
`CI_RUNNER_WORKSPACE_HYGIENE.md` for the mechanism and the standing defenses against it (#1528).

Every workflow **without an explicit hosted exception** runs on one of these two labels today
(`docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md`, "Status as of 2026-08-13") — this is not a blanket "zero
hosted jobs" claim. One pre-existing exception already runs on `ubuntu-latest`, predates this
policy, and stays hosted regardless of it: `build-android-manual.yml` / `pr-android-build-checks.yml`
(no Android SDK on either self-hosted box). See the job-by-job inventory below for the full,
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
| **Hotfix to `main`** (`incident-responder`'s monitor loop or `/hotfix` manual entry), post-merge deploy dispatch | **GitHub-hosted** | Same `deploy-main.yml`/production-deploy path as an ordinary promotion — a hotfix is still "anything that deploys to prod," so it gets the same isolation/predictability rationale, if anything more so given it's already running under incident pressure. No separate routing decision needed: it rides the same job, the same runner class, because it dispatches the same workflow |
| **`pr-checks.yml` build-check jobs, PR-time**, when the PR's head is `release/*`, `hotfix/*`, or `fix/*` **and** its base is `main` | **GitHub-hosted** (`route-build-checks` job, #1529, #1701) | Same promotion/hotfix-to-`main` rationale as the row above, applied one step earlier in the PR's lifecycle — not a blanket "any PR targeting `main`" rule, and not job-class-scoped (#1365's original shape, which #1529 corrects). Every other PR (develop/staging targets, or any other PR that happens to target `main` without one of these three head shapes) stays self-hosted |
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
| `pr-*-build-checks.yml` (api/frontend/migration-runner) | `sieitz-runner`/`sieitz-lg` (per `RUNNER_LIGHT_JSON`/`RUNNER_HEAVY_JSON`); **`ubuntu-latest`** when the PR's head is `release/*`/`hotfix/*`/`fix/*` and base is `main` (`pr-checks.yml`'s `route-build-checks` job, #1529, #1701) | Docker buildx (present on `ubuntu-latest` by default — no setup gap on the hosted path); `frontend-build-check` is the one self-hosted-path job with a measured size signal (OOM risk on the small box) | #923 measured split governs the self-hosted default; #1529 adds the promotion/hotfix-to-`main` exception, #1701 extends its head-shape match to `fix/*`. `BUILD_CACHE_FROM` stays disabled (empty) even on the hosted path for now — #726's cache-backend flip isn't yet wired to this narrower condition, a follow-up, not a defect |
| `pr-android-build-checks.yml` / `build-android-manual.yml` | `ubuntu-latest` (hardcoded, not via the label indirection) | Android SDK + Gradle | Stays hosted regardless of policy — neither self-hosted box has the Android SDK installed (explicit comment in the workflow file) |
| `pr-migration-runner-build-checks.yml` | `sieitz-runner`/`sieitz-lg` | `docker/setup-qemu-action` for `linux/amd64,linux/arm64` — needs privileged Docker to register binfmt handlers | Flagged "not yet verified" in the migration handoff doc; re-confirm before relying on it |
| `promotion-quality-gate.yml` (`dgfy-api-quality`, `frontend-quality` ×3, `repository-quality`) | `sieitz-lg` (pinned) | 2 service containers (MySQL/Redis), `--max-old-space-size=4096`, `playwright install chromium`; known AVX gap on this box (`@napi-rs/canvas` → SIGILL, gated behind a real capability probe since #1035) | Heaviest jobs in the repo; competes with the live DEV+STAGING stacks on the same box (already flagged in #1018) |
| `deploy.yml` / `deploy-main.yml` (SSH publish) | `sieitz-runner` (generic) | SSH key material, network reach to DEV/STAGING/BETA/PROD, credential cleanup step (`if: always()`, since this box is persistent, not ephemeral) | `vpn_required: false` everywhere — both self-hosted boxes reach the DEV/STAGING LAN directly; VPN only matters from a hosted runner with no LAN path (see "VPN" below) |
| `verify-deployment.yml` | `sieitz-runner` | Read-only `docker compose ps`/`docker inspect`/in-container `curl`; `vpn_required` input, default `false` | No runner affinity needed post-#599 |
| `tenant-schema-report.yml`, `compliance-preflight-sweep.yml` | `sieitz-runner` | Read-only; the sweep runs against its own ephemeral CI-provisioned instance, no deployed environment touched | |
| `build-android-manual.yml` | `ubuntu-latest` (hardcoded) | Android SDK + Gradle | Pre-existing hosted exception, predates this policy — hosted regardless of it |

**SOPS/decrypted secrets, and other jobs that stay local-only regardless of runner class:**
anything that needs the promoter's own locally-decrypted secrets or the promoter's own git-branch
state (e.g. several of `gate:release:local`'s 16 gates — see `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`) is out of
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

**Superseded 2026-09-02 by `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`, which is now the single
source for this mapping — the table that used to live here is deleted, not merely flagged stale.**
#1147's mapping deliverable originally landed here as a table; it had already drifted before this
deletion (it placed `architecture.guardrails` in `repository-quality` rather than
`dgfy-api-quality` — `frontend-quality` (cited for all three `frontend.*.lint` rows) no longer
exists either, having split into `frontend-ims-quality`/`frontend-pos-quality`/
`frontend-storefront-quality` per ADR 0071 — said "6 of 19 in CI," left four gates "Not assessed,"
and called `backend.lint`/`frontend.storefront.contracts` merely "likely in CI" when they're
confirmed blocking), and predated the advisory/blocking distinction entirely (every "**In CI**" row
in it meant "the step runs," not "the step blocks"). Because this doc is
`authority_level: authoritative` while the mapping doc is `reference`, the stale copy would have won
any conflict under `AGENTS.md`'s Surface precedence. Two tables, one of them wrong and outranking
the right one, is the defect — not the drift, and not something a "known stale" flag on the table
would have fixed either. Read the mapping doc.
`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md` is the current source of truth for this mapping,
including which gates are blocking-in-CI-and-dropped-from-`gate:release:local`'s-required-set
(#1431 Phase 1, PR-A/PR-B) versus advisory-only versus not-yet-wired. `gate:release:local` is 16
gates as of #1431 Phase 3, not 19.

## Status

This doc originally landed #1364's matrix/capability/fallback-switch deliverable and #1147's
gate-mapping deliverable, with no routing change implemented as part of that PR. **That has since
changed: #1365's Phase 234 Wave 3 (2026-09-02) flipped the live routing** — production
build/deploy/promotion jobs in `deploy-main.yml` and `promotion-quality-gate.yml` now route to
GitHub-hosted (`ubuntu-latest`) by default, per the matrix below, not self-hosted. See
`docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md`'s "Status as of 2026-09-02 — Phase 234 Wave 3" entry for
the full flip record, the Wave 2 T1–T5 evidence it was based on, and the current flip/fallback
procedure. Wave 4 (a real production promotion exercising this path) and Wave 5 (closeout) remain
separate, gated, not-yet-run work — this doc's matrix and fallback-switch mechanism below are
otherwise unchanged by the flip.

## Amendments

### 2026-09-03: `pr-checks.yml` build-check jobs route to GitHub-hosted runners for a release/*|hotfix/* PR into main (#1529)

Per Pat's direct correction on #1529 (superseding #1527, closed): the "Hotfix to `main`" row above
only ever covered `deploy-main.yml`'s post-merge deploy dispatch. It did not cover `pr-checks.yml`'s
own PR-time build-check jobs, which stayed unconditionally self-hosted for every PR regardless of
head/base shape -- including a `release/*`/`hotfix/*` PR into `main`, which should have gotten the
same isolation/predictability rationale already given to the deploy path itself.

Fixed in `pr-checks.yml` (new `route-build-checks` job, mirroring `promotion-quality-gate.yml`'s own
`gate`-job `case "$HEAD_REF" in` pattern with an added `hotfix/*` arm) and reflected in the matrix
and job-by-job inventory above. Not a blanket "any PR targeting `main`" rule, and not job-class-
scoped either (#1365's original, narrower shape, which #1529 corrects) -- the split is specifically
head-shape (`release/*`/`hotfix/*`) **and** base (`main`), together.

### 2026-09-07: `pr-checks.yml` build-check routing extended to `fix/*` heads into `main` (#1701)

The `route-build-checks` job's `hotfix/*` arm above had silently never matched a real hotfix-to-
`main` PR since this repo's actual hotfix naming convention drifted to `fix/*`
(`.agents/skills/incident-responder/SKILL.md`) -- 8 older hotfix-to-`main` PRs used `hotfix/*`,
every recent one (including #1699, the PR that surfaced this) used `fix/*` instead, and none of
those ever hit this routing.

Fixed by adding `fix/*` alongside `release/*`/`hotfix/*` in `pr-checks.yml`'s `route-build-checks`
case arm, scoped identically to the arms it extends -- still nested only under
`case "$BASE_REF" in main)`, so an ordinary `fix/*` PR into `develop` is a different case arm
entirely and is unaffected. The matrix row and job-by-job inventory row above are updated to the
three-shape (`release/*`/`hotfix/*`/`fix/*`) form. `promotion-quality-gate.yml`'s own `gate` job
stays unaffected -- its `case "$HEAD_REF" in` under `main)` deliberately excludes `hotfix/*`/`fix/*`
entirely (#1527), a separate, already-settled question from which runner class build-checks use.

## Related

#1363 (epic), #1365 (Phase 234 Wave 3 — live cutover shipped 2026-09-02), #1147 (gate umbrella),
#1018 (fast-tier subset — functionally merged via PR #1036, issue left open), #1015 (hard
prerequisite for the remaining DB-backed gates), #1124 (quality-gate trust, gates full #1147
closure), #724/#662 (local-CI fallback evidence path), #715 (alternative CI provider exploration),
#923 (runner size labeling), `docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md` (full history), `AGENTS.md`
(Merge Safety carve-out's four-way unavailability classification, reused here rather than
duplicated), `docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md` (#1528 — shared `_work` state hazards and
their standing defenses, a distinct concern from this doc's own "which class runs a job" scope).
