---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-09-06
applies_to: compliance_sensitive_feature_work
topic: request_time_preflight_protocol
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Request-Time Compliance Preflight Protocol

## Purpose
Ensure all compliance-sensitive feature work is classified and evaluated before implementation starts.

## Regulatory Source Chain (2026-04-07 Refresh)
1. BIR RR 7-2024, RR 11-2025, RR 26-2025
2. BIR RMO 24-2023, RMC 72-2025
3. NPC Circular 2022-04 + current NPC operational/security updates
4. BSP Circular 1049 + PSOF/MORPS framework context

Reference URLs:
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%207-2024%20%28final%29.pdf
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%2011-2025%20Digest.pdf
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025%20Digest.pdf
- https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023%20Digest%20FINAL.pdf
- https://www.bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2072-2025%20Digest.pdf
- https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf
- https://privacy.gov.ph/
- https://www.bsp.gov.ph/Regulations/Issuances/2019/c1049.pdf
- https://www.bsp.gov.ph/Regulations/Issuances/2020/1089.pdf
- https://www.bsp.gov.ph/Regulations/Issuances/2024/1191.pdf

## Mandatory Workflow
1. Classify requested work surfaces (`pos`, `terminal`, `settings`, `payments`, `compliance`).
   - Classification floor is computed from changed paths/surfaces (see `docs/compliance/compliance-classification-matrix.md`).
2. Prepare `impact_declaration` payload with:
   - `declaration_id`
   - `classification`
   - `summary`
   - `affected_surfaces`
   - `reason_codes_impacted`
   - `policy_version`
   - `verification_evidence`
   - `rollback_note`
3. Call `POST /api/v1/compliance/preflight`.
4. Execute only if response is:
   - `result=no_breach`, `can_proceed=true`.
5. Block implementation when response is:
   - `result=breach` or `result=review_required`.

### Runtime Scope Clarification
1. This preflight protocol is a feature-development governance control, not an end-user runtime UX gate.
2. Product runtime operations remain enforced by compliance policy decisions in use-cases and middleware.
3. Do not add implicit UI preflight prompts for normal tenant/admin operations unless ADR/governance explicitly changes scope.

## API Contract Summary
- Endpoint: `POST /api/v1/compliance/preflight`
- Request body keys:
  - `request_name`
  - `surfaces`
  - `setting_keys`
  - `setting_updates`
  - `requested_document_type`
  - `terminal_id`
  - `impact_declaration`
- Response keys:
  - `result`
  - `can_proceed`
  - `reason_code`
  - `decisions[]`
  - `required_actions[]`
  - `declaration_id`

## CI/Developer Gates
1. `npm run check:compliance` enforces declaration quality for sensitive file changes.
   - Enforces computed minimum classification floor from changed paths/surfaces.
   - Enforces strict preflight evidence semantics for `major|regulatory` declarations.
2. `.husky/pre-commit` enforces declaration checks on staged sensitive files.
   This is **bypassable** with `git commit --no-verify` and, as of 2026-08-07,
   is the *only* thing enforcing this — treat it as a developer convenience,
   not a gate.
3. CI does **not** currently enforce this. `pr-checks.yml`'s `changes` job has
   a blocking `check:compliance` step wired up behind
   `enforce_compliance_declarations` in
   `.github/workflows/shared-changed-paths.yml`, but `pr-checks.yml` passes it
   as `false`. It was briefly `true` the same day it was added, and was
   immediately used to block an in-flight release over two already-merged PRs
   with no fast way to clear it — see `docs/ops/RELEASE_CANDIDATE_POLICY.md`
   for the full history. Re-enabling it needs a faster path to a real
   `no_breach` result than "someone with backend access manually runs curl,"
   or the same situation recurs the next time it's flipped on.

### What the guardrail does and does not verify

The guardrail is a **document check, not a runtime check**. For a
`major|regulatory` declaration it requires four front-matter fields —
`preflight_result` (must literally equal `no_breach`), `preflight_reason_code`,
`preflight_run_at`, `preflight_request_ref` — and validates only their *shape*.
It never calls `POST /api/v1/compliance/preflight` and cannot distinguish a
recorded real preflight from a typed one.

