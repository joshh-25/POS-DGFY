<!--
Release-note template — sku-release-note/v1 (ADR 0082, docs/ops/RELEASE_CANDIDATE_POLICY.md's
2026-09-06 amendment). Copy this file to docs/releases/notes/<candidate_id>.md and fill it in; do
not edit this template's own schema without also updating ADR 0082 and the (later) enforcement
script that validates against it. See README.md in this directory for what this schema is and is
not for.
-->
---
schema: sku-release-note/v1
candidate_id: 2026-09-05-01
production_date: 2026-09-05
production_commit: pending
---

<!--
production_commit has a two-stage lifecycle (ADR 0082 Decisions 4 and 8) -- write the literal
sentinel `pending` (exactly that string, not a bracketed placeholder) when this note is authored
pre-cut, since the real `main` merge-commit SHA does not exist yet at that point. `pending` is
valid and expected on the release/<candidate_id>-rN -> main promotion PR itself. The promoter
finalizes this field to the real 40-hex SHA post-deploy, before the GitHub Release is published
(.agents/skills/promoter/references/promotion-runbook.md's "Publish the GitHub Release" section) --
a finished release note carries a real 40-hex SHA here, never `pending`.
-->

# Release 2026-09-05-01 — 2026-09-05

| App | Version |
|---|---|
| dgfy-api | 1.2.2 |
| dgfy-migration-runner | 1.1.0 |
| dgfy-ims | 1.1.2 |
| dgfy-pos | 1.1.2 |
| dgfy-storefront | 1.2.1 |

## Included

- Storefront guest checkout no longer rejects a valid OTP after a page refresh. (#1614)
- POS item thumbnails render at full resolution instead of falling back to a placeholder. (#265)

<!--
One line per user- or operator-visible change, each naming its source PR or issue. Not a
commit-by-commit changelog — an app's version bump alone (including a fan-out bump from a `file:`
dependency, #1605) is NOT evidence of a user-visible change; a human must have read the underlying
PR/issue and judged it observable before it earns a line here.

`No user-visible changes.` is a valid, expected body for this section — use it verbatim rather than
leaving the section empty or inventing a line to fill it.

Prefix a breaking change or a reversion so its severity doesn't have to be inferred from prose:
- **Breaking:** <what changed and what a caller must do>. (#NNNN)
- **Reverts:** <what was reverted and why>. (#NNNN)
-->

## Operational notes

None.

<!--
Any required upgrade, migration, or configuration action an operator must take. `None.` (verbatim)
is the expected body when there is nothing to report — never omit the section.

A main hotfix or a #1007 expedited promotion (ADR 0082 Decision 6) states its missing
staging-predecessor fact here explicitly, e.g.:
"This candidate has no staging soak — released via the #1007 expedited override / as a main
hotfix. See docs/ops/RELEASE_CANDIDATE_POLICY.md's expedited-override / hotfix-and-back-port
sections for the authorization record."
-->
