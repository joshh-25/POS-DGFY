---
status: amended
authority_level: authoritative
owner: release
date: 2026-08-25
last_reviewed: 2026-08-26
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
  unconditionally `continue-on-error` — visible, not blocking.
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

## Related

#980 (the decision this ADR records), #1007 (the override mechanism this ADR references but does
not define), #1019 (the doc retirement this ADR's Decision 10 executes), #1008 (parent epic), #1018
/ PR #1036 (the CI quality gate that makes this affordable), #860 / PR #858 (the concrete precedent
and the risk this ADR answers directly), #639, #495, #408, #409, #927 (resolved, unaffected),
#1063 / PR #1064 (the amendment above), `docs/ops/RELEASE_CANDIDATE_POLICY.md` (the executable
policy this ADR governs),
`docs/architecture/adr/0030-free-tier-signed-release-authorization.md` (superseded, the model
`NO_STAGING_RELEASE_STANDARD.md` described).
