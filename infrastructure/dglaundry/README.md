# DGLaundry hosting (DGFY-operated)

Tracked, environment-agnostic infra for running DGLaundry's own Docker stack
on a DGFY-managed server. DGLaundry owns its application images and compose
files (`Sieitzz/dglaundry`, `infrastructure/docker/docker-compose.production.yml`
+ `docker-compose.production.dgfy.yml`); this directory owns only the
DGFY-side hosting glue around that: per-environment non-secret config, the
SOPS-backed secrets materialization, and the deploy sequencing. See #2387 for
the hosting-migration epic and #2386 for the DNS/disk provisioning this
depends on.

**Written once, used for both `stage` and `prod`** — the same failure mode
`infrastructure/nginx-host/`'s own header comment already documents (a
hand-diverged per-environment copy silently drifting) is exactly what this
layout avoids. `deploy-sops.sh` takes an environment name
(`stage`/`prod`) as its one argument and resolves every path from it; nothing
here should ever need a second, environment-specific copy of itself.

## Layout

```
infrastructure/dglaundry/
  README.md                          # this file
  deploy-sops.sh                      # ./deploy-sops.sh <stage|prod> -- decrypts secrets into <host-root>/secrets/
  provision-migration-identity.sh     # idempotent CREATE USER/GRANT for the schema-scoped migration account
  remote-deploy.sh                    # runs ON the host: GHCR login -> pull -> up mysql -> migrate+up api/worker/gateway -> logout
  stage.env                           # non-secret config for staging (image digests, origin, migration head, ...)
  prod.env                            # same shape, for production (DGLAUNDRY_PUBLIC_ORIGIN=dglaundry.dgfy.ph,
                                       # a shrunk mem/cpu profile -- see "Prod-specific differences" below)
  compose/<release-sha>/
    docker-compose.production.yml     # vendored verbatim from Sieitzz/dglaundry at that exact pinned SHA -- only this
                                       # file; docker-compose.surebizcorp-lean.yml is deliberately NOT vendored (see
                                       # remote-deploy.sh's header comment -- it needs several live DGFY
                                       # integration vars this deployment doesn't have, and stage.env's own
                                       # mem_limit/cpus vars already apply directly to this file without it)
```

The `compose/<release-sha>/` files are **vendored, not generated** — copied byte-for-byte from
`Sieitzz/dglaundry` at the SHA named in `stage.env`'s `DGLAUNDRY_RELEASE_SHA`, so
`.github/workflows/deploy-dglaundry.yml` never needs `actions/checkout` against that private repo
(it only ever needs GHCR *image* access, granted per-package — see below). Bumping the pinned
release means adding a new `compose/<new-sha>/` directory and updating `stage.env`'s SHA/image
digests together, in the same commit — never editing an existing `compose/<sha>/` directory in
place, since its whole point is being an exact, auditable copy of what that SHA actually shipped.

Secrets live in `Sieitzz/dgfy-secrets` under `stage/dglaundry/secrets.env` /
`prod/dglaundry/secrets.env` (SOPS-encrypted, isolated per-environment age
keys, never this repo) — see that repo's README and
`docs/architecture/adr/0060-sops-age-encrypted-secrets-at-rest.md` for the
mechanism. The age *private* key for each environment lives only on that
environment's own host — `/opt/dglaundry-stage/age/keys.txt` on
`sieitz-dgfy-remote` (staging), `/opt/dglaundry/age/keys.txt` on the prod host (`ssh dgfy`) —
deliberately **not** `/etc/dgfy/age/keys.txt` on either host, to keep DGLaundry's own secrets fully
isolated from dgfy-platform's own SOPS cutover for its *own* `.env` (already live on prod; see
`infrastructure/docker/scripts/deploy-sops.sh`).

## Deploying: GitHub Actions, no GHCR credential ever stored on the host

