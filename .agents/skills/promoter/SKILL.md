---
name: promoter
description: Run a develop -> staging -> main promotion end to end on dgfy-platform, cutting the intermediate promotion branch itself — the Promoter/Release role from issue #331/#512. Use when asked to promote develop to staging, cut a release branch, or run a "review, merge, and deploy" composite instruction's deploy leg. Dispatches DEV/STAGING deploys unattended; never merges main and never dispatches a main/PROD deploy without an explicit go each time. First live run is report-only.
---

# Promoter/Release

**Portability**: this is the canonical definition of this role (#442).
`.claude/skills/promoter/SKILL.md` is a thin pointer back here — edit here, not there.

Runs a branch promotion end to end — `develop` → `staging`, and `staging` → `main` — including
cutting the intermediate branch each leg needs. This is the "Release/Deploy captain" candidate
named in #331, built out by #512 after PR #510 was blocked because `staging` had been deleted as a
side effect of using it directly as a PR head (full incident:
`docs/ops/STAGING_TO_MAIN_PROMOTION_INCIDENT_2026-07-28.md`).

**Read rule sources at runtime. Never embed their contents here.**
`docs/ops/RELEASE_CANDIDATE_POLICY.md` (authoritative) owns the flow and branch-naming convention;
`docs/testing/release-go-no-go-checklist.md` owns the pre-`main` gate; `docs/ai/PR.md` owns commit
and PR-body format; `scripts/check-compliance-impact.js` owns the promotion-PR compliance exemption;
`AGENTS.md`'s Merge Safety section owns the check-state rule this role must never merge past.

## Why a new role, not an extension of an existing one

#512's own design question, resolved here: not `pr-reviewer` (its charter is auditing *one* PR and
its tool allowlist is deliberately read-mostly — promotion needs branch creation and `gh pr create`)
and not `implement` (its checkpoint policy explicitly forbids opening a PR based on `staging` or
`main` — promotion *is* that). A promotion is a multi-branch orchestration job with its own shape
(no code authored, batch inventory + gate evidence instead of a diff review), so it gets its own
role rather than bending either existing one past its charter.

## The flow, and why it's one mechanism now, not two

`feature → develop → to-staging/<label> → staging → release/<label> → main`. Both legs cut a
throwaway branch — `to-staging/<label>` from `origin/develop`, `release/<label>` from
`origin/staging` — carrying no commits of its own, used once as a PR head, never reused. This was
amended into the policy specifically so this role implements **one** promotion mechanism for both
legs instead of two (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-16 amendment). The branch
prefix is not cosmetic: `scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_PREFIX_BY_BASE`
matches exactly `to-staging/*` (base `staging`) and `release/*` (base `main`) to exempt the PR from
a bundled-classification re-check that would otherwise produce ~13 false compliance failures on an
aggregate diff — get the prefix wrong and that incident reproduces. Full command sequence for both
legs: `references/promotion-runbook.md`.

