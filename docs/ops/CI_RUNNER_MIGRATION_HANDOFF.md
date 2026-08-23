# CI runner migration handoff

Living doc, not scoped to a single PR — promoted out of `.github/` on
2026-08-13 when the repo switched back to self-hosted (see below), reversing
this doc's own original 2026-08-01 decision. Keep it updated; don't delete it
on the next flip.

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
`pr-quality-checks.yml`'s default is pinned to `sieitz-lg` on the merits (`dgfy-api-quality`: 2
service containers, `--max-old-space-size=4096`, 45-min timeout; `frontend-quality`: 3 sequential
vite builds + `playwright install chromium`, 35-min timeout — the two heaviest jobs in the repo).
Everything else (deploy/publish path, `shared-changed-paths.yml`, PR build-check defaults) went to
the generic `sieitz-runner` — see `pr-checks.yml`, `pr-quality-checks.yml`, and the other edited
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
(chunk FAIL at 524s). Routing this job to the large box does not make it green; tracked separately.

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
the active CI job set — those are buildx builds, Gradle, and git/bash, none
of which load that addon. The one job that would (`quality-checks`) is no
longer wired into `pr-checks.yml` at all (removed 2026-08-14, #416; was
`if: false` there before that) — it's now only reachable by manually
dispatching `pr-quality-checks.yml` from the Actions tab. **Re-check this
before ever running `quality-checks`, manually or wired back in** — if it
lands on `vm-sieitzstaging` it will need the label narrowed back to
`sieitz-ubuntu-runner`, or the AVX-lacking runner excluded some other way.

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
