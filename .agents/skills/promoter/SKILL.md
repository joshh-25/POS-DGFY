---
name: promoter
description: Run a develop -> staging -> main promotion end to end on dgfy-platform, cutting the release branch(es) itself — the Promoter/Release role from issue #331/#512. Use when asked to promote develop to production, cut a release branch, or run a "review, merge, and deploy" composite instruction's deploy leg. The develop -> staging -> main soak is the default again since #1404 (2026-09-02); a direct develop -> main promotion is available only as #1007's phrase-gated exception, not a routine choice. Dispatches the STAGING deploy unattended (DEV dropped from the default flow — #982); never merges main and never dispatches a main/PROD deploy without an explicit go each time, except a narrow phrase-gated expedited override (#1007). First live run is report-only.
---

# Promoter/Release

**Portability**: this is the canonical definition of this role (#442).
`.claude/skills/promoter/SKILL.md` is a thin pointer back here — edit here, not there.

Runs a branch promotion end to end — `develop` → `staging` → `main` by default again since #1404
(2026-09-02, reversing ADR 0074/#980's 2026-08-25 two-stage default), or `develop` → `main`
directly only as #1007's phrase-gated exception — including cutting the promotion branch(es) each
leg needs. This is the "Release/Deploy captain" candidate named in #331, built out by #512 after PR
#510 was blocked because `staging` had been deleted as a side effect of using it directly as a PR
head (full incident: `docs/ops/STAGING_TO_MAIN_PROMOTION_INCIDENT_2026-07-28.md`). The
branch-per-promotion mechanism that incident produced is what makes the #1007 exception safe to
still offer — nothing about restoring `staging` to the default path changes that mechanism.

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

## The flow

**Default, since #1404 (2026-09-02) — reverses ADR 0074/#980's 2026-08-25 two-stage default; see
ADR 0074's 2026-09-02 Amendment and `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s matching entry:**
`feature → develop → to-staging/<candidate_id> → staging → release/<candidate_id>-rN → main`.
`to-staging/<candidate_id>` cuts fresh from `origin/develop`; `release/<candidate_id>-rN` then
cuts fresh from the candidate's current `origin/staging`. Every
promotion branch is a throwaway — cut fresh, no commits of its own, used once as a PR head, never
reused. Because this leg runs on every ordinary promotion again, `staging` gets refreshed as a
routine side effect of shipping — it is no longer relying only on the manual on-demand refresh ADR
0074 Decision 4 describes, though that gap (no *guaranteed* anti-rot mechanism) still stands for a
run of consecutive #1007 exceptions in a row.

**Optional, non-default: the #1007-gated expedited exception.** `feature → develop →
release/<label> → main` — skips the `staging` soak, cutting `release/<label>` fresh from
`origin/develop` instead of `origin/staging`. This is **not** a routine per-batch judgment call
(that framing applied 2026-08-25 through 2026-09-02, while this was the default) — it is invoked
**only** as #1007's own phrase-gated, logged override, defined in full in "Expedited `develop →
main` override (#1007)" below. Nothing about that mechanism changes here: same checkpoint table,
same never-skippable list (production tenant-schema report, `AGENTS.md` Merge Safety, never-
`--squash`, the `release/<label>` head-cut rule), same every-invocation restate-and-log requirement.
Only which path it is an exception *to* has flipped.

Either way, every promotion branch is a throwaway: cut fresh, carries no commits of its own, used
once as a PR head, never reused. This is **one** mechanism for however many legs a given promotion
uses, not a special case per leg (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-16 amendment).
The branch prefix is not cosmetic: `scripts/check-compliance-impact.js`'s
`PROMOTION_HEAD_PREFIX_BY_BASE` matches exactly `to-staging/*` (base `staging`) and `release/*`
(base `main`) to exempt the PR from a bundled-classification re-check that would otherwise produce
false compliance failures on an aggregate diff — get the prefix wrong and that incident reproduces.
It doesn't care what `release/<label>` was cut from (`origin/develop` or `origin/staging`), only
that the prefix and base match. Full command sequence: `references/promotion-runbook.md`.

Promotion PRs merge with `--merge` (a true merge commit), never `--squash` — confirmed as the
existing convention on every prior promotion (#127, #426); squashing would diverge the target's
history from what the next promotion diffs against.

## Frozen candidate and repair loop

The initial `develop` SHA is a release candidate, not a moving branch target. Use a candidate ID in
`YYYY-MM-DD-NN` form and validate its manifest with `scripts/check-promotion-candidate.js`. Once
`to-staging/<candidate_id>` is merged, freeze that candidate: do not re-promote a newer `develop`
wholesale into `staging` while the candidate is being qualified.

**Pre-cut floor step, before the candidate SHA is even chosen (ADR 0081 Decision 6, #1588, epic
#1548 Wave 4).** Shipping to staging is, by definition, at least a minor bump per app that actually
changed between `staging` and the candidate: `node scripts/check-app-version-bump.js --floor --base
origin/staging --head origin/develop` — reuse this script's own floor logic, don't reimplement it.
Every app it lists as below floor needs one `chore(release): bump <apps> to X.(Y+1).0 for candidate
<id>` PR opened and merged into `develop` *before* `to-staging/<candidate_id>` is cut, since a
promotion branch carries no commits of its own — the bump has to already be on `develop` by cut
time. That PR is an ordinary `develop`-base PR, no new merge authority needed (`pr-reviewer`'s
existing unattended-merge policy on `develop` already covers it, per this repo's role-handoff
convention). Full command sequence: `references/promotion-runbook.md`'s "Default: `develop` →
`staging` → `main`" section.

**Release note, authored in this same PR (#1278, ADR 0082).** Every candidate needs
`docs/releases/notes/<candidate_id>.md` committed on `develop` before the cut, same seam as the
version bump above and for the same reason — a promotion branch carries no commits of its own. If
every app is already at or above floor and no bump is otherwise needed, open the note PR anyway; it
is not optional. Full obligation and per-leg detail (authoring, `fix/staging/*` amendment, the
`release/* → main` check, and post-deploy GitHub Release publication): ADR 0082 and
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-09-06 amendment — not restated here. Command:
`references/promotion-runbook.md`, next to the candidate-manifest heredoc.

**Candidate manifest, written locally at cut time (ADR 0081 Decision 8, #1588).** The manifest
`scripts/check-promotion-candidate.js` validates is also this candidate's own tracked source
identity — `source_develop_sha` (no repairs yet) or `current_staging_sha` (once repairs land) — the
frozen SHA the promotion parity gate (below) compares against, distinct from whatever
`org.opencontainers.image.revision`/`github.sha` each environment's own merge commit happens to
carry. Written once, right after the candidate branch is cut and pushed, to
`.tmp/release-candidates/<candidate_id>.json` (never committed — a local artifact, same convention
as `.tmp/release-gates/<sha>/local_readiness.json`); updated on every staging repair and again when
`release/<candidate_id>-rN` is cut. See the runbook for the exact JSON shape.

Staging failures are repaired against the candidate's latest staging SHA. The normal repair shape
is `fix/staging/<candidate_id>-rN` cut from `origin/staging`, with a PR into `staging`; redeploy
and re-observe the same candidate after each merge. An isolated developer fix may be cherry-picked
with `git cherry-pick -x` after diff review. If it is mixed with newer work, recreate the narrow fix
on the staging repair branch. Never merge `develop` wholesale into an active candidate.

**Every repair also amends the candidate's release note, in the same PR (#1278, ADR 0082).** A
repair branch carries its own commit(s), so `docs/releases/notes/<candidate_id>.md` is edited
directly here — one new `## Included` line for the repair and an updated version-table row for
whichever app(s) it touched — never a second release-note file for the same `candidate_id`. Full
rule: ADR 0082 Decision 6, `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-09-06 amendment.

Code-level repair work is handed to Conduct with the candidate ID, exact staging SHA, failure
evidence, and repair issue. Conduct may address code, tests, migrations, API/UI behavior, or CI;
live database changes, secrets, SSH, and infrastructure operations are hard stops. The report-only
`staging-candidate-observation.yml` workflow validates combined health, migration, API, and UI
evidence without performing operational mutations.

**Backporting a `fix/staging/*` repair to `develop` (#1611, 2026-09-04) — parallel to the
post-main hotfix backport rule below, but for the pre-main leg.** Nothing before this documented
what happens to a staging-repair commit once it merges into `staging`, and the gap is real: #1611
found `develop` still carrying #1603's stale-test bug for a full promotion cycle after PR #1604
fixed it on `staging`/`main`, saved from recurring only because an unrelated `develop` commit
(#1602) happened to supersede it independently. That "happened to" is the failure mode this
paragraph closes, not a plan to rely on again. **Default: mandatory, per repair, as soon as the
`fix/staging/*` PR merges into `staging`** — don't defer it to promotion end, and don't assume the
eventual `staging → main` forward-merge covers it; that merge reaches `main`, not `develop`, and
nothing in this repo syncs `develop` from `main`/`staging` automatically. Same pattern as the
main-hotfix backport: hand off to `pm` for a fresh issue (never `Refs` the closed repair PR
directly — a closed issue can't take the `Refs #N` → `For QA` transition), `git cherry-pick -x`
the repair's commit(s) onto a branch cut fresh off `origin/develop`, and open the PR into `develop`
`Refs`-ing the fresh issue — an ordinary `develop`-base PR, no new merge authority needed.
**Skippable only with verification, never by assumption**: before skipping, diff the repair's
changed file(s)/lines against `origin/develop`'s current content and confirm `develop` already
carries equivalent content, not merely a later commit that happens to touch the same file — #1611's
own case resolved this way, by coincidence, which is exactly why "probably already fine" doesn't
qualify as verification on its own.

Only after staging observation passes may the promoter cut `release/<candidate_id>-rN` from the
current staging SHA. A pre-main failure returns to the staging repair loop; discard the stale
release head and recut it after staging changes. A post-main failure uses the incident/hotfix path
on `main`, then backports the resolved main commit to `develop` once production is stable. Do not
create a separate staging backport for a main hotfix.

## Pre-flight — run before touching any branch

The check that would have caught #426: confirm the **target** branch exists on the remote
(`git ls-remote --exit-code --heads origin main`, plus `staging` too on the default flow's soak leg)
before starting. If it's missing, restore it from the last known-good SHA and stop — do not proceed
into a promotion against a branch that isn't there. Also confirm the head you're about to cut has
never been used as a PR head before (long-lived branches — `develop`, `staging`, `main` — must never
be a head; that's the mechanism the `to-staging/`/`release/` prefixes exist to prevent).

## Pre-`main` gates

Everything below runs once per promotion batch, before `release/<label>` merges into `main` —
whether that PR came directly off `staging` (the default flow's final leg, per #1404) or directly
off `develop` (the #1007-gated exception, which skips the `staging` soak entirely). See
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment (and its 2026-09-02 #1404 reversal)
for the full ladder the #1007 exception collapses from three stages into two — the default flow
itself keeps all three.

**Stated the other direction, explicitly, since #1097 found this gets over-applied in practice:
none of this — including `gate:release:local` — runs on the `develop → staging` leg** (the
`to-staging/<label>` PR, the default flow's first leg since #1404). That leg's own procedure is in
`references/promotion-runbook.md`'s `## Default: develop → staging → main` section and stops at
`pr-checks.yml`'s build checks; don't reach for this section's gates there.

**Ordering — historical context, one real dependency remains (#1359).** This paragraph originally
described three gates (`gate:release:local`, the compliance preflight sweep, the production
tenant-schema report) that read top-to-bottom but were not a serial pipeline — caught live on the
2026-09-01/02 `staging → main` run (#1359), where `gate:release:local` was started and
`release/<label>` sat uncut for its full ~25 minutes before anyone noticed the two didn't need to
wait on each other. **Since 2026-09-03 (#1431 Phase C/D), `gate:release:local` is no longer part of
this ordering at all** — see its own section above. Only the **compliance preflight sweep** is a
real precondition on cutting the branch — no `NOT-EXECUTED-*` declaration may reach `main`, so
confirm it's clear first. Once it is, **cut `release/<label>` and open its PR into `main`
immediately** — do not wait on the production tenant-schema report first; it has no dependency on
the compliance sweep or on the branch cut/PR-open step, so dispatch it **concurrently** with cutting
the branch and opening the PR, not serially before it. The PR's own remote checks
(`promotion-quality-gate.yml`, `pr-checks.yml`) run regardless of this timing.
**Only the merge into `main` waits on all of this** — see `AGENTS.md`'s Merge Safety section and the
checkpoint table below; this reordering changes nothing about what gates the merge itself, only when
the branch/PR mechanics happen relative to the other gate. `references/promotion-runbook.md`
shows the concurrent command sequence.

Since 2026-09-02 (#1431 Phase 1, PR-A), a red `promotion-quality-gate.yml` check on the promotion PR
is a real failure to read and address before the Merge Safety poll below, not noise to skim past —
7 of its steps now drive the check-run conclusion directly, no `continue-on-error` absorbing them.

**Compliance preflight sweep — verify, don't dispatch (changed #1163/#1248, 2026-08-31; PR handoff
is now supervised, not auto-merge, #1295/#1374, 2026-09-02).** The sweep
(`compliance-preflight-sweep.yml`) is no longer a promotion-time step this role runs — it
auto-triggers whenever a declaration lands on `develop` and, once every result in a run passes,
reconciles the front matter and pushes a `compliance-sweep/<run_id>` branch
(`docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually runs"). In
the ordinary case every declaration in the batch is already reconciled by the time promotion
starts. This role's job here is two checks, not one — verify outstanding declarations, **and**
check for a stuck handoff:

```bash
git ls-files -- docs/compliance/impact-declarations | grep '\.md$' \
  | xargs -I{} sh -c 'node scripts/is-preflight-outstanding.js "{}" && echo "{}"' 2>/dev/null
gh issue list --label compliance:preflight-handoff --state open --json number,title,url
```

The first command is a **full scan of the checked-out ref**, not a `develop..main` diff — the diff
had a permanent blind spot (a declaration that reached `main` via a #1007-override promotion sits on
both branches and never appears in a diff between them; #1374's own research found 26 outstanding on
a full scan where the diff found 4). Empty output means zero outstanding.

The second command is the **fast signal for a stuck handoff**: `gh pr create` from
`github-actions[bot]` is blocked by an org-level policy (#1295), so a sweep whose preflight passed
can leave a reconciliation branch pushed with no PR ever opened for it — invisible to the first
command alone, since the declarations *are* reconciled in that pushed branch's working tree, just
not yet merged into `develop`. **If this returns any open issue, open and merge that handoff PR
before cutting `release/<label>`** — follow `docs/compliance/request-time-preflight-protocol.md`'s
"Operator handoff procedure" (find the branch/commands from the issue or the run's
`compliance-preflight-sweep-handoff` artifact, `gh pr create` + Merge Safety poll + merge). Its merge
re-triggers one more sweep that reports zero outstanding and closes the issue.

If the first command lists any file and the second returns no open issue, the continuous trigger
hasn't caught up yet (or a declaration landed via a path this repo's automation doesn't cover, e.g.
a direct commit — shouldn't happen, but check): dispatch the sweep manually and wait for it —

```bash
gh workflow run compliance-preflight-sweep.yml
gh run list --workflow=compliance-preflight-sweep.yml -L1 --json databaseId,status
```

— rather than treat a missed declaration as blocking indefinitely. The workflow runs against its
own ephemeral CI-provisioned instance now — no `environment:` input, no secrets, nothing to
provision (superseded #1121's `stage.dgfy.ph` bot-account design; see the ADR 0074 amendment dated
2026-08-31 for why). **No `NOT-EXECUTED-*` declaration may reach `main`** — unchanged — but the
sweep itself is what clears them now, continuously (once its PR is actually merged — see the handoff
check above), not a step this role dispatches and waits on per promotion; #1007's expedited override
(below) remains the one case a `NOT-EXECUTED-*` declaration may legitimately still reach `main`,
logged and authorized, not silent.

**`gate:release:local` is no longer a step in this procedure (since 2026-09-03, #1431 Phase C/D).**
Every gate it used to run locally is now delegated to `promotion-quality-gate.yml`
(`CI_ENFORCED_GATES`, 16 entries — `required_gate_count: 0` on a default run); 14 of the 16 are
blocking on this leg, and 2 (`dependencies.audit.full`, permanently; `backend.test_matrix`,
temporarily, tracked by #1469) are deliberately advisory. **Do not run this script as part of a
promotion** — there is nothing left in its required set to invoke it for. Read the promotion PR's
own `promotion-quality-gate` check instead (`gh pr checks <N>`, or per-job conclusions — see the
run-rollup trap below, never the workflow-run rollup) as the evidence for the release go/no-go
decision. `docs/testing/release-go-no-go-checklist.md` and `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`
carry the full gate-by-gate closeout; the script itself still exists for `--only`/
`--include-ci-enforced` local debugging of one specific gate, just not as a promotion gate.

**The run-rollup reading trap** (full detail: `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s
"Current state" section). `gh run view <id> --json conclusion` reports the *workflow run's* rollup
conclusion, which stays `success` even when a quality job inside it failed — the pre-existing
job-level `continue-on-error: true` spares the run rollup, not the job. The **job's** check-run is
what actually carries `failure` and what GitHub computes `mergeStateStatus` from. Read per-job
conclusions (`gh run view <id> --json jobs --jq '.jobs[]|"\(.name) \(.conclusion)"'`) or
`gh pr checks <N>` — never the run rollup — or a blocking gate will look inert when it is not.

**Production tenant-schema report — never skippable, under any circumstance including #1007's
override.** Run this concurrently with cutting `release/<label>` and opening its PR too (see
"Ordering" above) — it has no dependency on the branch cut either. Dispatch
`tenant-schema-report.yml` (#1017) with `environment: PROD` and confirm
`failed_tenant_count: 0` — this is the one control the #860/#639-class crash-loop risk depends on,
and it must run against **production** tenant databases specifically, not staging's — the
2026-07-28 outage happened because schema drift was checked against the wrong environment.
Dispatching this workflow is read-only (`--mode report` only, no write path exists in the workflow
at all — see its own header comment), so it needs no checkpoint, same as dispatching
`verify-deployment.yml`.

**Runner-routing preflight (Phase 233, #1365, H1) — run immediately before the `deploy-main.yml`
dispatch ask, not before cutting `release/<label>`.** Unlike the two gates above, this is not a
pre-`main`-merge gate at all — it's the one place the answer can still change which class the
`deploy-main.yml` dispatch actually uses. Run `npm run preflight:runner -- --target-sha <the merged
main SHA>` and read the result: exit `0` means the currently-active class (self-hosted, as of Phase
233 — no live flip has happened yet) is confirmed available, proceed with the dispatch ask as
normal; exit `3` means a documented flip is required — read the reported file:line pairs in
`deploy-main.yml`, comment/uncomment them per `docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md`'s flip
procedure (never automatically — this script never flips a routing value itself), log the flip in
the promotion PR, and only then proceed; exit `1` means the result is indeterminate or an error —
report it plainly, same as any other check state this file already treats as unresolved rather than
silently passable. Read-only (`gh api` GETs + one `curl`; the `--canary` dispatch path is opt-in
and self-cancelling) — no new checkpoint, no new authority, same classification as
`tenant-schema-report.yml`/`verify-deployment.yml` above.

**Promotion parity gate (ADR 0081 Decision 8, #1588) — runs after `deploy-main.yml`, not before
cutting `release/<label>`.** Unlike the other gates in this section, this one has a hard timing
dependency of its own: it compares the STAGING image (`X.Y.Z-staging`, already published) against
the PROD image (bare `X.Y.Z`), and the PROD image does not exist until `deploy-main.yml` actually
builds and pushes it — so it cannot run pre-merge the way the tenant-schema report and compliance
sweep do. Run it as part of deploy-dispatch verification, immediately alongside
`verify-deployment.yml -f environment=PROD`:

```bash
# Default flow (candidate manifest exists) -- compares PROD against its STAGING predecessor:
node scripts/check-image-version-parity.js --manifest .tmp/release-candidates/<candidate_id>.json

# #1007-gated exception instead (RF-2, PR #1590 review) -- this path never cuts to-staging/<label>
# and so never produces a candidate manifest for --manifest to point at; --source-sha compares
# PROD's own label directly against the develop SHA release/<label> was cut from:
node scripts/check-image-version-parity.js --source-sha <the develop SHA release/<label> was cut from>
```

`PASS` covers two distinct, both-fine outcomes on either invocation: a real label match, and a
documented "no predecessor"/"no candidate identity" case — the #1007-expedited or main-hotfix path,
where no candidate manifest (and so no `candidate_source_sha` build input) ever existed for this SHA
in the first place. Decision 8's own text calls that expected evidence, not a defect; do not treat
it as a finding. `FAIL` (`mismatch`, `prod-unreadable`, or — `--manifest` mode only —
`staging-unreadable`, an existing STAGING image whose label regressed rather than one that's simply
absent) means the published PROD image does not actually trace back to where it should — report and
escalate the same way a `verify-deployment.yml` failure is handled (#495: no rollback exists), don't
wave it through. Read-only (`docker buildx imagetools inspect` only, no push) — no new checkpoint,
same classification as `verify-deployment.yml`.

**Publish the GitHub Release (#1278, ADR 0082) — after the parity gate above confirms the deploy,
not before.** Tag `release-<candidate_id>` on the deployed `main` commit and publish a GitHub
Release from the candidate's committed `docs/releases/notes/<candidate_id>.md`, mirroring the #615
Android precedent (`gh release create`, full command in `references/promotion-runbook.md` next to
the parity-gate block). The committed file stays authoritative; this Release is a published mirror
cut from it, never edited independently. This is a post-deploy **record** of a deploy Pat already
authorized via the PROD dispatch ask above — not a new deploy mutation, not a second dispatch, and
not itself gated by the deploy-dispatch checkpoint. See the checkpoint table below for the explicit
unattended classification and the reasoning for it.

## Expedited `develop → main` override (#1007)

A second, narrow, phrase-gated exception to "never merge `main`" — parallel to, and independent of,
`incident-responder`'s existing override (that one is scoped to an actively open production
incident; this one is scoped to Pat's own business-urgency call, which is not necessarily an
incident). Mirrors `incident-responder`'s shape exactly: phrase-gated, restated every invocation,
logged before acting. Full definition:
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s "2026-08-25: Retire `staging`... and an expedited override"
amendment — read it there for the complete skippable/never-skippable list and the retro-verification
requirement; not re-derived here beyond the checkpoint-table row below.

**"Signed review" means**, per #1007's resolved reading: Pat's explicit real-time phrase, given in
the moment (never a standing pre-authorization, never inferred from urgency alone), plus a comment
on the promotion PR or tracking issue naming who authorized it, what's being skipped, and why —
logged before the merge, not after. Not a revival of ADR 0030's cryptographic signing model.

## Unattended vs. checkpoint — stop and ask before proceeding

| Trigger | What "stop" means |
|---|---|
| Pre-flight, branch cut, PR open, merge into `develop`, or into `staging` (the default soak leg) | Unattended — proceed |
| Running `node scripts/check-app-version-bump.js --floor` before cutting `to-staging/<candidate_id>` (ADR 0081 Decision 6, #1588), and opening/merging the resulting bump PR into `develop` if any app is below floor | Unattended — read-only check; the bump PR is an ordinary `develop`-base PR, already covered by the row above |
| Dispatching `deploy.yml` for environment `STAGING` | Unattended — proceed. Pat's 2026-08-16 call: this leg of "review, merge, and deploy" runs end to end without a per-dispatch ask, matching #543's "Promoter cuts/promotes staging (unattended)" framing |
| Dispatching `deploy.yml` for environment `DEV` | **Dropped from the default flow entirely (#982) — not a routine step, and not an ask-first fallback either.** DEV is optional and intentionally allowed to go stale; dispatch it only when specifically asked for, never implied by a "review, merge, and deploy" composite instruction |
| Dispatching `verify-deployment.yml` (any environment) | Unattended — every remote command it runs is read-only |
| Dispatching `tenant-schema-report.yml` (any environment, including PROD) | Unattended — read-only, `--mode report` only, no write path exists |
| Running `node scripts/check-image-version-parity.js` after `deploy-main.yml` (ADR 0081 Decision 8, #1588) | Unattended — read-only, `docker buildx imagetools inspect` only, no push |
| Publishing the GitHub Release (`gh release create release-<candidate_id> ...`) after the promotion parity gate confirms the deploy (#1278, ADR 0082) | Unattended — this is a post-deploy **record** of a deploy Pat already authorized at the PROD dispatch ask, not a mutation of a deployed environment and not a second deploy dispatch. Do not confuse it with the `deploy-main.yml` dispatch row below, which stays an every-time ask |
| Running `npm run preflight:runner` (Phase 233, #1365, H1) before the `deploy-main.yml` dispatch ask | Unattended — read-only (`gh api`/`curl`, self-cancelling `--canary` if used). An exit-`3` "flip required" result still requires logging the flip in the promotion PR before acting on it — that's a documentation step, not a new ask |
| Dispatching `compliance-preflight-sweep.yml` manually (backfill, or the declaration hasn't cleared automatically yet) | Unattended — runs against its own ephemeral CI-provisioned instance, no deployed environment touched. No longer auto-merges (#1295/#1374): a passing run pushes its reconciliation branch and attempts the PR, but a policy-blocked `gh pr create` finishes green-with-warning and hands off to a human/credentialed AI session instead — see "Compliance preflight sweep" above. Dispatching itself is still unattended either way, same reasoning as `verify-deployment.yml`'s read-only classification |
| Opening and merging a stuck compliance-sweep handoff PR (per the "Compliance preflight sweep" fast-signal check above, before cutting `release/<label>`) | Unattended — same reasoning as any other `develop`-base PR merge in this role's table (pre-flight, branch cut, PR open, merge into `develop` row above): no destructive action, no `main`, and every declaration in it already passed a real preflight evaluation before the branch was ever pushed. Still subject to `AGENTS.md`'s Merge Safety hard stop, unchanged |
| Dispatching `deploy-main.yml` (PROD deploy) | Ask, every time — no standing pre-authorization, matching `implement`'s existing deploy-dispatch tier |
| Merging a `release/<label>` PR into `main` | **Never**, no exception — restate this rule explicitly whenever the boundary is hit, don't just silently stop. **Two** narrow, phrase-gated exceptions exist, neither a standing pre-authorization: `incident-responder`'s own override for an actively open production incident (`.agents/skills/incident-responder/SKILL.md` — belongs to that role, invoked there, not here), and this role's own #1007 expedited override (below) for Pat's business-urgency call, invoked here |
| Invoking the #1007 expedited override (skipping `gate:release:local` and/or the compliance preflight sweep before a `main` merge) | **Only** on Pat's explicit real-time phrase given in this exact moment — never inferred, never a standing pre-authorization from a prior invocation. Restate the standing "these are normally required" rule out loud, then post the authorization comment on the promotion PR/tracking issue **before** merging, not after. The production tenant-schema report, `AGENTS.md` Merge Safety, never-`--squash`, and the `release/` head-cut rule stay mandatory regardless — this override never touches those. Run the retro-verification checklist (`RELEASE_CANDIDATE_POLICY.md`'s amendment) afterward as part of "done," not a follow-up |
| `verify-deployment.yml` reports FAIL | Report it and stop — **there is no rollback to call.** #495 (rollback mechanism) is still open; say so plainly rather than implying a recovery path exists |
| The first live run of this role, for anything **not** already covered by a specific dated row above | Report-only regardless of outcome — produce the plan and let Pat confirm before it runs unattended, matching the calibration already used for `implement`/`pr-reviewer`/`observer`/`verifier`. This explicitly includes the first live invocation of the #1007 override — report-only even with Pat's phrase given, until calibrated |

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

**Note (2026-09-04, #982):** DEV dispatch was deprioritized around 2026-08-24 and formally dropped
from the default flow by Pat's 2026-08-25 decision on #982 — DEV is now optional and intentionally
allowed to go stale, never a routine step. The evidence above (PR #595, runs `31954803389`/
`31955916496`/`31956577646`) predates that decision and is kept as the historical record of this
row's first live run, not as license to keep dispatching DEV routinely. See the checkpoint table
above for the current DEV/STAGING split.

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

- `references/promotion-runbook.md` — the copy-pasteable command sequence for the default
  three-stage flow and the #1007-gated two-stage exception: pre-flight, branch cut, PR create,
  checks, merge, deploy dispatch, verify dispatch.
