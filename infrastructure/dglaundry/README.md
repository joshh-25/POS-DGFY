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
  README.md          # this file
  deploy-sops.sh      # ./deploy-sops.sh <stage|prod> -- decrypts secrets, brings the stack up
  stage.env           # non-secret config for staging (image digests, origin, migration head, ...)
  prod.env            # same shape, for production -- added when prod hosting is actually scoped
```

Secrets live in `Sieitzz/dgfy-secrets` under `stage/dglaundry/secrets.env` /
`prod/dglaundry/secrets.env` (SOPS-encrypted, isolated per-environment age
keys, never this repo) — see that repo's README and
`docs/architecture/adr/0060-sops-age-encrypted-secrets-at-rest.md` for the
mechanism. The age *private* key for each environment lives only on that
environment's own host (e.g. `/opt/dglaundry-stage/age/keys.txt` on
`sieitz-dgfy-remote`, `sieitz:sieitz 0600`) — deliberately **not**
`/etc/dgfy/age/keys.txt`, to keep this pilot fully isolated from
dgfy-platform's own (not yet executed) SOPS cutover for its *own* `.env`.

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

```sh
# one-time per environment, on the host itself (not this repo):
#   mkdir -p /opt/dglaundry-stage/{releases,secrets,public-keys,age,bin}
#   (sops + age installed under .../bin, age identity generated under .../age)
#   secrets/ is root:<dedicated-secrets-group> 0750

./infrastructure/dglaundry/deploy-sops.sh stage
```

See `docs/architecture/adr/0060-sops-age-encrypted-secrets-at-rest.md` for the
full threat model this inherits (what SOPS does and does not protect
against), and `Sieitzz/dglaundry`'s own `infrastructure/docker/README.md` for
the base/lean/DGFY-overlay compose layering this script drives.
