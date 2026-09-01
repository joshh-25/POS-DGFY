# Repository Agent Rules

These instructions are for any AI agent, IDE assistant, or extension operating in this repository.

## Repository layout

There is no `backend/`, `frontend/`, `android/`, or `apps/dgfy-web/` directory — all four were
relocated. If a search hit, a doc, or your own training data references one of those paths, it's
stale; the real code lives under:

- `apps/dgfy-api` — backend
- `apps/dgfy-migration-runner` — migrations/seeders (split out of the API)
- `apps/dgfy-android-bridge` — Android
- `apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront` — the three frontend apps (issue #322)
- `packages/web-core` — the shared frontend trunk all three of the above consume via a `file:`
  dependency; it has no build step, no `node_modules`, and no lockfile of its own

Full path maps, before/after commands, and in-flight-branch merge guidance:
`docs/architecture/apps-layout-migration.md`. Do not "fix" old paths in ADRs, compliance
declarations, or other dated/historical records — see that doc's "note for AI agents" for the
full leave-alone list.

## MANDATORY: Pull Request Conventions

Before creating, updating, or describing any pull request in this repository, **read and follow `docs/ai/PR.md` in full**. This is not optional. It governs:

1. **Commit message format** — Conventional Commits (`type(scope): subject`), types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`.
2. **PR body format** — base the body on `.github/pull_request_template.md`; at minimum it must include `## Summary` and `## Testing Evidence` sections (no separate `## Motivation` header exists in the template).
3. **PR base branch** — ordinary branches (features, fixes, chores, docs) target `develop`; a
   promotion PR targets `staging` from a `to-staging/<label>` head, or `main` from a `release/<label>`
   head, per `docs/ops/RELEASE_CANDIDATE_POLICY.md` (authoritative) — corrected 2026-08-16 from a
   stale `rc/*` reference that named a prefix used nowhere else in the repo.
4. **Pre-commit safety check** — scan for `DO NOT COMMIT` markers (`rg "DO NOT COMMIT"`) across changed files before staging/committing, and exclude any matches.
5. **Batch commits by domain** — group changed files into logical batches (new modules → dependents → docs → CI config) and commit each batch separately with its own Conventional Commits message, so history stays bisectable and reviewable.

If any part of a requested change conflicts with `docs/ai/PR.md`, flag the conflict explicitly rather than silently picking one convention over the other.

## MANDATORY: Merge Safety

Before calling a GitHub merge on this repo — **in any context, regardless of which role is
nominally active** — confirm no check run on the head commit has status `in_progress` or `queued`
(check-run status, not the phase-ledger `in_progress`/`approved`/etc. states used elsewhere in this
file), and that merge state is `CLEAN`, not `unstable`. Check either surface: `gh pr checks <N>` and
`gh pr view <N> --json mergeStateStatus,mergeable` (CLI), or `get_check_runs` and `mergeable_state`
(REST) — whichever the acting session has to hand.

A pending or in-progress check is a **hard stop**, independent of outcome. This repo has no branch
protection (GitHub Free — confirmed 403 on both `branches/main/protection` and `rulesets`), so
nothing technical stops the merge either way — "technically allowed" is not "permitted." Report the
check state and wait for a terminal result; never merge past it and never wait it out silently.

This rule governs the action (`gh pr merge` or equivalent), not one named role — it applies whether
the acting session is running as `pr-reviewer`, `implement`, or unrostered. See #544 for the incident
(PR #510) that exposed the rule existing only inside `pr-reviewer`'s own policy table.

### Bounded carve-out — merging on local CI evidence when GitHub's checks are unavailable

Added 2026-08-19 (#662/#724), after two distinct failures of the check-run pipeline itself:
2026-08-18's self-hosted runners going fully offline mid-promotion, and 2026-08-19's **queue
starvation** — both runners `online`, yet PRs sitting `queued`/`in_progress` for hours before being
cancelled with no conclusion ever produced (measured: four PRs cancelled after ~3h that finished in
1–2 minutes once a runner freed). Either way the hard stop above never resolves on its own — nothing
about "wait for a terminal result" holds when no terminal result is coming.

`scripts/pr-checks.js` (`npm run check:pr`) reproduces the PR checks locally and — under `--post` —
posts one `## Local CI` PR comment as the evidence artifact. That comment may authorize a merge
**only** when every one of the following holds, all restated here rather than left to live only in
a skill file (this file's own Surface precedence calls that a bug):

- **Base is `develop` or `staging`. Never `main`** — no exception, matching every other role's
  absolute rule on `main`.
- **Unavailability is verified, not assumed**, as exactly one of four classified reasons:
  `runner_offline` (every runner non-`online`, `gh api repos/:repo/actions/runners`),
  `queue_starvation` (runners online, but this SHA's checks sit `queued`/`in_progress` past a
  threshold or were `cancelled` without a conclusion), `billing_allocation_failure` (the existing
  verified reason, via `scripts/collect-github-actions-unavailability.js`), or
  `github_platform_outage` (added 2026-08-27, #1077, gating tightened 2026-08-27 per PR #1078
  review RF-1 — requires the target SHA itself to have **zero check-runs and zero check-suites**
  before GitHub's own status API, `https://www.githubstatus.com/api/v2/summary.json`, is even
  consulted; a completed check-run for this SHA is proof its checks ran and is never overridden by
  a global degraded/outage status elsewhere. Distinct from the other three because no check-run
  object is ever created at all in this case — confirmed live via zero `check-suites` on a PR's
  head commit during a real GitHub-side Actions outage, a state `queue_starvation`'s check-run-based
  detection can't see).
  A check that is merely *slow but progressing* is none of these and does not qualify.
- **The `## Local CI` comment is posted before the merge**, never after, and states its own
  overall result plus a non-empty "Not reproduced locally" list — never silently substituting for
  CI.
- **The comment result is `PASS`.** `scripts/pr-checks.js --post` itself refuses to post when its
  classifier reports `healthy` (no verified unavailability) — that refusal is what keeps this from
  being a routine bypass; do not work around it by omitting `--post`'s own gate.
- **The comment's stated `Commit:` SHA equals the PR's current head.** Verify with `gh pr view <N>
  --json headRefOid` before merging. A comment is evidence for the commit it was generated against,
  not for the PR in general — if a later commit landed (a Worker's follow-up push is the common
  case), the comment is stale and does not qualify; a mismatch is treated exactly like no qualifying
  comment at all, not as a lesser confirmation step. Added 2026-08-19 (#725 RF-2) after the first
  version of this carve-out shipped with no commit binding at all.

Everything else about the hard stop above is unchanged: this carve-out extends *what evidence can
satisfy it*, not who may skip it or on which branch.

## Roles

This repo defines specialized agent roles for repeated jobs — planning, implementing, reviewing —
instead of re-briefing a general-purpose agent each session. This is #331's roster; each role's
canonical definition lives under `.agents/skills/`, readable by any tool that reads this file:

- **Worker/Implementer** (#436/#437) — plan → implement → commit → open a PR. Never merges, never
  touches a deployed environment. @.agents/skills/implement/SKILL.md
- **Planner/PM** (#367/#439) — files and shapes GitHub issues, maintains the DGFY Project board.
  @.agents/skills/pm/SKILL.md
- **PR Reviewer** (#366/#441) — audits an open PR, posts one verdict comment with concrete proposed
  fixes, auto-merges only on `develop`/`staging` with a clean `APPROVE`, never on `main`.
  @.agents/skills/pr-reviewer/SKILL.md
- **Observer** (#368) — ingests Sentry error/performance signals, triages against a noise policy,
  files at most a defensible number of issues per run. @.agents/skills/observer/SKILL.md
- **Verifier/QA** (#331/#536) — verifies a merged, deployed change against a live environment,
  then flips `For QA` to `Done` or `Failed`. @.agents/skills/verifier/SKILL.md
- **Promoter/Release** (#331/#512) — runs a `develop → main` promotion end to end (default since
  ADR 0074/#980, 2026-08-25; an optional `develop → staging → main` soak is still available per
  batch), cutting the promotion branch(es) itself. Dispatches DEV/STAGING deploys unattended;
  never merges `main` or dispatches a `main`/PROD deploy without an explicit go each time, except a
  second, narrow, phrase-gated override (#1007) — see "The #1007 promoter override" below.
  @.agents/skills/promoter/SKILL.md
- **Incident Responder** (#331/#546) — autonomous production incident-response loop (monitor → PM
  files → Worker fixes → fast-track Reviewer → Promoter redeploys), also reachable manually via
  `/hotfix` (#861) for an on-demand fix outside the monitor loop. Carries a narrow, phrase-gated
  override to merge a hotfix into `main` during an open incident; every other case keeps "never
  merge `main`" absolute. Only runs when explicitly authorized — either an active incident session,
  or an explicit `/hotfix` invocation; a detected hotfix-shaped request with neither only proposes.
  @.agents/skills/incident-responder/SKILL.md
- **Notes/Intake** (#331/#645) — primes on stakeholder-meeting topics beforehand, captures pasted
  notes verbatim during the meeting with live ADR/doc conflict flagging, then compiles a routed
  slate afterward for confirmation before handing off to Planner/PM to file. Sits upstream of every
  other role in this roster. @.agents/skills/notes/SKILL.md
- **Conduct** — manual-invocation-only (`disable-model-invocation: true`) preset over Orca's
  `orchestration` skill: runs a task or epic through Orca with per-slot
  (`WORKER_PLANNER`/`WORKER_BUILDER`/`REVIEWER`) model selection, otherwise identical to calling
  `/orchestration` directly. Never auto-invoked. @.agents/skills/conduct/SKILL.md;
  `.claude/skills/conduct/SKILL.md` is the usual thin shim, carrying only the Claude-specific
  `disable-model-invocation: true` flag that has no cross-tool equivalent.

Load the relevant one when a task matches its job. Each file names *where* the actual rules live
(`docs/ai/PR.md`, `docs/process/ISSUE-TAXONOMY.md`, compliance/architecture scripts) rather than
restating them — read the role file, then follow its references, don't reconstruct a role's
procedure from memory or from an older cached copy.

### Role handoffs and composite instructions

Added 2026-08-16 (#543), resolving the open question of what a chained instruction like "review,
merge, and deploy" concretely does and where it stops.

**What the chain actually does.** `pr-reviewer` reviews and merges (`develop`/`staging`, unattended
per its own merge policy) → `promoter` cuts/promotes and dispatches the DEV/STAGING deploy
(unattended) → the moment `main` is the actual target, the chain **stops**, restates the
never-merge-`main` rule out loud, and hands the physical merge to Pat — every time, not just until
he says go once. This is unchanged from the standing rule already in `implement` and `pr-reviewer`,
with **two** narrow exceptions, neither a standing pre-authorization: `incident-responder`'s
phrase-gated override (`.agents/skills/incident-responder/SKILL.md`), which supersedes this file's
earlier "no exception" framing *only* for that role, *only* mid-incident, *only* on Pat's explicit
real-time phrase; and `promoter`'s own #1007 expedited-promotion override, defined in full
immediately below, which supersedes it *only* for that role, *only* for Pat's business-urgency
call (not necessarily an incident), *only* on his explicit real-time phrase.

### The #1007 promoter override — a second, narrower `main`-merge exception

Added 2026-08-25 (#1007/#980, ADR 0074, PR #1042). Written out in full here rather than left to
live only in a skill file, matching the principle the Merge Safety carve-out above already states
outright ("this file's own Surface precedence calls that a bug"). The executable procedure and the
copy-pasteable commands live in `.agents/skills/promoter/SKILL.md` and
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment — this section is the binding
statement those two documents must conform to, not a summary that can drift from them.

- **Scope.** Pat's own business-urgency call — "we critically need this shipped now" — not
  necessarily a production incident (that case is `incident-responder`'s separate override above).
  Only `promoter` may invoke it, and only for a `develop → main` promotion (the default path since
  ADR 0074).
- **The phrase gate.** Only on Pat's explicit real-time phrase, given in the moment the override is
  actually invoked — never inferred from urgency alone, never a standing pre-authorization from a
  prior invocation. Every single invocation, not just the first: (1) restate the standing "these
  gates are normally required" rule out loud, so it is visibly not being silently skipped;
  (2) post a comment on the promotion PR (or the tracking issue if no PR exists yet) logging the
  authorization — timestamp, the phrase given, exactly what's being skipped — **before** the merge,
  not after.
- **Skippable, only under this override:**
  - `npm run gate:release:local` for the promotion PR.
  - The live compliance preflight sweep (`docs/compliance/request-time-preflight-protocol.md`) —
    the one case where a `NOT-EXECUTED-*` declaration may legitimately reach `main`, logged and
    authorized, not silent.
- **Never skippable, under this override or any other circumstance:**
  - The production tenant-schema-sync report (`tenant-schema-report.yml`, #1017), checked against
    **production** tenant databases specifically — the control that would have caught the
    #860/#639-class crash-loop risk this repo has already seen once.
  - This file's own Merge Safety hard stop (no `in_progress`/`queued` check, `mergeStateStatus:
    CLEAN`).
  - The never-`--squash` rule.
  - The `release/<label>` cut-from-`origin/develop` (or `origin/staging`, if the optional soak was
    used) head-cut rule — the #426 incident this guards against.
- **First live invocation is report-only**, regardless of outcome, matching the calibration already
  used for every other role in this roster — produce the plan and let Pat confirm before it runs
  unattended even with his phrase given.
- **#495 (no rollback) and #639 (schema repair disarmed) are accepted standing risk for this
  override, not a prerequisite** — unchanged by whether the override is invoked, since the
  tenant-schema report stays mandatory regardless of what else is skipped.

**Why this is main-session sequencing, not literal nesting.** A Claude Code subagent's tool
allowlist has no Agent tool (`pr-reviewer`'s is `Read, Grep, Glob, Bash`) — it cannot itself invoke
`promoter`. "Reviewer invokes Deploy/Release as the next step" is implemented as the acting session
running each role's procedure in sequence, not one role programmatically calling another. This is
also why `promoter` and `incident-responder` are Claude Code **skills that run inline in the main
session**, rather than isolated subagents like `pr-reviewer`/`observer`/`verifier` — those three
also have a `.claude/skills/<role>/SKILL.md` entry (#868, for a typed `/name` command), but it's a
thin `context: fork` dispatch wrapper that spawns the isolated subagent rather than running inline
itself. The distinction that matters is *where the work executes* (inline vs. forked/isolated), not
which `.claude/` file exists — after #868, file location alone no longer tells them apart.

**PM is callable by any role, mid-task, not just as the flow's entry point.** Worker, Reviewer, or
Promoter — any role that finds work outside its own current scope (a correction, a bug, a gap) hands
off to `pm` to shape and file it properly, rather than improvising its own `gh issue create`. This
generalizes the pattern `observer` already follows (deferring to `pm`'s search-before-filing
discipline) to every role in the roster, not just Observer's Sentry-triage entry point.

### Surface precedence

Four kinds of file govern behavior here, highest authority first, on any conflict:

1. **`docs/` governed docs**, ranked by their own `authority_level` frontmatter
   (`authoritative` > `reference` > `historical`, `deprecated` never used for new decisions).
   `docs/ai/*` files carry no `authority_level` frontmatter and so don't fall under this tier —
   they rank below this file (see rank 2) as working-context supplements, not above it; don't treat
   `docs/ai/CLAUDE.md` as outranking `AGENTS.md` just because it lives under `docs/` (#365).
2. **This file (`AGENTS.md`)** — repo-wide agent rules and the role index above. References `docs/`;
   never restates it.
3. **`.agents/skills/<role>/SKILL.md`** — canonical role definitions. Reference rules at runtime,
   same principle.
4. **Vendor directories** (`.claude/`, `.cursor/`, `.agent/`, `.codex/`) — thin pointers and
   harness-specific config only (tool allowlists, subagent isolation, IDE-specific glob scoping).
   Never a rule source in their own right — if a rule is found only in one of these, that's a bug,
   not a feature. Note the naming trap: `.agent/` (singular, Antigravity workflows) and `.agents/`
   (plural, the canonical roles above) are two different, unrelated directories — don't conflate
   or "tidy" one into the other.

## Communication and Critical Thinking Preferences
1. Be direct, practical, and precise. Prefer clear, copy-paste-ready answers.
2. Separate issues, risks, and recommendations one by one.
3. Do not over-explain unless the user asks for deeper reasoning.
4. Always evaluate the user's ideas critically before agreeing. Do not act like a yes man and do not automatically validate a plan just because the user suggested it.
5. Before implementing, planning, or approving anything, check for logic gaps, hidden assumptions, weak requirements, technical risks, edge cases, maintainability problems, security concerns, scalability issues, user experience issues, and possible simpler alternatives.
6. Only agree with an idea if it is logically sound. If there are no major logic gaps, say so clearly and proceed.
7. If an idea has issues, challenge it respectfully and explain what needs to change.
8. If an idea is risky but still usable, explain the risk and suggest a safer version.
9. If an idea is bad, say that clearly and explain why.
10. Before making changes, use this structure:
   - **Critical Assessment**: Point out possible flaws, missing requirements, or risks.
   - **Recommendation**: Tell the user whether to proceed, adjust, or reject the idea.
   - **Implementation Plan**: If the idea is solid or fixable, give the steps before editing code.
   - **Execution**: Implement only after the logic has been checked.
11. Be honest but not rude. Be skeptical but useful. Challenge weak thinking and support strong ideas quickly.
12. Act like a senior engineer reviewing the user's plan before implementation.

## Prompt Architect Rules
1. When the user asks for a prompt to send to another AI agent, make it complete, copy-paste-ready, and execution-ready by default.
2. Do not make the user ask whether the prompt is the full prompt. If it is not ready to send, label it exactly `DRAFT - NOT READY TO SEND` and state what is missing.
3. A send-ready implementation prompt must include objective, context before ask, authoritative docs/files to read, current behavior, required change, exact code to replace or add when known, a `DO NOT` list, risks/notes, validation, acceptance criteria, and final report requirements.
4. If the user wants deployment after validation, the prompt must also include release inventory, included scope, excluded scope, commit/push instructions, deploy instructions, production proof, and deployed-change accuracy review.
5. For investigative prompts, explicitly say whether the agent may edit code. If the correct fix is not yet known, require investigation findings before implementation.
6. When an investigation finds actionable implementation work and the user is using the prompter/reviewer workflow, include a complete `Implementation Handoff Prompt` in the same final response. Do not wait for the user to ask where the full prompt is.
7. If the investigation is not strong enough for implementation, provide a `DRAFT - NOT READY TO SEND` investigative prompt that names the missing evidence and forbids code edits until that evidence is gathered.

## Mandatory Documentation Lookup Order
1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. Relevant ADRs in `docs/architecture/adr/` — use `docs/architecture/adr/INDEX.md` to find them
5. Domain-specific docs (`docs/features`, `docs/api`, `docs/database`, `docs/testing`)
6. Historical docs only if explicitly marked as needed

## Planning Rules
1. Do not produce an implementation plan until steps 1-4 of the lookup order are read.
2. Every implementation plan must cite authoritative docs used for decisions.
3. If docs conflict:
- `authoritative` overrides `reference`
- `reference` overrides `historical`
- `deprecated` must not be used for new design decisions
4. Cross-boundary changes take the cheapest path matching the strictness tier of
the clause being changed (ADR 0039):
- `[binding]` clause: new superseding ADR + tech-lead approval
- `[default]` clause, or any untagged clause: dated `## Amendments` block on the
  existing ADR in the same PR; set `status: amended`
- `[snapshot]` clause: ordinary implementation work
- no ADR covers the decision: create one
5. Do not cite ADRs with `status: superseded` or `status: retired`. ADRs with
`status: proposed` constrain nothing.

## Prohibited Behavior
1. Do not treat `docs/archive/**` as a planning source.
2. Do not use deprecated docs when a `superseded_by` target exists.
3. Do not infer architecture rules from code alone when authoritative docs exist.

## Validation Before Finalizing Plan
1. Confirm architecture boundary checks that apply to the planned change.
2. Confirm documentation freshness (`last_reviewed`) for cited authoritative docs.
3. Confirm no unresolved exception/allowlist dependency is introduced without a removal plan.

## Continuous Phase Numbering

1. Every governed multi-phase initiative must use one continuous repository phase sequence.
2. Before creating a plan, find the highest phase number in the authoritative phase ledger and continue from the next number.
3. Do not restart numbering at Phase 0 or Phase 1 for a new release, feature group, milestone, or implementation session.
4. Releases and milestones may group phases, but they do not reset the phase sequence.
5. Preserve historical phase numbers. Never renumber completed phases unless an explicit documentation migration is approved.
6. Maintain the authoritative phase ledger in `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`.
7. Every ledger entry must include:
   - phase number;
   - initiative and release;
   - objective and scope;
   - status: `planned`, `approved`, `in_progress`, `completed`, `blocked`, or `deferred`;
   - dependencies;
   - acceptance and validation evidence;
   - completion date when applicable;
   - links to relevant contracts, ADRs, tests, and implementation files.
8. A phase may be marked `completed` only after its acceptance gates and required validation pass.
9. Plans and completion reports must state the current phase and next eligible phase.
10. When documentation disagrees about numbering, stop and reconcile it against the authoritative ledger before implementation.
