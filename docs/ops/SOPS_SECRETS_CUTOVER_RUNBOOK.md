---
status: draft
authority_level: default
owner: architecture
date: 2026-08-13
last_reviewed: 2026-08-13
review_by: 2027-02-13
applies_to: production_deployment, secrets_management, ci_cd
topic: sops_secrets_cutover_runbook
---

# SOPS+age Production Secrets Cutover Runbook

Implements ADR 0060. **This is documentation, not an executed cutover** —
Pat's explicit sequencing: document now, execute later, rotate credentials
only after encryption is in place. Do not run any command in this runbook
against `/opt/dgfy-platform` without Pat's direct go-ahead for that specific
phase.

Every phase below either passed as a real command against the real server
this session (marked ✅ verified 2026-08-13) or is planned and marked
unverified — do not treat the unverified commands as tested.

## Server facts this runbook assumes (verified 2026-08-13)

- Ubuntu 24.04.4 LTS, x86_64, Docker 29.6.1 / Compose v5.2.0.
- `ssh dgfy` reaches the box as `pat`. `pat` has **no passwordless sudo**.
- `/opt/dgfy-platform` is **not a git checkout** — hand-maintained.
- `.env` is `pat:docker`, mode `0660` — `pat` can read and write it directly.
- `docker` group members (effectively root): `pat`, `gha`, `josh`,
  `sieitz-radney`. Any of these can read the age key once it exists.
- `sops`/`age` are **not installed**. `gpg` is present but unused by this
  design.
- Running containers (2026-08-13): `dgfy-api` (beta tag), `frontend` (latest),
  `frontend-beta` (beta), `nginx`, `redis`, `mysql`, `certbot`.
- **`docker-compose.yml` on the server has drifted from the repo** — see
  Phase 3.
- **MySQL is published `3306:3306`** on the live server, commented
  `# TEMPORARY! remove once fixed`. Not in the repo version.
- **11 stale `.env*` files** exist in `/opt/dgfy-platform/`: `.env.bak`,
  `.env.bak.20260706-093329`, `.env.bak.20260720-215135`,
  `.env.bak.20260728065243`, `.env.bak.20260801-093910`,
  `.env.bak-issue177-20260804T113003Z`,
  `.env.bak-issue205-20260803T100228Z`,
  `.env.bak-paymongo-live-keys-20260731T122258Z`,
  `.env.bak.pre-connection-budget`, `.env.save` (owned `josh:josh`).

## Appendix A — full 93-variable classification (method + result)

Method: every variable name in the live `.env` was grepped against
`apps/dgfy-api/src`, `apps/dgfy-api/config`, `apps/dgfy-migration-runner`,
`infrastructure/docker/docker-compose.yml`, and
`infrastructure/docker/nginx/nginx.conf.template`. Reproduce with:

```bash
while read -r v; do
  api=$(rg -c --no-messages -g '!node_modules' "\b$v\b" apps/dgfy-api/src apps/dgfy-api/config | wc -l)
  mig=$(rg -c --no-messages -g '!node_modules' "\b$v\b" apps/dgfy-migration-runner | wc -l)
  echo "$v api=$api mig=$mig"
done < vars.txt
```

**19 → `secrets/` (SOPS-encrypted).** 13 are unambiguous credentials; 6 more
(marked *bundled*) are low-sensitivity on their own (a client ID, a username,
a DSN) but grouped with the credential they pair with so rotating one
service's credentials is a one-file edit, not two:

| Variable | File | Why |
| --- | --- | --- |
| `DB_NAME` | `shared.env` | bundled — travels with `DB_PASSWORD` |
| `DB_USER` | `shared.env` | bundled — travels with `DB_PASSWORD` |
| `DB_PASSWORD` | `shared.env` | credential |
| `MYSQL_ROOT_PASSWORD` | `mysql.env` | credential |
| `JWT_SECRET` | `dgfy-api.env` | credential |
| `REFRESH_TOKEN_SECRET` | `dgfy-api.env` | credential |
| `ADMIN_PASSWORD_HASH` | `dgfy-api.env` | credential |
| `ADMIN_ACCOUNTS_JSON` | `dgfy-api.env` | contains credential material |
| `OPENAI_API_KEY` | `dgfy-api.env` | credential |
| `ORIGINAL_LEGACY_COMPANY_TOKEN` | `dgfy-api.env` | credential |
| `PAYMONGO_LIVE_SECRET_KEY` | `dgfy-api.env` | credential |
| `PAYMONGO_LIVE_WEBHOOK_SECRET` | `dgfy-api.env` | credential |
| `PAYMONGO_LIVE_PUBLIC_KEY` | `dgfy-api.env` | bundled — travels with the secret key |
| `PAYPAL_CLIENT_SECRET` | `dgfy-api.env` | credential |
| `PAYPAL_CLIENT_ID` | `dgfy-api.env` | bundled — travels with the client secret |
| `SMTP_PASS` | `dgfy-api.env` | credential |
| `SMTP_USER` | `dgfy-api.env` | bundled — travels with `SMTP_PASS` |
| `SENTRY_BACKEND_DSN` | `dgfy-api.env` | bundled — low blast radius alone (event-submit only), grouped for caution |
| `TENANT_PAYOUT_ENCRYPTION_KEY` | `dgfy-api.env` | credential, highest-value single secret in the set |

**4 → prune, do not migrate.** Zero source hits; ADR 0054 Decision 1 already
records these as removed along with the Brevo API fallback code path — they
are stale `.env` entries that outlived the code that read them:
`BREVO_API_KEY`, `BREVO_API_URL`, `EMAIL_DELIVERY_PROVIDER`,
`EMAIL_DELIVERY_FALLBACK_TO_BREVO_API`.

**1 → deduplicate.** `MENU_IMPORT_BATCH_ENABLED` appears twice in the live
`.env`. Bash's own `.env` parsing takes the *last* definition, so this has
not caused a live bug, but carrying two lines into the classified split would
silently pick one — collapse to one line during Phase 2.

**69 → stay in `.env` as non-secret config**, including the two variables
`.env` must keep regardless (Compose reads these for image-tag/interpolation
*before* any secret handling runs): `IMAGE_TAG`, `FRONTEND_PROD_IMAGE_TAG`.
Everything else in this bucket is a domain, feature flag, rate limit, or
timing value — full list is the live `.env`'s variable names minus the 19 + 4
+ 1 above.

## Phase 0 — Pre-flight (read-only, safe to run any time)

```bash
ssh dgfy 'cd /opt/dgfy-platform && docker compose config' > preflight-compose-config.txt
ssh dgfy 'docker ps --format "{{.Names}} {{.Image}}"' > preflight-images.txt
ssh dgfy 'docker ps --format "{{.Names}}" | xargs -I{} docker inspect {} --format "{{.Name}} {{.Image}}"' > preflight-digests.txt
ssh dgfy 'for c in $(docker ps --format "{{.Names}}"); do echo "== $c =="; docker exec "$c" env 2>/dev/null | sort; done' > preflight-live-env.txt
```

Confirm which account the CI deploy step actually uses (`SSH_TARGET` in the
`prod`/`beta` GitHub Environment secrets — check via repo settings, not
inferable from this runbook) and confirm that account is in the `docker`
group so it can read `/etc/dgfy/age/keys.txt` in Phase 5/6. *(Unverified —
requires GitHub Environment access to confirm the exact identity.)*

## Phase 1 — Install sops + age on the server

*(Unverified — not yet run on `dgfy`.)* No current Ubuntu apt package for
`sops`; install both from GitHub release binaries pinned to a specific
version (do not float `latest` in a script that runs unattended later):

```bash
ssh dgfy '
  set -euo pipefail
  cd /tmp
  curl -fsSLo age.tar.gz https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz
  tar xzf age.tar.gz
  sudo install -m 0755 age/age age/age-keygen /usr/local/bin/

  curl -fsSLo sops https://github.com/getsops/sops/releases/download/v3.9.4/sops-v3.9.4.linux.amd64
  sudo install -m 0755 sops /usr/local/bin/sops

  sops --version && age --version
'
```

Generate the key directly at its final location, root-owned, group-readable
by `docker`:

```bash
ssh dgfy '
  sudo mkdir -p /etc/dgfy/age
  sudo age-keygen -o /etc/dgfy/age/keys.txt
  sudo chown root:docker /etc/dgfy/age/keys.txt
  sudo chmod 0640 /etc/dgfy/age/keys.txt
  grep "public key:" /etc/dgfy/age/keys.txt   # safe to echo — paste into .sops.yaml
'
```