So a passing `check:compliance` proves a declaration exists and is well-formed.
It does not prove the policy engine ever evaluated the change. If a declaration
is written without a live preflight, say so explicitly in its body rather than
leaving the front matter to imply otherwise — see
`docs/compliance/impact-declarations/2026-07-29-pos-batch-menu-import.md` for
the established shape of that caveat. Reconciling `preflight_run_at` /
`preflight_request_ref` against a real run is automated as of #1163/#1248
(2026-08-31) — see the next section — but note this section's own point still
holds regardless: `check:compliance` itself still cannot tell a reconciled ref
from a hand-typed one that merely matches the accepted pattern. Automating the
sweep closes the "nothing ever converts the placeholder" gap; it does not by
itself make `check:compliance` able to verify a ref's authenticity — that
remains open, tracked as a follow-up rather than solved here.

### Where live preflight actually runs (#884, 2026-08-22; token minting automated #1121, 2026-08-28;
### run against an ephemeral CI instance, no secrets, #1163/#1248, 2026-08-31; execute+resolve moved
### earlier, to the `develop → staging` leg, #1648, 2026-09-06)

The endpoint requires an authenticated session against a running backend
(`SYSTEM.EDIT_SETTINGS`), which no `develop`-merge PR ever has — so a per-PR
live call was never realistic, and #884 named the consequence: every
`major`/`regulatory` PR in the downpayment epic shipped with a
`NOT-EXECUTED-*` placeholder and no stage ever converted it to a real run.

