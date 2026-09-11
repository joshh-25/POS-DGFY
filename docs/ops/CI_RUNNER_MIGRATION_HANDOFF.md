# CI runner migration handoff

Living doc, not scoped to a single PR — promoted out of `.github/` on
2026-08-13 when the repo switched back to self-hosted (see below), reversing
this doc's own original 2026-08-01 decision. Keep it updated; don't delete it
on the next flip.

## Status as of 2026-09-10 — reverted to self-hosted again (GHA billing exhausted, #1810)

GitHub Actions billing/spending-limit failed again — same signature as the 2026-08-13 entry below:
run `34486564964`, job `102909346817`, failing with *"recent account payments have failed or your
spending limit needs to be increased."* This is the **second live recurrence** of this exact failure
mode, and is now evidence logged against #1609 (the still-open ask for a single-switch emergency-
mode mechanism instead of a manual comment/uncomment flip) — no such mechanism was built for this
flip either; this reversion used the same manual comment/uncomment pattern as 2026-08-13 and the
direct reverse of the 2026-09-02 Wave 3 entry below.

**What flipped, with real counts — corrected from both the issue's own stated counts and this doc's
own prior "14-site" tally, both of which are stale.** Issue #1810 claimed `deploy-main.yml` needed 7
sites (6 per-job + 1 input default) and `promotion-quality-gate.yml` needed 9 ("verify live"); the
2026-09-02 Wave 3 entry below claimed 6+8=14 sites total. **Live grep against this worktree at flip
time found 2 sites in `deploy-main.yml` and 12 sites in `promotion-quality-gate.yml` — 14 total,
coincidentally the same sum as the Wave 3 entry's tally, but with a materially different per-file
split:**

| File | Issue #1810 claimed | Wave 3 entry claimed | Live count (this flip) |
|---|---|---|---|
| `deploy-main.yml` | 7 (6 jobs + 1 input default) | 6 | **2** |
| `promotion-quality-gate.yml` | 9 | 8 | **12** |

- **`deploy-main.yml` — 2 sites, not 6+1.** The 6 jobs the issue names (`dgfy-api`,
  `dgfy-migration-runner`, `frontend-ims-prod`, `frontend-pos-prod`, `frontend-storefront-prod`,
  `publish`) do not carry their own `runs-on:`/`runner_labels_json:` literal — each is a
  reusable-workflow caller that forwards `runner_labels_json: ${{ inputs.runner_labels_json }}`
  straight through with no independent fallback, so they inherit entirely from the single
  `workflow_dispatch` input default. The only 2 real sites: that input default (L46-47), and the
  `resolve-build-plan` job's own inline `runs-on:` (L281-282, fallback label `sieitz-lg`, not
  `sieitz-runner` — preserved as-is) — a site the issue never mentioned at all.
- **`promotion-quality-gate.yml` — 12 sites, not 9, not 8.** 1 shared input-default site (the
  `&runner_labels_input` anchor) plus 11 job-level sites. Both the issue's list and the Wave 3
  entry's own tally omit two jobs entirely — `frontend-ims-pos-sales-e2e-quality` and
  `frontend-budgets-quality` — and both collapse what are actually **three separate jobs**
  (`repository-dependency-quality`, `repository-ci-contracts-quality`, `repository-docs-quality`)
  into one imagined `repository-quality` job that does not exist under that name.

This proves the doc's own "flip procedure" warning (re-derive live, don't trust a stale doc's line
numbers) true of **site counts**, not just line numbers — the count drifted between 2026-09-02 and
today because jobs were added to `promotion-quality-gate.yml` (and `deploy-main.yml`'s 6 per-job
pairs were already consolidated into the single delegated input by Wave 3 itself) without this doc
being updated. Cite the live grep, not this doc's own prior number, on the next flip too.

**The 2 non-pair edits:**