Two workflows, one per environment — **deliberately two files, not one parameterized by an
environment input**, mirroring this repo's own `deploy.yml` (STAGING, unattended) vs
`deploy-main.yml` (PROD, always a human-confirmed dispatch) split, so the checkpoint boundary stays
structurally obvious rather than hidden behind an input value:

- `.github/workflows/deploy-dglaundry.yml` — staging, `DGLAUNDRY_STAGE` environment
- `.github/workflows/deploy-dglaundry-prod.yml` — production, `DGLAUNDRY_PROD` environment. Also
  runs a live memory-headroom pre-flight check before touching the host (see "Prod-specific
  differences" below) — staging's workflow has no equivalent check, since staging isn't this
  memory-constrained.

Both take a `confirm` checkbox and do the pull + compose-up sequence that `deploy-sops.sh`
deliberately stops short of (see "Running it" below). Both log in to GHCR **ephemerally** — the
token is piped over the SSH connection's stdin into `docker login --password-stdin` on the host,
never passed as an argv or env var there, and `remote-deploy.sh` logs back out via a
`trap ... EXIT` that fires on every exit path, success or failure, so a mid-deploy failure can
never leave a working credential sitting in `~/.docker/config.json` indefinitely.

Treated as its own app/server throughout, not folded into dgfy-platform's existing deploy
pipeline (`deployment-orchestrator.yml`/`publish-platform.yml`) even though it currently lands on
the same physical boxes as dgfy-platform's own DEV/STAGING/PROD stacks:

- **its own GitHub Environment per environment** (`DGLAUNDRY_STAGE`, `DGLAUNDRY_PROD`), each with
  its own `SSH_PRIVATE_KEY`/`SSH_TARGET` secrets — independent of `STAGING`/`PROD`, the
  environments dgfy-platform's own deploys use, so a leaked/compromised key on either side can't
  reach another deploy path. `SSH_TARGET` still points at the same user/host dgfy-platform's own
  deploys for that environment use — `sieitz@10.123.32.26` (staging), `gha@172.105.122.32` (prod) —
  see "Why one shared OS user" below; only the key itself is independent per environment.
- **its own GHCR package-level Actions-access grant** — each of `Sieitzz/dglaundry`'s three
  `dglaundry-{api,web,worker}` packages grants `Sieitzz/dgfy-platform` read access directly in
  GHCR's own package settings (package → Settings → "Manage Actions access"). No PAT, no new
  stored secret, scoped to exactly those three packages — this is the only way
  `secrets.GITHUB_TOKEN` can pull a private package published from a *different* repo. This grant
  is repo-scoped, not environment-scoped — made once for staging, it already covers the prod
  workflow living in the same repo.

### Why one shared OS user, not a dedicated `dglaundry` account

An earlier version of this plan called for a dedicated, unprivileged `dglaundry` OS user,
docker-group-only, owning `/opt/dglaundry-stage` outright. Dropped (Pat's call, #2387) once two
facts were on the table together: **each of these hosts already runs every app it hosts as one
shared user, with no per-app OS split anywhere** — staging/dev as `sieitz` on
`sieitz-dgfy-remote`, prod as `gha` on the prod host (`ssh dgfy`, the same account
`publish-platform.yml`'s `PROD` environment already SSHes into for dgfy-platform's own deploys);
and **`docker` group membership is root-equivalent regardless of which user holds it** (`docker
run -v /:/host ... chroot /host sh` reaches real root), so a second, docker-group OS user wouldn't
have been a real trust boundary against a determined compromise — only against accidental
cross-contamination. Weighed against the extra setup/rotation cost of a second account and
keypair, it wasn't worth it on either host. `secrets/` is owned outright by whichever shared user
that host uses, at `0700` — `sieitz:sieitz` on staging, `gha:gha` on prod — not the earlier
`root:dglaundry-secrets`-group scheme (that group had zero members and would have blocked
`deploy-sops.sh` from writing to it entirely).

What *does* stay independent, per environment: its own GitHub Environment and SSH keypair
(above), and the GHCR package grant (below, repo-scoped so it's shared rather than duplicated) —
those are cheap to keep separate and still let a leaked DGLaundry-workflow credential be revoked
without touching dgfy-platform's own deploy secrets, or the other DGLaundry environment's. If real
OS-level isolation is wanted later, the mechanism that would actually deliver it is rootless
Docker or a user-namespaced context per app, not a second Linux user sharing the same `docker`
group — out of scope here, flagged as a deliberate non-goal.

## Prod-specific differences

Everything above applies to both environments. Two things differ for prod, both driven by real
constraints on that specific host, confirmed live (infra/2477):

- **Host root has no `-prod` suffix**: `/opt/dglaundry`, not `/opt/dglaundry-stage`. Unlike
  `sieitz-dgfy-remote` (which hosts `dgfy-dev` and `dgfy-stage` side by side and needs the suffix
  to disambiguate), the prod host runs exactly one DGLaundry environment — matching
  `/opt/dgfy-platform` having no suffix there either. `deploy-sops.sh`'s `HOST_ROOT` resolution
  encodes this split directly; it is not a generic `/opt/dglaundry-${ENV_NAME}` pattern.
- **`prod.env`'s mem/cpu limits are shrunk well below `stage.env`'s already-lean profile** (mysql
  256m vs 512m, api 192m vs 384m, worker 128m vs 192m, gateway 32m vs 64m, migrate 128m vs 256m —
  concurrent peak ~608MB vs staging's ~1.4GB, since `migrate` is transient and exits before
  `api`/`worker`/`gateway` start). The prod host's live memory is the binding constraint: confirmed
  848Mi free / swap already 100% used (495Mi/495Mi) *before* this stack's own footprint, the same
  "prod memory sizing pass" epic #2387 already lists as its own open DoD item. Checked against the
  vendored compose file directly: there is no `innodb-buffer-pool-size` override hook on the
  `mysql` service (only `--max_connections`/`--skip-name-resolve` are parameterized), so the lever
  that actually controls mysqld's footprint under memory pressure is `DGLAUNDRY_MYSQL_MEM_LIMIT`
  itself, not a buffer-pool setting — see `prod.env`'s own comment.

  `deploy-dglaundry-prod.yml` adds a **live pre-flight step** that SSHes in, reads the host's
  actual `free -m` "available" column, and refuses the dispatch outright if it's below a stated
  floor (700MB) — this is the real safety net, not the shrunk numbers alone. A failure there means
  stop and resize the host's RAM/swap, never re-dispatch into a tighter margin. Staging's workflow
  has no equivalent step, since staging isn't this memory-constrained.

## Why this differs from `prod/dgfy/`'s SOPS pattern

`infrastructure/docker/scripts/deploy-sops.sh` (dgfy-platform's own, PROD-only
cutover tooling) decrypts into **shell-exported env vars**, because
`dgfy-api`'s compose service consumes them via `environment:` blocks. DGLaundry's
own compose file instead uses Docker Compose's file-based `secrets:` construct
(`MYSQL_PASSWORD_FILE: /run/secrets/mysql_app_password`, etc.) — each secret
has to exist as a **plaintext file** on the host, bind-mounted read-only into
the container at `/run/secrets/<name>`. So this directory's `deploy-sops.sh`
decrypts the same way (`sops decrypt`, never `source` — same Decision 6
reasoning: a value containing a literal `$` would otherwise corrupt) but
*writes files*, not exported variables, into `<env-root>/secrets/`.

## Running it

`deploy-sops.sh` only materializes secret files and prints the compose commands — it does not
check out compose files or run `docker compose` itself. `deploy-dglaundry.yml` /
`deploy-dglaundry-prod.yml` are what actually do that, end to end, via `remote-deploy.sh`:

```sh
# one-time per environment, on the host itself (not this repo), as that environment's shared
# deploy user (sieitz on staging, gha on prod -- see "Why one shared OS user" above):
#   mkdir -p <host-root>/{releases,secrets,public-keys,age,bin,dgfy-secrets-cache}
#   (sops + age installed under .../bin, age identity generated under .../age)
#   secrets/ is <user>:<user> 0700 -- owned outright by the one user that ever touches it
#   dgfy-secrets-cache/<env>-dglaundry-secrets.env synced in from Sieitzz/dgfy-secrets's
#   <env>/dglaundry/secrets.env once, or on each rotation (deploy-sops.sh never fetches this
#   itself -- no GitHub credential is provisioned on either host for that, deliberately)
#   host-root is /opt/dglaundry-stage (staging) or /opt/dglaundry (prod, no suffix)
#
#   One EXTERNAL Docker network (plus a second, per-environment egress network) must also exist
#   before the first dispatch on EACH host -- the vendored compose file declares both
#   `external: true` on purpose (so this Compose project can never create or widen them itself)
#   and never creates them; docker-compose.proxy.yml's own comment already called this out as
#   "must be created by the deployment owner" but nothing had done it on staging (caught live on
#   the first real dispatch, #2387) -- and as of infra/2477, nothing has done it on prod either.
#   Names come from each environment's own <env>.env DGLAUNDRY_EDGE_NETWORK /
#   DGLAUNDRY_EGRESS_NETWORK -- <env>.env itself doesn't exist on either host until the matching
#   workflow's own "Copy release artifacts" step runs (so `grep ... stage.env`/`prod.env` fails
#   here, pre-dispatch, with nothing to read yet -- PR #2453 review, RF-2), so read the current
#   values from THIS repo's own copies before running this on each host. As of this writing:
#
#   staging (sieitz-dgfy-remote):
#     docker network create dgfy-dglaundry-edge
#     docker network create dglaundry-stage-egress
#
#   prod (ssh dgfy) -- also needs the live-host nginx/compose/cert wiring from "Prod: live-host
#   edge-routing prerequisites" below before the edge network actually carries traffic, not just
#   exists:
#     docker network create dgfy-dglaundry-edge
#     docker network create dglaundry-prod-egress
#
#   If either environment's EDGE_NETWORK/EGRESS_NETWORK values are ever rotated, update the
#   names above to match, in the same commit as that rotation.

gh workflow run deploy-dglaundry.yml -f confirm=true       # staging
gh workflow run deploy-dglaundry-prod.yml -f confirm=true  # prod
```

### Prod: live-host edge-routing prerequisites

Unlike staging (host nginx on `sieitz-dgfy-remote`, a plain per-domain server block added
directly to `infrastructure/nginx-host/stage.dgfy.ph.conf`), prod's reverse proxy is the
*containerized* `docker-compose.proxy.yml` nginx service already serving every other production
domain (`dgfy.ph`, `pos.dgfy.ph`, `skupervisor.dgfy.ph`, `opis.dgfy.ph`, `beta.dgfy.ph`). The
edge-routing plumbing for DGLaundry (`dgfy-dglaundry-edge` network declaration, the nginx
service's `DGLAUNDRY_DOMAIN`/`DGLAUNDRY_GATEWAY_HOST`/`DGLAUNDRY_GATEWAY_PORT` env vars and network
attachment, and the `DGLAUNDRY` server block in `nginx.conf.template`) already exists in this
repo's **generic** templates (`infrastructure/docker/{docker-compose.yml,docker-compose.proxy.yml,
nginx/nginx.conf.template}`, PR #1316) — but the prod host's own copies of those three files are
hand-maintained literal copies (per #401/#1236, diverged from the generic `${VAR}`-templated
versions) and did not carry it until it was applied by hand for #2477 (2026-10-15). Repeat this
on any rebuild of the prod host, directly on the host:

1. Add the three `DGLAUNDRY_*` env vars to the live `docker-compose.proxy.yml`'s `nginx` service
   and attach it to `dgfy-dglaundry-edge` (declared in the live `docker-compose.yml`'s top-level
   `networks:` block, `external: true`). **`DGLAUNDRY_GATEWAY_PORT` there is `8080`** — the gateway
   container's own port, reached container-to-container over the edge network — not
   `prod.env`'s same-named `4400`, which is only the host-loopback publish port of DGLaundry's
   own compose project. Two same-named vars, two unrelated meanings.
2. Copy the `DGLAUNDRY` server block into the live `nginx.conf.template`, and add
   `${DGLAUNDRY_DOMAIN}` to its port-80 `server_name` list — HTTP-01 validation for step 3 needs
   nginx to already serve the name on port 80.
3. Add `dglaundry.dgfy.ph` to the shared `dgfy.ph` cert via
   `infrastructure/docker/nginx/init-letsencrypt-additional-domain.sh`. That cert is one
   multi-SAN lineage shared by every prod domain and `certbot --expand` *replaces* the SAN list
   rather than adding to it, so the script reads the lineage's current SANs and re-requests them
   all plus the new one.
4. Recreate **only** nginx — `--no-deps --pull never`, and only with the SOPS-decrypted
   environment loaded (see `/opt/dgfy-platform/deploy-sops.sh`). A bare
   `docker compose up -d nginx` resolves every secret-backed variable blank and recreates
   `mysql`/`dgfy-api` with blank credentials: that caused a ~4 minute production outage during
   #2477. Then re-verify every *existing* production domain still responds.

Each of these is its own live-production-host checkpoint — not something
`deploy-dglaundry-prod.yml` does on your behalf. DNS for `dglaundry.dgfy.ph` is live (#2386).

### Connecting DGLaundry to DGFY (#2304) — mode, overlay, secrets

Hosting DGLaundry is not the same as connecting it to DGFY. While `DGLAUNDRY_DGFY_MODE=disabled`
(still the case on prod), DGFY login, machine tokens and signed requests do not work.

- **Mode values:** `sandbox` on staging, `production` on prod (the DGLaundry installer maps the
  manifest's `paymentMode` this way). Any value other than `disabled` makes `remote-deploy.sh`
  layer `docker-compose.production.dgfy.yml` (vendored beside the base compose, same pinned SHA),
  which **requires** every `DGLAUNDRY_DGFY_*` variable in `<env>.env` and five secret files:
  `dgfy_client_secret`, `dgfy_partner_signing_private_key`,
  `dgfy_partner_client_assertion_private_key`, `dgfy_outbound_signing_key`,
  `dgfy_outbound_auth_token`. `deploy-sops.sh` writes them from `<env>/dglaundry/secrets.env`;
  the three PEM keys are stored single-line with `\n` escapes and expanded back to multi-line
  files there.
- **URLs default to PRODUCTION DGFY** (`api.dgfy.ph`) in the base compose — `<env>.env` must set
  the issuer, session-context, registration-intent, staff-invitation and token URLs explicitly.
- **Staging, one time:** `sudo bash connect-dgfy-staging.sh` on `sieitz-dgfy-remote` generates
  fresh DGLaundry keypairs, swaps DGFY's three trusted DGLaundry public keys (existing
  `run-oidc-setup.sh --apply` path, restores on failure), and adds the five secrets to the SOPS
  cache — copying DGFY's existing browser client secret root-to-SOPS so no one reads it
  (ADR 0060 Decision 7). `--check` is a no-change preflight. Afterwards copy the updated
  ciphertext back into `Sieitzz/dgfy-secrets` and dispatch the staging deploy.
- **Prod, one time (#2304):** prod has no installer, no `/etc/dgfy/dglaundry` tree and no
  `apply` (`scripts/dglaundry-connection-setup.mjs` deliberately refuses production,
  `PRODUCTION_APPLY_FORBIDDEN`, and that guard stays). DGFY's own five key files are already SOPS
  ciphertext in `/opt/dgfy-platform/secrets/` (#2303) and the OIDC clients are defined by
  `docker-compose.api.yml`'s environment block, so nothing is registered in a database. What is
  missing is DGLaundry's half, and `connect-dgfy-prod.sh` supplies it. Run on `ssh dgfy`, in this order:
  1. `sudo bash connect-dgfy-prod.sh --check` — changes nothing; proves every DGFY secret
     decrypts and has the right key type, DGLaundry's cache decrypts, and nothing is overwritten.
  2. `sudo bash connect-dgfy-prod.sh` — (uses the system `sops` when `/opt/dglaundry/bin/sops` is absent, as it is on prod) generates DGLaundry's three prod keypairs; adds the five
     DGFY secrets to `/opt/dglaundry/dgfy-secrets-cache/prod-dglaundry-secrets.env` (the client
     secret goes root-to-SOPS and is never printed); encrypts DGLaundry's machine-assertion,
     request-signing and event **public** keys into `/opt/dgfy-platform/secrets/` in the existing
     whole-file SOPS format. Any failure restores the cache and removes the files it created.
     It prints only public fingerprints and DGFY's two public keys for `prod.env`, and **never
     restarts anything**.
  3. Copy the updated ciphertext into `Sieitzz/dgfy-secrets`.
  4. Apply `host-patches/dgfy-prod-2304.patch` to `/opt/dgfy-platform` (`patch -p1 --dry-run`
     first, with the **host's** GNU `patch`, not macOS's -- BSD `patch` silently accepts fuzz that
     GNU rejects). It points DGFY at `dglaundry.dgfy.ph`, consumes the three new files and makes
     `DGLAUNDRY_INTEGRATION_ENABLED` default to true. The host's compose file is hand-edited, so
     re-check the dry run against the live file on the day: it was rebased on 2026-10-26 (#2834)
     after the 10-19 Expo push variables shifted hunk 1's context. Do not apply it before #2513 is
     in production (it was, as of release 2026-10-18-01): the boot validator pins the production
     redirect URI, so on an older image `deploy-sops.sh`'s pre-flight check would refuse the new
     URL (safely, before touching any container).
  5. Recreate **only** `dgfy-api`, without pulling images: a bare `./deploy-sops.sh` runs
     `docker compose pull` and recreates every service whose `:latest` moved. Use a copy of
     `deploy-sops.sh` with the pull skipped and the final line changed to
     `docker compose up -d --no-deps --pull never dgfy-api` (it still runs the boot-validator dry
     run first). Expect 7 files in `/run/dgfy-secrets` and `https://api.dgfy.ph/oidc/jwks` = 200.
     Backups: `*.pre-<issue>-<stamp>` beside the patched files; rollback is restoring them and
     repeating this step. Done on 2026-10-26 (#2834).
  6. `prod.env` already carries the production DGFY values (public keys, URLs, inbound client ID);
     only flip `DGLAUNDRY_DGFY_MODE` to `production` -- after the staging flow has passed -- and
     redeploy DGLaundry.
`provision-migration-identity.sh` runs as part of that same dispatch, once `mysql` reports
healthy and before `migrate` runs — it parses the already-decrypted `mysql_migration_url` secret
to derive the migration account's username/schema, and reads the MySQL root password from
*inside* the `mysql` container via its own already-mounted `mysql_root_password` secret, so
neither credential ever appears as an argv or env var on the host. Idempotent
(`CREATE USER IF NOT EXISTS` + `ALTER USER ... IDENTIFIED BY`) — safe on every re-dispatch. See
`Sieitzz/dglaundry`'s own `infrastructure/docker/MIGRATION_IDENTITY.md` for why this account must
stay schema-scoped and must never carry `SUPER`/`FILE`/unrestricted `PROCESS`/`GRANT OPTION`.

See `docs/architecture/adr/0060-sops-age-encrypted-secrets-at-rest.md` for the
full threat model this inherits (what SOPS does and does not protect
against), and `Sieitzz/dglaundry`'s own `infrastructure/docker/README.md` for
the base/lean/DGFY-overlay compose layering this script drives.
