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
  remote-deploy-stage.sh              # runs ON the host: GHCR login -> pull -> up mysql -> migrate+up api/worker/gateway -> logout
  stage.env                           # non-secret config for staging (image digests, origin, migration head, ...)
  prod.env                            # same shape, for production -- added when prod hosting is actually scoped
  compose/<release-sha>/
    docker-compose.production.yml     # vendored verbatim from Sieitzz/dglaundry at that exact pinned SHA -- only this
                                       # file; docker-compose.surebizcorp-lean.yml is deliberately NOT vendored (see
                                       # remote-deploy-stage.sh's header comment -- it needs several live DGFY
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
environment's own host (e.g. `/opt/dglaundry-stage/age/keys.txt` on
`sieitz-dgfy-remote`) — deliberately **not** `/etc/dgfy/age/keys.txt`, to keep this pilot fully
isolated from dgfy-platform's own (not yet executed) SOPS cutover for its *own* `.env`.

## Deploying: GitHub Actions, no GHCR credential ever stored on the host

`.github/workflows/deploy-dglaundry.yml` (`workflow_dispatch`, `confirm` checkbox required) does
the pull + compose-up sequence that `deploy-sops.sh` deliberately stops short of (see "Running it"
below). It logs in to GHCR **ephemerally** — the token is piped over the SSH connection's stdin
into `docker login --password-stdin` on the host, never passed as an argv or env var there, and
`remote-deploy-stage.sh` logs back out via a `trap ... EXIT` that fires on every exit path,
success or failure, so a mid-deploy failure can never leave a working credential sitting in
`~/.docker/config.json` indefinitely.

Treated as its own app/server throughout, not folded into dgfy-platform's existing deploy
pipeline (`deployment-orchestrator.yml`/`publish-platform.yml`) even though it currently lands on
the same physical box:

- **its own GitHub Environment**, `DGLAUNDRY_STAGE`, with its own `SSH_PRIVATE_KEY`/`SSH_TARGET`
  secrets — independent of the `STAGING` environment dgfy-platform's own deploys use, so a
  leaked/compromised key on either side can't reach the other's deploy path. `SSH_TARGET` still
  points at `sieitz@10.123.32.26` — same user, same host as dgfy-platform's own STAGING deploys
  (see "Why one shared OS user" below) — only the key itself is independent.
- **its own GHCR package-level Actions-access grant** — each of `Sieitzz/dglaundry`'s three
  `dglaundry-{api,web,worker}` packages grants `Sieitzz/dgfy-platform` read access directly in
  GHCR's own package settings (package → Settings → "Manage Actions access"). No PAT, no new
  stored secret, scoped to exactly those three packages — this is the only way
  `secrets.GITHUB_TOKEN` can pull a private package published from a *different* repo.

### Why one shared OS user, not a dedicated `dglaundry` account

An earlier version of this plan called for a dedicated, unprivileged `dglaundry` OS user,
docker-group-only, owning `/opt/dglaundry-stage` outright. Dropped (Pat's call, #2387) once two
facts were on the table together: **this host already runs every app — DGFY's own DEV/STAGING
stacks, and prod too — as one shared `sieitz` user, with no per-app OS split anywhere**; and
**`docker` group membership is root-equivalent regardless of which user holds it** (`docker run -v
/:/host ... chroot /host sh` reaches real root), so a second, docker-group OS user wouldn't have
been a real trust boundary against a determined compromise — only against accidental cross-
contamination. Weighed against the extra setup/rotation cost of a second account and keypair, for
a staging pilot, it wasn't worth it. `secrets/` is `sieitz:sieitz 0700` accordingly — not the
earlier `root:dglaundry-secrets`-group scheme (that group had zero members and would have blocked
`deploy-sops.sh` from writing to it entirely).

What *does* stay independent: the `DGLAUNDRY_STAGE` GitHub Environment and its own SSH keypair
(above), and the GHCR package grant (below) — those are cheap to keep separate and still let a
leaked DGLaundry-workflow credential be revoked without touching dgfy-platform's own deploy
secrets. If real OS-level isolation is wanted later (most plausibly for prod), the mechanism that
would actually deliver it is rootless Docker or a user-namespaced context per app, not a second
Linux user sharing the same `docker` group — out of scope here, flagged as a deliberate non-goal.

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
check out compose files or run `docker compose` itself. `deploy-dglaundry.yml` is what actually
does that, end to end, via `remote-deploy-stage.sh`:

```sh
# one-time per environment, on the host itself (not this repo), as `sieitz` (the one shared user
# every app's deploys run as on this host -- see "Why one shared OS user" above):
#   mkdir -p /opt/dglaundry-stage/{releases,secrets,public-keys,age,bin,dgfy-secrets-cache}
#   (sops + age installed under .../bin, age identity generated under .../age)
#   secrets/ is sieitz:sieitz 0700 -- owned outright by the one user that ever touches it
#   dgfy-secrets-cache/stage-dglaundry-secrets.env synced in from Sieitzz/dgfy-secrets's
#   stage/dglaundry/secrets.env once, or on each rotation (deploy-sops.sh never fetches this
#   itself -- no GitHub credential is provisioned on the host for that, deliberately)
#
#   Two EXTERNAL Docker networks must also exist before the first dispatch -- the vendored
#   compose file declares both `external: true` on purpose (so this Compose project can never
#   create or widen them itself) and never creates them; docker-compose.proxy.yml's own comment
#   already called this out as "must be created by the deployment owner" but nothing had done it
#   (caught live on the first real dispatch, #2387). Names come from stage.env's
#   DGLAUNDRY_EDGE_NETWORK / DGLAUNDRY_EGRESS_NETWORK -- read the actual values from that file
#   rather than assuming the compose file's bare defaults, since stage.env overrides the egress
#   one:
#     docker network create "$(grep -m1 '^DGLAUNDRY_EDGE_NETWORK=' stage.env | cut -d= -f2)"
#     docker network create "$(grep -m1 '^DGLAUNDRY_EGRESS_NETWORK=' stage.env | cut -d= -f2)"

gh workflow run deploy-dglaundry.yml -f confirm=true
```

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
