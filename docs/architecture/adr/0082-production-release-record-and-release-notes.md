---
status: accepted
authority_level: authoritative
owner: release
date: 2026-09-06
last_reviewed: 2026-09-06
review_by: 2027-03-06
applies_to: development_to_production_release_flow, release_notes
topic: production_release_record_and_release_notes
---

# ADR 0082: Production Release Record and Release Notes

## Status

Accepted (2026-09-06)

> Strictness tiers per [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md):
> Clauses below are tagged `binding`, `default`, or `snapshot`. `binding` is a system invariant
> and needs a superseding ADR to change; `default` is amendable in place; `snapshot` records a
> point-in-time fact. Untagged clauses are `default`.

## Context

#1278 asks for one production-release record per production push, with concise, plain-language
release notes — and for the procedure to "reject or visibly flag a production release with no
release-note record." No existing ADR covers this. Verified against the tree, not assumed:

- `docs/ops/RELEASE_CANDIDATE_POLICY.md` (authoritative, 1192 lines as of this PR) contains **zero**
  occurrences of "release note", "changelog", or "tag" before this PR's own amendment.
- `.agents/skills/promoter/` contains **zero** references to release notes or `gh release` before
  this PR.
- No `CHANGELOG.md` exists anywhere in the repo. `deploy-main.yml` creates no git tag and no GitHub
  Release — it holds `permissions: contents: read`, so it *could not*, even if it tried.