**The resolution: a `NOT-EXECUTED-*` placeholder is the accepted, expected
state at PR-open time.** It is not a defect and `pr-reviewer` should not raise
it as a should-fix (see `.agents/skills/pr-reviewer/SKILL.md`, "Compliance").
What changed since #1121, though, is *when* it gets cleared: the sweep is no
longer a promotion-time-only step a batch can still get blocked on — it now
also runs **continuously**, triggered automatically whenever a declaration
lands on `develop` (`.github/workflows/compliance-preflight-sweep.yml`'s
`push` trigger, path-filtered to
`docs/compliance/impact-declarations/**`). In the ordinary case a
`NOT-EXECUTED-*` ref is cleared within minutes of merge, well before any
promotion is cut — the continuous trigger is not the only place the sweep
executes, and (as of #1648, 2026-09-06) it's no longer true that a promoter
only ever *verifies* this at one late point either.

**Two promotion-time checkpoints now, not one — but only the `origin/develop`-scanning ones resolve
rather than merely verify (#1648, 2026-09-06; scoping corrected RF-11, PR #1672 review, round 4 —
the prior wording claimed both checkpoints resolve, contradicting this same section's own correct
explanation below).** `promoter` runs the same check (full scan
for outstanding `NOT-EXECUTED-*` declarations, plus a check for a stuck
`compliance:preflight-handoff` issue) at two points: primarily *before cutting
`to-staging/<candidate_id>`* — the `develop → staging` leg, the earliest point
a promotion can catch this, added specifically because the old single
pre-`main` checkpoint could sit unexercised for the days or weeks of a full
staging soak while a stuck handoff issue went unnoticed (the bottleneck behind
seven identical recurring tickets: #1387, #1419, #1430, #1505, #1544, #1574,
#1618) — and again, kept on purpose as a defense-in-depth double-check, before
cutting `release/<label>` into `main` (this second checkpoint is also the
*only* one the #1007-gated expedited exception ever runs, since that path
skips the staging leg entirely). At the staging-leg checkpoint, and at the
pre-`main` checkpoint whenever it's scanning `origin/develop` (the #1007
exception's own case), `promoter` now goes past verify into resolve: if a
check turns up something outstanding, it dispatches
`compliance-preflight-sweep.yml` itself and then opens and merges the
resulting reconciliation PR itself — an ordinary `develop`-base PR, already
unattended-mergeable per `promoter`'s own merge table — rather than leaving
that step for a human or credentialed AI session to notice the standing issue
afterward. The default flow's own pre-`main` checkpoint instead scans
`origin/staging` (what `release/<label>` is actually cut from there); since
the sweep's reconciliation PR is hardcoded to `--base develop`, a finding
there can't go through this same dispatch-and-merge path — it's treated as a
frozen-candidate anomaly and escalated instead. Full procedure and the
flow-by-flow split: `.agents/skills/promoter/SKILL.md`'s "Frozen candidate and
repair loop" and "Compliance preflight sweep" sections;
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-09-06 #1648 amendment owns the
policy-level record of this change; `docs/architecture/adr/
0074-retire-staging-branch-from-default-promotion-path.md`'s 2026-09-06
amendment owns the architectural decision record.

**Discovery is a full scan, not a `develop..main` diff (#1374, 2026-09-02, ADR
0074 Decision 5 amendment).** The sweep used to auto-discover its work by
diffing `origin/main..origin/develop` under
`docs/compliance/impact-declarations/`, which had a permanent blind spot: a
declaration that reached `main` via #1007's expedited-override path sits on
*both* branches at once and never appears in a diff between them. #1374's own
research found this live — a full scan of `develop` turned up 26 outstanding
declarations where the diff-based discovery found only 4, and the promoter's
own verification snippet (using the same diff) had truthfully reported "0
outstanding" on a promotion PR while 22 sat unreconciled on `main`. The sweep
now auto-discovers by listing every declaration file on the checked-out ref
(`git ls-files`) and filtering to whichever ones `scripts/is-preflight-
outstanding.js` still considers outstanding — i.e. **every outstanding
declaration on the checked-out ref**, not a diff against any other branch.

**No deployed host, no GitHub Environment, no secrets (#1163/#1248, 2026-08-31,
ADR 0074 Decision 5 amendment).** The original design (#1121) called for the
sweep to hit a manually provisioned bot account on `stage.dgfy.ph`, with its
credentials stored as four `PREFLIGHT_*` GitHub Environment secrets. Those
secrets were never actually provisioned — confirmed empty on both `STAGING`
and `DEV` as of 2026-08-29 (#1163) — and blocked the 2026-08-29
`develop → main` promotion outright, requiring #1007's expedited override to
ship. Investigating why led to the finding that made this section's rewrite
necessary: **a deployed host bought no compliance property to begin with.**
The endpoint evaluates the change *proposal* carried in the declaration's
`impact_declaration` payload against the target tenant's own compliance
posture — it writes nothing (no audit row is persisted), never executes the
change's code, and its response carries no server-generated request id
(`preflight_request_ref` was always entirely operator-authored). See
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s governing principle: "A merge gate
... must be satisfiable without a deployed environment, or every leg that
needs one becomes circular."

So the sweep now provisions its own throwaway target instead: it boots an
ephemeral `mysql` + `redis` + `dgfy-api` on the CI runner (the same
container-per-step pattern `promotion-quality-gate.yml` already uses), seeds a
fixture tenant + `settings:edit` bot
(`apps/dgfy-api/scripts/seed-preflight-fixture.js`, built on the existing
`provisionTenant()` service — not a new provisioning path), calls the real
endpoint over `127.0.0.1`, and tears both down at the end of the run
(`apps/dgfy-api/scripts/teardown-preflight-fixture.js`). Confirmed live
end to end (#1163/#1248 spike, 2026-08-31): a real declaration from the
2026-08-31 batch returned `result: no_breach`, `can_proceed: true` from the
real endpoint. The fixture's pinned posture
(`complianceMode: 'non_compliant'`, `plan: 'premium'`,
`subscription_status: 'active'`) is strictly more reproducible than the
deployed host it replaces — a tenant on `stage.dgfy.ph` was unpinned and drifts
with whoever last edited its settings; this one is recreated identically
every run.

`apps/dgfy-migration-runner` remains landlord-DB-only and still has no path to
create a tenant-scoped user directly — that fact hasn't changed. What changed
is that `provisionTenant()` (`apps/dgfy-api/src/services/
tenantProvisioningService.js`), already used by the real tenant-onboarding
flow, does have that path, and the seeder script above uses it. Provisioning a
bot account by hand on a real tenant is no longer part of this protocol at
all — see the note at the end of this section on what stays deleted below.

**Run it.** The primary path is now automatic (the `push` trigger above); to
run it manually (backfill, or exercising the mechanism without waiting for a
push):

```bash
gh workflow run compliance-preflight-sweep.yml
```

Mints a fresh token per declaration (`scripts/mint-preflight-token.js`,
unchanged since #1121 — it still just reads `PREFLIGHT_HOST`/
`PREFLIGHT_COMPANY_TOKEN`/`PREFLIGHT_BOT_EMAIL`/`PREFLIGHT_BOT_PASSWORD` from
env, now supplied by the fixture seeder rather than a GitHub Environment),
calls the preflight endpoint for every outstanding `NOT-EXECUTED-*`
declaration on the checked-out ref (see "Discovery is a full scan" above),
and — unlike the #1121 design — **does** write back: it reconciles
`preflight_result`/`preflight_reason_code`/`preflight_run_at`/
`preflight_request_ref` into each declaration
(`scripts/reconcile-preflight-declarations.js`), but only when every
declaration in the run actually passed (`result: no_breach`,
`can_proceed: true`) — a real `breach`/`review_required` result is never
written over, and that declaration's `NOT-EXECUTED-*` ref stays intact for a
human to look at. The cut-branch-and-PR discipline itself is unchanged: still
never a direct commit to `develop`, this is regulator-facing evidence and
gets the same review path as everything else.

**PR open + merge is a supervised handoff, not an auto-merge (#1295/#1374,
2026-09-02, ADR 0074 Decision 5 amendment).** An org-level policy blocks
`github-actions[bot]` from creating or approving pull requests outright — the
sweep used to attempt `gh pr create` and treat any non-zero exit as an
undifferentiated failure, which meant a run whose preflight had genuinely
*passed* rendered identically to a real compliance breach, red only at the PR
step. The sweep still pushes the reconciliation branch and still *attempts*
`gh pr create` every run (so the loop self-heals for free the moment that org
policy ever changes), but now classifies the result
(`scripts/report-preflight-sweep-outcome.js`'s `classifyPrCreate`):

- **Policy-blocked** (the expected case today): the run finishes **green**,
  with a `::warning::` — the branch is pushed and ready, but nothing failed.
  A `compliance-preflight-sweep-handoff` artifact and a filed/updated
  `compliance:preflight-handoff` GitHub issue (one open issue, updated in
  place across runs, never one per run) carry the branch name, head/base SHA,
  the swept declarations, and the exact operator commands needed to finish
  the handoff — see "Operator handoff procedure" below.
- **A real preflight failure** (`overall_fail=1`, unchanged from before) is
  still **red**, and now also files/updates a `compliance:preflight-failed`
  issue naming the failing declaration(s) and reason code(s) — the same
  labelled-issue mechanism, so a compliance failure doesn't wait for someone
  to notice a red run in the Actions tab either.
- **Any other `gh pr create` failure**, or a failure later in the merge
  sequence (checks never reaching a terminal state, `mergeStateStatus` not
  `CLEAN`), is a genuine, red **handoff error** — left open for investigation,
  same as before.
- If org policy ever stops blocking the bot (or a credentialed AI session's
  own token is used), `gh pr create` succeeds and the existing Merge Safety
  poll + merge path runs exactly as it always has — auto-merge is not gone,
  it's just no longer assumed to always be reachable.

### Not applicable to live preflight (#1396, 2026-09-02)

A declaration can be classification `minor` and still declare nothing the live preflight endpoint
can evaluate — e.g. `surfaces: storefront` alone. `complianceUseCases.js`'s own
`surfaceToOperations` map has exactly five keys (`pos`, `terminal`, `settings`, `payments`,
`compliance`); a surface outside that set contributes zero operations, and zero operations falls
back to the generic `REQUEST_PREFLIGHT` decision — indistinguishable from submitting no surfaces at
all. **Widening the endpoint's accepted-surface set (or `ENDPOINT_ACCEPTED_SURFACES` in
`scripts/build-preflight-request.js`) to include `storefront` was considered and rejected** — there
is no storefront rule anywhere in `compliancePolicyEngine.js`, and the regulatory framework this
endpoint evaluates (BIR/BSP/NPC) is POS-fiscal/payments scoped; adding the surface would be a no-op
that reads as a real check, i.e. false confidence.

The honest fix: `scripts/build-preflight-request.js`'s `classifyEndpointApplicability()` detects
this case before any HTTP call and the sweep records it as `not_applicable` through the same
reconciliation machinery every other result uses — `preflight_result: not_applicable`,
`preflight_reason_code: NO_ENDPOINT_ACCEPTED_SURFACE`, and a
`preflight_request_ref: NOT-APPLICABLE-<run_id>-<slug>` (a distinct prefix from `PREFLIGHT-*`, so a
reader can tell "verified against the real endpoint" from "not evaluable by it" without opening the
run — still matches `isValidPreflightRequestRef`'s 3+-segment pattern).

**`minor`-only, by construction.** `check-compliance-impact.js`'s
`PREFLIGHT_REQUIRED_CLASSIFICATIONS` still hard-requires `preflight_result=no_breach` for
`major`/`regulatory` — a `major`/`regulatory` declaration with no endpoint-accepted surface fails
closed instead (`build-preflight-request.js` exits 1 with an explicit message: declare an evaluable
surface, or reclassify). The `NOT-EXECUTED-*` → `NOT-APPLICABLE-*` lifecycle never applies to those
two classifications.

### Operator handoff procedure

When a sweep run finishes green-with-warning (`handoff_required`), the
reconciliation branch is pushed but nobody has opened or merged its PR yet.
To finish it:

1. **Find the evidence.** Either the run's own `compliance-preflight-sweep-
   handoff` artifact, or the single open `compliance:preflight-handoff`
   GitHub issue (`gh issue list --label compliance:preflight-handoff --state
   open`) — both carry the same branch name, head/base SHA, swept
   declarations, and the exact commands below.
2. **Open the PR**, exactly as the artifact/issue names it:
   ```bash
   gh pr create --base develop --head compliance-sweep/<run_id> \
     --title "docs(compliance): reconcile preflight sweep results (<date>)" \
     --body-file <pr_body>
   ```
3. **Watch its checks and merge per this repo's Merge Safety rule**
   (`AGENTS.md`) — no check `in_progress`/`queued`, `mergeStateStatus: CLEAN`:
   ```bash
   gh pr checks <N> --watch
   gh pr merge <N> --merge --delete-branch
   ```
4. **The merge re-triggers exactly one more sweep run** (the PR also touches
   `docs/compliance/impact-declarations/**`) — that run's own discovery step
   finds zero outstanding declarations and exits immediately, so the loop
   terminates on its own; no further action is needed.
5. **Close the loop on the issue.** If the human-opened PR's body includes
   `Closes #<handoff issue number>`, the issue closes automatically on merge
   — the recommended shape, and what the artifact's suggested PR body already
   does. If it doesn't, the next green sweep run's own "Publish handoff
   issue" step closes-with-comment any open `compliance:preflight-handoff`
   issue whose recorded branch is already gone from origin, as a fallback —
   but don't rely on that path when `Closes` is available; it's simpler and
   immediate.

### Reconciling one declaration locally, without a CI round trip (#1694, 2026-09-07)

The handoff procedure above exists for the continuous `develop`-push sweep.
It has no equivalent for a compliance-sensitive fix authored directly against
`staging`/`release/*`, or a `main`-based production hotfix branch
(`.agents/skills/incident-responder/SKILL.md`), or any other branch that
trigger doesn't cover — historically that meant a `develop`-detour PR plus a
sweep-handoff PR just to clear one `NOT-EXECUTED-*` placeholder before the
actual fix could land where it needed to. Confirmed live for the hotfix case
specifically (#1700, 2026-09-07): PR #1702's own hotfix for #1698 shipped to
`main` with a `NOT-EXECUTED-*` ref intact and closed the gap only via that
exact `develop`-detour (back-port PR #1709, reconciled by the continuous
sweep there, then present on both branches) — the multi-PR round trip this
tool exists to collapse into one commit.

`npm run compliance:reconcile-local -- <file>.md [more...]`
(`scripts/reconcile-preflight-declaration-local.js`) is the recommended path
instead: it sequences the exact same steps
`compliance-preflight-sweep.yml` runs — boot an ephemeral mysql+redis, migrate,
seed a throwaway fixture tenant, boot `dgfy-api`, POST each declaration to the
live endpoint, reconcile on an all-pass — as one synchronous local command,
with no GitHub Actions run and no reconciliation PR. Requires Docker and both
`apps/dgfy-migration-runner`/`apps/dgfy-api` already `npm install`-ed.

**This writes to the given declaration file(s) on disk, in place, and nothing
else** — it does not create a branch, commit, or open a PR. Committing,
pushing, and opening the PR is the caller's own responsibility, through
whichever review path the branch already uses (a `staging`/`release/*` fix
rides the same review/merge path it would have anyway, just with the
reconciled front matter already part of the diff instead of a placeholder).
See `scripts/reconcile-preflight-declaration-local.js`'s own header for the
full step sequence and port choices.

**Resolves #1700 (2026-09-08).** This tool never performs a git operation (no
branch, commit, or PR of its own — confirmed by reading its source), so it
needs no modification to work against a `main`-based hotfix branch's working
tree; it is the sanctioned, mandatory reconciliation path for that case, same
as `staging`/`release/*`. `incident-responder`'s own SKILL.md carries the
exact procedural requirement (mandatory whenever a hotfix diff carries an
outstanding `NOT-EXECUTED-*` ref, not optional/best-effort) rather than
restated here.

For lower-level debugging (exercising one piece of the mechanism directly —
e.g. against a local `dgfy-api` you've already stood up yourself), the
underlying scripts remain directly runnable:

```bash
node apps/dgfy-api/scripts/seed-preflight-fixture.js   # prints PREFLIGHT_* + FIXTURE_TENANT_ID
DGFY_DEV_TOKEN=$(node scripts/mint-preflight-token.js)
```

**No `NOT-EXECUTED-*` declaration may reach `main`** — unchanged. In the
ordinary case the continuous trigger above already clears every declaration
well before a promotion is cut, so this is now rarely something a promoter
has to actively wait on; `promoter`'s own procedure checks zero outstanding
declarations before cutting `to-staging/<candidate_id>` **and** before cutting
`release/<label>` (#1648, 2026-09-06 — see "Where live preflight actually
runs" above). The `to-staging/<candidate_id>` checkpoint, and the
`release/<label>` checkpoint whenever it's scanning `origin/develop` (the
#1007 exception's own case), resolve rather than just wait if a check finds
something (RF-11, PR #1672 review, round 4 — this used to read "if either
check finds something," overclaiming resolve for the default flow's own
`release/<label>` checkpoint too). That checkpoint instead scans
`origin/staging` in the default flow and stays verify-only: a finding there
escalates as a frozen-candidate anomaly, routed through a `fix/staging/*`
repair, never through this dispatch-and-merge resolve path. #1007's
phrase-gated expedited override remains the one case a
`NOT-EXECUTED-*` declaration may legitimately still reach `main`, logged and
authorized, not silent (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25
amendment).

**What's deleted from this protocol, not just changed:** the manual
bot-account-provisioning procedure (register on the tenant's own
`POST /api/v1/auth/register` flow, trim `permissions` by hand, paste
credentials into a GitHub Environment); the "GitHub Environment secrets vs.
SOPS+age" storage-mechanism decision (there's no secret to store); and the
"not yet designed: rotation/revocation" open gap (there's no durable
credential to rotate — every fixture credential is generated fresh per run
and destroyed with the tenant that held it). None of these apply to the
current design; they're preserved only in this doc's own git history and in
#1121/#1163's issue history, not restated here as if still live.

## Dirty Worktree Handling
1. Use path-scoped diffs while preparing declaration evidence:
   - `git diff -- backend/src/modules/compliance`
   - `git diff -- frontend/Pages/Settings.jsx`
2. Stage only files belonging to declared surfaces.
3. If unrelated dirty files exist, do not include them in declaration evidence.
4. If declaration surfaces do not match staged sensitive files, treat as preflight failure.

## Operational Rule
When a user request conflicts with policy decisions, communicate the breach reason code first and block execution until controls are satisfied.
