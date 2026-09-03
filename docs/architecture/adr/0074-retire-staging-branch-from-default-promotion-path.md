---
status: amended
authority_level: authoritative
owner: release
date: 2026-08-25
last_reviewed: 2026-09-03
review_by: 2027-02-25
applies_to: development_to_production_release_flow
topic: retire_staging_branch_from_default_promotion_path
---

# ADR 0074: Retire the `staging` Branch From the Default Promotion Path

## Status

Accepted (2026-08-25)

## Context

Filed as issue #980 (2026-08-25), part of #1008's Phase 4. Pat's own framing, verbatim:

> considering removing `staging` from the standard promotion pipeline — keep the `staging`
> environment, but stop triggering it as part of promotion... Staging adds delay to shipping. Dev
> and staging are rarely actually tested. Dev and staging are intermittently accessible.

`docs/ops/RELEASE_CANDIDATE_POLICY.md` (authoritative) currently defines the flow as
`feature branch -> develop -> to-staging/<label> -> staging -> release/<label> -> main`. Removing a
stage from that flow that other governed mechanisms depend on (the compliance preflight sweep, the
production tenant-schema report) is an architecturally significant change, not a doc tweak — hence
an ADR rather than another dated Amendments block on the policy doc alone, per #980's own framing.

Two things make this affordable now that weren't true when the three-stage flow was designed:

1. **#1018 (2026-08-25, PR #1036, merged)** made the full quality gate
   (`promotion-quality-gate.yml`) cheap enough to run automatically, once per promotion, in CI —
   closing the gap that made a `staging` soak the only place a full test pass ever ran before this.
2. **#1015/#1016** cut the backend test matrix from ~19.6min to ~2-4min and made
   `gate:release:local` instrumented/selectable (`--only`/`--skip`), so the promoter's own local
   pre-flight is no longer a 25-minute unconditional block either.

**A real precedent already exists for what a `develop → main` promotion looks like without a
`staging` soak**: #860 documents PR #858 (2026-08-22), promoted directly under explicit time
pressure, skipping both the `staging` leg and the two pre-`main` gates. That promotion's own
finding is the risk this ADR has to answer, not gloss over: the tenant preflight is unconditional
and all-or-nothing under `NODE_ENV=production`, and normally the `staging` soak is where a
schema-shaped mistake surfaces first. #860 also recorded a real, if minor, cost of keeping `staging`
un-promoted-to: it drifted 103 commits stale from a single skipped cycle.

**Considered and rejected: fix `staging`'s accessibility instead of removing the gate.** #408/#409
(non-production environment resource efficiency, sharing MySQL/Redis between DEV and STAGING) are
already open, tracking exactly reason 3 above (intermittent accessibility). This ADR does not
replace that work — if #408/#409 land, `staging` becomes a more reliable *environment*, which is
still useful for the non-default, on-demand path this ADR keeps (Decision 3). But it doesn't answer
reason 1 (delay) or reason 2 (rarely tested) — an environment nobody promotes through by default is
still rarely tested regardless of how reliable it is. Rejected as a substitute for this decision,
accepted as complementary follow-up work outside this ADR's scope.

**Adjacent decision already resolved, not reopened here:** #927 ("where does the quality-gate
workflow run in the promotion flow") was resolved by #1018 itself — see
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment. Nothing in this ADR revisits that.

## Decision

1. **The default promotion path becomes `feature branch -> develop -> release/<label> -> main`** —
   two stages, not three. `release/<label>` is cut fresh from `origin/develop` (not `origin/staging`
   — the intermediate stage this branch was cut from no longer exists in the default path) and PRs
   directly into `main`. `[default]`
2. **The `staging` *environment* is retained.** It stops being part of the default promotion
   gate but keeps serving whatever it currently serves (manual QA access, a pre-prod target for
   ad-hoc verification). `[default]`
3. **The `staging` *branch* and its `to-staging/<label> -> staging` PR mechanism are not deleted** —
   kept available as a non-default, optional path. A promoter may still choose to route a
   particularly risky batch through a `staging` soak before cutting `release/<label>`, using the
   existing mechanism unchanged; nothing about this ADR requires it, and nothing about it forbids
   it. `promotion-quality-gate.yml`'s `staging`/`to-staging/*` trigger stays as-is — dormant under
   the new default, still functional if the optional path is used. Deleting a working mechanism to
   save one dormant CI trigger condition is not a trade this ADR makes. `[default]`
