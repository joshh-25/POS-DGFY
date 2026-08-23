---
status: planned
authority_level: reference
owner: engineering
last_reviewed: 2026-08-23
applies_to: frontend_split_cutover,infrastructure,deployment,dev,staging,prod,ci
topic: frontend_split_cutover_runbook
---

# Frontend-split live-server cutover — runbook

Status: **planned, not yet executed.** This document will be updated to `status: executed` (mirroring
`docs/deployment/2026-07-20-dgfy-ph-production-cutover-runbook.md`) once the sequence below has
actually run against DEV, STAGING, and PROD.

Cuts DEV, STAGING, and PROD over from the single `frontend` container (ADR 0059/0071's pre-split
architecture — one image, three surfaces on three internal ports) to the three independent images
ADR 0071 introduces: `dgfy-ims`, `dgfy-pos`, `dgfy-storefront`. The repo side of that split (compose
definitions, Dockerfiles, nginx template, every CI workflow) is already complete and already builds
and pushes the three images correctly — confirmed live this session. What's missing is applying the
equivalent change to each server's hand-maintained compose file, which this document exists to
close, per ADR 0071's Consequences section naming this exact gap.

## Why the repo compose/nginx are not the source of truth for the live servers

Same constraint the 2026-07-20 backend-cutover runbook already established: `/opt/dgfy-dev`,
`/opt/dgfy-stage`, and `/opt/dgfy-platform` are hand-maintained, not git checkouts. CI never copies
files there — `publish-platform.yml` only SSHes in and runs `docker compose pull && up -d` against
whatever compose/nginx/.env already live on the box. **The server files are the operative artifact;
this document records what they need to become.**

## Live topology today (confirmed via SSH, this session)

| Env | `docker compose ps` shows | Fronted by | Host-published frontend ports |
|---|---|---|---|
| DEV (`sieitz-dgfy-remote`, `/opt/dgfy-dev`) | `mysql`, `redis`, `dgfy-api` (image `api:develop`), `frontend` (image `frontend:develop`) | Host nginx (`infrastructure/nginx-host/dev.dgfy.ph.conf`, not in compose) | `127.0.0.1:8081-8083` → container `8081-8083` |
| STAGING (`sieitz-dgfy-remote`, `/opt/dgfy-stage`) | `mysql`, `redis`, `dgfy-api` (`api:staging`), `frontend` (`frontend:staging`) | Host nginx (`infrastructure/nginx-host/stage.dgfy.ph.conf`, not in compose) | `127.0.0.1:9081-9083` → container `8081-8083` |
| PROD (`dgfy`, `/opt/dgfy-platform`) | `mysql`, `redis`, `dgfy-api` (`api:beta`), `frontend` (`frontend:latest`), `nginx`, `certbot` | **Containerized** nginx (part of this same compose file) | No host port — nginx reaches `frontend:808x` over `dgfy_internal` only |

All three environments' single `frontend` container already serves all 3 surfaces internally on
ports 8081 (skupervisor/IMS) / 8082 (POS) / 8083 (storefront) — this is the pre-split, one-image-
three-ports architecture ADR 0071 retires.