- The only GitHub Releases in this repo are four hand-cut Android APK releases
  (`android-prod-v1.2` etc., the #615 precedent) — a real, working publication pattern, just never
  extended to the platform itself.
- `docs/releases/batches/*.md` is the one human-readable release-narrative precedent in this repo
  (`## Plain-English Summary` / `## Included` / `## Excluded` / `## Regression Risk Notice` /
  `## Rollback` / `## Production Proof Required`) — frozen since 2026-07-03, ADR-0030-era machinery
  built for a `master` branch and a release controller this repo never actually ran
  (`RELEASE_CANDIDATE_POLICY.md`'s own Purpose section). It is far more verbose than #1278 asks for
  and describes a promotion model this repo superseded. This ADR borrows its section-skeleton
  instinct only — see Decision 7 and `docs/releases/notes/README.md` for why it is not revived.

Per `docs/architecture/ARCHITECTURE_GOVERNANCE.md`'s decision procedure ("new cross-boundary
decision with no ADR covering it: create an ADR"), this is that ADR. [ADR 0081](0081-per-app-container-semantic-versioning.md)
governs image *tags* only and says so explicitly at its own Context/Decision 1 — it supplies the
version identity this ADR reports on (the promotion `candidate_id`, five independent per-app
SemVers, a validated candidate manifest, the production commit SHA) but does not itself define a
release record. That gap is what this ADR closes.

**Out of scope for this ADR**, recorded here so it isn't rediscovered as a silent gap:

- No `deploy-main.yml`, `deploy.yml`, or `publish-platform.yml` workflow changes. Publishing the
  GitHub Release stays a promoter-run step after a successful deploy, not an in-workflow action —
  automating that is Follow-up 2, explicitly deferred (see `## Related`).
- No retroactive notes for past production pushes — #1278's own stated non-goal.
- No `CHANGELOG.md`, and no revival of `docs/releases/batches/`.
- No change to API URL versioning (#520, explicitly separate, per #1278's own non-goals).
- The enforcement mechanism (a `check:release-notes` script and CI wiring) is **named** by Decision
  8 below but is **not built by this ADR** — it is the next phase's scope (Phase 296, a separate PR),
  matching the same split ADR 0081 itself used between deciding a scheme (that ADR) and building the
  tooling that enforces it (later phases of epic #1548).

## Decision

1. `[default]` **Release unit.** The release unit is the promotion `candidate_id`
   (`YYYY-MM-DD-NN`, [ADR 0081](0081-per-app-container-semantic-versioning.md)'s own identity for a
   frozen promotion candidate). One release record per production promotion, not per app and not
   per merge — a candidate that ships five apps at five independent versions still produces exactly
   one release note. This ADR does not introduce a platform-wide SemVer: ADR 0081 Decision 6
   explicitly rejected one, and epic #1548's own non-goals keep `candidate_id` as the promotion
   identity rather than inventing a second, competing version number.
2. `[default]` **Authoritative record and published mirror.** `docs/releases/notes/<candidate_id>.md`,
   committed to the repository, is the authoritative record — the one a check can validate and
   reject against. The GitHub Release on tag `release-<candidate_id>` is the **published mirror**,
   cut from that same file after `deploy-main.yml` succeeds, matching the #615 Android precedent of
   publishing a GitHub Release as the human-facing artifact. If the two ever disagree, the committed
   file is authoritative; the GitHub Release is regenerated from it, not edited independently.
3. `[binding]` **No production promotion reaches `main` without a release-note record for its
   candidate.** This is the one clause this ADR asks to be a hard constraint — it is #1278's own
   acceptance criterion ("the release procedure rejects or visibly flags a production release with
   no release-note record") and everything else in this Decision section is procedure layered on
   top of it. Every other clause here is `[default]`.
4. `[default]` **Minimum structure.** A release note names: the candidate ID, the production date,
   a per-app version table (all five apps from ADR 0081's scheme: `dgfy-api`,
   `dgfy-migration-runner`, `dgfy-ims`, `dgfy-pos`, `dgfy-storefront`), the production commit SHA,
   an `## Included` section listing user- or operator-visible changes in plain language, and an
   `## Operational notes` section for any required upgrade, migration, or configuration action —
   explicitly `None.` when there is nothing to report. `docs/releases/notes/TEMPLATE.md` is the
   canonical shape; `docs/releases/notes/README.md` explains the directory's own purpose.
5. `[default]` **Concision rule.** One line per user- or operator-visible change, each naming its
   source PR or issue. This is not a commit-by-commit changelog: a change that a merchant or an
   operator cannot observe does not get a line. **Explicitly cite #1605 here**: `check:app-versions`'
   fan-out detection (an app's version bump triggered by a `file:` dependency it did not directly
   change) cannot distinguish a test-only or dependency-only change from user-visible shipped
   behavior — "an app's version bumped" is *not* evidence of a user-visible change on its own and
   must never be used to mechanically generate an `## Included` line. A line is authored because a
   human read the underlying PR/issue and judged it observable, the same authorship model ADR 0081
   Decision 6 already uses for version bumps themselves.
6. `[default]` **Edge cases.**
   - `No user-visible changes.` is a valid and expected `## Included` body — not an error, not an
     empty section, and not a reason to skip the record entirely.
   - A breaking change or a reversion gets an explicit prefixed line (`**Breaking:**` /
     `**Reverts:**`) rather than reading like an ordinary item — the reader should not have to infer
     severity from prose.
   - A `fix/staging/*` repair (`.agents/skills/promoter/SKILL.md`'s "Frozen candidate and repair
     loop") **amends the existing candidate's note in its own PR** — repair branches carry commits of
     their own (unlike `to-staging/*`/`release/*` promotion branches), so the repair adds its own
     item line and updates its app's row in the version table, rather than creating a second record
     for the same `candidate_id`.
   - A `main` hotfix and a #1007 expedited promotion each get **their own** release record, keyed by
     their own `candidate_id` — a #1007 path uses the `release/<label>` label as its candidate ID; a
     hotfix assigns a fresh `YYYY-MM-DD-NN` ID at fix time, per `.agents/skills/incident-responder/SKILL.md`'s
     hotfix procedure. Either path's note states the missing-staging-predecessor fact outright in its
     `## Operational notes` section, rather than silently omitting the version table's usual
     staging-parity context — mirroring ADR 0081 Decision 8's own instruction that "the gate
     documents the fact, it does not forbid it."
7. `[default]` **Component releases stay separate.** The Android wrapper keeps its own
   `android-<flavor>-v<X.Y>` tags and its own GitHub Releases (#615) — untouched by this ADR. The
   `release-` prefix (Decision 2) and the `android-` prefix are disjoint, so no ambiguous or
   duplicate version label can arise between a platform release and an Android release.
   `v2.1`/`v2.2` are explicitly noted as **dead, pre-#1548 tags** — an older versioning attempt that
   predates ADR 0081's per-app scheme and this ADR's release-note scheme; they are not to be
   extended or reused as a precedent for either.
8. `[default]` **Rollout posture.** The enforcement check (named here, built in a later phase —
   `check:release-notes`, validating a `release/<candidate_id>-rN` → `main` promotion PR carries a
   matching `docs/releases/notes/<candidate_id>.md`) lands **advisory first, flips blocking only in a
   dedicated later phase**, once clean-run evidence exists — the same pattern
   [ADR 0081](0081-per-app-container-semantic-versioning.md) Decision 9 and Phase 272/#1550/#1551
   already established in this repo for a new promotion-time gate. This ADR's Decision 3
   (`[binding]`) is the substantive obligation; Decision 8 governs only how soon a script starts
   *enforcing* it mechanically, matching Decision 3's own instruction to visibly flag before it
   rejects.

## Consequences

- **A release note becomes a required, PR-authored artifact, not an after-the-fact summary.**
  Per `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s matching dated amendment, the note is written into
  the same `chore(release): bump <apps> …` PR that ADR 0081 Decision 6's pre-cut floor step already
  requires before cutting `to-staging/<candidate_id>` — this is the only workable seam, since a
  promotion branch (`to-staging/*`/`release/*`) carries no commits of its own (the #426 rule), so
  the note has to already be on `develop` at cut time to ride `develop → staging → main` with the
  code it describes.
- **`.agents/skills/promoter/SKILL.md` and its runbook gain new obligations** — author the note in
  the bump PR, amend it on every `fix/staging/*` repair, and publish the GitHub Release after
  `deploy-main.yml` succeeds — tracked as a dated amendment to `RELEASE_CANDIDATE_POLICY.md` and a
  direct edit to the promoter's own skill files in this same PR.
- **`docs/releases/batches/` stays frozen, explicitly not folded into this scheme.** It remains a
  historical record of the pre-#1548, ADR-0030-era release model; `docs/releases/notes/README.md`
  states this outright so a future reader does not conflate the two directories or resurrect the
  older, more verbose format.
- **The enforcement check ships advisory, not blocking, on first landing** (Decision 8) — a missing
  or malformed release-note record on a `release/* → main` promotion PR is visible (a failed, but
  `continue-on-error` CI step) but non-fatal until a later, dedicated phase flips it, mirroring the
  advisory-to-blocking rollout `check:app-versions` itself went through (ADR 0081 Decision 9,
  Phase 272 → Phase 283/#1592).
- **This ADR does not solve retroactive coverage.** No release note is created for any production
  push that predates this ADR — #1278's own non-goal, restated here as a Consequence rather than
  silently implied.
- **Automating GitHub Release publication is deferred, not solved here.** `deploy-main.yml` holds
  `permissions: contents: read` today; giving it `contents: write` to publish the Release itself,
  rather than the promoter doing it as a manual post-deploy step, is Follow-up 2 (below) — explicit
  future scope, not assumed to already work.

## Alternatives considered

- **A platform-wide SemVer number, independent of `candidate_id`.** Rejected: ADR 0081 Decision 6
  already rejected a platform-wide version in favor of five independent per-app SemVers plus the
  promotion `candidate_id` as the shared identity; inventing a second, competing platform version
  here would fragment "what version is this" into two incompatible answers for the same production
  push.
- **Reviving `docs/releases/batches/`'s existing template** instead of a new, smaller schema.
  Rejected: that format's `## Excluded` / `## Regression Risk Notice` / `## Rollback` /
  `## Production Proof Required` sections describe a promotion model (`staging-qualification.yml`,
  `exact-master-sha-qualification.yml`, `promote-staging-to-master.yml`) this repo already retired
  (`RELEASE_CANDIDATE_POLICY.md`'s own Purpose section) — carrying it forward would misdescribe the
  current promotion flow on every single release note. The plain-language `## Included` /
  operational-notes instinct is kept; the rest is not.
- **Auto-generating `## Included` from `check:app-versions`' changed-app detection or from raw
  commit messages.** Rejected per Decision 5 and the explicit #1605 citation: fan-out version bumps
  and commit messages both include changes no merchant or operator can observe (a dependency-only
  bump, a test fixture update, an internal refactor) — a mechanically generated list would drift
  from "plain-language, user- or operator-visible" into a commit-by-commit changelog, exactly what
  #1278's own scope explicitly rejects.
- **Making the enforcement check blocking from day one.** Rejected: this repo has an established,
  working precedent (ADR 0081 Decision 9) for landing a new promotion-time gate advisory first,
  specifically so its first real exposure against a live promotion cannot itself stall an active
  production release. Reusing that precedent was judged lower-risk than a first-day blocking gate on
  new mechanism.

## Related

- [ADR 0081](0081-per-app-container-semantic-versioning.md) — supplies the version identity
  (`candidate_id`, per-app SemVer, the candidate manifest, the production commit SHA) this ADR's
  release note reports on; governs image tags only and does not itself define a release record.
- [ADR 0074](0074-retire-staging-branch-from-default-promotion-path.md) — the promotion flow
  (`develop → staging → main` default, `develop → main` as the #1007-gated exception) whose `main`
  leg this ADR's Decision 3 gates.
- [ADR 0072](0072-ghcr-container-image-naming.md) — image *naming*; unrelated to this ADR's tag
  namespace (`release-<candidate_id>`) but cited for the same "tags are namespaced and disjoint"
  reasoning Decision 7 relies on.
- #1278 — the issue this ADR was filed to close (PR 1 of its own two-PR implementation).
- #1548 — the container-semantic-versioning epic #1278 was re-parented under on 2026-09-04; this ADR
  is #1278's own scope within that epic, reporting on the epic's version identities rather than
  redeciding them.
- #615 — the prior Android GitHub-Release precedent this ADR's Decision 2/7 explicitly follows and
  stays disjoint from.
- #1605 — the fan-out version-bump detection this ADR's Decision 5 explicitly cites as *not*
  evidence of a user-visible change.
- #495 (epic #492) — the open rollback-mechanism gap; this ADR's `## Operational notes` section is
  where a release note would record a rollback action if #495 ever supplies one, but this ADR does
  not implement or assume that mechanism exists.
- `docs/ops/RELEASE_CANDIDATE_POLICY.md` — the executable promotion policy this ADR's obligations
  are layered onto via a dated amendment in this same PR.
- `docs/releases/notes/README.md`, `docs/releases/notes/TEMPLATE.md` — the schema and directory
  this ADR's Decision 4 defines, added in this same PR.
- `docs/releases/batches/` — the frozen, ADR-0030-era precedent this ADR deliberately does not
  revive (Decision 7's own "Alternatives considered" entry above).

## Follow-ups (not built by this ADR — hand to `pm` to file, do not improvise)

1. Flip `check:release-notes` advisory → blocking, once clean-run evidence exists — the dedicated
   later phase Decision 8 promises, mirroring ADR 0081 Decision 9 → Phase 283/#1592.
2. Auto-publish the GitHub Release from `deploy-main.yml` after its `publish` job succeeds, instead
   of the promoter doing it as a manual post-deploy step. Needs `contents: write` on a workflow
   currently pinned to `contents: read`; deliberately deferred out of this ADR's scope.