- `scripts/lib/runner-routing-state.js`'s `EXPECTED_ACTIVE_CLASS`: `'hosted'` → `'self-hosted'`, in
  the same commit as the 14 site flips (its own file-header warning: the constant and every site
  must move together or `check-runner-routing.js`'s Assertion 6 fails by design).
- `deploy-main.yml:243`'s `guard-branch` preflight `--class both` argument is **retained, not
  reverted** to `--class self-hosted`. `--class` only controls which probes execute; the active
  class used for the flip-required decision is derived independently from the workflow files' own
  live content, never from `--class`. Narrowing to `--class self-hosted` would permanently mark
  hosted `not_probed`, blinding the preflight to hosted recovering and regressing #1365's own
  acceptance criterion that hosted-unavailability "fails clearly and permits only the documented,
  logged fallback strategy." A stale comment at L176 describing the active class as "hosted
  (post-flip)" was also reworded to reflect self-hosted as active again — **this is itself a repeat
  of the same site-count-drift lesson above**: a routing comment, not just a doc, had gone stale
  between flips and needed a live re-check rather than being trusted at face value.

**Verification:** `npm run check:runner-routing` — **OK**. All 12 non-exempt sites carry a
commented, opposite-class alternate directly above their active line; the 3 anchor exceptions
(`guard-branch`, `gate`, `report-advisory-failures`) are unchanged; the `dgfy-api-quality` ↔
`salvage-api-evidence` co-location invariant holds; neither file targets DEV/STAGING; every
non-exempt site's active class matches `EXPECTED_ACTIVE_CLASS` (`"self-hosted"`); `NON_HOSTED_FILES`
and `verify-deployment.yml` carry no hosted runner literal.

Refs #1810, Refs #1609. Direct precedents: the 2026-09-02 Wave 3 entry below (the flip this reverses)
and the 2026-08-13 entry further below (the same billing-exhaustion failure mode, first occurrence).

## Status as of 2026-09-03 — sparse-checkout permanently poisoned the shared `_work` (#1528)

`deploy-main.yml`'s `guard-branch` job (permanently self-hosted, one of the three anchor
exceptions above) checked out with `sparse-checkout: scripts + .github/workflows`. Confirmed live,
on both `vm-sieitzstaging` and `vm-openproject`, that this poisoned the shared `_work` workspace
**permanently** for every later job on the box — `actions/checkout`'s own `sparse-checkout
disable` writes into `.git/config.worktree`, then unsets `extensions.worktreeConfig`, which makes
git stop reading that file; the stale `core.sparseCheckout=true` in `.git/config` stays
authoritative, `git status` reports the tree clean, and downstream jobs fail with
`docker/build-push-action`'s opaque `lstat infrastructure/docker/<app>: no such file or directory`.
Full mechanism, diagnosis signature, and manual clearing procedure:
`docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md`.

Fixed by removing the sparse checkout (plain full checkout instead) and adding a runtime
pre-checkout hygiene guard + post-checkout assertion at every self-hosted-reachable checkout site
(10 sites: `guard-branch`, the three `pr-*-build-checks.yml`, `shared-changed-paths.yml`,
`compliance-preflight-sweep.yml`, and the three `deploy-{api,frontend,migration-runner}.yml`
`build-and-push` jobs, plus `publish-pos-receipt.yml`), enforced by
`scripts/check-workspace-hygiene.js` (`npm run check:workspace-hygiene`) both in
`promotion-quality-gate.yml` (advisory, same shape as its `validate_runner_routing` sibling) and as
a hard local `.husky/pre-commit` gate on any workflow-file change.

**Known residual window, deliberately not hotfixed**: the sparse-checkout removal landed on
`develop` (PR #1536, alongside the back-port of #1525/#1526 and #1530/#1533), not as a fifth same-
day `main` hotfix — PROD was already stable and deployed by the time this was found, so there was
no same-day urgency. `deploy-main.yml`'s `guard-branch` executes from `main`'s copy, which still
carries the sparse checkout until the next promotion; the runtime hygiene guard (which reached
`develop` in the same PR) is what makes that window harmless in the meantime — the next PR job on a
re-poisoned box clears the state before its own checkout runs, rather than inheriting it.

## Status as of 2026-09-02 — Phase 234 Wave 3, the live cutover (#1365)

Worker/Implementer build stage of Phase 234 Wave 3 (#1365, child of epic #1363) — the flip this
whole handoff doc has been building toward since the 2026-08-13 self-hosted revert. **Production
build/deploy/promotion routing is now hosted (`ubuntu-latest`) by default**, not self-hosted. This
follows directly from Wave 0 (#1375, the `salvage-api-evidence` prerequisite, resolved), Wave 1
(the commented-hosted scaffold + `check-runner-routing.js` validator, inert by design), and Wave 2
(the controlled non-production T1–T5 evidence run below, all passing) — read those entries below
for the full history; this entry states only what Wave 3 itself changed.

**What flipped — purely mechanical comment⇄uncomment at the 14 pair sites, plus 4 non-pair edits:**

- `deploy-main.yml` (6 sites: `dgfy-api`, `dgfy-migration-runner`, `frontend-ims-prod`,
  `frontend-pos-prod`, `frontend-storefront-prod`, `publish`) — each site's active `sieitz-runner`
  line commented, its commented `ubuntu-latest` alternate uncommented.
- `promotion-quality-gate.yml` (8 sites: the shared `runner_labels_json` input `default:` — one
  physical site via the `&runner_labels_input` anchor, covers both `workflow_call` and
  `workflow_dispatch` — plus `dgfy-api-quality`, `migration-runner-quality`, `frontend-ims-quality`,
  `frontend-pos-quality`, `frontend-storefront-quality`, `repository-quality`,
  `salvage-api-evidence`) — same comment⇄uncomment flip.
- `scripts/lib/runner-routing-state.js`'s `EXPECTED_ACTIVE_CLASS` constant: `'self-hosted'` →
  `'hosted'` — without this the flip fails Wave 1's own Assertion 6 by design; the constant and
  every site move together or not at all.
- `deploy-main.yml`'s `guard-branch` preflight step: `ci-runner-preflight.js --class self-hosted` →
  `--class both` — single-class probing can't produce the informative mixed-state exit code once
  both classes are legitimately in play; `activeRouting` is derived from the file itself, not
  passed as an argument.
- **New `runner_labels_json` `workflow_dispatch` input on `deploy-main.yml` itself**
  (default `'["ubuntu-latest"]'`, commented alternate `# '["sieitz-runner"]'`), threaded into all 6
  job call sites as `runner_labels_json: ${{ inputs.runner_labels_json }}` instead of each site
  carrying its own literal. This turns the emergency fallback from "comment/uncomment 6 sites and
  push a commit to `main`" into "re-dispatch with one input" (F-5) — a single dispatch-time override
  now covers every production build/publish job in one shot. `check-runner-routing.js` was extended
  (a job whose active line delegates to `${{ inputs.runner_labels_json }}` resolves its class from
  the file's own input `default:` site instead of requiring its own local commented pair; that
  input-default site itself still carries the ordinary commented/active pair and is validated the
  same way `promotion-quality-gate.yml`'s always has been) and gained regression tests for the new
  delegation shape.

**Untouched, deliberately** (unchanged from Wave 1): the 3 anchor exceptions (`guard-branch`,
`gate`, `report-advisory-failures` — permanently self-hosted, no commented alternate);
`deploy.yml`/`deployment-orchestrator.yml` (DEV/STAGING — no LAN path from a hosted VM,
`CI_RUNNER_POLICY.md` "VPN"); all `pr-*-build-checks.yml`; the four reusable workflows' own
`default: '["sieitz-runner"]'` (`deploy-api.yml`, `deploy-migration-runner.yml`,
`deploy-frontend.yml`, `publish-platform.yml`) — shared with `deploy.yml`'s DEV/STAGING calls,
`deploy-main.yml` passes its class explicitly at every call site so it never reaches them.

### Wave 2 evidence (T1–T5) — the basis for confidence in this flip

From PR #1380's evidence-matrix comment (dispatch-only, non-production, run against
`ci/1365-runner-switch-harness`):

| # | Proves | Result |
|---|---|---|
| T1 | hosted picks up a `runner-probe.yml` job | **PASS** — hosted runner (`runnervmgx7h7`) |
| T2 | self-hosted still picks up a job (fallback direction) | **PASS** — `vm-openproject` |
| T3 | the whole `promotion-quality-gate.yml` runs hosted | **PASS** — all 9 jobs `success`; wall-clock 35m28s; ~50 est. billed hosted minutes |
| T4 | self-hosted control, same job set | **PASS** — all 9 jobs `success`; wall-clock 38m42s; 0 billed minutes |
| T5 | hosted → PROD SSH works, read-only | **PASS** — `conclusion: success` |
| T6 | (optional, Tier 2) build+GHCR smoke | Skipped — not run, out of scope for that pass |

Notably, the plan's predicted AVX surprise (`menuPdfRasterService.test.js`'s
`CANVAS_SUPPORTED_ON_THIS_HOST`-gated render tests) **did not materialize** — that suite passed on
both T3 (hosted) and T4 (self-hosted). Two pre-existing, runner-independent advisory failures in
`dgfy-api-quality` (a missing-export bug and an index-audit failure) showed up identically on both
runs, confirming they predate the runner class and aren't new noise from this flip.

### #1375 resolution and its accepted residual (Wave 0, carried forward)

