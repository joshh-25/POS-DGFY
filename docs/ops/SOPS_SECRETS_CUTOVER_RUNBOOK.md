---
status: draft
authority_level: default
owner: architecture
date: 2026-08-13
last_reviewed: 2026-08-28
review_by: 2027-02-28
applies_to: production_deployment, secrets_management, ci_cd
topic: sops_secrets_cutover_runbook
---

# SOPS+age Production Secrets Cutover Runbook

Implements ADR 0060. **This is documentation, not an executed cutover** —
Pat's explicit sequencing: document now, rehearse in a disposable VM, execute
on the real server only after the rehearsal passes end to end (including
rollback), rotate credentials only after encryption is in place. Do not run
any command in this runbook against `/opt/dgfy-platform` without Pat's direct
go-ahead for that specific phase.

Every phase below either passed as a real command against the real server
(marked ✅ verified, with a date) or is planned and marked unverified — do not
treat the unverified commands as tested.

## Server facts this runbook assumes (re-verified 2026-08-28)

- `ssh dgfy` reaches the box as `pat`, uid 1000, groups `pat, sudo, users,
  docker`. **`pat` has no passwordless sudo** — confirmed live, `sudo -n
  true` fails.
- `/opt/dgfy-platform` is **not a git checkout** — hand-maintained.
- `.env` is `pat:docker`, mode `0660`, currently **101 assignments, 100
  unique variable names** (one duplicate: `MENU_IMPORT_BATCH_ENABLED`).
- `docker` group members: `pat`, `gha`, `josh`, `sieitz-radney`
  (`getent group docker` → `docker:x:988:gha,pat,sieitz-radney,josh`). Any of
  these can read the age key once it exists — `gha` is the account CI
  deploys as, and it's already a member, so Phase 6 should work without
  further access changes; confirm `SSH_TARGET` in the PROD GitHub Environment
  actually resolves to `gha` before relying on this.
- `sops`/`age`/`age-keygen` **are installed** — `/usr/local/bin/{sops,age,age-keygen}`.
  The production age keypair exists at `/etc/dgfy/age/keys.txt`
  (`root:docker`, `0640`); public key
  `age1vn735dtf8lupv3djtur3le5mgqlql5x08hekq09r9u9p5g5zrs4s7sjsa4`.
