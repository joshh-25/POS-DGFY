# Release notes (`sku-release-note/v1`)

One file per production promotion, named `<candidate_id>.md` (e.g. `2026-09-05-01.md`), following
`TEMPLATE.md`'s shape. This is the authoritative record [ADR 0082](../../architecture/adr/0082-production-release-record-and-release-notes.md)
requires for every production promotion — read that ADR for the full decision record; this file
only orients a reader dropped into the directory, and explains why it is not the older
`docs/releases/batches/` directory next to it.

## Why this is not `docs/releases/batches/`

`docs/releases/batches/` is **dead machinery, frozen 2026-07-03**, not a lighter version of the same
idea. It was built for an ADR-0030-era release model — a `master` branch and a root-owned external
release controller (`staging-qualification.yml`, `exact-master-sha-qualification.yml`,
`promote-staging-to-master.yml`) that `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s own Purpose section
confirms **was never actually installed** for this repository. Its per-release `.md`/`.json` pairs
carry sections that describe that retired model directly — `## Excluded`, `## Regression Risk
Notice`, `## Rollback`, `## Production Proof Required` — and are considerably more verbose than
#1278 asked for. Do not add new files there, and do not port its section shape into a
`sku-release-note/v1` file. If you are looking for a release record for a promotion that landed
before 2026-09-06, `docs/releases/batches/` may have one (as a historical artifact of that older
model); every production promotion from 2026-09-06 onward has its record here instead.

## What belongs here

Exactly one `<candidate_id>.md` file per production promotion (`develop → staging → main`, the
#1007-gated `develop → main` exception, or a `main` hotfix — every path gets its own record, per
ADR 0082 Decision 6), plus a repair amendment in-place on the same file for any `fix/staging/*`
candidate repair. Nothing else — no per-app notes, no per-PR notes, no draft/scratch files.

## Schema

`sku-release-note/v1` — frontmatter (`schema`, `candidate_id`, `production_date`,
`production_commit`), a per-app version table (`dgfy-api`, `dgfy-migration-runner`, `dgfy-ims`,
`dgfy-pos`, `dgfy-storefront` — the same five apps [ADR 0081](../../architecture/adr/0081-per-app-container-semantic-versioning.md)
versions independently), an `## Included` section (plain-language, one line per user- or
operator-visible change, each citing its source PR/issue — `No user-visible changes.` is a valid
body; see ADR 0082 Decision 5 on why a version bump alone, including a #1605 fan-out bump, is never
sufficient evidence for a line), and an `## Operational notes` section (`None.` when empty). See
`TEMPLATE.md` for the exact copy-pasteable shape and its inline authoring notes.

## Who writes these, and when

Per `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-09-06 amendment (mechanics) and
`.agents/skills/promoter/SKILL.md` (the role that carries them out):

- **Authored** in the `chore(release): bump <apps> …` PR, before `to-staging/<candidate_id>` is cut
  (the only seam available — a promotion branch carries no commits of its own).
- **Amended** in place by each `fix/staging/*` repair PR — never a second file for the same
  candidate.
- **Validated** by `check:release-notes` on the `release/* → main` PR — advisory on first landing,
  blocking only once a later, dedicated phase flips it (ADR 0082 Decision 8). Not yet built as of
  this ADR's own PR — see `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`'s Phase 296 entry once it
  lands.
- **Published** as a GitHub Release on tag `release-<candidate_id>` after `deploy-main.yml`
  succeeds — the committed file here stays authoritative; the GitHub Release is a mirror cut from
  it, never edited independently.