**Escrow before continuing.** Copy the file's contents into a Bitwarden
secure note titled clearly (e.g. "DGFY prod age key — break-glass only").
Then verify the escrowed copy actually works before trusting it:

```bash
echo "test=value" | sops --age "$(grep -oP 'public key: \K.*' /etc/dgfy/age/keys.txt)" \
  --input-type dotenv --output-type dotenv --encrypt /dev/stdin > /tmp/sops-escrow-test.env
SOPS_AGE_KEY="<paste the Bitwarden copy here>" sops decrypt --input-type dotenv /tmp/sops-escrow-test.env
# must print: test=value
rm /tmp/sops-escrow-test.env
```

## Phase 2 — Classify and encrypt (Pat runs this personally)

**AI boundary, from ADR 0060 Decision 7:** an AI session must not run the
commands in this phase against the real `.env` — not even as a blind pipe
that never displays a value. Pat performs this phase directly over `ssh
dgfy`. An AI session may write the `.sops.yaml` and script scaffolding
(below) using placeholder values, and may assist afterward with *rotating*
values once they're already in SOPS.

```bash
ssh dgfy
cd /opt/dgfy-platform
mkdir -p secrets
# Using Appendix A's classification: hand-split .env into
# secrets/shared.env, secrets/mysql.env, secrets/dgfy-api.env (plaintext,
# temporary) and a trimmed .env with the 4 dead vars removed and the
# MENU_IMPORT_BATCH_ENABLED duplicate collapsed to one line.

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
Decision 5 for the path-scoping shape). Keep a `.sops.yaml` in
`dgfy-platform` too, pointed at the same recipient, if local encrypt/decrypt
convenience from a laptop clone of `dgfy-platform` itself is wanted —
optional, decide at execution time.

## Phase 3 — Compose reconciliation

The live server and the repo have drifted **in both directions**. Do not
copy the repo file over the server file naively — reconcile:

- Present in repo, **missing on server**: `DB_MAX_CONNECTIONS`, all seven
  `SENTRY_*` passthrough vars on `dgfy-api`, the
  `./data/nginx/custom-storefronts:/etc/nginx/custom-storefronts:ro` mount on
  `nginx`.
- Present on server, **missing in repo**: the `frontend-beta` service block,
  five `*_PROD` domain vars on `nginx` (`SKUPERVISOR_DOMAIN_PROD`,
  `POS_DOMAIN_PROD`, `STOREFRONT_DOMAIN_PROD`, `STOREFRONT_ALT_DOMAIN_PROD`,
  `CERT_DOMAIN_PROD`), and the `3306:3306` MySQL port publication.

Full reconciled file, plus the `env_file: .env` → scoped `environment:`
rewrite, is in
`infrastructure/docker/env/prod.sops-cutover-fragment.yml`.

**Call out the MySQL port removal separately in the PR/commit that applies
this** — it is the one change in this phase that alters network reachability
rather than just secret handling, and is individually revertable if it turns
out something depends on host-level `3306` access.

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
diff <(docker compose config | yq '.services.dgfy-api.environment') \
     <(grep -A100 '== dgfy-platform-dgfy-api-1 ==' preflight-live-env.txt | ...)
```

**Zero diff on step 3 is the gate.** If anything differs, stop — do not
proceed to Phase 5 until the rendered environment is proven identical to
what's running today, service by service.

## Phase 5 — Cutover

```bash
cd /opt/dgfy-platform
cp .env .env.pre-sops && chmod 0600 .env.pre-sops
cp docker-compose.yml docker-compose.yml.pre-sops

docker compose down
# apply the reconciled docker-compose.yml from Phase 3
# apply the trimmed .env (secrets removed, dead vars pruned) from Phase 2
./deploy-sops.sh   # decrypt loop + docker compose up -d --remove-orphans, see below

docker compose ps
curl -fsS https://dgfy.ph/api/v1/health
curl -fsS https://beta.dgfy.ph/api/v1/health
# manual smoke test: log in on both dgfy.ph and beta.dgfy.ph
```

`deploy-sops.sh` (goes in `/opt/dgfy-platform/`, and is what
`publish-platform.yml` will call in Phase 6 — write it once, use it both
places):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