**Prod-specific, confirmed live 2026-08-23, hours before this runbook was written**: `frontend-beta`
was already retired on prod (separate epic #329/#895/#896, unrelated to this split) — nginx now
`return 301`s the beta domain group into prod instead of proxying to a `frontend-beta` container.
Prod's starting point for this cutover is `frontend` alone, not `frontend` + `frontend-beta`.

## Target topology (per `infrastructure/docker/docker-compose.yml`, already correct in-repo)

Three services replace `frontend`, each with no host port on prod (reached only via `dgfy_internal`
through nginx) and a fixed host-port publish on dev/stage (same numbers the single `frontend`
container already publishes today — see below):

```yaml
  dgfy-ims:
    image: ghcr.io/sieitzz/dgfy-platform/dgfy-ims:${IMAGE_TAG:-latest}
    restart: unless-stopped
    networks: [dgfy_internal]   # dgfy_dev / dgfy_stage on those environments
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8081/"]
      interval: 15s
      timeout: 5s
      retries: 5

  dgfy-pos:
    image: ghcr.io/sieitzz/dgfy-platform/dgfy-pos:${IMAGE_TAG:-latest}
    restart: unless-stopped
    networks: [dgfy_internal]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8082/"]
      interval: 15s
      timeout: 5s
      retries: 5

  dgfy-storefront:
    image: ghcr.io/sieitzz/dgfy-platform/dgfy-storefront:${IMAGE_TAG:-latest}
    restart: unless-stopped
    networks: [dgfy_internal]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8083/"]
      interval: 15s
      timeout: 5s
      retries: 5
```

On **dev/stage**, add the same `ports:` publish the current `frontend:` service already carries
(dev: `127.0.0.1:8081:8081` / `:8082:8082` / `:8083:8083`; stage: `127.0.0.1:9081:8081` /
`:9082:8082` / `:9083:8083`), one port per new service instead of three ports on one service.
**Because the published host port numbers don't change, host nginx on dev/stage needs zero edits —
it already dials a fixed host port, not a container name.** Confirmed by reading the live
`infrastructure/nginx-host/dev.dgfy.ph.conf`/`stage.dgfy.ph.conf` — both proxy_pass to
`localhost:8081`/`8082`/`8083` (dev) or `127.0.0.1:9082` etc. (stage), never to a `frontend`
hostname.

On **prod**, no `ports:` block (matches today), and the containerized `nginx` service's
`depends_on` must add all three new services and drop `frontend`:

```yaml
  nginx:
    depends_on:
      dgfy-api:
        condition: service_healthy
      dgfy-ims:
        condition: service_healthy
      dgfy-pos:
        condition: service_healthy
      dgfy-storefront:
        condition: service_healthy
```

Exact per-environment diffs (with the required prod image-tag override, see below) are appended to
`infrastructure/docker/env/{prod,dev,stage}.compose-fragment.yml`, per ADR 0071's own naming of
those exact files — this document is the narrative and sequencing; those files are the literal
paste-in diff.

### The one required edit: prod's image tag variable

The repo's reference compose above uses `${IMAGE_TAG:-latest}` for all three new services. **That is
correct on DEV and STAGING** (`IMAGE_TAG=develop` / `IMAGE_TAG=staging` respectively, matching what
`deploy.yml` actually pushes for `dgfy-ims`/`dgfy-pos`/`dgfy-storefront` there). **It is wrong on
PROD**: prod's `IMAGE_TAG=beta` is scoped to the backend images only (`dgfy-api`, `dgfy-migration-
runner`); `deploy-main.yml` never pushes a `dgfy-ims:beta`/`dgfy-pos:beta`/`dgfy-storefront:beta` tag
— only `"latest"`. Copying `${IMAGE_TAG:-latest}` verbatim onto prod's three new services would try
to pull a tag that doesn't exist. Prod must instead use `${FRONTEND_PROD_IMAGE_TAG:-latest}` on all
three — the variable the 2026-07-20 backend/frontend-beta cutover already added to prod's `.env` for
exactly this beta/prod disambiguation, already set to `latest` there today. No `.env` change needed
on prod for this — the variable already exists and already has the right value.

### Nginx template — already correct in-repo, just needs copying

`infrastructure/docker/nginx/nginx.conf.template` in this repo already proxies to
`dgfy-ims:8081`/`dgfy-pos:8082`/`dgfy-storefront:8083` (confirmed by reading it directly). The live
prod template still says `frontend:8081`/`8082`/`8083`. This is a **copy**, not a rewrite — see step
4 below.

**Known, unrelated drift, explicitly not fixed here**: the repo's `nginx:` service also mounts
`./data/nginx/custom-storefronts:/etc/nginx/custom-storefronts:ro` (for the custom-storefront-domain
feature's `include /etc/nginx/custom-storefronts/*.conf;` line), which prod's *live* compose does not
currently have. This predates and is unrelated to the frontend split; flagged so it isn't confused
with this cutover's own diff, not addressed by this runbook.

## Pre-flight checklist

1. **GHCR org package permissions.** The first "push-only" dispatch (step 2 below) auto-creates the
   `dgfy-ims`/`dgfy-pos`/`dgfy-storefront` GHCR packages. Immediately after that dispatch completes,
   go to each package's Settings in the GitHub org and match its visibility/Actions-access to the
   existing `api`/`frontend` packages' current settings, **before** dispatching the actual deploy
   (step 5). Left on the auto-created default, the first real pull will 403 in production. This is a
   manual, GitHub-UI step — not automated by this runbook or any script in this repo.
2. **No rollback mechanism exists for this deploy path** (#495, open). This runbook's rollback plan
   (below) is a manual compensating step, not a tooling guarantee — read it before starting, not
   after something goes wrong.
3. Confirm the target server's compose file matches the "Live topology today" table above
   (`docker compose ps`) — if it's drifted further, reconcile before applying the fragment rather
   than assuming this document is still current.

## Per-environment sequence

Run DEV first as the dry run, then STAGING, then PROD. **Stop and get an explicit go-ahead before
the PROD leg** — a `deploy-main.yml`/PROD dispatch is never unattended, matching the standing rule
already in `.agents/skills/promoter/SKILL.md`.

1. **Push-only dispatch.** `deploy.yml` (DEV/STAGING) or `deploy-main.yml` (PROD) with
   `components: frontend`, `deploy: false`. Pushes the three new images to GHCR; touches nothing
   live. This is also what first creates the GHCR packages — do this before the pre-flight
   permissions step above, not after.
2. **Grant GHCR permissions** per pre-flight item 1, now that the packages exist.
3. **SSH in and hand-edit the server's `docker-compose.yml`.** Delete the `frontend:` service block;
   paste in the three new service blocks from the matching
   `infrastructure/docker/env/<env>.compose-fragment.yml`'s frontend-cutover section (already
   carries the correct network name, host-port publish, and — on prod — the
   `FRONTEND_PROD_IMAGE_TAG` override). On prod, also apply the `nginx:` `depends_on` edit from that
   same fragment file. Validate with `docker compose config >/dev/null` before proceeding.
4. **Prod only: copy the nginx template.** `scp` this repo's `infrastructure/docker/nginx/` directory
   onto the server, replacing what's there. Then `docker compose restart nginx` — **restart, not
   reload**; the envsubst-on-templates step only re-runs at container start, matching the same note
   already in `prod.compose-fragment.yml`'s data-move section.
5. **Deploy dispatch.** Re-run `deploy.yml`/`deploy-main.yml` with `components: frontend`,
   `deploy: true` (or the default `all`, which is harmless — it just also refreshes images that
   didn't change). This pulls the three new images and runs `docker compose up -d --remove-orphans`,
   which **also stops and removes the now-orphaned `frontend` container automatically**, since its
   service was deleted from the compose file in step 3.
6. **Verify.** Dispatch `verify-deployment.yml` (after the `SERVICES` fix landing alongside this
   runbook — see below) and manually `curl` all three domains for that environment as a smoke test.
7. **Bake, then finalize.** See Rollback below for how long to wait before treating the cutover as
   done on that environment.

## Rollback (manual — no tooling exists for this)

Per #495, there is no automated rollback for this deploy path. The compensating plan:

- **Don't delete the old `frontend`/`frontend-beta` GHCR image tags** for a bake period (recommend
  48h post-cutover per environment) — they cost storage, not risk, sitting unused.
- **Keep the deleted `frontend:` compose block** — it's preserved verbatim in this runbook's git
  history and in each `*.compose-fragment.yml`'s pre-cutover section — so reverting means pasting it
  back into the server's `docker-compose.yml`, reverting `nginx:`'s `depends_on` (prod), reverting
  the nginx template copy (prod), and `docker compose up -d --remove-orphans` again.
- If a bad cutover is caught mid-bake, this reversal is the same manual SSH sequence as the forward
  cutover, just backward — there is no faster path today. Treat that latency as a live risk, not a
  solved problem, when deciding when to run the PROD leg.

## Post-cutover hardening — do this last, only after all three environments are cut over

`publish-platform.yml`'s staleness guard today only checks that `docker compose config --images`
contains `dgfy-platform/api` + `dgfy-platform/migration-runner` (the backend rename from PR #55),
refusing to deploy otherwise. The same protection is worth adding for the frontend rename — a
publish dispatched against a server whose compose still only has `frontend:` would otherwise
silently no-op the frontend half of the deploy (nothing to pull for a service not in the file, `up
-d` leaves the stale container running) rather than failing loudly, mirroring exactly the backend
failure mode that guard already exists to catch.

**Deliberately not added in the same PR as this runbook.** Landing it before all three environments
are actually cut over would make it fail *every* deploy to whichever environment hasn't been cut
over yet — including backend-only changes, since `publish-platform.yml` is one shared, unconditional
script every dispatch runs through. Add this only once DEV, STAGING, and PROD have all completed
step 5-6 above and are confirmed serving from the three new images:

```bash
# In publish-platform.yml's "Pull and restart platform containers" step, alongside the existing
# backend check:
{ echo "$COMPOSE_IMAGES" | grep -q 'dgfy-platform/api' && echo "$COMPOSE_IMAGES" | grep -q 'dgfy-platform/migration-runner'; } || { echo "::error::... server compose is stale, refusing to deploy." >&2; exit 1; } && \
{ echo "$COMPOSE_IMAGES" | grep -q 'dgfy-platform/dgfy-ims' && echo "$COMPOSE_IMAGES" | grep -q 'dgfy-platform/dgfy-pos' && echo "$COMPOSE_IMAGES" | grep -q 'dgfy-platform/dgfy-storefront'; } || { echo "::error::... server compose has no dgfy-ims/dgfy-pos/dgfy-storefront image reference -- server compose is stale, refusing to deploy." >&2; exit 1; } && \
```

File this as a small, separate, fast-follow PR once the checklist above is fully checked off for all
three environments — not bundled into this runbook's own PR.

## Cross-references

- ADR 0071 (`docs/architecture/adr/0071-frontend-split-into-three-apps.md`) — the decision and
  Consequences section this runbook fulfills; see its `## Amendments` for the pointer back to this
  file.
- `infrastructure/docker/env/{prod,dev,stage}.compose-fragment.yml` — the literal per-environment
  paste-in diffs this runbook's step 3 uses.
- `docs/deployment/2026-07-20-dgfy-ph-production-cutover-runbook.md` — the precedent this document's
  shape and the "hand-maintained, not a git checkout" framing are drawn from.
- Issue #915.
