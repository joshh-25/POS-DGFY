---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-08-24
last_reviewed: 2026-08-24
review_by: 2027-02-24
applies_to: infrastructure
topic: ghcr_container_image_naming
supersedes_in_part: docs/architecture/adr/0071-frontend-split-into-three-apps.md
---

# ADR 0072: GHCR Container Image Naming Convention

## Status

Accepted (2026-08-24)

## Context

Issue Sieitzz/dgfy-platform#928 flagged an inconsistency introduced across two unrelated splits
done at different times: the backend split (PR #55) named its two images
`ghcr.io/sieitzz/dgfy-platform/api` and `ghcr.io/sieitzz/dgfy-platform/migration-runner` — dropping
the `dgfy-` prefix their `apps/dgfy-api`/`apps/dgfy-migration-runner` directories both carry — while
ADR 0071's frontend split named its three images `ghcr.io/sieitzz/dgfy-platform/dgfy-{ims,pos,
storefront}`, keeping the prefix. Neither was an accident; each matched the convention in force at
the time it was decided, and neither ever got reconciled against the other.

The GitHub Container Registry org packages page
(`https://github.com/orgs/Sieitzz/packages`) renders only the **last path segment** of a package
name — `ghcr.io/sieitzz/dgfy-platform/api` shows up as a bare `api` under the Sieitzz org. That's
harmless while `dgfy-platform` is the only repository publishing containers into the org, but it
becomes collision-prone the moment a second Sieitzz application also publishes an `api` image — the
org listing would show two unrelated packages both named `api`, with nothing in the listing itself
distinguishing them. Meanwhile `dgfy-platform/dgfy-ims` carries a redundant `dgfy-` prefix under a
namespace (`dgfy-platform`) that already says `dgfy`.

## Decision

1. Every GHCR container package for this repository is named `ghcr.io/sieitzz/<name>`, dropping the
   `dgfy-platform/` path segment entirely — one flat namespace under the `sieitzz` org, not a
   `dgfy-platform/` sub-namespace. `[default]`
2. `<name>` is exactly the corresponding `apps/*` directory name: `dgfy-api`, `dgfy-migration-runner`,
   `dgfy-ims`, `dgfy-pos`, `dgfy-storefront`. A future `apps/<name>` deployable surface follows the
   same rule by construction — no separate naming decision needed per new app. `[default]`
3. This supersedes-in-part ADR 0071 Decision 3, which named the frontend images as
   `ghcr.io/sieitzz/dgfy-platform/dgfy-{ims,pos,storefront}` — only the registry path changes; the
   rest of that decision (one image per app, own Dockerfile per app, the retired single `frontend`
   image) is unaffected and stays in force under ADR 0071.
4. `ghcr.io/sieitzz/dgfy-platform/frontend` — the pre-split monolith image ADR 0071 already retires
   — is **not** renamed. It has no `apps/*` directory to name it after, it is being deleted once the
   frontend-split cutover bakes across all three environments, and renaming it would mean an extra
   build, an extra GHCR package, and an extra manual visibility grant for an image with weeks left to
   live. `[snapshot]`

This ADR carries no binding-tier clause — image naming is exactly the kind of decision ADR 0039's
tier table assigns to `default` ("the chosen approach... covers naming, module placement"), not a
system invariant. A future change to this convention needs only a dated `## Amendments` block on
this ADR in the implementing PR, not a new superseding ADR.

## Consequences

- **Every workflow that names or derives a GHCR image path changes together, in one PR**:
  `deploy-api.yml`, `deploy-migration-runner.yml`, and `deploy-frontend.yml`'s `IMAGE_NAME`;
  `publish-platform.yml`'s staleness guard (and its `scripts/deploy-local.sh` mirror), which now
  requires the **new** names only — accepting the old name there would silently permit exactly the
  stale-server state the guard exists to catch. `deploy-frontend.yml`'s `IMAGE_NAME` derivation from
  `inputs.app` needed only the `dgfy-platform/` prefix dropped, since the three frontend apps'
  `inputs.app` tokens (`dgfy-ims`, `dgfy-pos`, `dgfy-storefront`) already equal their new package
  names — no change to the `inputs.app` token chain through `deploy.yml`, `deploy-main.yml`, or
  `deployment-orchestrator.yml`.
- **Every compose file that pins an image tag changes together**:
  `infrastructure/docker/docker-compose.yml` and `infrastructure/docker/env/{dev,stage,prod}.
  compose-fragment.yml` — the last of which are the hand-apply reconciliation source the frontend-
  split cutover runbook (`docs/deployment/2026-08-23-frontend-split-cutover-runbook.md`) drives the
  live server edits from.
- **New GHCR packages need the same manual GitHub-UI visibility step ADR 0071 already named** — the
  first push under a not-yet-seen package name auto-creates it with a default visibility that 403s
  on a production pull until manually matched to the existing packages' settings. This ADR does not
  change that gap; renaming `api`/`migration-runner` to `dgfy-api`/`dgfy-migration-runner` means
  those two, previously-established packages hit this same one-time step again, on top of the three
  frontend packages ADR 0071 already required it for.
- **The live servers' hand-maintained compose files are not renamed by this ADR.** As of this
  writing no environment (DEV/STAGING/PROD) has cut over to the split frontend at all — all three
  still run the monolith `migration-runner`/`api`/`frontend` trio. The rename lands on each server in
  the same hand-edit pass as the already-scheduled frontend-split cutover, not as a separate SSH
  pass — one edit and one restart per environment covers both changes together.
- **Stale packages under the old naming get deleted, not just abandoned.** `dgfy-platform/backend`
  (pre-backend-split monolith), `dgfy-platform/skupervisor`, `dgfy-platform/pos`,
  `dgfy-platform/storefront` (pre-frontend-split), and `dgfy-platform/dgfy-api` (an earlier,
  abandoned naming attempt distinct from the live `dgfy-platform/api`) are all superseded and
  unreferenced anywhere in the repo or on any live server — confirmed by inventory
  (`gh api orgs/Sieitzz/packages?package_type=container`) cross-checked against every server's
  `docker compose config --images`, 2026-08-24. `dgfy-platform/dgfy-{ims,pos,storefront}` (never
  deployed) are also deleted once superseded by the flattened names. `dgfy-platform/frontend-beta`
  no longer exists — it was deleted separately, prior to this ADR.

## Validation

- `docker compose -f infrastructure/docker/docker-compose.yml config --images` resolves the five
  flattened names.
- `npm run check:adr` / `npm run lint:docs` pass with this ADR and the accompanying amendments to
  ADR 0071 and ADR 0032.
- Post-cutover, per environment: `ssh <host> 'cd /opt/<dir> && docker compose config --images'`
  shows the flattened names and no remaining `dgfy-platform/` path for the renamed services;
  `verify-deployment.yml` reports PASS.
- Post-PR-merge, GHCR org inventory shows exactly `dgfy-api`, `dgfy-migration-runner`, `dgfy-ims`,
  `dgfy-pos`, `dgfy-storefront`, plus `dgfy-platform/frontend` until the frontend-split cutover
  retires it, with the five superseded packages named above deleted.
