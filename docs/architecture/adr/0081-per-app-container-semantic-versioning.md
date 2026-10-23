---
status: amended
authority_level: authoritative
owner: release
date: 2026-09-04
last_reviewed: 2026-10-24
review_by: 2027-03-23
applies_to: dgfy-api, dgfy-migration-runner, dgfy-ims, dgfy-pos, dgfy-storefront, dgfy-opis, release_process
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
`dgfy-ims`, `dgfy-pos`, `dgfy-storefront`), enforced at PR time (unchanged floors on `develop` and staging repair, at least a minor floor
bump per changed app on promotion to `staging`, patch-only on direct `main` hotfix), stamped on published images, and observable at runtime. No ADR governs image *tags* today
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
   from Decision 6 according to the PR's `(base, head)` pair) is **blocking on a `staging`/`main`-base
   PR** (a promotion leg or hotfix) **and advisory on a `develop`-base PR** —
   `develop -> staging`'s own minor-floor bump (Decision 6) already supersedes whatever an
   individual `develop` PR did or didn't bump, so blocking a `develop`-base PR at PR time would
   enforce a requirement that becomes irrelevant at promotion time while needlessly blocking
   contributors. Historically: shipped advisory on every base first, matching this repo's own
   established advisory-to-blocking rollout pattern (Phase 272, #1550/#1551); flipped to blocking on
   every base by #1592 (epic #1548, Phase 283, 2026-09-05) once enough clean-run evidence existed;
   then narrowed to this base-aware split by #1774 (2026-09-10) once the global flip was found to
   block `develop`-base PRs on exactly the requirement promotion already supersedes — see the
   2026-09-10 Amendments entry below for the full record.
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
- **The PR-time enforcement check (#1560) is blocking on a `staging`/`main`-base PR, advisory on a
  `develop`-base PR** (Decision 9) — a `develop`-base version-bump omission is visible but
  non-fatal, since `develop -> staging`'s own minor-floor bump (Decision 6) is what actually
  enforces the requirement at promotion time. Historically: shipped advisory on every base first, in
  the same spirit as this repo's existing advisory-to-blocking rollout pattern (Phase 272,
  #1550/#1551); flipped to blocking on every base by #1592 (epic #1548, Phase 283, 2026-09-05); then
  narrowed to the current base-aware split by #1774 (2026-09-10, epic #1548) — see the 2026-09-10
  Amendments entry below for the full record.
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

### 2026-09-10 — Post-promotion `develop` version-baseline sync, a new mechanism this ADR did not
previously cover (#1807, epic #1548)

Filed as #1807: an app several promotions never touch stays on `develop` at whatever version it
had the last time it *was* touched, even after a repair or hotfix later advances it further on
`staging`/`main`. Decision 6's floor step and the per-fix backport obligation (#1611) are both
best-effort, per-touch mechanisms — neither is a periodic reconciliation — so a backport that's
missed, delayed, or only partially applied can leave `develop`'s source-tree version genuinely
behind what `main` is already running. Production safety is unaffected either way: the floor step
already forces the correct, larger leapfrogged bump the moment `develop` next actually touches
that app (Decision 6's own `[snapshot]` sub-clause on accepted numeric overlap between channels).
This is a source-tree honesty problem, not a safety gap.

**Resolution: `scripts/sync-app-version-baselines.js` (new), run once per ordinary promotion, after
`main` has deployed and the parity gate/GitHub Release step (Decision 8) completes.** Compares each
of the five apps' `package.json` `version` on `origin/develop` against `origin/main`; where
`main`'s version is a real semver increase over `develop`'s, the promoter opens one ordinary
`develop`-base PR (`chore(release): sync app version baselines from main`) raising exactly those
apps to match `main`'s current value. **Additive only, per app, never a downgrade** — an app where
`develop`'s version is already `>=` `main`'s is left untouched; this mechanism never lowers a
version and never bumps an app `main` hasn't moved past. Full procedure:
`.agents/skills/promoter/references/promotion-runbook.md`'s "Sync develop's version baselines from
main" section; full script design and constraints: the script's own header comment.

**Deliberately a new, separate script, not a mode added to `check-app-version-bump.js`.** That
script's `--floor` mode has had two recent regressions from scope creep (#1740, #1802) — floor
enforcement (a minimum bump required for an app a promotion is actively touching, scoped to
changed files, compared against `staging`) and baseline reconciliation (an unconditional
comparison of two absolute version numbers against `main`, with no changed-files scoping at all)
are genuinely distinct concerns. The new script reuses that script's exported `APPS`/
`readVersionAt`/`parseVersion`/`compareVersionTuples` rather than re-deriving them a second time —
the same one-directional, read-only reuse pattern `resolve-build-skip-plan.js` already established
for its own sibling concern (the 2026-09-05 Amendment above).

**No clause change; no interaction with #1610.** This does not modify Decision 6's bump-level
rules, Decision 7's tag-immutability guard, or Decision 8's per-app candidate-source-identity
resolution (the #1610 conflict) — the sync mechanism only ever edits a source-tree `package.json`
`version` field on `develop`, after `main` has already deployed, and never builds, tags, or
publishes an image. It does not read or write the `org.dgfy-platform.candidate-source-sha` label
#1610 is about, so it cannot trip Decision 7's guard (nothing here ever pushes an image tag to
collide with) and cannot affect the parity gate's per-app comparison. A version this script writes
is still governed by Decision 6's ordinary bump-mode rules the next time it's actually published
— this script creates, removes, and shortcuts none of those checks.

`[default]` tier — corrected 2026-09-10 (PR #1813 review, RF-1) from an earlier version of this
entry that mislabeled it `[snapshot]`. This Amendment adds a new, recurring rollout procedure — run
`scripts/sync-app-version-baselines.js` once per ordinary promotion, and open and merge a sync PR
whenever it reports drift — not a point-in-time description of current state. Per ADR 0039's own
tier table, `[snapshot]` is "documentation, never a constraint" whose "staleness is not a
violation"; a standing "do this every promotion" obligation is squarely the `[default]` tier's own
example category ("rollout sequencing"), not `[snapshot]`. **Decisions 6, 7, and 8's own text and
tier are unchanged by this Amendment** — their substance is not modified (see "No clause change; no
interaction with #1610" above); this Amendment adds one new `[default]`-tier obligation alongside
them, via ADR 0039's own amendment path for a `default`-tier change ("append to the ADR in the same
PR that implements the change... normal code review is sufficient," no superseding ADR needed).
`status: amended` (front matter, already set) and this dated Amendment block together are exactly
what that path requires — nothing added "anyway"; it's the mechanism itself. Full detail:
`scripts/sync-app-version-baselines.js` (+ its test file),
`.agents/skills/promoter/SKILL.md`/`references/promotion-runbook.md`, issue #1807.

### 2026-09-17 — Separate candidate identity from the physical staging head used for release cuts

The first live promotion exercising the candidate-manifest validator exposed a latent assumption:
GitHub can fast-forward a staging promotion PR even when the promoter invokes `gh pr merge --merge`.
In that case the frozen candidate source identity used for OCI provenance remains the initial or
latest repair SHA, while the physical `origin/staging` head used to cut `release/<candidate>` is a
different SHA. Requiring `release_revision.source_staging_sha` to equal `current_staging_sha`
therefore rejects a valid fast-forward promotion and surfaces only at the release step.

**Resolution:** candidate manifests may record `staging_head_sha`, the actual staging head after
the staging promotion/repair merge. A released candidate must have this field, and its
`release_revision.source_staging_sha` must equal it. `current_staging_sha` remains unchanged as
the candidate source identity consumed by per-app production provenance resolution. The promoter
runbook now requires recording `staging_head_sha` immediately after the staging merge, before
cutting the release branch.

`[default]` tier — a release-process clarification and validator correction; Decisions 6–8's
candidate identity and per-app provenance semantics are unchanged. No production deploy is
authorized from a manifest that fails this validation.

### 2026-09-19 — Preserve the release floor and separate staging revisions from production patches (#1977, Phase 342)

Decision 1 applied `-dev`/`-staging`/bare uniformly to all five images, and Decision 8 compared
`X.Y.Z-staging` with bare `X.Y.Z`. That pairing conflates two things the release process needs
apart: the per-app production floor (the `X.Y.Z` the version-bump rules in Decision 6 reason
about) and the identity of the exact artifact that reached production. A frontend STAGING image
and its PROD image are different digests by construction (baked `VITE_*` values); stamping both
`1.13.0` pretends otherwise. Backend images bake nothing environment-specific, so rebuilding
them per environment manufactures a distinction their content does not have.

**Resolution: `X.Y.Z` remains the per-app production floor; candidate revisions identify the
exact artifact.** `rN` is the candidate-wide `release_revision.revision`
(`scripts/check-promotion-candidate.js`'s manifest — one greater than the latest staging repair
revision), not a Docker build-attempt count. The tag matrix:

| Artifact | DEV (unchanged) | STAGING candidate | PROD |
| --- | --- | --- | --- |
| Frontend apps | `X.Y.Z-dev` | `X.Y.Z-rN-staging` | `X.Y.Z-rN` plus immutable alias `X.Y.Z` |
| API and migration runner | `X.Y.Z-dev` | `X.Y.Z-rN` | Reuse the staging `X.Y.Z-rN` digest plus immutable alias `X.Y.Z` |

Docker tags forbid `+`, so the separator is `-rN`, never `+` build metadata. The production
alias and revision tag reference the same digest. Existing published tags are historical and are
never rewritten. The immutable revision tag is the artifact identity used for `APP_VERSION` and
`org.opencontainers.image.version` (Decision 4's "runtime version equals the published image
tag" now means the revision tag, never the bare alias); `APP_RELEASE_FLOOR`/`APP_RELEASE_REVISION`
build-args, `org.dgfy-platform.release-floor`/`org.dgfy-platform.release-revision` OCI labels,
`/health` fields, and frontend `version.json`/build-stamp fields carry the floor and revision
explicitly so runtime consumers never infer the floor from an alias. Direct production hotfixes
increment the patch and use the same paired revision/canonical tags without a staging parity
predecessor. Tag resolution is centralized in `scripts/resolve-release-tags.js` (shared by the
workflows, the parity gate, and the build-skip plan); backend PROD digest reuse and alias
creation go through `scripts/promote-image-alias.js`, which refuses an existing target with a
different digest or revision. Per-service compose `IMAGE_TAG` changes stay #495 scope; image
naming (ADR 0072), package-version bump ownership (Decision 6), and production deployment
approval are unchanged.

`[default]` tier — Decisions 1, 3, 4, and 8 are amended in place via ADR 0039's dated-Amendment
path (`status: amended`, no superseding ADR); Decision 7 (`[binding]`) is untouched — the alias
promotion's refuse-on-mismatch is a second, narrower guard alongside it, not a restatement of it.
Full detail: issue #1977, `scripts/resolve-release-tags.js`, `scripts/promote-image-alias.js`,
`scripts/check-image-version-parity.js`, `scripts/resolve-build-skip-plan.js`,
`.github/workflows/deploy-main.yml`'s `promote-aliases` job.

### 2026-09-23 — Per-app revision history from DEV through PROD; the candidate-wide rN is retired (#2055, Phase 346)

The 2026-09-19 amendment above left DEV at bare `X.Y.Z-dev` with no revision, while STAGING/PROD
carried a candidate-wide `rN` assigned only at release-cut time. Two consequences collided in
production: a DEV rebuild at an already-published floor tripped Decision 7's guard (Build &
Deploy Platform run 35841999065 — four images refused to overwrite their `X.Y.Z-dev` tags
while the run had already published mutable channel aliases), and no record anywhere linked a
DEV artifact to the candidate later cut from it. The example lifecycle the issue offered
(`X.Y.Z-r14-dev` → same `rN` through STAGING → higher `rN` for repairs) does not work as-is:
`release_revision.revision` was a single integer assigned when a candidate was cut, but DEV
builds happen per-app and continuously on `develop`, before any candidate exists — and a
candidate can bundle repairs touching several apps under one shared value with no coherent
single "driving" app. The resolution below was recorded on the issue first
(#2055, decided 2026-09-23) and deliberately reverses Phase 342's candidate-wide-uniform-`rN`
design in favor of a per-app map — a larger change than the issue's own Notes implied, chosen
because no smaller change is structurally coherent once DEV (inherently per-app, async) is
folded into the same lineage. The rejected alternatives (a global platform-wide counter —
gappy, meaningless-per-app numbering; keeping the counter candidate-wide — structurally
incompatible with pre-candidate DEV builds) are recorded on the issue, not repeated here.

**Resolution — per-app revision counter, spanning DEV → STAGING → PROD:**

1. **DEV eligibility.** `develop` dispatches publish promotion-eligible DEV artifacts;
   ordinary feature-branch dispatches publish ad-hoc DEV artifacts under a distinct,
   non-promotion-eligible shape (`X.Y.Z-pr<PR#>-dev`, branch-slug fallback with no PR
   context) that a candidate can never select. Ad-hoc dispatches publish the sha tag only,
   never the moving `develop` tag. A temporary DEV integration branch may opt into the same
   per-app `X.Y.Z-rN-dev` history through `deploy.yml`'s explicit `revisioned_dev_dispatch`
   input; that opt-in is promotion-eligible and must only be used when the operator intends
   that ref to stand in for the DEV integration line. Its DEV deploy consumes the immutable
   `sha-<7>` tag for that workflow SHA through the shared Compose `IMAGE_TAG` override, without
   moving the `develop` alias. Already-published bare `X.Y.Z-dev` tags are historical: never
   retroactively revisioned, never overwritten, never candidate-selectable.
2. **Allocation and source of truth.** At publish time (an eligible DEV build on `develop` or an
   explicitly revisioned temporary DEV integration ref, or a staging repair touching app X):
   query GHCR for the highest existing
   `<app>:X.Y.Z-r<N>*` tag across all channels for that app+floor (`docker buildx
   imagetools inspect`, the same primitive `scripts/check-tag-immutability.js` already
   uses — `scripts/allocate-artifact-revision.js`) → allocate `N = max + 1` → push. GHCR
   is the durable source of truth; no counter file or ledger. A same-source retry reuses
   its own `N` (Decision 7's existing idempotent no-op, not a new allocation). A race
   landing two builds on the same `N` gets the loser's push refused by Decision 7's
   unchanged guard; each dispatch is one bounded attempt and a re-dispatch re-queries
   from the new max. Scoping to `<app>:<floor>-r*` resets `N` to 1 on a floor bump with
   no separate reset logic. A revision is an artifact-lineage identity, never a Docker
   build-attempt count.
3. **Tag shapes.** DEV-eligible (`develop`): `X.Y.Z-rN-dev`. STAGING/PROD tag *format* is
   unchanged (frontend `X.Y.Z-rN-staging` / `X.Y.Z-rN` + alias `X.Y.Z`; backend
   environment-neutral `X.Y.Z-rN` + alias) — only where `N` comes from changes, from
   candidate-wide `repair_count+1` to the per-app GHCR-sourced sequence above. Runtime
   version (`APP_VERSION` / `org.opencontainers.image.version`) is the revision tag;
   floor and revision travel explicitly (`APP_RELEASE_FLOOR`/`APP_RELEASE_REVISION`,
   `org.dgfy-platform.release-floor`/`release-revision`, `/health` fields, frontend
   `version.json`/build-stamp) — revisioned DEV builds stamp theirs like any candidate
   build; ad-hoc DEV builds omit the revision exactly as before.
4. **Candidate manifest (`sku-release-candidate/v2`).** A candidate selects
   already-published DEV artifacts per app (by SHA/digest) as its starting point;
   `revisions[0]` (`initial`) records them (`dev_artifacts: [{ app, revision, sha,
   digest }]`). The old sequential `revision` counting is renamed to a cosmetic
   `repair_seq` ordinal — branch-naming/ordering only (`fix/staging/<candidate_id>-<seq>`,
   bare `-<seq>` with no `r` prefix, so it can never be mistaken for an artifact `rN`),
   no longer doubling as an artifact-identity claim. `release_revision` becomes the
   per-app map `{ "<app>": { revision, source_sha, digest, origin: "dev"|"staging_repair"
   } }`, populated at release-cut time from each touched app's latest allocated revision
   (read off GHCR, not derived in-manifest); apps the candidate never rebuilds are absent
   and keep their last-published artifact unchanged. The release branch itself is the
   plain `release/<candidate_id>` (one cut per candidate; a failed pre-main cut is
   deleted and re-cut under the same name, recorded by the updated `source_staging_sha`).
   `v1` manifests still validate (frozen legacy path) but are never written anymore.
5. **Parity and promotion mechanics.** Decision 8's parity gate compares per-app: each app
   against its OWN allocated `rN` from the v2 map (an app absent from the map reports
   skip — nothing new to verify). Dispatch threading is per-app-group throughout
   (`release_revision_api` covering both backends, one per frontend — the same grouping
   `candidate_source_sha_*` already established); the build-skip plan checks each app's
   own revision-aware tag. Partial publication stays per-app atomic: each app's version
   tag lands only through Decision 7's unchanged guard, so a failed dispatch can never
   leave aliases claiming an unqualified set as a successful deployment.
6. **Partial-failure/legacy handling.** Unchanged tags are never relabeled; legacy
   `X.Y.Z-dev` is excluded from allocation (it never matches the `-rN` pattern) and from
   selection. Frontend environment-specific digests still cannot reuse the DEV digest in
   STAGING/PROD (source lineage is carried, content is rebuilt); backend images keep
   their environment-neutral digest-reuse semantics.

`[default]` tier — Decisions 1, 3, 4, and 8 are amended in place via ADR 0039's
dated-Amendment path (`status: amended`, already set); Decision 7 (`[binding]`) is
untouched. Full detail: issue #2055, `.tmp/plan-2055.md` (planner handoff),
`scripts/resolve-release-tags.js`, `scripts/allocate-artifact-revision.js`,
`scripts/check-promotion-candidate.js` (v2), `scripts/check-image-version-parity.js`,
`scripts/resolve-build-skip-plan.js`, `.github/workflows/deploy.yml` /
`deployment-orchestrator.yml` / `deploy-main.yml` (+ the three builders),
`docs/ops/RELEASE_CANDIDATE_POLICY.md`, `.agents/skills/promoter/references/promotion-runbook.md`.

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

### 2026-10-04 — Preserve candidate identity for release-only repairs (#1542 follow-up, Phase 472)

After a candidate has passed staging qualification, a pre-main failure may be fixed on its existing
`release/<candidate_id>` branch through a reviewed repair PR. In `sku-release-candidate/v3`, the
optional `release_revision.repairs` array records the sequential repair number, resulting release
head SHA, previous release head SHA, repair branch, PR, issue, and non-empty `apps_touched`. The
first repair's parent is `release_revision.source_staging_sha`; each later repair parents the prior
repair SHA. `release_revision.apps[app].source_sha` resolves to the latest release repair SHA that
lists that app, and its origin is `release_repair`. Unchanged apps retain their prior per-app source
identity. Allocate a fresh immutable per-app `rN` from GHCR for every app a release repair rebuilds;
the candidate's earlier STAGING revision tag may already occupy its existing `rN`. Use the new
revision in the updated per-app map so PROD builds a new tag without weakening Decision 7.

Decision 8's parity gate remains strict about the app's production source label, release floor,
revision label, and production alias agreement. For `release_repair`, it does not require a STAGING
predecessor or compare the original STAGING digest with the rebuilt PROD digest: the repaired source
was intentionally never deployed or observed on STAGING. It reads the PROD revision digest and
requires the bare PROD alias to reference that same digest. The recorded staging-qualified SHA and
each release repair SHA remain distinct, so parity evidence cannot say the final release head passed
staging. Other origins retain the existing STAGING-to-PROD checks.

Once production is stable, release-only repair commits are backported to `develop` by ordinary PRs;
they are never separately backported to `staging`. This is a new obligation for commits that do not
land on staging and does not alter #1696's staging-commit backport rule.

`[default]` tier — amends Decision 8's per-app candidate-source resolution and parity procedure.
Decision 7's `[binding]` immutable-tag guard and all production controls remain unchanged. Full
detail: `scripts/check-promotion-candidate.js`, `scripts/check-image-version-parity.js`,
`.agents/skills/promoter/references/promotion-runbook.md`, and
`docs/ops/RELEASE_CANDIDATE_POLICY.md`.

PR: (this PR). Refs #1542.

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
  fix loosens Decision 7 itself. Its 2026-10-09 no-app-change refresh case is resolved by the
  Phase 487 amendment below; real-candidate requalification remains post-merge verification.
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
- #1807 — the post-promotion `develop` version-baseline sync mechanism added by this ADR's
  2026-09-10 Amendment above; `[default]` tier (a recurring rollout procedure, not a point-in-time
  snapshot), no change to Decisions 6-8's own text or tier, no interaction with #1610.
- `scripts/check-pos-receipt-version-bump.js` — the existing single-package version-bump precedent
  this ADR's scheme deliberately does not fold `packages/pos-receipt` into.
- Sieitzz/dgfy-mobile#78, #79 — the sibling repo's versioning policy cited for pattern reuse in
  "Alternatives considered," not adopted wholesale.


### 2026-09-24 — Versionless shared DEV and promotion-owned floors (#2071, Phase 347)

This amendment supersedes the 2026-09-23 DEV artifact-selection path from Phase 346. DEV is an
experimental shared target that may be updated manually from `develop` or any non-main branch;
all such builds publish the moving `dev` alias and a SHA tag. DEV has no SemVer floor, artifact
revision, candidate eligibility, or promotion role. CI always rebuilds selected DEV apps so a
previously published alias cannot cause a false skip. The DEV compose deployment explicitly uses
`IMAGE_TAG=dev`.

Promotion is frozen to a `develop` SHA and builds changed apps directly on STAGING. It does not
dispatch DEV, inspect DEV tags, select DEV digests, or depend on DEV availability. At promotion
start, changed apps receive their next minor package floor; ordinary `develop` changes keep their
floors unchanged. STAGING repairs also keep the floor unchanged and allocate the next immutable
artifact revision (`rN`) without a patch bump. Only a direct `main` hotfix advances an app's patch
floor. Promotion revisions are allocated from STAGING/PROD tags only; DEV tags do not participate.
Frontend STAGING tags retain `X.Y.Z-rN-staging`; backend and PROD revision tags retain their
existing neutral `X.Y.Z-rN` forms.

New candidate manifests use `sku-release-candidate/v3`: the initial revision records
`apps_touched` and the frozen develop SHA, without `dev_artifacts`; per-app release lineage uses
origin `promotion` or `staging_repair`. The validator continues accepting v1/v2 manifests for
already-created candidates. ADR 0081 Decisions 1, 3, 4, 6, and 8 are amended in place at the
`[default]` tier. Decision 7's `[binding]` immutability rule is unchanged.

PR: (this PR). Closes #2071. Refs #2055.

### 2026-10-01 — Separate backend artifact revisions with paired build and deploy (#2186)

The 2026-09-23 amendment's `release_revision_api` group incorrectly carried one revision into
both backend images. Artifact revision numbers are scoped to an image repository and package
floor, so `dgfy-api` and `dgfy-migration-runner` may have independent immutable histories even
when their builds are coordinated. A candidate may therefore use (for example) API `r1` and
migration-runner `r5`; allocation and same-source retry reuse are performed independently against
each app's own repository and floor. No existing immutable tag may be overwritten.

`build_api` remains one paired user selection. Candidate `apps_touched` and `release_revision.apps`
include both backend apps or neither, while each map entry carries that app's own revision, source
SHA, staging digest, and origin. Staging/PROD dispatches, build-skip planning, builder forwarding,
alias creation, and parity use each app's own revision. A modern per-app map omitting both backends
means they were not selected; a malformed or one-sided pair is rejected. Explicit legacy
candidate-wide script inputs and v1 manifests retain their existing compatibility behavior.
PROD publish requires neither backend job to fail or be cancelled; a verified content-equivalent
skip remains valid. Registry pushes are not transactional, so a failed paired dispatch may leave
one immutable artifact published; retries re-resolve each app independently and never overwrite it.

Parity resolves each app's package floor at its candidate source SHA and checks the image's source
label, floor label, revision, and staging digest against that app's manifest lineage. Backend PROD
reuses the neutral revision digest. Frontend PROD builds contain environment-specific configuration,
so the manifest digest check applies to STAGING; frontend PROD is still checked against its own
source, floor, revision, and alias digest contract.

**Package-floor policy conclusion.** Keep the existing per-app floor management unchanged: floors
are already maintained independently by Decision 6, and the API `1.32.0` / migration-runner
`1.21.0` floors demonstrate that they need not be numerically aligned. This repair changes artifact
revision routing only. A further split or redesign of semantic-version-floor policy is outside this
incident's compatibility scope and can be scheduled separately if a future product or release
requirement justifies it.

`[default]` tier — this amends the dispatch, manifest, build-skip, alias, and parity procedures
recorded in Decisions 1 and 8 / the 2026-09-23 amendment. Decision 7's `[binding]` immutable-tag
guard and the package-floor rules in Decision 6 are unchanged. Full detail: #2186,
`scripts/check-promotion-candidate.js`, `scripts/check-image-version-parity.js`,
`scripts/resolve-build-skip-plan.js`, `scripts/check-deploy-version-stamping-workflow.js`,
`.github/workflows/deploy.yml`, `deployment-orchestrator.yml`, `deploy-main.yml`,
`docs/ops/RELEASE_CANDIDATE_POLICY.md`, and `.agents/skills/promoter/references/promotion-runbook.md`.

PR: (this PR). Refs #2186.

### 2026-10-01 follow-up — OPIS production gating and six-app revision wiring (#2186)

The amendment above split the backend revisions but predates OPIS joining the production
path: `deploy-main.yml`'s `promote-aliases` and `publish` jobs now list `frontend-opis-prod`
in `needs:` and fail closed on its `failure`/`cancelled` results, and `promote-aliases` runs
whenever `release_revision_frontend_opis` is supplied (including an OPIS-only dispatch). The
revision checker (`scripts/check-deploy-version-stamping-workflow.js`) now enforces all six app
groups — the `release_revision_frontend_opis` declaration, `frontend-opis-prod` job forwarding,
`frontend-opis` orchestrator wiring, and the `should_build_dgfy_opis` skip gate — the same
contract the other five groups already carried.

Package floors remain independently managed and unchanged by this follow-up (currently API
`1.32.0`, migration-runner `1.21.1`); only revision routing and production gating change.

`[default]` tier — amends the dispatch, alias, and gate procedures recorded in Decisions 1
and 8 / the amendments above. Decision 7's `[binding]` immutable-tag guard and Decision 6's
package-floor rules are unchanged. Full detail: #2186,
`scripts/check-deploy-version-stamping-workflow.js`, `.github/workflows/deploy-main.yml`,
`deployment-orchestrator.yml`, `docs/ops/RELEASE_CANDIDATE_POLICY.md`, and
`.agents/skills/promoter/references/promotion-runbook.md`.

PR: (this PR). Refs #2186.

### 2026-10-03 — Require release artifacts for every touched candidate app (#2227)

A v3 candidate's `apps_touched` history is the authoritative set of deployable apps selected for
the frozen promotion and its STAGING repairs. That set includes apps changed by the candidate and
apps carried forward from an earlier partial PROD release. When the candidate has a
`release_revision`, its per-app map must include an immutable STAGING artifact for every app in
that history. An app may be omitted only when it was never selected by any candidate revision.
This keeps sparse maps valid for apps outside the candidate while preventing production dispatch
from interpreting a missing selected-app artifact as an intentional skip.

The candidate validator rejects incomplete maps before release qualification. The release runbook
requires carrying apps omitted by an earlier partial PROD dispatch into the next normal candidate,
building their STAGING artifacts alongside that candidate's other apps, and validating the completed
manifest before release qualification. Existing API/migration-runner pairing and per-app
source-lineage checks remain in force. For candidate `2026-10-03-01`, IMS, POS, and OPIS remain
pending for the next combined PROD release; this PR does not authorize or dispatch that release.

`[default]` tier — amends Decision 8's per-app candidate-map and parity procedure. Decision 7's
`[binding]` immutable-tag guard is unchanged. Full detail: #2227,
`scripts/check-promotion-candidate.js`, `.agents/skills/promoter/references/promotion-runbook.md`,
and `docs/ops/RELEASE_CANDIDATE_POLICY.md`.

PR: (this PR). Closes #2227.

### 2026-10-03 — Preflight occupied PROD floors and gate moving aliases (#2238)

The 2026-10-03 Storefront PROD collision showed that a candidate can pass source-side promotion
checks while its immutable floor alias is already claimed by another artifact. `resolve-build-plan`
now inspects each selected app's canonical PROD floor alias before any image build begins. When the
alias exists under a different source revision, it compares the app's tracked build inputs with
the current source: identical inputs reuse the existing alias; changed inputs fail the whole plan
before any build or alias mutation, with the app and required floor bump reported. Indeterminate
registry reads or diffs preserve the existing fail-closed-to-build behavior.

The PROD builder call sites no longer move `latest` while building. After an app's immutable floor
alias has been verified or safely reused, `promote-aliases` advances that app's `latest` pointer.
This keeps an app whose floor promotion failed from publishing its unpromoted digest as the server's
moving image pointer. The incident's partial mutations to five other apps' floor aliases were
verified as valid and reused by the successful retry; the failed Storefront build's unconditional
`latest` push was the registry inconsistency this tightening removes.

`[default]` tier — adds preflight and moving-alias enforcement around the existing Decision 7
invariant. Decision 7's `[binding]` immutable-tag rule and Decision 6's floor policy are unchanged.
Full detail: #2238, `scripts/resolve-build-skip-plan.js`, `.github/workflows/deploy-main.yml`, and
`docs/ops/STOREFRONT_PROD_FLOOR_ALIAS_COLLISION_INCIDENT_2026-10-03.md`.

PR: (this PR). Refs #2238.

### 2026-10-06 — Refresh floors use the original promotion baseline (#2266, Phase 474)

Candidate v4 records `promotion_base_sha` and an append-only `staging_refresh` sequence. A refresh
retains the candidate's initial source identity while recording each incoming `develop` SHA and
actual resulting STAGING SHA independently from staging-repair and per-app artifact counters.
Refreshed builds receive new immutable per-app `rN` revisions; untouched selected apps retain their
earlier artifact provenance. `staging_refresh` parity requires the normal STAGING predecessor.

The version-floor checker has a separate refresh context that requires a verified baseline in the
current STAGING release note and the same baseline in incoming `develop`'s note. It enforces the
initial minor-floor obligation against that original baseline and rejects a floor below current
STAGING. A refresh branch name grants no exception by itself. Missing or unverifiable baseline
evidence stops v4 conversion; v1-v3 remain valid for their existing workflows. `[default]` — amends
Decision 6 and Decision 8; Decision 7's immutable-tag invariant is unchanged.


### 2026-10-09 — Mid-soak refresh and successor version/artifact lineage (#2381, Phase 486)

A pre-cut staging refresh may use later pinned `develop` work under the existing candidate ID and
original `promotion_base_sha`. The initial manifest revision may include optional `base_staging_sha`;
each refresh records its source develop SHA, resulting staging SHA, physical staging base, parent,
PR, and per-app artifact lineage. New release cuts require a recorded staging observation bound to
the selected SHA; the validator accepts this field as optional for in-flight v4 compatibility and
validates it against the release selection when present. A post-cut update uses a new successor
candidate and fresh immutable per-app artifacts. Its floor is checked against then-current staging,
so changed apps take the next minor floor from that baseline. Never overwrite or reuse published
artifact tags for different contents. `[default]` — amends Decisions 6 and 8. Decision 7's
`[binding]` immutable-tag invariant is unchanged. See #2381 and `RELEASE_CANDIDATE_POLICY.md`'s
2026-10-09 amendment.

### 2026-10-09 — No-app-change refresh (#1610, Phase 487)

A staging refresh whose content-equivalence build plan selects no app may record both
`apps_touched: []` and `artifacts: []`. The refresh still advances the candidate's staging history
and `current_staging_sha`; apps not rebuilt retain their existing artifacts and per-app source-SHA
lineage. Observation and release qualification remain bound to the new staging SHA, and the
manifest reason records the skipped-build-plan evidence. This does not change Decision 7's
`[binding]` immutable-tag rule. `[default]` — amends Decision 8. See #1610 and
`RELEASE_CANDIDATE_POLICY.md`'s 2026-10-09 amendment.

### 2026-10-09 — Bind live staging runtime evidence to the physical staging head (#2399)

For live staging observation, `observation.candidate_sha` remains bound to the candidate's
`current_staging_sha` identity, while `observation.runtime_sha` must equal the manifest's required
`staging_head_sha`, the physical Git head at `origin/staging`. These values can differ because
candidate source identity and physical staging history serve separate purposes. Per-app candidate
source resolution, immutable artifact revisions, and promotion parity continue to use their
existing provenance rules; this change affects only the identity used to verify the running
staging deployment. `[default]` — amends Decision 8's staging observation contract; Decision 7's
`[binding]` immutable-tag rule and existing per-app provenance semantics are unchanged. See #2399.

### 2026-10-24 — Reserved integration branches keep app version floors unchanged (#2737)

For a child PR whose base has a reserved `epic/<n>-<slug>` or `feature/<n>-<slug>` name, and for a
reserved-name head PR into `develop`, `resolveMode` requires
the app package floors to remain unchanged. These are pre-promotion integration steps, not
independent release or version-floor events. Normal `develop` PRs, staging repairs, promotions, and
main hotfixes keep their existing Decision 6 modes. The reserved-name registration and lifecycle
contract is defined in ADR 0074's 2026-10-24 amendment and the release policy.

| PR path | Mode |
| --- | --- |
| Reserved integration base, or reserved integration head into `develop` | `unchanged` |

`[default]` tier — amends Decision 6's PR-path mode table only. Decision 7's `[binding]`
immutable-tag invariant is unchanged.

PR: (this PR). Refs #2737.