export SOPS_AGE_KEY_FILE=/etc/dgfy/age/keys.txt
SECRET_FILES=(secrets/shared.env secrets/mysql.env secrets/dgfy-api.env)

set -a
for f in "${SECRET_FILES[@]}"; do
  # read/export, NOT `source <(...)` -- source executes decrypted text as
  # bash script, corrupting any value containing a literal $ (e.g. a bcrypt
  # hash). See ADR 0060 Decision 6.
  while IFS='=' read -r key value; do
    export "$key=$value"
  done < <(sops decrypt --input-type dotenv "$f")
done
set +a

exec docker compose up -d --remove-orphans
```

## Phase 6 — CI verification

Do not consider the cutover done until a real deploy runs through
`.github/workflows/publish-platform.yml` and succeeds. See the CI section
below for the exact workflow edit this phase depends on.

## Phase 7 — Cleanup (only after Phase 6 passes)

```bash
ssh dgfy '
  cd /opt/dgfy-platform
  shred -u .env.bak .env.bak.20260706-093329 .env.bak.20260720-215135 \
    .env.bak.20260728065243 .env.bak.20260801-093910 \
    .env.bak-issue177-20260804T113003Z .env.bak-issue205-20260803T100228Z \
    .env.bak-paymongo-live-keys-20260731T122258Z .env.bak.pre-connection-budget
'
# .env.save is owned by josh -- needs josh or root to remove it:
ssh dgfy 'sudo shred -u /opt/dgfy-platform/.env.save'
```

`.env.pre-sops` (from Phase 5) is itself a plaintext secret dump — it is a
twelfth file of exactly this kind. **Track its removal as a distinct
checklist item with an explicit trigger**: delete it once Phase 6 has passed
*and* one subsequent, independent CI deploy has also succeeded (proof the
rollback copy is no longer needed, not just that the cutover looked fine
once).

```bash
ssh dgfy 'shred -u /opt/dgfy-platform/.env.pre-sops /opt/dgfy-platform/docker-compose.yml.pre-sops'
```

## Rollback

Rollback must work at every phase and must not depend on SOPS/age working —
it is a plain file restore, deliberately:

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
since moved (e.g. `beta`/`latest` re-pushed by an intervening deploy),
pin the rollback to the exact pre-cutover digests instead of the moving tag,
so rollback restores the *behavior* that was running, not just the file:

```bash
docker compose up -d --remove-orphans \
  --scale dgfy-api=0   # then re-pin with `image: <digest>` overrides if tags moved
```

Rollback does not require deleting `secrets/` or `/etc/dgfy/age/keys.txt` —
leaving them in place costs nothing and preserves the ability to retry the
cutover without repeating Phase 1/2.

## CI — `.github/workflows/publish-platform.yml`

See the companion note in this PR for the exact diff. Summary: the deploy
step's final two commands (`docker compose pull && docker compose up -d
--remove-orphans`) become a call to `./deploy-sops.sh` (which itself does
`docker compose up -d --remove-orphans` after decrypting — add a `docker
compose pull` before it, since `deploy-sops.sh` as written above assumes
images are already local/pullable via the existing `docker login` step). The
staleness guard (`COMPOSE_IMAGES=$(docker compose config --images)` check)
stays exactly where it is, **before** any decrypt step — it only inspects
`IMAGE_TAG`, which remains in plaintext `.env` and needs no secret access.
No new GitHub secret is required: the age key already lives on the server at
`/etc/dgfy/age/keys.txt`, and CI already authenticates as whichever account
`SSH_TARGET` names (confirm in Phase 0 that account is in the `docker`
group).

## Verification checklist for whoever executes this

- [ ] Phase 0 snapshots taken and reviewed before touching anything.
- [ ] Escrow copy in Bitwarden verified to actually decrypt (Phase 1).
- [ ] Appendix A classification re-confirmed against the *current* live
      `.env` at execution time — it may have changed since 2026-08-13.
- [ ] Phase 4's rendered-env diff is genuinely zero, per service, not just
      "looks about right."
- [ ] Phase 6 CI deploy is a real one, not a dry run.
- [ ] `.env.pre-sops` deletion tracked separately, not folded into Phase 7.