- `secrets/` **does not exist yet** on the server (Phase 2 has never run).
- Running containers (2026-08-28, all healthy except `nginx` which has no
  healthcheck defined): `mysql`, `redis`, `dgfy-api`, `dgfy-ims`, `dgfy-pos`,
  `dgfy-storefront`, `nginx`, `certbot`. **`frontend`/`frontend-beta` are
  gone** — retired 2026-08-23 (#329/#894/#896), superseding this doc's
  2026-08-13 server-facts snapshot, which still listed them.
- `dgfy-api` image: `ghcr.io/sieitzz/dgfy-api:latest` @
  `sha256:05cb22347869083b24fc45323e2fbec39c7272e43623f8937795047cbf79ccca`,
  `linux/amd64`, built 2026-08-26.
- **`docker-compose.yml` on the server has drifted from the repo** — see
  Phase 3. One item matters beyond secrets handling: the live file still has
  `dgfy-api`'s `start_period: 30s`; the repo has carried `300s` since
  2026-08-25 (#1014, measured ~104s real boot). The live server was never
  updated. This cutover's reconciliation fixes that as a side effect.
- **MySQL is published `3306:3306`** on the live server, commented
  `# TEMPORARY! remove once fixed`. Not in the repo version. Not touched by
  this cutover — see #402.
- Disk: 79G total, **26G available**. `data/mysql` 2.9G, `data/dgfy-api`
  1.2G.
- Backups: `backups/` holds three ad-hoc files, newest DB dump 2026-08-10,
  newest file tarball 2026-07-12. **No cron — nothing is scheduled.** See
  "Backup and rollback, before this cutover runs" below.
- **12 stale `.env*` files** exist in `/opt/dgfy-platform/` today (one more
  than the 11 counted 2026-08-13 — `.env.pre-cutover-20260825024615` was
  added by an unrelated 2026-08-25 change): `.env.bak`,
  `.env.bak.20260706-093329`, `.env.bak.20260720-215135`,
  `.env.bak.20260728065243`, `.env.bak.20260801-093910`,
  `.env.bak-issue177-20260804T113003Z`, `.env.bak-issue205-20260803T100228Z`,
  `.env.bak-issue951-20260824T072541Z`,
  `.env.bak-paymongo-live-keys-20260731T122258Z`,
  `.env.bak.pre-connection-budget`, `.env.pre-cutover-20260825024615`,
  `.env.save` (owned `josh:josh`). Re-inventory at Phase 7 execution time —
  this list drifts between now and then.

## Variable classification

Superseded by two documents, in order:
`infrastructure/docker/env/prod.env-var-classification.md` (code-derived
full surface — 314 vars `dgfy-api` can read, all `BASE_REQUIRED_KEYS` traced)
reconciled against a **names-only** extraction from the live `.env`
(2026-08-28, zero values read — ADR 0060 Decision 7 governs values, not
names):

```bash
ssh dgfy "grep -oE '^[A-Z_][A-Z0-9_]*=' /opt/dgfy-platform/.env | tr -d '=' | sort -u"
```

The reconciled A/B/C bucket assignment (23 secret / 75 literal-in-compose /
2 mutable, 2 dropped) is written directly into
`infrastructure/docker/env/prod.sops-cutover-fragment.yml`'s EDIT 1–3 blocks
— that file is now the authoritative classification output, not this
runbook's own appendix. The old "Appendix A" (19/4/1/69, method: grep the
live `.env`'s names against source) undercounted because it could only
confirm or deny names already in `.env` — it never carried
`TENANT_SCHEMA_MUTATION_APPROVED`, which is why the original fragment draft
had no source for a var `entrypoint.sh` needs.

## Rehearsal — required before Phase 2 runs for real

Not part of the original runbook; added 2026-08-28 per Pat's direction that
this cutover be simulated end to end, including rollback, before it touches
production. Full procedure: the plan file for this initiative
(`/Users/pat/.claude/plans/let-s-plan-up-https-github-com-sieitzz-d-peaceful-parnas.md`
as of 2026-08-28 — read there for the exact steps, not restated here).

Summary: `do-not-commit/local-test` (the `ch` docker context's stack) is
already a full 7-service replica of the BEFORE state — real `env_file:
.env.compose`, real data. Stop it, then drive the same directory from the
`dgfy-secrets-poc` Lima VM (which already has `sops`/`age` installed) to
rehearse: build the five images inside that VM, generate a rehearsal-only
age keypair, populate `secrets/*.env` with **fixture values only** (never a
real production secret — ADR 0060 Decision 7), apply this runbook's own
Phase 3–5 steps against the rehearsal directory, and rehearse Phase 5's
rollback too. **An unrehearsed rollback is not a rollback.**

**Known and accepted limitation:** the VM is aarch64; the real images are
`linux/amd64`. The rehearsal validates configuration and mechanism, not the
exact production image bits.

## Backup and rollback, before this cutover runs

Distinct from — and a prerequisite to — this runbook's own Phase 5 rollback
(below), which only restores config files. Scoped to epic #492's #493
(backup automation), #494 (no pre-deploy DB backup), #495 (no rollback
mechanism), plus a gap not yet on any issue: the age key and ciphertext repo
have no backup story of their own.

Before Phase 5 runs for real:

- **Config backup** — `.env`, `docker-compose.yml`, `nginx/` → `.pre-sops`
  copies (Phase 5 already does this; treat it as non-optional even for a
  rehearsal).
- **Image digests pinned** — record the exact digest each service is
  running (see Server facts above for `dgfy-api`'s). If `:latest` moves
  before a rollback is needed, a file-only restore recovers the *file*, not
  the *behavior* that was running — pin to digests, not tags.
- **A fresh DB dump** — this cutover does not touch schema or data and
  `mysql` is not recreated when its four values resolve identically, but
  take one anyway (~3G against 26G free): closes the #494 gap this cutover
  would otherwise walk past.

**Stated plainly:** #495 remains open after this cutover. There is no
rollback mechanism for the container deploy path beyond the plain file
restore below. Do not imply a recovery path that does not exist.

## Phase 0 — Pre-flight (read-only, safe to run any time)

```bash
ssh dgfy 'cd /opt/dgfy-platform && docker compose config' > preflight-compose-config.txt
ssh dgfy 'docker ps --format "{{.Names}} {{.Image}}"' > preflight-images.txt
ssh dgfy 'docker ps --format "{{.Names}}" | xargs -I{} docker inspect {} --format "{{.Name}} {{.Image}}"' > preflight-digests.txt
ssh dgfy 'for c in $(docker ps --format "{{.Names}}"); do echo "== $c =="; docker exec "$c" env 2>/dev/null | sort; done' > preflight-live-env.txt
```

Confirm which account the CI deploy step actually uses (`SSH_TARGET` in the
PROD GitHub Environment — check via repo settings, not inferable here) and
confirm that account is in the `docker` group. `gha` already is (see Server
facts) — this only needs confirming `SSH_TARGET` actually names `gha`.

## Phase 1 — Install sops + age on the server

**✅ Done, 2026-08-13, still current as of 2026-08-28.**
`infrastructure/docker/scripts/setup-sops-age.sh` (committed, idempotent —
safe to re-run for a server rebuild) does the whole phase in one `sudo`
invocation: downloads age/sops pinned to a checked version, installs both to
`/usr/local/bin`, generates the keypair at `/etc/dgfy/age/keys.txt` (skips
regeneration if a key already exists), prints the public key, and walks
through Bitwarden escrow verification interactively.

```bash
scp infrastructure/docker/scripts/setup-sops-age.sh dgfy:/tmp/
ssh dgfy
sudo /tmp/setup-sops-age.sh
```

**Escrow status: still unresolved as of 2026-08-28.** Re-run the script's
interactive prompt to confirm the Bitwarden copy actually decrypts — it was
either completed or explicitly skipped when Phase 1 first ran, and that has
never been closed out. ADR 0060 Decision 3 is `binding`: a missing escrow
copy means a lost/corrupted server is unrecoverable secret loss, no
exceptions. **Do this before anything else in this runbook** — it is the
only step whose failure mode is permanent.

## Phase 2 — Classify and encrypt (Pat runs this personally)

**AI boundary, from ADR 0060 Decision 7:** an AI session must not run the
commands in this phase against the real `.env` — not even as a blind pipe
that never displays a value. Pat performs this phase directly over `ssh
dgfy`. An AI session may write `.sops.yaml` and script scaffolding using
placeholder values, and may assist afterward with *rotating* values once
they're already in SOPS.

```bash
ssh dgfy
cd /opt/dgfy-platform
mkdir -p secrets
# Using infrastructure/docker/env/prod.sops-cutover-fragment.yml's bucket-A
# list: hand-split .env into secrets/shared.env, secrets/mysql.env,
# secrets/dgfy-api.env (plaintext, temporary) and a trimmed .env with
# FRONTEND_PROD_IMAGE_TAG and the dead Brevo vars removed, the
# MENU_IMPORT_BATCH_ENABLED duplicate collapsed to one line, and the 75
# bucket-B vars removed once they're baked into docker-compose.yml as
# literals instead.

sops --age "$(grep -oP 'public key: \K.*' /etc/dgfy/age/keys.txt)" \
  --input-type dotenv --output-type dotenv --encrypt --in-place secrets/shared.env
sops --age "$(grep -oP 'public key: \K.*' /etc/dgfy/age/keys.txt)" \
  --input-type dotenv --output-type dotenv --encrypt --in-place secrets/mysql.env
sops --age "$(grep -oP 'public key: \K.*' /etc/dgfy/age/keys.txt)" \
  --input-type dotenv --output-type dotenv --encrypt --in-place secrets/dgfy-api.env

# Confirm ciphertext, not plaintext, is on disk before going further:
grep -c 'ENC\[' secrets/*.env   # each file should show hits
```

Once encrypted, mirror `secrets/` into `Sieitzz/dgfy-secrets` under
`prod/dgfy/` and add the corresponding `.sops.yaml` entry there (see ADR 0060
Decision 5 for the path-scoping shape). `dgfy-platform` itself also carries
a `.sops.yaml` pointed at the same recipient — see the "`.sops.yaml`
decision" section below.

## Phase 3 — Compose reconciliation

The live server and the repo have drifted **in both directions**. Do not
copy the repo file over the server file naively — reconcile using
`infrastructure/docker/env/prod.sops-cutover-fragment.yml`, which already
carries the resolved diff plus the bucket-A/B/C rewrite:

- Present in repo, **missing on server**: `DB_MAX_CONNECTIONS`, all seven
  `SENTRY_*` passthrough vars on `dgfy-api`, the
  `./data/nginx/custom-storefronts:/etc/nginx/custom-storefronts:ro` mount on
  `nginx`, and `dgfy-api`'s `start_period: 300s` (server still has `30s`,
  see Server facts).
- Present on server, **missing in repo**: the five `*_PROD` domain vars on
  `nginx` were true as of 2026-08-13 but have since landed in the repo
  (`docker-compose.yml:214-218`, 2026-08-23 #329/#401) — this drift item is
  resolved, not open. What remains open: the `3306:3306` MySQL port
  publication (#402, out of scope for this cutover).

**Call out the MySQL port removal separately in its own PR/commit** — it is
the one change in this area that alters network reachability rather than
just secret handling, and is individually revertable (#402).

## Phase 4 — Dry run (no service restart)

```bash
cd /opt/dgfy-platform

# 1. Ciphertext decrypts cleanly, values never touch disk:
sops decrypt --input-type dotenv secrets/shared.env > /dev/null
sops decrypt --input-type dotenv secrets/mysql.env > /dev/null
sops decrypt --input-type dotenv secrets/dgfy-api.env > /dev/null

# 2. Compose renders with no empty interpolations:
set -a
while IFS='=' read -r k v; do export "$k=$v"; done < <(sops decrypt --input-type dotenv secrets/shared.env)
while IFS='=' read -r k v; do export "$k=$v"; done < <(sops decrypt --input-type dotenv secrets/mysql.env)
while IFS='=' read -r k v; do export "$k=$v"; done < <(sops decrypt --input-type dotenv secrets/dgfy-api.env)
set +a
docker compose config > /tmp/post-sops-config.txt
grep -n '""' /tmp/post-sops-config.txt   # should be empty — no blank-interpolated values

# 3. Per-service rendered env matches the Phase 0 snapshot exactly:
diff <(docker compose config | yq '.services.dgfy-api.environment' | sort) \
     <(sed -n '/== dgfy-platform-dgfy-api-1 ==/,/== /p' preflight-live-env.txt | sed '1d;$d' | sort)

# 4. The in-image pre-flight gate itself, without touching a running container:
docker compose run --rm --no-deps --entrypoint node dgfy-api -e "
  const {validateProductionEnv,formatValidationFailure}=require('./src/config/productionEnvValidation.cjs');
  const r=validateProductionEnv({env:process.env});
  if(r.shouldFail){console.error(formatValidationFailure(r));process.exit(1);}
  console.log('OK');"
```

**Zero diff on step 3, and a clean pass on step 4, are the gate.** If
anything differs, stop — do not proceed to Phase 5 until the rendered
environment is proven identical to what's running today, service by
service, and the gate itself passes.

## Phase 5 — Cutover

**Do not run `docker compose down`** — that takes down TLS, the static
frontends, and MySQL along with the two services actually changing. Use a
targeted `up -d` instead; see the low-disruption sequence in the plan file
for the full per-service breakdown (`dgfy-api` and `dgfy-migration-runner`
recreated, `mysql` not recreated provided its four values resolve
identically, everything else untouched, `nginx` deliberately excluded from
this round).

```bash
cd /opt/dgfy-platform
cp .env .env.pre-sops && chmod 0600 .env.pre-sops
cp docker-compose.yml docker-compose.yml.pre-sops

# apply the reconciled docker-compose.yml from Phase 3 (the fragment's
# EDIT 1-3 blocks) and the trimmed .env from Phase 2 -- do NOT `down` first
./deploy-sops.sh   # decrypt loop + in-image pre-flight gate + targeted
                    # docker compose up -d --remove-orphans, see below

docker compose ps
# dgfy-api needs up to ~104s to report healthy -- do not call it failed early
curl -fsS https://dgfy.ph/api/v1/health
# NOT beta.dgfy.ph -- it 301-redirects to dgfy.ph since 2026-08-23, so a
# health check against it proves nothing about this cutover
# manual smoke test: log in on the live domain yourself
```

`deploy-sops.sh` is now a committed file —
`infrastructure/docker/scripts/deploy-sops.sh` — copied to
`/opt/dgfy-platform/deploy-sops.sh` on the server rather than hand-typed
here (as an earlier draft of this runbook had it, inline and without the
in-image pre-flight gate). Read that file directly for the current
contents; it is also what `publish-platform.yml` calls in Phase 6, so
there is exactly one copy of this logic to keep in sync, not two.

## Phase 6 — CI verification

Do not consider the cutover done until a real deploy runs through
`.github/workflows/publish-platform.yml` and succeeds, PROD-only, gated on
`inputs.environment == 'PROD'`. That workflow's own header carries a
`PLANNED, NOT YET LIVE` block until this phase actually passes — update it
once it does. No new GitHub secret is required: the age key already lives
on the server at `/etc/dgfy/age/keys.txt`, and `gha` (the account CI
deploys as) is already in the `docker` group.

## Phase 7 — Cleanup (only after Phase 6 passes)

Re-inventory the stale `.env*` file list at execution time — it drifts (see
Server facts; 12 files as of 2026-08-28, not the original 11).

```bash
ssh dgfy '
  cd /opt/dgfy-platform
  shred -u .env.bak .env.bak.20260706-093329 .env.bak.20260720-215135 \
    .env.bak.20260728065243 .env.bak.20260801-093910 \
    .env.bak-issue177-20260804T113003Z .env.bak-issue205-20260803T100228Z \
    .env.bak-issue951-20260824T072541Z \
    .env.bak-paymongo-live-keys-20260731T122258Z .env.bak.pre-connection-budget \
    .env.pre-cutover-20260825024615
'
# .env.save is owned by josh -- needs josh or root to remove it:
ssh dgfy 'sudo shred -u /opt/dgfy-platform/.env.save'
```

`.env.pre-sops` (from Phase 5) is itself a plaintext secret dump — it is a
thirteenth file of exactly this kind. **Track its removal as a distinct
checklist item with an explicit trigger**: delete it once Phase 6 has passed
*and* one subsequent, independent CI deploy has also succeeded (proof the
rollback copy is no longer needed, not just that the cutover looked fine
once).

```bash
ssh dgfy 'shred -u /opt/dgfy-platform/.env.pre-sops /opt/dgfy-platform/docker-compose.yml.pre-sops'
```

## Rollback

Rollback must work at every phase and must not depend on SOPS/age working —
it is a plain file restore, deliberately, with **no rollback mechanism for
the deploy path itself** (#495 is open — this is the only recovery there
is):

```bash
ssh dgfy '
  cd /opt/dgfy-platform
  docker compose down
  cp .env.pre-sops .env
  cp docker-compose.yml.pre-sops docker-compose.yml
  docker compose up -d --remove-orphans
'
```

If the Phase 0 digest snapshot (`preflight-digests.txt`) shows tags have
since moved (e.g. `latest` re-pushed by an intervening deploy — #1130
merging before this cutover runs would do exactly that), pin the rollback
to the exact pre-cutover digests instead of the moving tag, so rollback
restores the *behavior* that was running, not just the file.

Rollback does not require deleting `secrets/` or `/etc/dgfy/age/keys.txt` —
leaving them in place costs nothing and preserves the ability to retry the
cutover without repeating Phase 1/2.

## CI — `.github/workflows/publish-platform.yml`

Summary: the PROD deploy step's final two commands (`docker compose pull &&
docker compose up -d --remove-orphans`) become a call to `./deploy-sops.sh`,
**gated on `inputs.environment == 'PROD'`** — DEV/STAGING keep today's path
unconditionally, since `deploy-sops.sh`, `secrets/`, and an age key exist on
none of those boxes. The staleness guard (`COMPOSE_IMAGES=$(docker compose
config --images)` check) stays exactly where it is, **before** any decrypt
step. This PR merges last, after the server-side phases have run and
verified — see the plan file's "Order of execution."

## `.sops.yaml` decision

`dgfy-platform` carries its own `.sops.yaml`, pointed at the same production
age recipient as `Sieitzz/dgfy-secrets/.sops.yaml`, for local encrypt/decrypt
convenience from a laptop clone (rehearsal iteration, reviewing ciphertext
structure without needing the secrets repo checked out too). The
authoritative copy — the one CI and the server actually trust — remains
`Sieitzz/dgfy-secrets/.sops.yaml`; this repo's copy is a convenience mirror,
not a second source of truth, and must be kept identical to it.

## Verification checklist for whoever executes this

- [ ] The rehearsal (see "Rehearsal" above) has passed end to end, including
      rollback.
- [ ] Phase 0 snapshots taken and reviewed before touching anything.
- [ ] Escrow copy in Bitwarden verified to actually decrypt (Phase 1).
- [ ] Classification re-confirmed against the *current* live `.env` at
      execution time — names, not just the 2026-08-28 snapshot.
- [ ] Phase 4's rendered-env diff is genuinely zero, per service, and the
      in-image pre-flight gate passes.
- [ ] Backup/rollback prerequisites taken (config backup, digests pinned, a
      fresh DB dump) — see "Backup and rollback, before this cutover runs."
- [ ] Phase 6 CI deploy is a real one, not a dry run.
- [ ] `.env.pre-sops` deletion tracked separately, not folded into Phase 7.