`salvage-api-evidence`'s cross-job recovery mechanism cannot survive hosted routing (every hosted
job gets a fresh ephemeral VM, breaking the co-location assumption it depended on). Investigation
found the feared capability loss was narrower than the issue's own framing: `dgfy-api-quality`'s own
`if: always()` "Upload API test-matrix evidence" step already re-implements the recovery path PR
#1167 built `salvage-api-evidence` to provide, so no re-implementation was needed. What shipped
instead (#1376): `salvage-api-evidence`'s working steps are now gated at the *step* level on
`runner.environment == 'self-hosted'`, and a first step that fires only when the job lands hosted
emits a loud `::warning::` + `$GITHUB_STEP_SUMMARY` entry naming the one genuinely uncovered case —
**the job envelope dying mid-run, before any step (`always()` or not) ever executes** — as an
accepted residual, not a silent loss. That residual is unchanged by Wave 3; it was a precondition
for the flip, not something the flip itself needed to resolve further.

### The flip procedure, now that hosted is the active line

Reversing this flip (should it ever be needed as a considered decision, not the emergency fallback
below) means the same 14-site comment⇄uncomment plus the 4 non-pair edits, run in reverse — see
Wave 1's original scaffold entry below for exact site locations, and re-derive live line numbers via
`grep -n 'runner_labels_json\|runs-on:' .github/workflows/deploy-main.yml
.github/workflows/promotion-quality-gate.yml` rather than trusting any doc's line numbers, which go
stale as soon as an unrelated edit shifts lines. `EXPECTED_ACTIVE_CLASS` in
`scripts/lib/runner-routing-state.js` must move with it, or `check-runner-routing.js`'s Assertion 6
fails CI by design.

**The emergency fallback no longer needs a commit at all**, for the 6 `deploy-main.yml`
build/publish jobs specifically: re-dispatch with `-f runner_labels_json='["sieitz-runner"]'` and
every one of those 6 jobs runs self-hosted for that one dispatch, with no file edit. This does not
cover `promotion-quality-gate.yml`'s 8 sites (those still require the file-level comment/uncomment,
or — for the quality-gate leg specifically — a `-f runner_labels_json='["sieitz-lg"]'` dispatch
override on a manual `workflow_dispatch`/`workflow_call` invocation of that workflow, per its own
long-standing input).

### Not part of this PR — Wave 4 and Wave 5

Wave 4 (a real production promotion that actually exercises this hosted path end to end) and Wave 5
(closeout) are separate, gated, `promoter`-role work — **not** part of Wave 3's scope and not
unattended. See the Phase 234 plan for their procedures.

## Status as of 2026-09-02 — Phase 234 Wave 0, #1375 resolved (prerequisite for the live cutover)