4. **`staging` is refreshed on demand, not automatically.** Fast-forwarding `staging` to `develop`'s
   current HEAD is a manual, best-effort action a promoter takes when `staging` is actually needed
   for something (e.g. before deciding whether to route a batch through the optional soak in
   Decision 3) — a direct `git push --force-with-lease` fast-forward, not a PR, matching how
   `RELEASE_CANDIDATE_POLICY.md` already reasons about `develop` being un-deletable by GitHub.
   **There is no automatic anti-rot mechanism.** #980 asked this question explicitly and it is
   answered here directly rather than left implicit: `staging` is expected to drift stale between
   uses, the same way it already did once (#860, 103 commits) under the old three-stage flow the
   one time it was skipped. This is a named, accepted gap, not a solved one — if `staging`'s
   accuracy needs to be guaranteed rather than best-effort, that is new scope, not something this
   ADR builds. `[default]`
5. **The compliance preflight sweep re-anchors to the `develop -> main` leg**, run once per batch
   before `release/<label>` is cut — the same mechanism (`POST /api/v1/compliance/preflight`
   against a deployed non-production host, DEV sufficing), just anchored to the one promotion leg
   that now exists instead of the `develop -> staging` leg that no longer runs by default.
   `[default]`
6. **The production tenant-schema-sync report (#1017, `tenant-schema-report.yml`) stays mandatory
   before every merge into `main`, checked against production tenant databases specifically** — this
   is the exact fail-closed control the whole #860/#639 risk chain depends on, and removing a
   pipeline stage does not get to also remove the control that stage used to make redundant.
   `[binding]`
7. **`npm run gate:release:local` (`run_mode: "full"`) stays mandatory before every `develop -> main`
   promotion PR is opened, against the exact target SHA** — unaffected by dropping a stage, since it
   was already anchored to the leg immediately before `main`, which is still the leg immediately
   before `main`. `[default]`
8. **Unaffected and unchanged by this ADR, restated so it isn't assumed away**: `AGENTS.md`'s Merge
   Safety hard stop (no check `in_progress`/`queued`, `mergeStateStatus: CLEAN`), the never-`--squash`
   rule, and the promotion-branch head-cut rule (`release/<label>`, never a long-lived branch as
   head — the #426 incident this guards against). `[binding]`
9. **#1007's expedited-override mechanism is defined in `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s own
   Amendments and `.agents/skills/promoter/SKILL.md`, not duplicated here** — this ADR accepts that
   `promoter` carries a narrow, phrase-gated exception to skip `gate:release:local` and/or the
   compliance preflight sweep (never the tenant-schema report, never Decision 6/8 above), mirroring
   `incident-responder`'s existing `main`-merge override in shape. See those two documents for the
   actual mechanism. `[default]`
10. **`docs/ops/NO_STAGING_RELEASE_STANDARD.md` is retired** (#1019) — it describes the already-
    superseded ADR-0030 signed-controller model and asserts "there is no unsigned emergency bypass,"
    directly contradicting Decision 9. Its retirement is executed as a doc change in the same PR
    that lands this ADR, not a separate follow-up. `[default]`

## Consequences

- **#495 (no rollback mechanism) and #639 (tenant schema repair silently disarmed on deploy) are
  accepted standing risk, not a prerequisite for this ADR.** Neither is made worse by dropping a
  pipeline stage — the compensating control (Decision 6, tenant-schema report against production)
  was already the thing that would catch the #639-class failure mode before merge, independent of
  whether a `staging` soak ran first. Closing #495/#639 remains valuable but is not gated on, or by,
  this decision.
- A promotion is now faster by construction — one fewer PR, one fewer set of checks to wait on,
  before a change reaches `main`. This is the explicit goal (#980's stated reason 1).
- `staging` becomes a genuinely optional safety net rather than a mandatory gate. Anyone relying on
  "if it's wrong, `staging` will have caught it" needs to stop relying on that by default — the
  tenant-schema report and `gate:release:local` are now the only mandatory backstops between
  `develop` and production for a change that skips the optional soak.
- `.agents/skills/promoter/SKILL.md`'s flow diagram, pre-flight, and gate sections all change to
  match — see that file directly rather than this ADR for the executable procedure.

## Alternatives considered

- **Fix #408/#409 instead of removing the gate** — addresses accessibility (reason 3) but not delay
  (reason 1) or actual usage (reason 2); rejected as a substitute, kept as complementary follow-up.
- **Decommission `staging` outright** (delete the branch, retire the environment) — rejected;
  Pat's own framing was explicit about keeping the environment, and Decision 3 keeps the branch
  mechanism too rather than forcing a rebuild later if the optional path is ever wanted again.
- **Auto-refresh `staging` on every `develop` merge** — considered as an anti-rot mechanism for
  Decision 4; rejected as new scope this ADR doesn't need to build to answer #980's question. Named
  as an open door for a future change, not built here.

## Interaction with #860

#980 explicitly asked how #860's own "procedure for next time" work interacts with this ADR — stated
here rather than left implicit. #860's own Definition of Done already resolved this on its own:
"Procedure for next time — moved to #1007, not tracked here anymore." #860 itself carries no
standing "expedited exception" framing left to retire or rewrite; it deferred that work to #1007 in
full, and #1007's mechanism (Decision 9 above, defined in `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s
2026-08-25 amendment) is that deferred work's actual, shipped answer. #860 itself remains open only
for its own narrower, unrelated retro-verification checklist (confirming PR #858's specific
promotion was sound) — unaffected by this ADR either way.

## Amendments

### 2026-08-26 — `promotion-quality-gate.yml` no longer runs at all on the optional soak leg (#1063)

- Clause amended: **Decision 3** (`[default]` tier per ADR 0039). The clause it amends: "`
  promotion-quality-gate.yml`'s `staging`/`to-staging/*` trigger stays as-is — dormant under the new
  default, still functional if the optional path is used." That's no longer accurate on its own —
  restated here rather than left silently stale.
- Change: `promotion-quality-gate.yml` is suspected stale/unreliable and needs dedicated
  investigation time (#1063). Until that's resolved: every quality job in the workflow is skipped
  entirely (not just non-blocking) when triggered via `to-staging/*` → `staging` — i.e. the optional
  soak path Decision 3 describes as "still functional" currently runs with **no** quality-gate
  signal at all, not a degraded one. On the `release/*` → `main` leg (and the default two-stage
  path this ADR's own Decision 1 established), the workflow still runs in full but is
  unconditionally `continue-on-error` — not blocking (the 2026-08-26 #1066 correction below revises
  "visible" specifically: under the step-level fix a red run reports as a green check-run by
  design, so "visible" now means a deduped comment on #1063, not the Checks tab).
- Reason: same as `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-26 amendment, which is the
  authoritative record of the full rationale and exit condition — not duplicated here. This ADR's
  amendment exists only so Decision 3's own claim about the CI trigger doesn't go stale in place.
- Scope check against this ADR's `[binding]` clauses, confirmed unaffected: Decision 6 (production
  tenant-schema report) and Decision 8 (`AGENTS.md` Merge Safety, never-`--squash`, the
  `release/<label>` head-cut rule) are untouched — this amendment only concerns
  `promotion-quality-gate.yml`'s own blocking behavior, a `[default]`-tier detail, not any
  `[binding]` control.
- Not a prerequisite for, or triggered by, #495/#639 — same standing-risk framing as this ADR's own
  Consequences section already states.
- PR: #1064. Tracked as #1063.

### 2026-08-26 — correction: job-level `continue-on-error` didn't clear `mergeStateStatus` (#1066)

- Clause amended: this ADR's own amendment immediately above, which asserted Decision 8
  (`AGENTS.md` Merge Safety) was "untouched" by the prior change. True of the rule itself, false in
  practice — confirmed live on PR #1066 that the prior shape (job-level `continue-on-error: true`
  only) did not clear `mergeStateStatus`, and so did not actually let a promotion PR satisfy
  Decision 8's `mergeStateStatus: CLEAN` requirement despite this workflow's advisory design intent.
- Change: `promotion-quality-gate.yml` now carries `continue-on-error: true` on every individual
  step within each quality job, not just at job level — that's the mechanism GitHub Actions actually
  uses to keep a job's own check-run conclusion (and therefore `mergeStateStatus`) green regardless
  of an internal failure; job-level alone only spares the workflow run's own rollup. Full rationale:
  `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-26 correction entry (authoritative record, not
  duplicated here). A new job in the same workflow (`report-advisory-failures`) records each real
  per-step outcome from `steps.<id>.outcome` (the pre-override result — the one field that actually
  survives `continue-on-error`, exposed as a per-job `outputs.real_failures`) and posts it as a
  deduped comment on #1063, so the now-hidden signal isn't lost entirely — not the Actions Jobs API,
  whose `steps[].conclusion` is post-override and would never report a failure this workflow now
  swallows (see the second correction below).
- Scope check, confirmed unaffected: Decision 8 itself is not weakened or reinterpreted — it still
  requires `mergeStateStatus: CLEAN` before any merge, unconditionally. What changed is only whether
  `promotion-quality-gate.yml`'s advisory design can actually produce that state, a `[default]`-tier
  implementation detail, not the `[binding]` control itself.
- PR: #1068. Refs #1063, #1066.

### 2026-08-26 — second correction: the Actions API and the service-container gap (#1066 round 2)

- Clause amended: the correction immediately above, on two counts — one what it said, one what it
  left unaddressed.
- Change 1 (what it said): the amendment above originally described `report-advisory-failures` as
  re-deriving real per-step outcomes "from the Actions API." That mechanism never worked —
  `steps[].conclusion` via the Actions Jobs API is the *post-override* value (matches the
  `conclusion` context, not `outcome`); a step with `continue-on-error: true` that genuinely fails
  still reports `conclusion: "success"` there. Caught by pr-reviewer on PR #1068's own review round
  and confirmed independently against this repo's run `32620370627`. Fixed in the same PR before
  merge: each quality job now records `steps.<id>.outcome` (the pre-override result) directly into
  its own job output, consumed by `report-advisory-failures` via `needs.<job>.outputs.real_failures`
  — no Actions API call involved in detection at all. The text above is corrected to match rather
  than left describing the mechanism that never worked.
- Change 2 (what it left unaddressed): the first #1066 fix left the `mysql`/`redis` `services:`
  blocks on `dgfy-api-quality`/`migration-runner-quality` as a documented "known, accepted residual
  gap" — GitHub's own service-container provisioning happens before any step runs, outside
  continue-on-error's reach at any level, so a failing container could still leave one of those two
  jobs' check-run red. pr-reviewer correctly refused a PR-body declaration as a substitute for
  fixing it. Both `services:` blocks are replaced with ordinary steps (start/wait/stop the same
  containers via `docker run`), which the existing continue-on-error and reporting mechanism already
  covers like any other step — no new Decision-level exception needed. Full detail in the workflow
  file's own top-of-file comment, not duplicated here.
- Scope check, confirmed unaffected: same as the correction above — Decision 8 itself is untouched;
  this closes the gap between the advisory *design* and what it could actually produce.
- PR: #1068. Refs #1063, #1066.

### 2026-08-31 — Decision 5's preflight target: ephemeral CI instance, not a deployed host (#1163/#1248)

- Clause amended: Decision 5, `[default]` tier — "the compliance preflight sweep re-anchors to the
  `develop -> main` leg ... against a deployed non-production host, DEV sufficing."
- Why: the deployed-host requirement was never actually satisfiable. Its four
  `PREFLIGHT_HOST`/`PREFLIGHT_COMPANY_TOKEN`/`PREFLIGHT_BOT_EMAIL`/`PREFLIGHT_BOT_PASSWORD` GitHub
  Environment secrets were never provisioned on either `STAGING` or `DEV` (#1163, confirmed empty
  2026-08-29) and blocked the 2026-08-29 `develop -> main` promotion outright, requiring #1007's
  expedited override to ship. Investigating why led to the actual finding: a deployed host bought
  no compliance property this ADR's own reasoning depends on. The preflight endpoint
  (`POST /api/v1/compliance/preflight`) writes nothing, never executes the change's code (it
  evaluates the declaration's *proposed* `impact_declaration` payload against the target tenant's
  own compliance posture, not the host's deployed version), and its response carries no
  server-generated request id — `preflight_request_ref` was always entirely operator-authored.
  `docs/ops/RELEASE_CANDIDATE_POLICY.md` (authoritative) already states the principle this
  requirement violated: "A merge gate ... must be satisfiable without a deployed environment, or
  every leg that needs one becomes circular."
- Change: the sweep (`.github/workflows/compliance-preflight-sweep.yml`) now provisions its own
  ephemeral `mysql` + `redis` + `dgfy-api` instance on the CI runner, seeds a throwaway fixture
  tenant + `settings:edit` bot (`apps/dgfy-api/scripts/seed-preflight-fixture.js`, using the
  existing `provisionTenant()` service — not a new provisioning path), and calls the real endpoint
  over `127.0.0.1`. No GitHub Environment, no secrets, nothing to provision or rotate by hand.
  Confirmed live end to end (#1163/#1248 spike, 2026-08-31): a real declaration from the
  2026-08-31 batch returned `result: no_breach`, `can_proceed: true` from the real endpoint. Also
  now auto-triggers on any `develop` push touching `docs/compliance/impact-declarations/**` and
  reconciles + auto-merges a PR when every result passes, rather than waiting for the promotion
  leg — so the sweep is continuous, not a promotion-time gate a batch can still get blocked on.
- Scope check, confirmed unaffected: the pinned fixture posture
  (`complianceMode: 'non_compliant'`, `plan: 'premium'`, `subscription_status: 'active'`) is
  strictly more reproducible than the deployed host it replaces — a tenant on `stage.dgfy.ph` is
  unpinned and drifts with whoever last edited its settings; this one is recreated identically
  every run. Decisions 6 (production tenant-schema report) and 8 (Merge Safety) are untouched —
  neither concerns preflight.
- Supersedes: #1163, which tracked provisioning the manual bot account and secrets this change
  removes the need for.
- PR: (this PR). Refs #1163, #1248.

### 2026-09-02 — Decision 5's PR handoff: supervised, not auto-merge; discovery: full scan (#1295/#1374)

- Clause amended: Decision 5, `[default]` tier — the 2026-08-31 amendment above's "reconciles +
  auto-merges a PR when every result passes" and its implicit "auto-triggers ... rather than waiting
  for the promotion leg" discovery mechanism (a `develop..main` diff).
- Why (PR open + merge): an org-level policy blocks `github-actions[bot]` from creating or approving
  pull requests outright — confirmed live across four separate runs (33531804412 / 33536811560 /
  33542764832 / 33545741502) where the preflight itself had genuinely PASSED, red only at the PR-
  create step, rendering identically to a real compliance breach with no way to tell the two apart
  from the run's own red status. #1295 settled the underlying policy question: no PAT bot, no direct
  commit to `develop`; a human or credentialed AI session opens and merges the PR.
- Why (discovery): the `develop..main` diff had a permanent blind spot — a declaration that reached
  `main` via #1007's expedited-override path sits on *both* branches and never appears in a diff
  between them. #1374's own research, 2026-09-02: a full scan of `develop` found 26 outstanding
  declarations where the diff found 4, and the promoter's own verification snippet (using the same
  diff) truthfully reported "0 outstanding" on a real promotion PR while 22 sat unreconciled on
  `main`.
- Change: the sweep still pushes the reconciliation branch and still *attempts* `gh pr create` every
  run (so the loop self-heals for free if that org policy ever changes), but now classifies the
  result (`scripts/report-preflight-sweep-outcome.js`'s `classifyPrCreate`) instead of treating every
  non-zero exit as an undifferentiated failure: a policy-blocked create finishes the run **green**
  with a `::warning::` (`handoff_required`) rather than red, backed by a
  `compliance-preflight-sweep-handoff` artifact and a filed/updated `compliance:preflight-handoff`
  GitHub issue naming the branch, head/base SHA, swept declarations, and the exact operator commands
  to finish the handoff; any other create/merge failure is still a genuine, red handoff error. A real
  preflight failure (`overall_fail=1`) is unchanged — still red — and now also files/updates a
  `compliance:preflight-failed` issue. Discovery switches from the `develop..main` diff to a full
  scan of the checked-out ref (`git ls-files` under `docs/compliance/impact-declarations/`, filtered
  by `scripts/is-preflight-outstanding.js`) — **every outstanding declaration on the checked-out
  ref**, not a diff against any other branch. Full detail:
  `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and
  "Operator handoff procedure" sections.
- Scope check, confirmed unaffected: the ephemeral-target mechanism from the 2026-08-31 amendment
  (fixture tenant, no deployed host, no secrets) is untouched — this amendment only changes who opens
  the resulting PR and how the sweep finds its own work, not how the preflight call itself runs.
  Decisions 6 (production tenant-schema report) and 8 (Merge Safety) remain untouched — the handoff
  PR is still subject to Merge Safety like every other GitHub merge in this repo, unchanged.
- Risk noted, not resolved here: the first sweep run after this change reconciles all 26 currently-
  outstanding declarations into one handoff branch/issue in a single run (the discovery blind spot's
  own backlog); `promoter`'s own verification step now blocks on that one PR merging before cutting
  `release/<label>`. All-or-nothing reconcile is unchanged — one `breach` in that batch blocks the
  other 25 from reconciling until resolved; partial reconciliation is a flagged follow-up, not this
  change.
- PR: (this PR). Refs #1295, #1374.

### 2026-09-02 — not-applicable preflight outcome (#1396)

- Clause amended: Decision 5, `[default]` tier — the reconciliation write path (the 2026-08-25 and
  2026-08-31 amendments above) previously only ever wrote a `PREFLIGHT-*` ref for a `result:
  no_breach` pass; it had no outcome for a declaration the live endpoint cannot evaluate at all.
- Why: `docs/compliance/impact-declarations/2026-09-05-discovery-delivery-from-price.md`
  (`classification: minor`, `surfaces: storefront`) 422s at the live endpoint — of 315 declarations
  scanned, the only one with a `NOT-EXECUTED-*` ref and no endpoint-accepted surface. Widening the
  endpoint's accepted-surface enum to include `storefront` was researched and rejected as a no-op
  (no storefront rule exists in `compliancePolicyEngine.js`; see
  `docs/compliance/request-time-preflight-protocol.md`'s "Not applicable to live preflight" section
  for the full reasoning).
- Change: `scripts/build-preflight-request.js` classifies this case before any HTTP call
  (`classifyEndpointApplicability`) and exits 3 with a JSON marker; the sweep step records
  `{http_code: "n/a", verdict: {pass: true, result: "not_applicable", can_proceed: true,
  reason_code: "NO_ENDPOINT_ACCEPTED_SURFACE"}}` and skips the curl call entirely.
  `scripts/reconcile-preflight-declarations.js` writes `preflight_request_ref:
  NOT-APPLICABLE-<run_id>-<slug>` for that result (`PREFLIGHT-*` unchanged for every other pass).
  `scripts/report-preflight-sweep-outcome.js` treats a `not_applicable` + `pass:true` row as passing
  (not a failure) and renders it in its own "Not applicable to live preflight" section in the
  summary, the handoff issue, and the `compliance-preflight-sweep-handoff` artifact, so the human
  merging the handoff PR sees it named explicitly rather than folded silently into the same list as
  a real `no_breach` pass.
- Scope, stated plainly: **`minor`-classification only.** `check-compliance-impact.js`'s
  `PREFLIGHT_REQUIRED_CLASSIFICATIONS` is unchanged and still hard-requires
  `preflight_result=no_breach` for `major`/`regulatory` — a `major`/`regulatory` declaration with no
  endpoint-accepted surface fails closed (exit 1), never reconciled as not-applicable.
  `complianceValidator.js` is untouched (compliance-sensitive, and unnecessary under this design).
- PR: (this PR). Refs #1396, #1402.

### 2026-09-02 — Reverse Decision 1: restore `develop → staging → main` as the default;
`develop → main` becomes the #1007-gated exception (#1404)

- Clause amended: **Decision 1** (`[default]` tier per ADR 0039) and, as a consequence, the framing
  of **Decision 3** (also `[default]`). Decision 1's original text ("The default promotion path
  becomes `feature branch -> develop -> release/<label> -> main` — two stages, not three") is
  reversed. Decision 3's original text ("kept available as a non-default, optional path... nothing
  about this ADR requires it") is inverted the other way: the three-stage soak is no longer the
  optional add-on, it is the default; the direct two-stage path is now the thing a promoter needs a
  stated reason to choose.
- Why: this ADR's own Decision 1 and #1007 ("Define an expedited develop→main promotion override
  for promoter"), filed the *same day* (2026-08-25) as part of the same parent epic (#1008), stated
  opposite defaults. #1007's own body quotes Pat directly: "...develop -> staging -> main takes
  time... that is understandable under normal circumstances, and should be the best practice... Let's
  make this rule loose and allow the promoter to directly promote to main [as an exception]" — and
  states outright "The normal ... flow stays the default/best-practice path. This is an exception
  mechanism on top of it, not a replacement." #1008's own Definition of Done anticipated exactly this
  clash ("Whichever amendment lands second should reconcile against the other") and that
  reconciliation never happened until now. Confirmed 2026-09-02 (Pat, #1404): #1007's framing was the
  correct one; this ADR's Decision 1 should have matched it instead of overriding it.
- Change: `feature branch -> develop -> to-staging/<label> -> staging -> release/<label> -> main`
  (three-stage) is the default/best-practice path again. `feature branch -> develop ->
  release/<label> -> main` (direct, two-stage) becomes the deliberate, gated exception — invoked
  **only** through the mechanism #1007 already defined and implemented, unchanged: Pat's explicit
  real-time phrase (never inferred, never a standing pre-authorization), the standing-rule
  restatement before acting, a logged authorization comment posted before the merge, and the
  never-skippable list (production tenant-schema-sync report, `AGENTS.md` Merge Safety, never-
  `--squash`, the `release/<label>` head-cut rule) staying exactly as mandatory as it already was.
  Nothing about #1007's design changes — only which flow it is now an exception *to*.
- Explicitly unaffected, restated so it isn't assumed away: the engineering enablers this ADR's own
  Context section cited to justify affordability — **#1018/PR #1036** (the CI quality gate cheap
  enough to run every promotion) and **#1015/#1016** (the backend test-matrix cut + selectable
  `gate:release:local`) — stay merged and useful regardless of which path is default. They are what
  makes running the full gate on *every* promotion (not just risky ones) affordable; that property
  doesn't depend on which flow shape is presumed by default, and this reversal does not revert,
  disable, or reduce the value of either.
- Decision 4 (`staging` refreshed on demand only, no automatic anti-rot mechanism) is not amended,
  but is now largely self-resolving as a side effect: since every ordinary promotion's
  `to-staging/<label> -> staging` leg runs by default again, `staging` gets refreshed as a routine
  part of shipping, not only on manual demand. The named gap (no *guaranteed* anti-rot mechanism)
  still stands — a run of consecutive #1007 exceptions can still leave `staging` stale, same as any
  other gap in front of that override — this is an observation, not a new decision, and not a
  prerequisite for anything here.
- Decisions 2 (`staging` environment retained), 5 (compliance sweep anchor), 6 (tenant-schema report
  mandatory, `[binding]`), 7 (`gate:release:local` at the leg before `main`), 8 (Merge Safety /
  no-squash / head-cut, `[binding]`), 9 (#1007's mechanism defined elsewhere), and 10
  (`NO_STAGING_RELEASE_STANDARD.md` stays retired) are **untouched** — none of them asserted a
  two-stage-is-default premise; Decision 9 in particular already anticipated this exact kind of
  amendment ("this ADR accepts that `promoter` carries a narrow, phrase-gated exception... mirroring
  `incident-responder`'s existing `main`-merge override in shape").
- Consequences section correction: its claim "a promotion is now faster by construction... This is
  the explicit goal" no longer describes the default case — restated here rather than left stale in
  place (matching this file's own established correction convention): the *default* promotion is
  once again the three-stage flow's full wall-clock cost; the speed gain is now available on demand,
  bounded and audited, via the #1007 exception, not by construction on every promotion.
- Scope check against this issue's own explicit boundary: #1007's mechanism/design (the phrase gate,
  the checkpoint table, the never-skippable list) is **not** touched by this entry — only its
  relationship to "the default" is restored to what #1007 itself already stated.
- Related: reconciles #1008's Definition of Done item 3 ("The two amendments are reconciled with
  each other") — #1008's own checklist should be updated to reflect this once this PR merges (not
  done in this PR — see the PR description note below).
- PR: (this PR). Refs #1007, #1008, #980, #1404.

### 2026-09-02 — `promotion-quality-gate.yml` partially re-arms: 7 of 8 covered gates are blocking
again on the leg into `main` (#1431 Phase 1, PR-A)

- Clause amended: **Decision 3** (`[default]` tier per ADR 0039), continuing the 2026-08-26/#1066
  lineage above. Those entries described `promotion-quality-gate.yml` as running "in full but ...
  unconditionally `continue-on-error`" on the leg into `main` (and, per the entry above, now the
  `staging → main` leg by default too). That is no longer accurate for 8 of the workflow's steps —
  restated here rather than left silently stale, matching this ADR's own established correction
  convention.
- Confirmed `[default]`, not `[binding]`, per ADR 0039's own tier table: which steps in a CI
  workflow carry `continue-on-error` is "the chosen approach... rollout sequencing," not a system
  invariant reserved for data-ownership truth, fail-closed security/compliance controls, or layer
  boundaries. Decision 6 (production tenant-schema report, `[binding]`) and Decision 8 (Merge
  Safety, `[binding]`) are the actual invariants this workflow interacts with, and neither is
  touched — see the scope check below.
- Change: step-level `continue-on-error: true` removed from exactly 8 steps —
  `enforce_arch_guardrails`, `enforce_controller_boundaries`, `run_api_lint` (job
  `dgfy-api-quality`); `run_ims_lint` (`frontend-ims-quality`); `run_pos_lint`
  (`frontend-pos-quality`); `run_storefront_lint`, `run_storefront_vitest`
  (`frontend-storefront-quality`); `run_docs_lint` (`repository-quality`) — the 7 of
  `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s 8 "(a) Covered" gates confirmed healthy across 12
  recent release-leg runs (one gate, `frontend.storefront.contracts`, maps to a second step,
  `run_storefront_vitest`, hence 7 gates / 8 steps). `backend.test_matrix` (`run_test_matrix`) and
  `run_web_core_lint` are deliberately **not** included — both confirmed still failing/incomplete for
  real reasons (stale test fixtures plus a hosted-runner OOM for the former, pre-existing lint debt
  with no local gate for the latter) — and stay advisory. Full evidence and root-cause finding:
  the #1431 Phase 1 implementation plan (Worker Planner output, 2026-09-02).
- Why: #1431's own precondition for flipping any of its named 8 gates was "once confirmed healthy" —
  this amendment is that confirmation acted on for the 7 gates that met it, not a reopening of
  #1063's still-open staleness question for `backend.test_matrix`.
- Scope check against this ADR's `[binding]` clauses, confirmed unaffected: Decision 6 (production
  tenant-schema report) and Decision 8 (`AGENTS.md` Merge Safety, never-`--squash`, the
  `release/<label>` head-cut rule) are untouched — this amendment only changes which
  `promotion-quality-gate.yml` steps drive their own check-run conclusion, a `[default]`-tier detail.
  Decision 8 itself already required `mergeStateStatus: CLEAN` before any merge; this amendment is
  what now makes a red one of these 7 steps actually produce `UNSTABLE`, which Decision 8 already
  knew how to react to — no change to the rule, only to whether these particular steps can trigger
  it.
- Not yet touched: `scripts/gate-release-local.js` still requires all 7 flipped gates locally, in
  full, per Decision 7 (`[default]`, "`gate:release:local` (`run_mode: "full"`) stays mandatory") —
  dropping them from the local required set is explicitly a separate, later PR (PR-B) gated on a real
  `release/*→main` (or `staging→main`) promotion actually proving the 7 flipped steps green under
  production conditions, not assumed from this amendment alone.
- PR: (this PR). Refs #1431, #1063, #1066, #1147.

### 2026-09-03 — `gate:release:local` drops the same 7 gates from its required set, delegated to CI
(#1431 Phase 1, PR-B)

- Clause amended: **Decision 7** (`[default]` tier per ADR 0039). Its original text —
  "`npm run gate:release:local` (`run_mode: "full"`) stays mandatory before every `develop -> main`
  promotion PR is opened, against the exact target SHA" — is narrowed, not reversed: mandatory now
  means "every gate this script owns either ran locally or was legitimately delegated to a
  verified-blocking CI enforcer," not "every gate ran locally." `run_mode: "full"` keeps its literal
  meaning and its role as the promotion precondition this Decision (and
  `.agents/skills/promoter/SKILL.md`) requires — a run that delegates all 7 CI-enforced gates by
  default is still `run_mode: "full"`, per the amendment's own change below.
- Confirmed `[default]`, not `[binding]`, for the same reason the 2026-09-02 PR-A amendment above
  gave for Decision 3: which gates a local script runs itself versus delegates to an already-verified
  CI enforcer is rollout sequencing, not a system invariant. Decision 6 (tenant-schema report) and
  Decision 8 (Merge Safety) remain the actual invariants in this ADR and are untouched — see the
  scope check below.
- Change: `scripts/gate-release-local.js` gained `CI_ENFORCED_GATES`, naming the same 7 gates the
  amendment above flipped to blocking (`docs.lint`, `architecture.guardrails`, `backend.lint`,
  `frontend.ims.lint`, `frontend.pos.lint`, `frontend.storefront.lint`,
  `frontend.storefront.contracts`). By default each is recorded `status: "delegated_to_ci"`,
  `ok: true`, `duration_ms: 0`, and never actually invoked; `--include-ci-enforced` or an explicit
  `--only <gate>` still runs it locally. The artifact gained `required_gate_count`,
  `delegated_gate_count`, and `ci_enforced_gates` so a reader can tell "ran" from "delegated" without
  inferring it from `duration_ms: 0`. `scripts/check-pr-quality-workflow.js`'s new
  `checkCiEnforcedGatesAreBlocking()` asserts every `CI_ENFORCED_GATES` step id is still present in
  that file's `BLOCKING_STEP_IDS` — the compensating control the PR-A amendment above named as not
  yet built, now built: a future edit that silently regains `continue-on-error` on one of these 7
  steps fails this check rather than reopening a coverage hole on both sides (not enforced in CI,
  not run locally) at once.
- Rejected alternative, recorded so it isn't re-litigated: a third `run_mode` value (e.g.
  `"ci_delegated"`) or a separate `coverage:` field, instead of redefining what `"full"` covers.
  Rejected because this Decision and `.agents/skills/promoter/SKILL.md` both cite `run_mode: "full"`
  by that literal string as the promotion precondition; a third value would silently break both, and
  a promoter reading the pre-amendment rule would refuse a legitimately complete run.
- Why: #1431 Phase 1's plan gated this delegation on the same 7 gates being verified trustworthy and
  genuinely blocking in CI — met under a B-amended evidence bar Pat confirmed after the plan's
  originally-stated precondition (a real `release/*→main` promotion) turned out not to be available:
  V1 (a genuine negative-signal dispatch run, `33650659451`, reds out `frontend-pos-quality`'s own
  check-run), V2′ (the existing green `workflow_dispatch` run on `develop` HEAD, `33642893358`, cited
  in place of a real promotion on a verified command/runner-identity argument), V3 (local/CI command
  parity, exact for 6 of 7, a documented CI-side superset for the 7th). Full detail:
  `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s matching 2026-09-03 amendment and
  `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`.
- **Open, tracked residual gap — not closed by this amendment or the PR behind it:** no real
  `release/*→main` PR has yet exercised these 7 steps as a blocking check on an actual PR's
  `mergeStateStatus: UNSTABLE` transition — V1 shows the job-level check-run itself goes red, V2′
  shows the green path is command/runner-identical to a real promotion, neither is the same PR-level
  mechanism Decision 8 relies on. Track close-out against #1431: cite the promotion PR that
  eventually demonstrates it.
- Scope check against this ADR's `[binding]` clauses, confirmed unaffected: Decision 6 (production
  tenant-schema report) and Decision 8 (`AGENTS.md` Merge Safety, never-`--squash`, the
  `release/<label>` head-cut rule) are untouched — this amendment only changes which gates
  `gate:release:local` runs itself versus delegates, a `[default]`-tier detail. Decision 8 still
  requires `mergeStateStatus: CLEAN` before any merge, unaffected by where a gate's command runs.
- Not yet touched: `backend.test_matrix` (row 10 of the mapping doc) and `run_web_core_lint` — the
  PR-A amendment's own "what did not change" list — remain fully out of scope here too; flipping the
  former to blocking and delegating it locally are PR-A2/PR-B2, separate PRs per #1431's own scoping.
- PR: (this PR). Refs #1431, #1063, #1066, #1147, #1435 (PR-A).

### 2026-09-04 — Freeze release candidates and repair the active promotion environment (#1542)

- Clause amended: **Decision 1** and the `[default]` operational framing of **Decision 3**. The
  default three-stage path remains unchanged, but the initial `develop` snapshot is now a named,
  immutable promotion candidate while it is being qualified.
- Change: the promoter records a `sku-release-candidate/v1` manifest, repairs staging failures
  from `origin/staging` through disposable `fix/staging/<candidate_id>-rN` PRs, and cuts each
  `release/<candidate_id>-rN` from the latest repaired staging SHA. A newer `develop` branch is not
  merged wholesale into an active candidate.
- Code-level repairs may be handed to Conduct with exact-SHA evidence. Live database, secrets, SSH,
  and infrastructure operations remain outside the automated repair scope. Main-side failures use
  the existing hotfix path and are backported to `develop` after stabilization.
- The report-only staging observation workflow validates candidate identity, runtime SHA, health,
  migration, API, UI, and read-only evidence. It does not replace existing CI, tenant-schema, or
  Merge Safety gates.
- This is a `[default]` procedure amendment under ADR 0039. Decisions 2, 5, 6, 7, 8, and all
  `[binding]` controls remain unchanged.
- Refs: #1542, #1008.

## Related

#980 (the decision this ADR records), #1007 (the override mechanism this ADR references but does
not define), #1019 (the doc retirement this ADR's Decision 10 executes), #1008 (parent epic), #1018
/ PR #1036 (the CI quality gate that makes this affordable), #860 / PR #858 (the concrete precedent
and the risk this ADR answers directly), #639, #495, #408, #409, #927 (resolved, unaffected),
#1063 / PR #1064 (the amendment above), #1295 (the org-policy finding), #1374 (the supervised-
handoff + full-scan-discovery amendment above), #1404 (this reversal),
`docs/ops/RELEASE_CANDIDATE_POLICY.md` (the
executable policy this ADR governs),
`docs/architecture/adr/0030-free-tier-signed-release-authorization.md` (superseded, the model
`NO_STAGING_RELEASE_STANDARD.md` described).
