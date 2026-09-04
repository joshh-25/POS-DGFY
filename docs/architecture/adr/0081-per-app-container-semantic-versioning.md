---
status: accepted
authority_level: authoritative
owner: release
date: 2026-09-04
last_reviewed: 2026-09-04
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
8. `[default]` Promotion parity gate: for a given app, `X.Y.Z-staging` and the later `X.Y.Z` must
   share the same `org.opencontainers.image.revision` label (frontends) or the same source commit
   SHA (backends). A production version published with no matching staging predecessor is expected
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
