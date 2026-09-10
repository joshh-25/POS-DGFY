---
status: amended
authority_level: authoritative
owner: release
date: 2026-09-04
last_reviewed: 2026-09-09
review_by: 2027-03-04
applies_to: dgfy-api, dgfy-migration-runner, dgfy-ims, dgfy-pos, dgfy-storefront, release_process
topic: per_app_container_semantic_versioning
---

# ADR 0081: Per-App Container Semantic Versioning

## Status

Accepted (2026-09-04)

> Strictness tiers per [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md):
> Clauses below are tagged `binding`, `default`, or `snapshot`. `binding` is a system invariant
> and needs a superseding ADR to change; `default` is amendable in place; `snapshot` records a
> point-in-time fact. Untagged clauses are `default`.

## Context

Epic #1548 asks for per-app SemVer on the five containers (`dgfy-api`, `dgfy-migration-runner`,
`dgfy-ims`, `dgfy-pos`, `dgfy-storefront`), enforced at PR time (patch by default on `develop`, at
least a minor bump per changed app on promotion to `staging`, patch-only on staging repair and main
hotfix), stamped on published images, and observable at runtime. No ADR governs image *tags* today
— only names ([ADR 0072](0072-ghcr-container-image-naming.md)). Per
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`'s decision procedure, a new cross-boundary decision
with no ADR covering it means: create an ADR. This is that ADR, filed as #1559.

Two facts make a bare `X.Y.Z` tag ambiguous for this repo specifically:

- The three frontend images (`dgfy-ims`, `dgfy-pos`, `dgfy-storefront`) bake ~30
  environment-specific `VITE_*` values from the GitHub Environment's `vars` at `docker build` time
  (`.github/workflows/deploy-frontend.yml:125-232`) — API URL, Sentry DSN/environment, PostHog key,
  payment/sandbox flags, etc. A frontend image is `source version x environment` by construction;
  the same commit built for STAGING and PROD produces two different digests.
- The two backend images (`dgfy-api`, `dgfy-migration-runner`) bake nothing — their Dockerfiles
  have zero build args — so they are environment-agnostic in principle, but this ADR chooses
  uniformity over a special case (see Decision 1).

Today every published image gets exactly two tags — a moving channel tag (`develop`/`staging`/
`latest`) and an immutable `sha-<7>` — plus two OCI labels (`revision`, `source`); no
`org.opencontainers.image.version` exists anywhere, and no `docker/metadata-action` is used. All
five apps' `package.json` (and the root, `packages/web-core`, `packages/shared-constants`) still
carry the inert `1.0.0` from `npm init`; only `packages/pos-receipt` (0.1.5) has ever moved, via its
own precedent check, `scripts/check-pos-receipt-version-bump.js`.

**Out of scope for this ADR**, recorded here so it isn't rediscovered as a silent gap:

- The per-service `IMAGE_TAG` compose split (retiring the single shared `IMAGE_TAG` for
  per-service pinnable variables) belongs to #495 — this ADR documents the *contract* #495 must
  honor (version tags of the shape `X.Y.Z[-channel]` exist and are pullable) but does not implement
  the compose change itself.
- Root `package.json`, `packages/web-core`, and `packages/shared-constants` are explicitly excluded
  from this versioning scheme — they are not independently deployable containers.
  `packages/pos-receipt` keeps its own existing scheme
  (`scripts/check-pos-receipt-version-bump.js`) unchanged; this ADR does not fold it in.
- Retiring `:latest` / pinning what prod actually pulls, and rollback — owned by #495 (epic #492),
  per #1548's own Non-goals.

## Decision

1. `[default]` One image repository per app (unchanged, ADR 0072); environment is a tag;
   non-prod version tags carry a semver pre-release suffix naming the channel: `1.5.2-dev`,
   `1.5.2-staging`; prod publishes bare `1.5.2` (no suffix). Applies uniformly to all five images,
   including the two environment-agnostic backends. No `v` prefix (matches `sha-<7>` and the OCI
   label convention already in use). No `+` build-metadata in the tag — Docker tags forbid `+`; the
   commit stays in the existing `sha-<7>` tag and `org.opencontainers.image.revision` label.
2. `[default]` The existing moving channel tags (`develop`/`staging`/`latest`) and `sha-<7>` are
   unchanged and additive to the above — servers keep pulling the moving tag; nothing on the deploy
   path changes as a result of this ADR alone.
3. `[default]` `org.opencontainers.image.version` = the full tag string, e.g. `1.5.2-staging`.
   `package.json`'s own `version` field stays the bare `X.Y.Z` (no suffix) — the suffix is a
   publish-time artifact, not a source-tree fact.
4. `[default]` Runtime version equals the published image tag: every image bakes
   `APP_VERSION=<tag>` (e.g. `1.5.2-staging`) as a build-arg, so `/health` and a frontend
   build-stamp equivalent report exactly what was published, not the bare package.json version.
   This makes backend images channel-bound too — accepted for uniformity across all five apps.
5. `[default]` Sentry release stays bare (`dgfy-pos@1.5.2`), with `environment` carrying the
   channel — release-vs-fix correlation should track across channels, not fork per channel. This
   format is handed to #633 and #276 as a comment once this ADR merges; wiring their consumption is
   out of scope here.
6. `[default]` Version bumps are **PR-authored**, not CI-owned: whoever's PR changes an app or a
   `packages/*` dependency that app lists as a `file:` dependency in its `package.json` bumps that
   app's version in the same PR. A `develop` back-port of a main hotfix (per
   `RELEASE_CANDIDATE_POLICY.md`'s hotfix procedure) also bumps develop's version. **The required
   bump level depends on which path the PR takes (Pat, 2026-09-04):**
   - **PR into `develop`** — any increase; patch by default (`1.2.3` → `1.2.4` → `1.2.5` as each
     contributor's PR lands). The level is deliberately *not* policed here — develop changes are
     non-blocking by design.
   - **`to-staging/<candidate_id>` into `staging`** (promotion) — for every app whose files
     changed between `staging` and the candidate (directly or via `file:` fan-out), the
     candidate's version must be **at least one minor above staging's current version for that
     app**: staging on `1.2.3`, develop on `1.2.6` → the candidate must carry `1.3.0`. If a develop
     PR already raised the minor (to `1.3.x` or `1.4.x`), that satisfies the floor as-is. Apps
     with no changes keep their version untouched. Because promotion branches carry no commits of
     their own, the bump has to already be on `develop`: the promoter runs a pre-cut floor check
     (`origin/develop` vs `origin/staging`) and, for any app below its floor, opens and merges one
     `chore(release): bump <apps> to X.(Y+1).0 for candidate <id>` PR into `develop` before
     cutting. Shipping to staging is, by definition, at least a minor change.
   - **`fix/staging/<candidate_id>-rN` into `staging`**, and **a hotfix into `main`** — **patch
     only**: major and minor must be unchanged, patch strictly greater (`1.3.0` → `1.3.1` →
     `1.3.2`). Prod ships whatever staging ended on (e.g. `1.3.3` after three repairs); a prod
     hotfix then makes it `1.3.4`.
   - **`release/<candidate_id>-rN` into `main`** — inherits staging's versions unchanged (holds by
     construction since it's cut from `staging`; the check only asks for an increase vs `main`
     for changed apps).
   - This is per app, not platform-wide: a valid prod shipment can be `dgfy-api: 1.3.6`,
     `dgfy-ims: 1.3.2`, `dgfy-pos: 1.3.3`, `dgfy-storefront: 1.3.0` (no changes at all).
   - `[snapshot]` **Accepted consequence, not a defect:** after a candidate is cut at `X.Y.0`,
     develop's subsequent patch bumps (`1.3.1-dev`, `1.3.2-dev`) and staging's repair patches
     (`1.3.1-staging`) overlap numerically. The channel suffix keeps every published tag distinct;
     bare (prod) versions only ever derive from the staging line; and the promotion floor guarantees
     the next candidate jumps past whatever develop reached. Record this in `## Consequences`
     rather than trying to prevent it (the alternative — jumping develop to the next minor after
     every cut — was considered and rejected by Pat on 2026-09-04).
7. `[binding]` A published version tag is never overwritten with a different revision — a builder
   must refuse to push `<app>:X.Y.Z[-channel]` if that tag already exists in GHCR pointing at a
   different `org.opencontainers.image.revision`; pushing the same revision again (an idempotent
   re-dispatch) is allowed. This is the one system invariant this ADR asks to be a hard constraint;
   every other clause is `[default]`.
8. `[default]` Promotion parity gate: for a given app, the image published as `X.Y.Z-staging` and
   the later image published as bare `X.Y.Z` must share the same **candidate source identity** — not
   `org.opencontainers.image.revision` as-is, which the deploy path stamps from the triggering
   merge commit's `github.sha` (Decision 1/7) and which therefore differs between the
   `to-staging/<candidate_id>` → `staging` merge commit and the `release/<candidate_id>-rN` → `main`
   merge commit even when both carry byte-identical candidate content — comparing raw
   `github.sha`-derived revisions this way would fail the *normal* three-stage promotion path this
   gate exists to validate, not just the #1007/hotfix exceptions below. The candidate source
   identity is instead the frozen promotion candidate's own tracked SHA
   (`scripts/check-promotion-candidate.js`'s manifest: `source_develop_sha` for a candidate with no
   staging repairs, or the latest `staging_repair` revision's `sha` — equivalently,
   `current_staging_sha` — once repairs have landed; `release/<candidate_id>-rN` is itself asserted
   cut from exactly `current_staging_sha`, so this identity is stable across both merges by
   construction). Phase 277's builder stamps this identity into a distinct label at build time
   (naming and mechanics are that phase's job, not this ADR's — `org.opencontainers.image.revision`
   keeps its existing, unchanged meaning from Decision 1/7, the actual build-commit SHA); Phase 279's
   parity check compares that label, not `org.opencontainers.image.revision`, between the two
   images. Applies uniformly to all five apps, matching Decision 1 — no frontend/backend split. A
   production version published with no matching staging predecessor under this identity is expected
   evidence of a #1007 expedited promotion or a main hotfix, not a defect — the gate documents the
   fact, it does not forbid it.
9. `[default]` The PR-time version-bump check (issue #1560; base-aware — it applies the level rule
   from Decision 6 according to the PR's `(base, head)` pair) lands advisory first and flips to
   blocking only in a later, dedicated phase, once enough clean-run evidence exists — matching this
   repo's own established pattern (Phase 272, #1550/#1551).
10. `[snapshot]` Known accepted gap, not solved by this ADR: two PRs opened in parallel that each
    bump the same app to the same next version can both pass the (equality-based or increase-based)
    check and merge without conflict, since there is no push-triggered check on `develop`.
    Documented here as a stated limitation, not fixed.

## Consequences

- **Numeric overlap between channels is expected, not a bug** (Decision 6's snapshot-tier
  sub-clause, restated here per that clause's own instruction to record it in Consequences): after
  a candidate is cut at `X.Y.0`, develop's subsequent patch bumps (`1.3.1-dev`, `1.3.2-dev`) and staging's
  repair patches (`1.3.1-staging`) overlap numerically with each other and, transiently, with
  whatever staging or main is on. The channel suffix (Decision 1) is what keeps every *published
  tag* distinct despite the overlap; production versions only ever derive from the staging line
  (Decision 6's `release/*` inheritance); and the promotion floor check guarantees the next
  candidate's minor jumps past whatever develop reached in the meantime. The rejected alternative —
  jumping develop to the next minor immediately after every candidate cut, to keep the two lines
  from ever sharing a number — was considered and rejected by Pat on 2026-09-04: it would force a
  version bump with no corresponding code change, defeating the "PR-authored, reflects real change
  history" premise of Decision 6.
- **Backend images become channel-bound for the first time.** `dgfy-api` and `dgfy-migration-runner`
  bake zero build args today (Context); Decision 4 makes `APP_VERSION` a build-arg on all five apps
  uniformly, so a backend image built for `staging` and one built for `main` at the same source
  commit now differ by that one baked value, even though the Dockerfiles otherwise stay
  environment-agnostic. Accepted for uniformity (Decision 1, Decision 4) rather than carving out a
  same-digest special case for the two backends.
- **`RELEASE_CANDIDATE_POLICY.md` and the promoter/implement/pr-reviewer skill files gain new
  obligations** stating who bumps what version and when — tracked as a dated amendment to
  `RELEASE_CANDIDATE_POLICY.md` in the same PR as this ADR (see that document), with the skill-file
  wiring itself (Worker's own bump obligation, `pr-reviewer` proposing a level) deferred to epic
  #1548's Wave 2 (planned Phase 275), not built in this PR.
- **Sentry (#633) and the PWA update toast (#276) gain a real version to key off**, once they wire
  up to Decision 5's format — this ADR only hands them the format as a comment; consuming it is
  explicitly out of scope here (Decision 5).
- **The PR-time enforcement check (#1560) ships advisory, not blocking**, in the same spirit as this
  repo's existing advisory-to-blocking rollout pattern (Phase 272, #1550/#1551) — a version-bump
  omission is visible but non-fatal to a PR until Decision 9's later blocking flip, tracked as epic
  #1548's Wave 2 (planned Phase 276).
- **The parallel-PR race (Decision 10) stays open** — two PRs racing to bump the same app to the
  same next version can both merge clean today. Closing it would need a push-triggered check on
  `develop`, which is new scope this ADR does not build.
- **Everything downstream of this ADR — the builder changes (`:X.Y.Z[-channel]` tags, the
  immutability guard, `APP_VERSION` build-args), runtime observability (`/health`, frontend build
  stamp), and the promoter's pre-cut floor check and parity gate — is deferred to later phases of
  epic #1548** (planned Phases 274, 277-279; see `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`).
  This ADR fixes the scheme; it does not implement any of the tooling that stamps or enforces it.

## Amendments

### 2026-09-04 — Decision 8's `current_staging_sha` is not enough for an app untouched by a repair; candidate source identity is now resolved per app

Found live during epic #1548's first real promotion (candidate `2026-09-05-01`, release revision r2,
merged to `main` at `052753eb7`, deployed and verified healthy — a metadata/provenance-tracking gap,
not a production incident). `check-image-version-parity.js` FAILed for `dgfy-api` and
`dgfy-migration-runner`: their `X.Y.Z-staging` images still carried the candidate's *original*
identity (from before a staging repair, #1603/#1605, that touched only `packages/web-core` and the
three frontends), while their `X.Y.Z` PROD images had been stamped with the repair's *newer*
identity — because the PROD build applies one manifest-wide `current_staging_sha` uniformly to every
app, regardless of whether that app was actually part of the repair. `dgfy-ims`/`dgfy-pos`/
`dgfy-storefront` (the apps the repair did touch) passed. Full incident writeup: #1610.

**Root cause:** two things this ADR asked for turn out to be mutually exclusive for an app a repair
never touches. Decision 7 (binding) correctly refuses to re-label that app's already-published
`X.Y.Z-staging` tag under a new revision — nothing rebuilt it, so nothing should relabel it. But
Decision 8's original text treated candidate source identity as one uniform `current_staging_sha`
value, advancing for every app the moment *any* repair lands. PROD always rebuilds every app fresh
(there is no existing bare `X.Y.Z` tag to skip rebuilding), so stamping every app with that one
advanced value mislabels the untouched ones: their STAGING image is telling the truth (the earlier
identity); their freshly-built PROD image is not.

**Resolution:** candidate source identity moves from one manifest-wide value to a **per-app**
resolution. An app's candidate source identity is the SHA of the most recent revision — the initial
`to-staging/<candidate_id>` cut, or a `staging_repair` — that actually rebuilt/relabeled that app on
STAGING. An app never named by any repair keeps the initial revision's SHA (`source_develop_sha`)
for the candidate's entire life, even after `current_staging_sha` itself advances for other apps.

Mechanically:
- `scripts/check-promotion-candidate.js`'s manifest schema gains a **required** `apps_touched` array
  on every `staging_repair` revision (non-empty, entries drawn from the five app names, no
  duplicates) — the same apps whose `build_*` flag was `true` on that repair's STAGING redeploy.
  `dgfy-api` and `dgfy-migration-runner` always appear together, since `build_api` always rebuilds
  them as one paired unit (see `deploy.yml`/`deploy-main.yml`'s own pairing comment) — a repair that
  touches either always lists both. `current_staging_sha` is unchanged in meaning (still the latest
  revision's SHA, still validated the same way, still useful as overall candidate context) but is no
  longer what the parity gate compares per app.
- A new `resolveCandidateSourceShaByApp(manifest, apps)` function computes the per-app map described
  above, and a new `--resolve-app-shas` CLI mode prints it as JSON for the promoter's runbook to
  consume.
- `scripts/check-image-version-parity.js --manifest` resolves each app's candidate source identity
  independently via this function (including which SHA it reads that app's `package.json` version
  from), instead of one shared `current_staging_sha` for every app. Each result entry now also
  reports its own resolved `candidate_source_sha`, so a future mismatch is legible without
  cross-referencing the manifest by hand.
- `deploy-main.yml`'s single `candidate_source_sha` workflow_dispatch input is replaced with four
  inputs matching its existing `build_*` boolean groups (`candidate_source_sha_api` covers both
  `dgfy-api` and `dgfy-migration-runner`; one each for `candidate_source_sha_frontend_ims`/`_pos`/
  `_storefront`), so PROD's build for an app untouched by any repair is stamped with that app's own
  correct (earlier) identity, not the candidate's latest one. A new
  `checkDeployMainCandidateSourceShaWiring` shape check
  (`scripts/check-deploy-version-stamping-workflow.js`) guards this wiring the same way
  `checkOrchestratorCandidateSourceShaWiring` already guards the orchestrator's.
- `deploy.yml`/`deployment-orchestrator.yml`'s STAGING dispatch is **unchanged** — it was never the
  source of this bug. An app skipped there (`build_api=false` etc.) simply keeps its previously-
  stamped label untouched rather than being relabeled with a stale value, so the one shared
  `candidate_source_sha` value it does pass always already matches whatever IS being rebuilt in that
  exact dispatch (the dispatch always runs immediately after the manifest's `current_staging_sha`
  advances to name that exact revision).

`[default]` tier, so this is a dated amendment, not a superseding ADR, per ADR 0039. Decision 8's
substance — the parity gate compares the candidate's own tracked source identity, not raw
`org.opencontainers.image.revision`/`github.sha` — is unchanged; only its resolution granularity
moves from candidate-wide to per-app. **Decision 7 is untouched by this fix** — no repair ever needs
to re-label an already-published tag under a different revision; a PROD build always publishes a
not-yet-existing bare tag regardless of which identity it's stamped with, so the two decisions are
no longer in tension for this case.

Full detail: `scripts/check-promotion-candidate.js`, `scripts/check-image-version-parity.js`,
`scripts/check-deploy-version-stamping-workflow.js`, `.github/workflows/deploy-main.yml`,
`.agents/skills/promoter/references/promotion-runbook.md`, issue #1610.

### 2026-09-04 — Decision 8's label was never actually added by Phase 277; Phase 279 (#1588) adds it

Decision 8's original text (above, unchanged) says "Phase 277's builder stamps this identity into a
distinct label at build time." That was this ADR's own plan at the time it merged, not a fact yet
verified against the merged code — and it turned out wrong: Phase 277 (#1559/#1575, PR #1577,
completed 2026-09-04) added `org.opencontainers.image.version` and the `version_tag` job output
(Decisions 1-4, 7), but no candidate-source-identity label of any kind. Confirmed directly against
the merged `deploy-api.yml`/`deploy-migration-runner.yml`/`deploy-frontend.yml` before Phase 279
started: each carried exactly three labels (`org.opencontainers.image.revision`, `.source`,
`.version`) — nothing else.

Phase 279 (#1588) adds the missing label-stamping step itself, in the same three builder workflows,
rather than treating the gap as blocking. The label is named `org.dgfy-platform.candidate-source-sha`
(Decision 8 explicitly left naming to that phase — "naming and mechanics are that phase's job, not
this ADR's"), sourced from a new `candidate_source_sha` input threaded through
`deploy.yml`/`deploy-main.yml` → `deployment-orchestrator.yml` → the three builders, which the
promoter resolves from the candidate manifest (`scripts/check-promotion-candidate.js`'s
`source_develop_sha`/`current_staging_sha`) before dispatching. Left empty, the label is omitted
entirely rather than stamped blank — covering DEV builds and any dispatch outside a tracked
promotion candidate.

Decision 8's substance (which SHA counts as the candidate source identity, and that the parity check
compares that label rather than `org.opencontainers.image.revision`) is unchanged by this
correction — only the "Phase 277 already did this" implementation detail was wrong. `[default]`
tier, so this is a dated amendment, not a superseding ADR, per ADR 0039. Full detail:
`scripts/check-image-version-parity.js` (the new parity-check script this label feeds),
`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s matching "Promotion-time per-app version gates"
section, issue #1588.

### 2026-09-05 — `deploy-main.yml` auto-skips a build whose version tag is already published and content-unchanged, so Decision 7 is never unnecessarily tripped (#1610)

Found live via #1610's own two follow-up comments (07:41, 07:53): `deploy-main.yml` rebuilds every
app on every dispatch by default — its four `build_*` inputs are manual, and (checked directly
against `.agents/skills/promoter/references/promotion-runbook.md`) the promoter's own documented
dispatch commands never set them. A retry after one app's build fails Decision 7's guard (its
version tag is already published under a different revision) therefore re-rebuilds every app that
already succeeded too, tripping the SAME guard for each of them in turn — not a single-incident
fluke, but the guaranteed behavior of "always rebuild everything, and Decision 7 always refuses a
second publish of an unchanged tag." PRs #1624/#1625/#1630 were hand-rolled workarounds for this
same recurring symptom before this mechanism.

**Resolution:** a new job, `resolve-build-plan` (`.github/workflows/deploy-main.yml`, `needs:
guard-branch`), computes, per app, whether this dispatch's build can be safely SKIPPED — the
version tag is already published under the CURRENT revision (an idempotent re-dispatch), or
published under a DIFFERENT revision whose tracked build inputs (`apps/<app>/`, its resolved
`file:` dependencies, and `infrastructure/docker/<app>/`) are byte-for-byte unchanged between that
revision and the current one. Reuses `check-tag-immutability.js`'s own `decideImmutability`/
`runInspect` for the registry read (the same GHCR inspect Decision 7's guard itself performs) and
`check-app-version-bump.js`'s `resolveFileDependencyPackages`/`readVersionAt`/`APPS` for the
dependency-fan-out and version-read logic — no second GHCR inspector or dependency-graph resolver
was written. Full algorithm and the four-outcome table: `scripts/resolve-build-skip-plan.js`'s own
header comment.

**Fail-closed asymmetry, deliberate:** a per-app indeterminate read (registry unreachable,
unreadable/disagreeing label, an undiffable revision — e.g. history too shallow to contain it)
degrades to BUILD for that one app, never to skip — building unnecessarily costs CI minutes and, at
worst, reproduces today's already-loud Decision 7 refusal; skipping unnecessarily would run PROD on
stale code with no visible failure. A genuine CRASH of the `resolve-build-plan` job itself (a script
bug, not a per-app read) is the one thing allowed to halt the whole dispatch — every downstream
build job's `if:` requires `needs.resolve-build-plan.result == 'success'`, so a job failure there
transitively skips every build, the same way a `guard-branch` failure already does today.

**`publish`'s own gate changed too** (a real gap found while designing this, not introduced by it):
its previous `if:` required at least one build job to report `'success'`, which a legitimate
"every app is skip-eligible" dispatch (a true no-op re-dispatch, or an operator forcing a compose
restart with nothing to rebuild) could never satisfy — every build job `'skipped'`, none
`'success'`, `publish` would never run. `publish` now gates directly on
`needs.guard-branch.result == 'success' && needs.resolve-build-plan.result == 'success'` instead
(both added to its `needs:` array, which GitHub Actions requires before a job's `if:` may reference
them), which already covers the one other way every build job could legitimately end up
`'skipped'` (a whole-job crash upstream, transitively skipping everything) — so the OR-clause
became unnecessary rather than merely redundant.

**`dgfy-api`/`dgfy-migration-runner` stay ONE shared `build_api` dispatch checkbox, but resolve TWO
independent skip verdicts.** These are genuinely separate images with genuinely separate
`package.json` versions; nothing about deploy-order or the server's compose `depends_on` requires
their CI build cycles to march in lockstep, only their human-facing checkbox stays coupled (the same
pairing the existing `candidate_source_sha_api` grouping above already established for a different
reason — provenance labeling, not build eligibility).

`[snapshot]` tier — no Decision clause changes tier or substance. **Decision 7 is byte-for-byte
unchanged** and still runs, unconditionally, in every build job that actually executes; this only
changes whether a doomed, already-guard-refused attempt is ever started in the first place. A
version tag published at a revision whose content genuinely differs from `github.sha` is NEVER
treated as skip-eligible — that case falls straight through to a normal build attempt, so the
existing, unmodified guard still refuses it exactly as it does today. Per ADR 0039, a `[snapshot]`
entry records ordinary implementation work and needs neither a superseding ADR nor a dated Amendment
with `status: amended` — added here anyway to match this ADR's own established practice of
recording every operationally-significant build/deploy mechanism change.

Full detail: `scripts/resolve-build-skip-plan.js` (+ its test file), `.github/workflows/deploy-main.yml`,
`scripts/check-deploy-version-stamping-workflow.js` (+ its test file — asserts the new job wiring),
`.agents/skills/promoter/references/promotion-runbook.md`, `docs/ops/RELEASE_CANDIDATE_POLICY.md`,
issue #1610. **Not yet exercised against a real dispatch** — everything above is unit-tested and
shape-verified against this repo's real files, same caveat the Phase 293 Amendment above already
states for its own mechanism; the issue stays open (`Refs #1610`, not `Closes`) pending a real
`deploy-main.yml` dispatch that exercises an already-published, content-unchanged app.

### 2026-09-07 — `runFloor()`'s pre-cut floor step had no change detection at all; now scoped to changed apps (#1740)

Found live investigating PR #1738 (candidate `2026-09-08-01`): the promoter's pre-cut floor step
(`node scripts/check-app-version-bump.js --floor --base origin/staging --head origin/develop`)
force-bumped all five apps' versions even though the candidate's only real code change was two
files in `apps/dgfy-storefront/src/`. Same pattern confirmed on candidates `2026-09-07-03` and
`2026-09-07-04`.

**Root cause:** `runFloor()` and `runCheck()` (the PR-time check) are two independent code paths for
"does this app need a bump." `runCheck()` correctly filters through `detectChangedApps()` — direct
`apps/<app>/` changes or a changed `file:`-dependency package. `runFloor()` had no such filter at
all: it iterated the full, hardcoded five-app list unconditionally and flagged any app whose
`develop` version wasn't at least a minor above `staging`'s, whether or not that app's files had
changed between the two refs. An app's version not having moved *because nothing in it changed* is
exactly the case Decision 6 says to skip ("Apps with no changes keep their version untouched") —
the implementation did the opposite of its own spec.

**This is not a Decision 6 change** — the clause was always correct; the code simply didn't
implement it for this one entry point. `[snapshot]` tier, no Decision clause changes tier or
substance, matching this ADR's 2026-09-05 Amendment's own stated practice of "recording every
operationally-significant build/deploy mechanism change" even where nothing above `[snapshot]`
tier is at stake.

**Consequence beyond git-history noise:** `resolve-build-skip-plan.js` (the 2026-09-05 Amendment
above) already skips rebuilding an app whose version tag is already published and whose tracked
build inputs are byte-for-byte unchanged. A spurious version bump defeats that mechanism outright —
a newly bumped, not-yet-published tag always falls to the "build normally" outcome, so every
force-bumped-but-unchanged app was rebuilt and republished to GHCR on every promotion, burning CI
minutes and registry storage for zero content change. Fixing the floor's scope is what actually lets
the existing skip mechanism engage for a promotion; no workflow change was needed.

**Resolution:** `runFloor()` now reuses `detectChangedApps()` — the same function `runCheck()`
already uses — computing the changed-file diff between the given refs and evaluating the floor only
for apps with `changed: true`. `file:` fan-out (a `packages/web-core` change still bumping every
frontend that depends on it) is preserved exactly as-is, since `detectChangedApps()` is the single
source of truth for that already. An app with zero changed files is now reported in a new,
informational `unchanged` bucket rather than `belowFloor`. A diff that can't be computed (an
unresolvable ref, shallow history) surfaces its own `diffError` and fails the check rather than
silently reading as "nothing changed."

Full detail: `scripts/check-app-version-bump.js`'s `runFloor()`, `printFloorResult()`; its test
file's `--floor` section (regression coverage for the single-app case and for `file:` fan-out
staying intact); issue #1740.

### 2026-09-09 — `release_process` in `applies_to` does not bind store-constrained (mobile) release processes to Decision 6's patch-timing/build-number rules

Filed as #1770, cross-repo source `Sieitzz/dgfy-mobile#195` (found during that repo's PR #194
review, epic #78). `dgfy-mobile` adopted this ADR's general promotion shape (per-app versions,
PR-authored bumps, a minor floor at promotion) but its own `docs/VERSIONING.md` deliberately
diverges from Decision 6 on two points, both forced by shipping through App Store Connect / Google
Play instead of GHCR:

1. **Patch timing.** Decision 6 patches on both a staging repair *and* a main hotfix. Mobile
   patches **only** on a production hotfix — a staging (TestFlight) repair advances only the
   native build number, because App Store Connect refuses to reuse a version string once released
   to real users, and TestFlight groups builds under one marketing version regardless.
2. **Build-number scope.** Decision 6 has no concept of a counter distinct from the version/tag —
   none of the five containers need one. Mobile's native build number
   (`iOS CFBundleVersion` / `Android versionCode`) is a separate, per-app-per-channel counter with
   no container equivalent.

`applies_to` listing `release_process` alongside the five container names read as a candidate for
binding Decision 6 to `dgfy-mobile` too, which would put these two documented, store-forced
divergences in conflict with this ADR. That was never the intent — `applies_to` is a
doc-discovery/topic tag (used by `.agents/skills/notes/SKILL.md`'s ADR-matching grep, among
others), not an assertion that every clause below binds every repo that ships anything called a
"release process." Decision 6 was designed against GHCR/container constraints (Context, above) and
never considered App Store Connect/Google Play's version-reuse and build-number semantics.

**Resolution: `applies_to` and Decision 6's text are unchanged.** Rather than narrow the
frontmatter (which would just relocate the ambiguity to "then why is `release_process` there at
all"), this amendment states directly: **Decision 6 does not bind a release process constrained by
an external app-store platform's version-reuse/build-numbering rules.** `dgfy-mobile`'s
`docs/VERSIONING.md` (§3 patch timing, §4 build-number scope) is the authoritative record of that
carve-out for `dgfy-mobile` specifically; a future non-container adopter of this ADR outside
`dgfy-platform` gets the same carve-out for the same reason (store constraints, not repo identity,
is what's exempted) without needing its own amendment here. Everything else `release_process`
might reasonably cover — the promotion shape (per-app independent versions, PR-authored bumps, a
minor floor at promotion, patch-only repairs/hotfixes as a *ceiling*, not a floor, on how sparingly
version increments happen) is unaffected and continues to apply as general guidance to any adopter,
`dgfy-mobile` included, per `dgfy-mobile/docs/VERSIONING.md`'s own "Relationship to
`dgfy-platform`" section.

`[default]` tier (Decision 6 is untagged/`[default]`), so this is a dated amendment, not a
superseding ADR, per ADR 0039 — decided by Pat, 2026-09-09. Full detail: issue #1770,
`Sieitzz/dgfy-mobile#195`, `dgfy-mobile/docs/VERSIONING.md`.

### 2026-09-10 — Decision 9's blocking flag never carried Decision 6's own base split forward; `check:app-versions` blocking is now base-aware, not global

Filed and found as #1774 (epic #1548). #1592 (Phase 283, 2026-09-05) flipped
`check:app-versions`' `BLOCKING` toggle `true` for every base — `develop`, `staging`, and `main`
alike. PR #1773 hit the consequence directly: three apps unbumped on a `develop`-base PR, blocked
from merging for a requirement that, per Decision 6's own mode table, was never meant to bind
`develop` at that strictness. Decision 6 already treats `develop` as the least-restrictive tier
(`'any-increase'` mode, "non-blocking by design" per the mode table's own framing) precisely because
`develop -> staging`'s minor-floor bump requirement supersedes whatever an individual `develop` PR
did or didn't bump — Decision 9's own blocking flag, introduced separately, never carried that same
base distinction forward when it was armed. That's the gap this amendment closes: not a new
decision about bump *levels* (Decision 6's mode table is unchanged), but a correction to *whether
the check blocks at all*, which Decision 9 conflated with "trust the check enough to ever block"
instead of "block on every base uniformly."

**Resolution:** `scripts/lib/version-bump-gate-toggle.js` now exports `resolveBlocking(base, head)`
— blocking only when `base` is `staging` or `main` (a promotion leg or a hotfix), advisory on
`develop` — in place of the flat `BLOCKING` constant both consuming surfaces
(`scripts/pr-checks.js`, `.github/workflows/shared-changed-paths.yml`) used to read directly.
`BLOCKING` itself remains exported as a global kill switch. Deliberately not derived from
`resolveMode(base, head)`: a `release/*` head into `main` resolves to the same `'any-increase'` mode
`develop` gets, so a `resolveMode(...) !== 'any-increase'` proxy would silently leave the
release-to-`main` leg advisory — exactly the case that must stay blocking. Full rationale, the
correctness hazard found and avoided, and both consuming surfaces' re-verification:
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s matching 2026-09-10 dated entry.

`[default]` tier (Decision 9 is `[default]`-tagged; this amendment corrects how Decision 9 is
implemented, not Decision 6's own mode table, which is unchanged) — decided by Pat, 2026-09-10. Full
detail: issue #1774, `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s matching entry,
`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s updated status line.

## Alternatives considered

- **Build each frontend once and inject environment config at container start**, so one digest
  serves every environment instead of baking `VITE_*` values per environment (Context). Rejected
  for now — it would require rewriting how three apps and `packages/web-core` consume roughly
  thirty `import.meta.env.VITE_*` sites, plus the Sentry sourcemap upload flow, which this epic's
  scope does not cover. Worth a future epic, not blocking here.
- **Environment-named image repositories** (e.g. `dgfy-pos-staging` alongside `dgfy-pos`) instead of
  a single per-app repository with environment carried in the tag. Rejected: it would double the
  GHCR package count per frontend, need its own visibility grant per new package
  ([ADR 0072](0072-ghcr-container-image-naming.md)'s already-named one-time cost), and reopen the
  exact flattened-namespace, one-name-per-app decision ADR 0072 just settled. Decision 1's
  "environment is a tag" is the direct rejection of this alternative.
- **Fully CI-owned version bumps**, mirroring `dgfy-mobile`'s shipped model
  (Sieitzz/dgfy-mobile#78/#79). Rejected as the ownership model for this repo: a CI-computed bump
  can't distinguish "this PR is a genuine feature/fix to the app" from "this PR only touched a
  config file the app happens to also own," and this epic wants bumps to reflect real,
  human-asserted change history (Decision 6) rather than a mechanical diff heuristic. Cited for
  pattern reuse only (the promotion-inherits / hotfix-bumps shape, per-channel tag suffixes), not
  adopted wholesale — #1548's own Related section makes this distinction explicit.

## Related

- #1548 — parent epic this ADR decides Wave 1 of.
- #1559 — the issue this ADR was filed to close.
- #1588 — Phase 279 (epic #1548 Wave 4): the promoter's pre-cut floor step (Decision 6), the
  candidate-source-identity label and promotion parity gate (Decision 8, corrected by this ADR's
  2026-09-04 Amendments above), and final policy text.
- #1610 — found live during candidate `2026-09-05-01`'s first real promotion, with two distinct
  symptoms from the same root gap. First: Decision 8's original uniform `current_staging_sha`
  mislabeled an app a staging repair never touched — resolved by this ADR's 2026-09-04
  per-app-resolution Amendment above. Second: `deploy-main.yml` rebuilding every app on every
  dispatch by default meant a retry after one app's Decision 7 refusal re-tripped the SAME guard for
  every app that had already succeeded — resolved by this ADR's 2026-09-05 build-skip Amendment
  above. Both symptoms trace back to the same fact (PROD always rebuilds unconditionally); neither
  fix loosens Decision 7 itself.
- #1560 — the PR-time version-bump check (Decision 9) this ADR hands its enforcement rule to;
  explicitly not implemented by this ADR.
- [ADR 0072](0072-ghcr-container-image-naming.md) — governs image *names*; this ADR governs tag
  *content* layered on top of those names. Amended by this ADR's own PR to cross-reference back.
- [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md) — the strictness-tier system
  this ADR's Decision clauses are tagged under.
- `docs/ops/RELEASE_CANDIDATE_POLICY.md` — the executable promotion policy this ADR's Decision 6
  bump obligations are layered onto; amended in the same PR as this ADR.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — the decision procedure whose "no ADR covers this
  cross-boundary decision: create an ADR" clause is why this ADR exists.
- #633, #276 — the concrete Sentry-release and PWA-update-toast consumers Decision 5's format is
  handed off to.
- #495 (epic #492) — owns the per-service `IMAGE_TAG` compose split, `:latest` retirement/pinning,
  and rollback; this ADR documents the tag contract #495 must honor but does not implement it.
- Phase 272, #1550, #1551 — the advisory-to-blocking rollout precedent Decision 9 follows.
- `scripts/check-pos-receipt-version-bump.js` — the existing single-package version-bump precedent
  this ADR's scheme deliberately does not fold `packages/pos-receipt` into.
- Sieitzz/dgfy-mobile#78, #79 — the sibling repo's versioning policy cited for pattern reuse in
  "Alternatives considered," not adopted wholesale.