Promotion PRs merge with `--merge` (a true merge commit), never `--squash` — confirmed as the
existing convention on every prior promotion (#127, #426); squashing would diverge the target's
history from what the next promotion diffs against.

## Pre-flight — run before touching any branch

The check that would have caught #426: confirm the **target** branch exists on the remote
(`git ls-remote --exit-code --heads origin <staging|main>`) before starting. If it's missing,
restore it from the last known-good SHA and stop — do not proceed into a promotion against a branch
that isn't there. Also confirm the head you're about to cut has never been used as a PR head before
(long-lived branches — `develop`, `staging`, `main` — must never be a head; that's the mechanism the
`to-staging/`/`release/` prefixes exist to prevent).

## Pre-`staging` gate: compliance preflight sweep

Before cutting `to-staging/<label>`: for every `major`/`regulatory` impact declaration in the batch
still carrying a `NOT-EXECUTED-*` `preflight_request_ref`, run the real
`POST /api/v1/compliance/preflight` against a deployed non-production host (DEV suffices — this
never needs staging or production). Full protocol, the request-body shape, and the curl recipe:
`docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually runs" — read it
there, don't reconstruct the request shape here. Find the batch's declarations with
`git diff --name-only origin/staging origin/develop -- docs/compliance/impact-declarations/` and
grep the results for `NOT-EXECUTED-` — cheaper and more precise than sweeping the whole directory.

**Land the reconciled front matter the same way as the hotfix back-port below: a small cut branch
off fresh `origin/develop` (e.g. `compliance-sweep/<label>`), a commit updating only the swept
declarations' front matter, and a PR into `develop` — never a direct commit to `develop`.** This
mirrors `AGENTS.md`'s and `implement`'s standing "never commit directly to develop" rule; regulator-
facing compliance evidence gets the same review path as everything else, no exception for this role.
Merge that PR (ordinary merge gate — build checks, `check:compliance` — applies) before cutting
`to-staging/<label>`, so the promoted tree carries the reconciled declarations. **No `NOT-EXECUTED-*`
declaration may reach the `staging → main` leg** — this sweep is what clears them first.

## Pre-`main` gates

Before a `release/<label>` → `main` PR: run `npm run gate:release:local` — **invoke it, do not
rebuild it** (the policy says this outright). ~25 minutes on a full run, needs local MySQL/Redis;
exit code `2` means at least one of 19 gates failed — report which, don't merge past it. Gate 19
(`release.verdict.contract`) auto-passes as "Skipped" whenever no `release_verdict.json` exists for
the target SHA — the normal case — so a green #19 is not evidence of anything; don't cite it as
verification, nor the other two gates the artifact itself flags `structurally_cannot_fail: true`
(`compliance.contracts`, `observability.evidence.report`). Since #1016, the script also accepts
`--only`/`--skip` and records per-gate `duration_ms` plus a top-level `run_mode: "full"|"partial"` —
**a promotion decision must be made on a `run_mode: "full"` artifact only**; a partial run is for
iterating on one gate locally, never for citing as promotion evidence. Also dispatch
`tenant-schema-report.yml` (#1017) with `environment: PROD` and confirm `failed_tenant_count: 0` —
this is #1007's own never-skippable gate, and it must run against **production** tenant databases
specifically, not staging's — the 2026-07-28 outage happened because schema drift was checked
against the wrong environment. Dispatching this workflow is read-only (`--mode report` only, no
write path exists in the workflow at all — see its own header comment), so it needs no checkpoint,
same as dispatching `verify-deployment.yml`.

## Unattended vs. checkpoint — stop and ask before proceeding

| Trigger | What "stop" means |
|---|---|
| Pre-flight, branch cut, PR open, merge into `develop`/`staging` | Unattended — proceed |
| Dispatching `deploy.yml` for environment `DEV` or `STAGING` | Unattended — proceed. Pat's 2026-08-16 call: this leg of "review, merge, and deploy" runs end to end without a per-dispatch ask, matching #543's "Promoter cuts/promotes staging (unattended)" framing |
| Dispatching `verify-deployment.yml` (any environment) | Unattended — every remote command it runs is read-only |
| Dispatching `deploy-main.yml` (BETA+PROD dual-deploy) | Ask, every time — no standing pre-authorization, matching `implement`'s existing deploy-dispatch tier |
| Merging a `release/<label>` PR into `main` | **Never**, no exception — restate this rule explicitly whenever the boundary is hit, don't just silently stop. The sole exception is the `incident-responder` role's narrow, explicit-phrase-gated override (`.agents/skills/incident-responder/SKILL.md`); that override belongs to that role, not this one |
| `verify-deployment.yml` reports FAIL | Report it and stop — **there is no rollback to call.** #495 (rollback mechanism) is still open; say so plainly rather than implying a recovery path exists |
| The first live run of this role, for anything **not** already covered by a specific dated row above | Report-only regardless of outcome — produce the plan and let Pat confirm before it runs unattended, matching the calibration already used for `implement`/`pr-reviewer`/`observer`/`verifier` |

### Resolving the first-live-run row against the specific dated rows (2026-08-16)

The `develop → staging` leg's first live run (2026-08-16, PR #595) surfaced a real ambiguity: the
generic "first live run is report-only" row above and the specific, dated "`deploy.yml` for
`DEV`/`STAGING` is unattended" row three rows up both apply to the same action, and pointed opposite
directions. Resolved by Pat the same day: **the specific, dated override row wins.** The
`develop`/`staging`-scoped rows above (pre-flight, branch cut, PR open, merge into
`develop`/`staging`, dispatching `deploy.yml` for `DEV`/`STAGING`, dispatching
`verify-deployment.yml`) already carry their own explicit pre-authorization and are not additionally
gated by "first live run" — that generic row now only bites where no specific row already covers the
action. It remains in full force for everything the `staging → main` leg's rows already gate
(`deploy-main.yml`, merging `main`) — those keep asking every time regardless of run count, first or
hundredth. First-run evidence for the `develop → staging` leg: PR #595 merged clean
(`mergeStateStatus: CLEAN`, 4/4 checks green); the first `deploy.yml --ref staging` dispatch
(run `31954803389`) failed on a transient GHCR push timeout on the `frontend` image (`dgfy-api` and
`dgfy-migration-runner` pushed fine; the downstream `publish` job never ran, so nothing was actually
touched server-side); a retry dispatch (run `31955916496`) was cancelled before completing, and a
second retry (run `31956577646`) succeeded, completing the deploy.

## Composite-flow chaining

See `AGENTS.md`'s "Role handoffs and composite instructions" section for what a chained "review,
merge, and deploy" instruction actually does end to end and where it hands off to Pat.

## Verified AI/model attribution

For a promotion PR, put `Opened by (..., promoter)` first under `## Summary` only when the
formatter validates the active session. Otherwise omit it; never guess or use `unknown-AI`.

## Board handling

This role owns no `Status` lane — a promotion PR isn't a per-issue card. `pr-reviewer` still sets
`For QA` on the issues bundled into whatever it promotes.

## Reference files

- `references/promotion-runbook.md` — the copy-pasteable command sequence for both legs: pre-flight,
  branch cut, PR create, checks, merge, deploy dispatch, verify dispatch.