Worker/Implementer build stage of Phase 234 Wave 0 (#1375), the prerequisite the Phase 234 plan
identified before the 14-site flip below can land atomically. #1375 asked for a re-implementation
of `salvage-api-evidence`'s recovery over `actions/upload-artifact`/`if: always()` for the case
where both it and `dgfy-api-quality` flip hosted. Verified against the tree: that re-implementation
**already exists** — `dgfy-api-quality`'s own `if: always()` "Upload API test-matrix evidence" step
— so no re-implementation was needed. What actually shipped: `salvage-api-evidence`'s working steps
(`resolve_evidence_path`, `check_api_quality_envelope`, `upload_salvaged_evidence`,
`sweep_salvaged_evidence`) are now additionally gated at the *step* level (not job-level — the job's
`if:` can't see `runner.environment`) on `runner.environment == 'self-hosted'`, and a new first step
fires only when the job lands hosted, emitting a loud `::warning::` plus a `$GITHUB_STEP_SUMMARY`
entry stating that cross-job evidence salvage is unavailable there, that
`dgfy-api-quality`'s own upload remains the evidence path, and that the one genuinely uncovered case
— the job envelope dying mid-run, before any step (`always()` or not) executes (run 33241398956) —
is accepted, not recovered. The job itself, its `runs-on:` pair, and the co-location invariant in
`scripts/check-runner-routing.js` are unchanged — this was a loudness fix, not a capability fix, and
not a streaming/chunked upload redesign (out of proportion to a residual this narrow). See #1375 for
the discussion and F-3 in the Phase 234 plan for the full correction.

## Status as of 2026-09-02 — Phase 233 scaffold (#1365)

Worker/Implementer build stage of Phase 233 (#1365, child of epic #1363), the phase after
`docs/ops/CI_RUNNER_POLICY.md` (PR #1368) landed on `develop` and declared hosted (`ubuntu-latest`)
the intended default class for production build/deploy/quality jobs — an inversion of every prior
entry in this doc, which routed self-hosted as the default and hosted as the emergency fallback.

**What changed — SCAFFOLD ONLY, no active routing value changed:**

- `deploy-main.yml`'s 6 pre-existing commented hosted lines had their rationale reworded (they
  previously read "GHA billing exhausted... revert to this when hosted runners are back" — stale
  now that hosted is the intended default, not a fallback to revert *to*); the one gap
  (`guard-branch`) was closed with a documented anchor-exception comment instead of a hosted line
  (it must stay self-hosted permanently — see below).
- `promotion-quality-gate.yml` gained commented hosted alternates at all 9 `runs-on:` sites plus
  the shared `workflow_call`/`workflow_dispatch` input default (10 sites total) — the 6 quality
  jobs, `salvage-api-evidence`, and anchor-exception comments on `gate` and
  `report-advisory-failures`.
- New validator `scripts/check-runner-routing.js` (+ `.test.js`, wired as `check:runner-routing` /
  `test:runner-routing`, called from `repository-quality`'s existing validator step) asserts every
  non-exempt site keeps its commented, opposite-class alternate; that the three anchor exceptions
  stay undocumented-alternate-free and self-explained; that `salvage-api-evidence`'s active class
  always matches `dgfy-api-quality`'s (co-location invariant, below); and that neither file targets
  DEV/STAGING while carrying a hosted site.
- New `scripts/lib/runner-availability.js`: the four-way reason-code taxonomy and two pure
  interpretation helpers extracted out of `scripts/pr-checks.js`'s `classifyCiUnavailability()`
  (no behavior change there — its existing test suite passes unmodified), reused by:
- New `scripts/ci-runner-preflight.js` (+ `.test.js`, `npm run preflight:runner`): a *pre-dispatch*,
  class-specific probe ("is hosted available right now? is self-hosted?") — distinct from
  `classifyCiUnavailability()`'s *post-hoc*, SHA-bound question. Probes the org billing-minutes API
  (indeterminate, never healthy, on the 404/403 this session's and this repo's current token scope
  returns), githubstatus.com's Actions component, and an opt-in `--canary` dispatch against the new
  `.github/workflows/runner-probe.yml` (a tiny, non-production, no-checkout/no-secrets echo job —
  deliberately not `build-android-manual.yml`, which builds a real release APK). Never flips a
  routing value itself, on any exit code — it only tells the operator which file:line pair to
  comment/uncomment, and why.
- `deploy-main.yml`'s `guard-branch` job runs the preflight as an in-workflow second step (H2):
  checks out just `scripts/`, probes the currently-active (self-hosted) class, and fails the job —
  stopping every downstream job, all of which carry `needs: guard-branch` — on an unconfirmed or
  unavailable result. `timeout-minutes` raised 1 → 5 for the added network calls.
- `.agents/skills/promoter/SKILL.md` gained the standalone preflight (H1) as an unattended,
  read-only pre-`main` gate, run immediately before the `deploy-main.yml` dispatch ask.

**Anchor exceptions (never routed hosted, by design, not a gap):** `deploy-main.yml`'s
`guard-branch`, `promotion-quality-gate.yml`'s `gate` and `report-advisory-failures`. All three are
short (~1-3 minute) control-plane jobs; `guard-branch` is additionally the always-available anchor
the H2 in-workflow preflight hooks into (a preflight that itself ran on the class it's checking
would be chicken-and-egg).

**Co-location invariant:** `promotion-quality-gate.yml`'s `salvage-api-evidence` recomputes and
reads `dgfy-api-quality`'s workspace path directly, which only exists on the same box under
self-hosted. Its active class must always match `dgfy-api-quality`'s — flip them together, never
independently. Re-implementing salvage to survive an independent flip (over
`actions/upload-artifact`, `if: always()`, from inside `dgfy-api-quality`) is deliberately deferred,
tracked separately, not smuggled into this scaffold.

**Updated flip procedure** — the mirror image of every earlier entry below, since the active class
is now the one a flip reverts *from* rather than reverts *to*: **uncomment the hosted line, comment
the self-hosted line**, per site, in `deploy-main.yml` / `promotion-quality-gate.yml`. Never a
silent or automatic flip (an earlier design — a `guard-branch` output every downstream job
auto-consumes — was deliberately rejected for exactly this reason: it would make the flip silent
and unlogged, destroying the audit trail every entry in this doc relies on). Run
`npm run check:runner-routing` after any manual edit to confirm the pairing invariant still holds.

**Explicitly not done in this phase** (Phase 234, live cutover, not opened here): no active
`runner_labels_json`/`runs-on` value flipped; no workflow dispatched; no `main` merge or production
promotion. See the Phase 233 PR body for the full list of open questions Phase 234 must resolve
first (quality-job capacity/cost at hosted scale, AVX-gated test behavior change, PROD SSH
source-IP restriction — unconfirmed, needs Pat's own server access — and the org billing-token
scope gap).

## Status as of 2026-08-23 — the two runners are labeled by size and routed by measurement (#923)

Both self-hosted runners previously carried only the generic `self-hosted` label, so every
`runs-on`/`runner_labels_json` targeted either box interchangeably even though they're very
unevenly resourced and both dual-purposed, not dedicated CI boxes:

| SSH alias | GH runner name | Runner ID | Cores | RAM | Disk free | Also running |
|---|---|---|---|---|---|---|
| `ssh ch-openproject-runner` | `vm-openproject` | 23 | 4 | 3.8Gi (340Mi free, 1.9G swapped) | 3.9G / 29G | The OpenProject app, 3 buildx builders, cloudflared, yopass |
| `ssh ch-dgfy-runner` | `vm-sieitzstaging` | 25 | 8 | 15Gi (11Gi available) | 11G / 39G | **The live DEV + STAGING docker-compose stacks** |

**Labels** (applied live via the GitHub REST API, no SSH/re-registration needed —
`gh api --method POST repos/Sieitzz/dgfy-platform/actions/runners/<id>/labels -f "labels[]=<label>"`):

- `sieitz-sm` — runner 23 (`vm-openproject`) only. Descriptive; nothing currently forces onto it.
- `sieitz-lg` — runner 25 (`vm-sieitzstaging`) only. Used where a job genuinely needs the bigger box.
- `sieitz-runner` — both runners. The generic "don't care which box" label, replacing bare
  `self-hosted` for everything that doesn't specifically need the large box.

**The split was measured from GHA history (206 runs / 852 job records), not guessed:**

| Job | vm-openproject (sm) | vm-sieitzstaging (lg) | sm/lg ratio |
|---|---|---|---|
| `frontend-build-check` | n=39 med 3.7m | n=36 med 2.4m | 1.51x — slower on small |
| `dgfy-api-build-check` | n=32 med 2.8m | n=51 med 3.4m | 0.81x — faster on small |
| `dgfy-migration-runner-build-check` | n=14 med 1.4m | n=27 med 1.8m | 0.76x — faster on small |

Only `frontend-build-check` (its Dockerfile runs `npm run build:all:parallel`, 3 concurrent vite
builds in one container — the documented exit-137 OOM case, #662) showed a real size signal.
`dgfy-api-build-check` and `dgfy-migration-runner-build-check` are `npm ci --omit=dev` + COPY with
no compile step and are measurably *faster* on the small box, so `pr-checks.yml`'s
`RUNNER_HEAVY_JSON`/`RUNNER_LIGHT_JSON` anchors were re-split accordingly: only
`frontend-build-check` stays on `*runner_heavy` (→ `sieitz-lg`); `dgfy-api-build-check` and
`dgfy-migration-runner-build-check` moved to `*runner_light` (→ `sieitz-runner`).
`promotion-quality-gate.yml`'s default is pinned to `sieitz-lg` on the merits (`dgfy-api-quality`: 2
service containers, `--max-old-space-size=4096`, 45-min timeout; `frontend-quality`: 3 sequential
vite builds + `playwright install chromium`, 35-min timeout — the two heaviest jobs in the repo).
Everything else (deploy/publish path, `shared-changed-paths.yml`, PR build-check defaults) went to
the generic `sieitz-runner` — see `pr-checks.yml`, `promotion-quality-gate.yml`, and the other edited
workflow files' inline `#923` comments for the exact site-by-site reasoning.

**Correction to a since-superseded framing:** #923's own issue body raised a concern that
defaulting the DEV/STAGING deploy path (`deploy.yml`) to the generic label instead of pinning it to
`sieitz-lg` could silently reintroduce the OpenVPN hop #599 removed. That concern predates this
doc's own "Status as of 2026-08-18" section below, which already established that `vm-openproject`
reaches the DEV/STAGING host directly over the internal LAN and that `vpn_required` is a hardcoded
`false` at `deploy.yml`'s call into the orchestrator, gating the only three OpenVPN steps
independent of which runner picks up the job. A DEV/STAGING publish landing on either box brings up
no tunnel either way — so `deploy.yml`'s `runner_labels_json` went to the generic `sieitz-runner`,
not `sieitz-lg`. The label's real forward-looking purpose, per the "Deliberately not done in this
pass" note below (#599 item 2), is as the prerequisite for a future "skip SSH-to-self, run
`docker compose` locally when the runner *is* the deploy target" optimization — `sieitz-lg` now
exists and positively identifies that box, satisfying that prerequisite, but nothing consumes it yet.

**Separately found, not fixed by this pass:** the `dgfy-api-quality` timeouts that originally
motivated #923 are not a resource problem. `tests/token_refresh_race.test.js`'s `beforeAll` hook
hangs on `sequelize.authenticate()` and blows Jest's 120s hook timeout — confirmed failing the same
4 tests, with the same signature, on both the 8-core box (chunk TIMEOUT at 600s) and the 4-core box
(chunk FAIL at 524s). Routing this job to the large box does not make it green; tracked separately
as #925.

**Amendment, same day:** the bare `self-hosted` label was dropped from every array entirely, on
Pat's direction — `sieitz-runner` (both boxes) and `sieitz-lg` (large box only) are the sole
values now, e.g. `'["sieitz-lg"]'` rather than `'["self-hosted", "sieitz-lg"]'`. GitHub's
`runs-on` label matching is AND, not OR, and only self-hosted runners can carry a custom label at
all (a hosted image like `ubuntu-latest` can't be assigned one) — so `'["self-hosted", "sieitz-lg"]'`
was already structurally unable to match anything but `vm-sieitzstaging`, and this amendment
doesn't change what any job can land on. It's intentional cleanup, not a routing fix: `sieitz-lg`/
`sieitz-runner` alone read as the actual policy instead of `self-hosted` plus a size qualifier,
and it removes the now-redundant literal. `scripts/check-pr-quality-workflow.js`'s hosted/
self-hosted detection was updated to match — it now keys off the presence of a GitHub-hosted image
name (`ubuntu-latest` etc.) rather than the now-absent `self-hosted` substring, since that's the
real signal the documented revert-to-hosted procedure actually swaps in.

## Status as of 2026-08-19 — cache backend added as a third flippable anchor (#726)

Measured: the `type=gha` Docker layer cache costs ~21x the build it's meant to skip on the current
self-hosted pool (the Actions cache service serves these runners at 49-69 KB/s; a `push: false`
PR build-check with **zero** actual compute still spent 19+ minutes importing that cache before
`timeout-minutes` killed it). Full measurements in #726.

**Fix shipped**: `pr-checks.yml` gained a third workflow-level anchor, `BUILD_CACHE_FROM`, next to
the existing `RUNNER_LIGHT_JSON`/`RUNNER_HEAVY_JSON` pair -- empty on self-hosted, disabling
`cache-from` entirely on the three PR build-check reusables (`pr-dgfy-api-build-checks.yml`,
`pr-frontend-build-checks.yml`, `pr-migration-runner-build-checks.yml`, each gained a matching
`cache_from` input). **This is deliberately not a deletion of `cache-from`** -- on GitHub-hosted
runners the calculus inverts: hosted VMs are ephemeral with no local layer cache at all, and they
sit on the same network as the Actions cache service, where `type=gha` is a genuine win. The anchor
exists so that stays a one-line flip, not a re-implementation.

**Switch-back procedure update**: the existing "every active `runner_labels_json`/`runs-on` site
carries a commented hosted-runner revert line directly above it" step (below) now also covers
`BUILD_CACHE_FROM` -- it carries its own commented revert line
(`# BUILD_CACHE_FROM: &build_cache_from 'type=gha'  # revert to this when hosted runners are back`)
in `pr-checks.yml`'s `env:` block, right next to the runner anchors it's paired with. Flip both
together, not just the runner anchors -- a self-hosted pool with the network cache re-enabled
reproduces exactly the outage #726 fixes; hosted runners with no cache at all throws away a real
win for nothing. `scripts/check-pr-quality-workflow.js` asserts the two stay consistent.

**Not touched by this pass** (deferred to #728, gated on a measured dispatch first): the deploy-path
reusables (`deploy-api.yml`, `deploy-frontend.yml`, `deploy-migration-runner.yml`) still hardcode
`cache-from`/`cache-to: type=gha,mode=max` -- those builds push to GHCR regardless, so the cache
isn't pure overhead there the way it is on a `push: false` PR check, and #726 explicitly says not to
flip that blind.

## Status as of 2026-08-18 — the OpenVPN hop is unnecessary on self-hosted, made opt-in (#598/#599)

The network topology behind every VPN decision in this doc was never actually written down. Pat
supplied it directly (2026-08-18):

| Host | IP | Role |
|---|---|---|
| `vm-sieitzstaging` | `10.123.32.26` | Online runner **and** the DEV + STAGING server itself (`/opt/dgfy-dev`, `/opt/dgfy-stage` live on it) — same box, different user |
| `vm-openproject` | `10.123.32.17` | Offline runner, a separate PC, but on the **same internal LAN** — reaches `10.123.32.26` directly, no VPN needed |
| BETA / PROD | Linode (`172.105.122.32`) | Public-internet SSH; never needed the VPN either way |

**The rule, stated once:** a job running on *any* registered self-hosted runner must not bring up
OpenVPN for *any* environment — both runners already reach `10.123.32.26` over the internal LAN. The
tunnel is only meaningful from a GitHub-hosted runner, which has no path to that LAN at all.

This corrects the framing the 2026-08-13 section below (and #598/#599, both filed under that stale
framing) inherited — that only `vm-sieitzstaging` was network-adjacent and `vm-openproject` still
needed the VPN hop. `vm-openproject` never needed it either; it was simply never reachable to
confirm that until Pat supplied its IP.

**Why this was worth fixing, not just tolerating:** `verify-deployment.yml` was the one remaining
live VPN site (`publish-platform.yml`'s callers already default `vpn_required: false`), gated on
`inputs.environment == 'DEV' || 'STAGING'` with no way to turn it off. On 2026-08-16, during the
first live `develop → staging` promotion, a verify dispatch landed on `vm-openproject` and hung
indefinitely on "Connect to VPN" (run `31957380863`, #598) — it neither completed nor respected
`gh run cancel`. The mechanism: bringing up a tunnel *into* the network the runner is already on
rewrites that runner's own default route and DNS, which can cut it off from GitHub's control plane
entirely — explaining why the job was unkillable rather than merely slow. #432 (general self-hosted
stall investigation) is still open and may be chasing other instances of this same class.

**Fix shipped**: `verify-deployment.yml` gained a `vpn_required` boolean input (`default: false`,
same shape as `publish-platform.yml`'s existing one) and its three OpenVPN steps now gate on that
input instead of the environment name. No runner affinity was added — with the VPN hop gone,
either runner can service any environment, so pinning buys nothing today. `runs-on: ['self-hosted']`
stays bare on both workflows.

**Switch-back procedure** (kept explicitly reversible per Pat's ask, for a return to GitHub-hosted
runners):
1. Every active `runner_labels_json`/`runs-on` site still carries its commented hosted-runner
   revert line directly above it (e.g. `# runner_labels_json: '["ubuntu-latest"]'  # revert to this
   when hosted runners are back`) — uncomment it, comment the active `self-hosted` line, per site.
2. Set `vpn_required: true` on the DEV/STAGING callers of `publish-platform.yml`
   (`deploy.yml`/`deployment-orchestrator.yml`'s `vpn_required` passthrough).
3. Tick the new `vpn_required` input when dispatching `verify-deployment.yml` for DEV/STAGING.
4. No secret re-provisioning needed: `OVPN_CONFIG`/`OVPN_USERNAME`/`OVPN_PASSWORD` are **repo-level**
   secrets (confirmed live, 2026-08-18), not scoped to the DEV/STAGING GitHub Environments as ADR
   0030's 2026-07-06 amendment claims — they already resolve from any environment's workflow run.

**Deliberately not done in this pass** (#599's item 2, still open): having `publish-platform.yml`
skip the SSH-to-self step entirely when the runner *is* the deploy target, running `docker compose`
locally instead. Blocked on the same fact this section documents: a job cannot currently tell which
runner it landed on, so if `vm-openproject` picked up a DEV/STAGING dispatch, a local-compose path
would silently deploy to the wrong machine. A distinguishing label on `vm-sieitzstaging` (it
currently carries only `self-hosted, Linux, X64` — nothing that positively selects it) is a hard
prerequisite, not yet added.

## Status as of 2026-08-14 — every auto-build/auto-deploy trigger removed

Separate from the runner-hosting question below: as of #417, `push` no
longer triggers anything in this repo. `build-develop.yml`, `build-staging.yml`,
`build-manual.yml`, and `build-beta-manual.yml` (referenced by those names
throughout the rest of this doc, below — historical narrative, left as
written) are **deleted**, superseded by one consolidated `deploy.yml`
(`workflow_dispatch`, explicit environment + component selection:
`all`/`backend`/`frontend`, no automatic detection). `deploy.yml` briefly had
a fourth `auto` option that read the OCI labels added in #415 to rebuild
only what changed since the currently-deployed revision -- removed the same
day (#420) on Pat's own pushback: manual dispatch should mean you pick, not
something deciding for you. `build-main.yml` is **renamed to
`deploy-main.yml`** and lost its `push: [main]` trigger — production now
deploys only on manual dispatch. `publish-pos-receipt.yml` is the one
exception, kept on a real (now path-filtered) `push: [develop]` trigger —
see its own header comment for why. This is orthogonal to
self-hosted-vs-hosted: whichever runner type is active, nothing fires
without a human dispatching it.

## Status as of 2026-08-13 — switched back to self-hosted (GHA billing exhausted)

GitHub Actions billing/spending-limit failed; every job was dispatching and
failing in ~4s with *"recent account payments have failed or your spending
limit needs to be increased."* No CI ran at all. Runner inventory at the time
(`gh api /repos/Sieitzz/dgfy-platform/actions/runners`):

| Runner | Status | Labels |
|---|---|---|
| `vm-sieitzstaging` | online | `self-hosted, Linux, X64` |
| `vm-openproject` | **offline** | `self-hosted, Linux, X64, sieitz-ubuntu-runner` |

**This flip used bare `["self-hosted"]`, not the `sieitz-ubuntu-runner` pin**
the 2026-08-01 section below tells you to use. The pin only matches
`vm-openproject`, which was offline — using it would have queued every job
forever. Bare `self-hosted` matches whichever runner is up, including
`vm-openproject` if it comes back online later with no further edits needed.

The AVX warning that justified the pin (`vm-sieitzstaging`'s CPU lacks
AVX-family instructions → `exit 132`/SIGILL loading `@napi-rs/canvas`, see
`apps/dgfy-api/src/services/menuPdfRasterService.js`) does **not** apply to
the active `pr-checks.yml` job set — those are buildx builds, Gradle, and
git/bash, none of which load that addon.

**This warning was no longer hypothetical as of #1018 (2026-08-25), and is
now handled.** The one job that loads the addon (`dgfy-api-quality`, in the
renamed `promotion-quality-gate.yml` — formerly `pr-quality-checks.yml`) was
`workflow_dispatch`-only until #1018 and, as far as this doc's own history
shows, was never actually run against `sieitz-lg` since the AVX gap was
found — so the risk stayed latent. #1018 wires it to trigger *automatically*
on every `to-staging/*`/`release/*` promotion PR, still pinned to
`sieitz-lg`. Building that workflow surfaced a **confirmed, not hypothetical**
consequence: `apps/dgfy-api/tests/menuPdfRasterService.test.js`'s
capability-gating test hardcoded `expect(isPdfRasterizationSupported()).toBe(true)`
— false on an AVX-less host. Filed and fixed in the same change as #1018
(#1035): the render-dependent tests in that file are now gated on a real
probe of the runner's own capability, captured once at file load, rather
than assuming every runner has AVX — on `sieitz-lg` they report as Jest
`skipped` (a real, visible signal, not a false red or a masked failure), and
still run for real on any host that does have AVX. If a *different* addon-
loading test is ever added to a job pinned here, the same pattern applies:
gate it on a real capability probe, don't assume the host.

**The one-line switch-back claim in the 2026-08-01 section below is no
longer accurate.** Beyond the `runner_labels_json` sites it documents, this
flip also had to touch:

- **`pr-checks.yml`** has no commented fallback at all — its five jobs are
  driven by two YAML anchors (`&runner_light`, `&runner_heavy`) in the
  workflow-level `env:` block. Change the anchor **values**, never the
  names — `scripts/check-pr-quality-workflow.js` hard-asserts the literal
  string `runner_labels_json: *runner_heavy` exists in this file.
- **`build-beta-manual.yml`** passed no `runner_labels_json` at all,
  silently inheriting the orchestrator's hosted default. Now pinned
  explicitly so it can't drift back to hosted on its own.
- **`build-android-manual.yml`** and **`deploy-production.yml`** hardcode
  `runs-on: ubuntu-latest` directly (no `runner_labels_json` indirection).
- **Every reusable workflow's `runner_labels_json` input default** changed
  from `'["ubuntu-latest"]'`/`'["ubuntu-slim"]'` to `'["self-hosted"]'`, so
  the repo fails safe (self-hosted) rather than fails to billing if a caller
  ever omits the input.
- **`vpn_required` flipped to `false`** on all DEV/STAGING callers
  (`build-develop.yml`, `build-staging.yml`, `build-manual.yml`). The
  OpenVPN→SSH hop in `publish-platform.yml` exists so a *hosted* runner can
  reach the office-network DEV/STAGING servers. A self-hosted runner
  (`vm-sieitzstaging`) already sits on that network *and is itself the
  target* — leaving VPN on would have it tunnel into itself and rewrite its
  own routing/DNS on every deploy.
- **`publish-platform.yml` gained a credential cleanup step** (`if:
  always()`, removes `~/.ssh/deploy_key` and `/tmp/client.ovpn` after every
  run). Hosted runners threw these away for free by being ephemeral;
  `vm-sieitzstaging` is persistent and also serves live DEV/STAGING traffic,
  so a deploy key (including the **PROD** key, via `build-main.yml`) left on
  disk there is a real exposure.

**Every active `runner_labels_json`/`runs-on` line carries a commented
revert line directly above it** (e.g. `# runner_labels_json:
'["ubuntu-latest"]'  # revert to this when hosted runners are back`) —
flipping back to GitHub-hosted once billing is restored is comment/uncomment
per site, same mechanism the 2026-08-01 migration used. The `vpn_required`
and credential-cleanup changes are not part of that toggle and would need
re-evaluating on the way back to hosted, not just re-flipping.

**Not yet verified on this flip (do before trusting it fully):**
- `docker/setup-qemu-action@v3` (used by `deploy-migration-runner.yml` /
  `pr-migration-runner-build-checks.yml` for the `linux/amd64,linux/arm64`
  build) needs privileged Docker on the runner to register binfmt handlers —
  confirm `vm-sieitzstaging` can do this.
- Disk headroom on `vm-sieitzstaging` — its ~39GB root already hit "no space
  left on device" mid-build once before (see git history, `31d0bb2e`), and it
  also runs the live DEV/STAGING compose stacks.
- Whether a burst of pushes to `develop` queues badly — `build-develop.yml`
  deliberately sets `cancel-in-progress: false`, and there is currently only
  one online runner.

## Status as of 2026-08-01 (superseded above, kept for history)

**No longer blocked on billing — the user decided to fully retire
self-hosted and accept the GitHub-hosted minute cost.** A measured cost
analysis (see the PR description / conversation this session) found the
original assumption backwards: the *push/deploy* builds run on self-hosted
today at $0, and moving them to `ubuntu-latest` alone would add ~1,450
billed min/month against the org's 2,000-minute free allowance. The
resolution: retire self-hosted everywhere (this PR's original scope), but
every `runner_labels_json` site now carries a **commented self-hosted
fallback** right above the active hosted-runner line, e.g.:

```yaml
      # Switch back to the free self-hosted runners if Actions minutes run
      # out. Pin the label so jobs avoid vm-sieitzstaging (AVX-less CPU ->
      # exit 132 on native addons like @napi-rs/canvas).
      # runner_labels_json: '["self-hosted","sieitz-ubuntu-runner"]'
      runner_labels_json: '["ubuntu-latest"]'
```

Uncommenting that line (and commenting the active one) is the whole
switch-back — no other changes needed. `sieitz-ubuntu-runner` is a label
unique to `vm-openproject`, routing switch-back builds off the AVX-less
`vm-sieitzstaging` box.

On top of the original runner migration, this session also collapsed the PR
Checks fan-out from 6 billable jobs to 3 (see "What this branch does,
continued" below) — measured billing is per-job, rounded up to the nearest
minute, so trivial sub-60s jobs (conventional-commits, summary) were pure
rounding waste, and `code-quality` (`continue-on-error: true`, so it could
never block a merge) was 22% of the entire PR Checks bill for zero
enforcement. Do not merge this PR just because it looks finished — confirm
with the user first.

This branch will keep getting `origin/develop` merged into it (merge, not
rebase) as part of the ongoing process while it sits open. Resolve conflicts
in favor of keeping this branch's runner/gating changes; re-verify per the
checklist below after each merge, and expect a steady trickle of merge commits
from `develop` in the history rather than a rebased/linear log.

## What this branch does

- Moves every PR check and image build off the two self-hosted runners onto
  GitHub-hosted `ubuntu-slim` (git/bash-only jobs) or `ubuntu-latest` (Docker
  builds, code-quality, the OpenVPN->SSH publish step).
- Generalizes `pr-changed-paths.yml` into reusable `changed-paths.yml`
  (adds a `base_sha` input for push-mode diffing, with a build-both fallback
  for new branches / force-pushes) and wires it into `build-develop.yml` so
  pushes to `develop` only rebuild the image domain that actually changed,
  instead of always rebuilding both. `deployment-orchestrator.yml` gained
  `build_backend`/`build_frontend` inputs (default `true`) so staging/main/
  manual/beta callers are unaffected and still always build both, per the
  user's explicit instruction.
- Narrows the `.github/workflows/` clause in the changed-paths filters so only
  build-relevant workflow edits force an image rebuild (previously *any*
  workflow edit rebuilt both).
- Replaces the self-hosted-only retained `dgfy-builder` buildx setup with
  ephemeral builders + `type=gha` cache (canonical scope in `deploy-*`,
  PR-scoped write-only cache in `pr-*-build-checks`).
- Added a `cancelled`-result check to `pr-checks-summary.yml`'s gate (it
  previously only checked for `failure`). **Superseded 2026-08-01** —
  `pr-checks-summary.yml` was deleted in this session's fan-out collapse
  (see below); that gate no longer exists.
- Archives 7 workflows outside the user's stated maintained set
  (`build-*`/`deploy-*`/`deployment-orchestrator`/`pr-*`/`publish-platform`/
  `publish-pos-receipt`) into `.github/workflows-archive/`, with its own
  README explaining what/why. `deploy-production.yml` is kept but trimmed to
  `workflow_dispatch`-only since its trigger workflow was archived.

Full rationale and the original design tradeoffs are in the PR #118
description; the plan this was built from also covered rejected alternatives
(e.g. keeping the retained buildx builder, leaving `.github/workflows/` broad
in the path filter) if you need to understand *why* something is shaped the
way it is rather than just *what* it does.

## What this session added (2026-08-01) — measured cost pass

Merged `origin/develop` in (resolving conflicts from develop's own
`shared-changed-paths.yml` rename), then applied a plan built from *measured*
billing data (`gh api .../actions/runs/<id>/jobs`, `gh api
/orgs/Sieitzz/settings/billing/actions`), not estimates:

- **Self-hosted switch-back comments** on every `runner_labels_json` site in
  `build-develop.yml`, `build-staging.yml`, `build-main.yml`,
  `build-manual.yml` (see "Status" above).
- **Fixed the stale changed-paths regex**: `shared-changed-paths.yml`'s two
  filters still matched `\.github/workflows/(changed-paths|...)`, a filename
  that no longer exists post-rename — self-edits to the filter workflow
  triggered neither image build. Also added `\.dockerignore` to both filters
  (it directly determines Docker build context content, `context: .`).
- **Fixed `build-main.yml`'s `publish` job condition** — it required all
  three image builds `== 'success'`; a `skipped` build (e.g. once a
  changed-paths gate is added there, still TODO) would have silently blocked
  publish forever. Now mirrors `deployment-orchestrator.yml`'s existing gate
  shape (`!cancelled() && != 'failure' && (...any succeeded...)`).
- **Collapsed the PR Checks fan-out from 6 billable jobs to 3.** Deleted
  `pr-code-checks.yml` (`code-quality` job) outright — it was
  `continue-on-error: true`, so with no branch protection available on this
  repo's free org plan (confirmed via `gh api .../branches/develop/protection`
  → 403 "Upgrade to GitHub Pro"), it could never have blocked a merge, yet
  cost ~22% of the entire PR Checks bill. Folded `pr-conventional-commits.yml`
  (PR title/body format) and the `check:pos-receipt-version` step formerly in
  `pr-code-checks.yml` into `shared-changed-paths.yml`'s `changes` job behind
  a new `validate_pr_metadata` input (PR-mode only; each new step keeps
  `continue-on-error: true` at the step level, same advisory behavior as
  before). Deleted `pr-checks-summary.yml` — with no branch protection to
  feed, it just aggregated already-advisory checks into another advisory
  check.
- **Coverage gap opened by deleting `code-quality`**: `npm --prefix backend
  run lint` / `npm --prefix frontend run lint` (eslint) are no longer run in
  CI at all. The pre-commit hook (`.husky/pre-commit`) already covers
  architecture guardrails, tenant-schema coverage, compat-seams, compliance,
  and doc lint, but not eslint. The plan calls for adding `lint-staged` to
  the pre-commit hook to close this — **deliberately not done in this
  session** (a new devDependency + lockfile change felt like it needed its
  own confirmation rather than riding along). Flagged for the user as a
  fast-follow.
- ~~Not yet done from the full plan~~ **Update 2026-08-14**: dropping the
  `edited` PR trigger and skipping draft PRs shipped (#413).
  `build-staging.yml`/`build-main.yml` are gone entirely (#417/#419), so
  "gate them on changed paths" is moot — their replacement (`deploy.yml`)
  takes an explicit `components` input instead. Still not done: untracking
  the ~528 MB of committed `Standalone POS/app/build` + `backups/` (incl. a
  committed `.sql` dump — separate security finding), now tracked as #359.

## What's verified vs. not

**Verified (static, safe to trust):**
- `actionlint` clean across all 19 active workflow files.
- ~~No functional `self-hosted` runner-label references remain in
  `.github/workflows/` (only two explanatory comments).~~ **Stale as of
  2026-08-13** — see the section above; the repo is back on self-hosted
  everywhere.
- Every internal `uses: ./.github/workflows/...` reference resolves to a file
  that still exists after the archive move.
- `scripts/collect-github-actions-unavailability.test.js`,
  `scripts/build-release-candidate-evidence.test.js`,
  `scripts/deploy-master-ci.test.js` (11/11) still pass — these reference
  `"staging-qualification"` as a string fixture and one reads
  `deploy-production.yml` directly.
- Pre-commit `check:compliance`/`check:compliance:api-contracts` passed.

**~~Not yet verified~~ Verified 2026-08-13/14 — the section below is obsolete
and kept only as a historical record.** Every item it named is gone: the
`push`-triggered build-checks it describes don't exist anymore (`build-develop.yml`/
`build-staging.yml` are deleted, #417/#419), the `changes` job it references was
removed along with them, and the "watch the first real hosted DEV/STAGING deploy"
plan was abandoned when the repo went back to self-hosted (2026-08-13, above). What
actually got verified, on the current `deploy.yml`/`deploy-main.yml`:

- **DEV**, run [31724177658](https://github.com/Sieitzz/dgfy-platform/actions/runs/31724177658) —
  build + SSH publish succeeded, deployed `org.opencontainers.image.revision` label
  matched `develop` HEAD.
- **STAGING**, run [31727201728](https://github.com/Sieitzz/dgfy-platform/actions/runs/31727201728) —
  same, against `staging` HEAD. (Not `31726388197` — that run's `guard-ref` job
  stalled on the self-hosted runner past its own `timeout-minutes: 2` and was
  cancelled; see #432. The re-dispatch with zero code changes succeeded cleanly,
  which is the run above.)
- **BETA+PROD**, run [31728787346](https://github.com/Sieitzz/dgfy-platform/actions/runs/31728787346) —
  `deploy-main.yml`'s dual-deploy, both frontend variants + shared api/migration-runner,
  single SSH publish. Hit (and recovered from) a GHCR secondary rate limit on this
  run — see #427 and the transitive-skip-adjacent lesson below.
- The self-hosted-vs-VPN question the old bullet asked about is answered, and the
  opposite way from what it worried about: DEV/STAGING/BETA/PROD are all reached
  directly over SSH from the self-hosted runner, with `vpn_required: false`
  everywhere. There is no GitHub-hosted tier anymore for this to matter to — see
  #386 (closed), which recorded self-hosted as the only CI tier.

### Lesson: a skipped ancestor job propagates through the whole dependent chain

Cost a full deploy cycle on 2026-08-13 and looked completely green while doing
nothing, so it's worth writing down precisely.

The pre-#421 `deploy.yml` had `build-and-push` depending on `compute-flags`,
which depended on `changes` — and `changes` only ran for `components: auto`.
Dispatching with any other `components` value meant `changes` was `skipped`.
GitHub Actions propagates a `skipped` status **transitively** through `needs`:
an intermediate job wrapped in `if: always()` (which `compute-flags` was) still
runs itself, but that does not rescue *its own* dependents — a job's default
`if` behavior still requires its `needs` to have succeeded, `always()` on an
ancestor two hops up doesn't reach past the direct parent.

The tell was that **both** `build-and-push` (`if: needs.compute-flags.outputs.should_build == 'true'`)
and its sibling `nothing-to-build` (`if: needs.compute-flags.outputs.should_build != 'true'`)
were skipped in the same run — mutually exclusive conditions, so neither `if:`
was ever evaluated at all, which only happens when the job itself never ran.
The run still reported success, because nothing in the graph actually failed.

Fixed structurally, not defensively: #421 deleted `changes`/`compute-flags`/
`nothing-to-build` outright, leaving `resolve-environment → build-and-push`
with no skippable ancestor in between. The general lesson for any future job
graph here: a conditionally-skipped job anywhere upstream needs either
`always()` on **every** job downstream of it (not just the direct child), or —
better, as this fix did — no conditional job in the chain at all.

## Known stale references (out of scope for this PR)

Retiring the 7 archived workflows leaves some docs/config pointing at paths
that no longer exist under `.github/workflows/`:
`release-controller/config/controller.example.json` (required-check names),
`docs/ops/WORKSPACE_CLEANUP_AND_BRANCH_POLICY.md`,
`docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`,
`docs/architecture/adr/0030-free-tier-signed-release-authorization.md`. See
`.github/workflows-archive/README.md` for the full list. Updating the
release-governance docs is a separate decision the user hasn't made yet —
don't fold it into this PR without asking.
