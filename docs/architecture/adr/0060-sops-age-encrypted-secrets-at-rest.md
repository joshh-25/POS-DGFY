---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-13
last_reviewed: 2026-08-31
review_by: 2027-02-13
applies_to: production_deployment, secrets_management, ci_cd
topic: sops_age_encrypted_secrets_at_rest
---

# ADR 0060: SOPS+age Encrypted Secrets At Rest

## Status

Accepted (2026-08-13). Planning/documentation only — see Amendments for the
implementation gate.

## Context

Production (`dgfy.ph` + `beta.dgfy.ph`, one Linode VPS, plain `docker
compose`, no Swarm) keeps all 93 environment variables — real database
credentials, `JWT_SECRET`/`REFRESH_TOKEN_SECRET`, `PAYMONGO_LIVE_SECRET_KEY`,
`OPENAI_API_KEY`, `SMTP_PASS`, `TENANT_PAYOUT_ENCRYPTION_KEY`, and more — in
one plaintext `/opt/dgfy-platform/.env`. Both backend services
(`dgfy-api`, `dgfy-migration-runner`) receive the **entire** file via a
blanket `env_file: .env`, regardless of which variables they actually use.

This is not hypothetical risk. Issue #239 recorded a real incident: live
PayMongo test keys were pasted in plaintext into a committed doc
(`docs/setup/COLLABORATOR_LOCAL_ENV.md`) and into the GitHub issue describing
the problem, both later redacted (PR #394, and a direct edit to #239's body).
The root cause in both cases was the same: a plaintext secret sitting
somewhere an AI agent or collaborator could read it in the course of
unrelated work, with no signal distinguishing "safe to read" from "safe to
see the value of."

A SOPS+age mechanism was built and verified end-to-end on 2026-08-13 in a
disposable Lima VM (`do-not-commit/local-test-secrets-poc/`), proving:
ciphertext is inert at rest while keys stay legible for diffs; per-service
scoping eliminates blanket access; the app boots and connects to
MySQL/Redis on injected secrets; a `$`-bearing bcrypt hash survives byte-exact
through explicit `environment:` interpolation (the `env_file:`-based
double-`$$`-escaping problem in `do-not-commit/local-test` does not
reproduce); and rotation works through SOPS's real decrypt-into-`$EDITOR`
mechanism. Results posted to #360.

### Options considered

- **Docker Swarm secrets.** Real encryption-at-rest for secret values via
  `docker secret create`, and `docker swarm init` works on a single node with
  no additional workers. Rejected for now: `docker stack deploy` only
  understands the legacy Compose v3 schema, not the Compose Specification
  format the current `docker-compose.yml` already uses (no `version:` key) —
  adopting it is a real schema migration, not an additive change, and does
  not fit the "documentation now, cutover later" scope of this decision.
- **Cloud secrets manager (previously scoped: Akamai Secrets Manager).**
  Rejected — the infrastructure direction is consolidating onto a single VPS
  shared across Sieitz apps, not expanding into a managed multi-cloud
  control plane. A per-provider secrets API is the wrong shape for that
  target topology.
- **HashiCorp Vault.** Rejected as disproportionate: Vault's operational
  surface (a server process, unseal/token lifecycle, its own HA story) is
  built for a scale and team size this deployment does not have.
- **SOPS + PGP.** Same envelope-encryption model as SOPS+age, but shells out
  to the system `gpg` binary by default and depends on `gpg-agent`
  key/passphrase handling, which is a known source of flakiness in
  unattended CI. Rejected in favor of age, which SOPS links as a Go library
  with no external process.
- **SOPS + SSH key (ssh-rsa/ssh-ed25519) as the age recipient.** SOPS
  supports this directly. Rejected for the primary key: it requires a
  passphrase-less private key file, which is a materially weaker resting
  state than an age identity kept in a permissioned file with no separate
  vault-custody requirement.

## Decision

1. **SOPS + age is the secrets-at-rest mechanism for the DGFY production
   VPS.** `sops` performs envelope encryption: one random AES-256-GCM data
   key per file, wrapped per-recipient using age (X25519). For `.env`-format
   files, only values are encrypted — keys stay cleartext, so diffs on
   secret *changes* stay meaningful. `default`
2. **Split by secrecy, not only by service.** Superseded 2026-08-28 (see
   Amendments) — the non-secret majority no longer stays in `.env` at all;
   it becomes literal values in `docker-compose.yml` instead, and there are
   three buckets, not two. Original text, for history: "Of the 93 current
   variables, roughly 18 are genuine secrets; the rest are non-secret
   configuration (domains, feature flags, rate limits, image tags).
   `/opt/dgfy-platform/.env` continues to hold the non-secret ~75 and
   continues to serve as Compose's `${VAR}` interpolation source for
   `IMAGE_TAG`/`FRONTEND_PROD_IMAGE_TAG`/nginx domain vars. The ~18 secrets
   move into SOPS-encrypted files under a new `secrets/` directory, split
   further by which service needs them (`shared.env` for
   `DB_NAME`/`DB_USER`/`DB_PASSWORD`, used by three services; `mysql.env`;
   `dgfy-api.env`)." `default`
3. **One escrowed age key, generated on the server, not distributed to
   individual operators as a second recipient.** Lives at
   `/etc/dgfy/age/keys.txt` (`root:docker`, `0640`). A break-glass copy is
   held in a Bitwarden secure note for disaster recovery only — if the VPS
   is lost and no other copy of the key exists, every encrypted secret is
   permanently unrecoverable. `binding` — losing the only copy of this key
   is a data-loss event with no recovery path; the escrow copy is the
   control that prevents it.
4. **Ciphertext lives in a separate private repository** (`Sieitzz/dgfy-secrets`),
   not in `dgfy-platform`. `dgfy-platform` is cloned routinely by
   collaborators and worker AI agents; committing ciphertext there would
   hand every one of them a permanent, full-history copy, so a future age
   key leak would retroactively expose every secret ever rotated away from.
   `.sops.yaml` and the deploy tooling remain in `dgfy-platform`; only
   ciphertext and its own `.sops.yaml` recipient mapping live in
   `dgfy-secrets`. `default`
5. **Key scoping is per path-regex in `.sops.yaml`, enabling per-application
   isolation.** A key that decrypts `prod/dgfy/*` is not a recipient for any
   other path. This is intentionally load-bearing beyond this one
   application: `dgfy-secrets` is expected to also hold Fastlane/Expo Apple
   signing material and Google service-account keyfiles for other Sieitz
   apps, each under its own path with its own recipient key. `default`
6. **Decrypted values are exported into the deploy shell's environment, never
   written to a plaintext file, and never sourced as shell script.** The
   deploy script reads each decrypted line with `read -r key value` +
   `export "$key=$value"` — not `source <(sops decrypt ...)`, which executes
   decrypted output as bash and corrupts any value containing a literal `$`
   (e.g. a bcrypt hash), as found and fixed during the POC. `binding` — this
   is a correctness requirement for every secret value, not a style
   preference; reintroducing `source` silently corrupts values containing
   `$`.
7. **AI agents may read ciphertext and may assist with rotating a secret to
   a new value. An AI agent must not extract or transcribe an existing real
   secret value from the live server during the migration itself**, even via
   a command whose output is never displayed — the execution environment has
   full read access in that moment regardless of what a transcript shows,
   and a failed/interrupted command risks the plaintext value landing in the
   transcript itself, which is a worse outcome than the status quo. The
   one-time move of existing real values out of `/opt/dgfy-platform/.env`
   into SOPS is performed by a human operator directly. `binding` — this
   protects against exactly the failure mode #239 already demonstrated.

## Threat model — what this does and does not protect

**Protects against:** secrets appearing in git history, committed docs,
GitHub issues/PRs, AI agent transcripts, or ad hoc file backups — the exact
mechanism behind #239.

**Does not protect against:**

- **A running container's live process environment.** `docker exec <container>
  env` and `docker inspect` expose decrypted values for the container's
  entire runtime, identical to today's plaintext `.env` exposure once a
  container has started. Envelope encryption protects data at rest, not a
  live process.
- **Any of the four accounts in the server's `docker` group** (`pat`, `gha`,
  `josh`, `sieitz-radney` as of 2026-08-13). Group membership in `docker` is
  equivalent to root — any of these accounts can read
  `/etc/dgfy/age/keys.txt` directly. SOPS narrows *who and what* can
  routinely see secret values in the course of unrelated work; it does not
  create a security boundary between accounts that already have host
  access.
- **A single leaked age key compromising everything encrypted to it.** Unlike
  KMS-backed per-secret IAM, one age identity decrypts every file it is a
  recipient of. Blast radius is bounded by path-scoping recipients per
  application (Decision 5), not by anything finer-grained within one
  application's secrets.

## Consequences

- `/opt/dgfy-platform/docker-compose.yml` drops both `env_file: .env` lines
  in favor of explicit, scoped `environment:` blocks per service — see
  `infrastructure/docker/env/prod.sops-cutover-fragment.yml` and
  `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md`.
- `.github/workflows/publish-platform.yml`'s deploy step gains a decrypt stage
  before `docker compose up -d`; no new GitHub secret is required since the
  age key lives on the server and CI already authenticates over SSH.
- Rotating `DB_USER`/`DB_PASSWORD` becomes a single-file edit
  (`secrets/shared.env`) instead of three, correcting a structural flaw the
  POC surfaced when each service had its own independently-encrypted copy.
- This ADR does not itself change production. Implementation, rollback
  planning, and execution are tracked separately (#360 and its child
  issues); see the runbook for the phased cutover and rollback plan.

## Amendments

### 2026-08-23 — beta.dgfy.ph retired

The Context section's framing of production as "`dgfy.ph` + `beta.dgfy.ph`, one Linode VPS" is now
stale: `beta.dgfy.ph` was retired (#329/#894/#896) and its three hostnames now `301`-redirect
straight to their `dgfy.ph` equivalents at the nginx layer — there is no longer a second
domain-group serving its own frontend or its own secrets. This is a scope correction only, not a
substantive change to this ADR's decisions: it was always one server, one `.env`, one set of
backend secrets shared across whatever domains nginx routed to it — retiring beta narrows that
routing, it doesn't change the secrets-management shape this ADR governs. No `binding` clause is
affected; the single-file/scoped-`environment:` decisions and the threat model both hold unchanged.
`docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md` and `infrastructure/docker/env/prod.sops-cutover-fragment.yml`
should be read against the current (post-retirement) `docker-compose.yml`/`.env` shape when the
real cutover executes, not against the four-domain-group state this ADR was originally written
against.

### 2026-08-28 — Decision 2 refined: three buckets, literals in compose, PROD-only CI scope

Supersedes Decision 2's original 2-bucket split (untagged/`default`-tier, so
this is an amendment per ADR 0039, not a new ADR — no `binding` clause is
touched). Pat's own framing was that non-secret config should live directly
in `docker-compose.yml`, not in a thinner `.env` — giving it a git audit
trail the way the secrets already get one from SOPS diffs.

**Three buckets now, not two:**

- **A — secrets.** SOPS-encrypted `secrets/*.env`, referenced as `${VAR}`.
  Unchanged in mechanism from the original Decision 2, just re-scoped: 23
  vars (not ~18), split `shared.env`/`mysql.env`/`dgfy-api.env` exactly as
  before.
- **B — static non-secret config.** Now **literal values directly in
  `docker-compose.yml`** (via the committed prod fragment,
  `infrastructure/docker/env/prod.sops-cutover-fragment.yml`), not a thinner
  `.env`. 75 vars. This is the change: config edits become a reviewable git
  diff on the fragment file, the same audit-trail property secrets already
  had from SOPS.
- **C — mutable / CI-injected.** `IMAGE_TAG` (hand-maintained on the server,
  confirmed **not** CI-written — a correction to an earlier working
  assumption) and `SENTRY_RELEASE` (confirmed injected as a shell variable
  by `publish-platform.yml` per deploy, not present in the live `.env` at
  all). Both stay `${VAR}` with their existing defaults, never literals.

**The actual split, reconciled against a live 2026-08-28 names-only
extraction of the production `.env` (100 unique names, zero values read —
this Decision governs values, not names, so a names-only read doesn't cross
Decision 7's boundary): 23 secret / 75 literal-in-compose / 2 mutable, with
2 names dropped** (a duplicate `MENU_IMPORT_BATCH_ENABLED` line, and
`FRONTEND_PROD_IMAGE_TAG`, vestigial since the 2026-08-25 frontend-split
restart) — not the "roughly 18/75" originally estimated. `FRONTEND_PROD_IMAGE_TAG`
no longer appears anywhere in the cutover artifacts as a live reference.

**CI scope also narrowed, not part of the original Decision 2 text at all:**
`.github/workflows/publish-platform.yml`'s SOPS path applies to **PROD
only**, gated on `inputs.environment == 'PROD'`. That workflow is shared by
all three environments; an unconditional swap would break the next
DEV/STAGING deploy, since `deploy-sops.sh`, `secrets/`, and an age key exist
on none of those boxes.

With `/opt/dgfy-platform/.env` no longer holding bucket-B config, its role
narrows to (at most) `IMAGE_TAG` — arguably droppable entirely, since PROD
already runs the `${IMAGE_TAG:-latest}` default. **No root `.env` file** is
now the target end state, matching Pat's original framing for this
refinement.

### 2026-08-29 — Real cutover incident: 3 bucket-B values wrongly hardcoded, not read from `.env`

Found during Phase 183's live execution (`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`), via a
manual post-cutover smoke test — not caught by the pre-flight gate, since none of the three
produced an invalid-environment error, just wrong runtime behavior.

The compose-reconciliation tooling classified `CORS_ORIGIN`, `TEMP_FILE_STORAGE`, and
`RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` as bucket-B "policy literals" — assumed/deduced values
independent of the live `.env` — rather than reading their actual live values, the treatment every
other bucket-B var correctly got. This was wrong for all three:

- **`CORS_ORIGIN`** was assumed to be the single value `https://dgfy.ph`. The real live value was
  a comma-separated list of 7 origins (`pos.dgfy.ph`, `skupervisor.dgfy.ph`, three `*.beta.dgfy.ph`
  entries, a custom domain `bar.space.com.ph`, and `dgfy.ph` itself). Every request from a
  non-bare-domain origin was rejected with `CORS_NOT_ALLOWED` until this was caught live and fixed
  directly on the server.
- **`TEMP_FILE_STORAGE`** was assumed to be `local`; the real value was `auto`. Silent — no
  validator error, since both are valid enum members, just a runtime behavior difference.
- **`RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS`** was assumed to be `"900000"` (15 min); the real
  value was `"3600000"` (1 hour). Also silent, same reason.

**Fix:** all three are now `<copy literal from live .env>` placeholders in
`infrastructure/docker/env/prod.sops-cutover-fragment.yml`, matching every other genuinely
non-deducible bucket-B value — not hardcoded. The remaining bucket-B-hardcode set (`NODE_ENV`,
`HOSTING_PROFILE`, `SESSION_COOKIE_SECURE`, `AUTH_BLACKLIST_FAILURE_MODE`,
`RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS`, `TENANT_SCHEMA_MUTATION_APPROVED`, `PAYMONGO_MODE`,
`PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS`) was individually audited against the live `.env` after this was
found and confirmed to genuinely match — not merely re-asserted.

**Lesson for future work in this space:** a "policy literal" classification is only safe when the
value is *independently derivable* (e.g. `NODE_ENV: production` needs no external source of
truth). Anything that could plausibly have been configured differently per-deployment — even
something that looks like an obvious single value, like a CORS origin — belongs in the "read from
the live source, never assume" bucket, full stop. No `binding` clause is affected; this is an
implementation-tooling correction, not a decision reversal.

### 2026-08-29 — Phase 184 incident: `secrets/*.env` group ownership blocked the CI deploy account

Found during Phase 184's first live `deploy-main.yml` PROD run
(`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`). Not a values/corruption issue — a file-permissions
gap that Phase 183's manual, `pat`-run cutover had no way to surface.

Runbook Phase 2 (`phase182.sh encrypt`, run personally by Pat per Decision 7) created
`secrets/{mysql,shared,dgfy-api}.env` with default ownership: `pat:pat`, mode `640`. That's correct
for `pat`'s own manual runs — the file is readable by its owner and by anyone else in the `pat`
group (nobody). It silently excludes the CI deploy account: `gha`'s groups are `gha`, `users`,
`docker` — not `pat`. `deploy-sops.sh`'s decrypt loop (`sops decrypt --input-type dotenv "$f"`, fed
into a `while read` export loop, never `source` — per Decision 6) failed permission-denied for
`gha` on all three files; the loop got zero stdin and exported nothing, so the assembled
environment came up empty. The in-image pre-flight gate correctly caught this and refused to
deploy — but its error text (`ADMIN_ACCOUNTS_JSON account 0 requires a username and valid bcrypt
password hash`) is identical in shape to Phase 183's real bcrypt-doubling data bug, so the two
failure classes are indistinguishable from the gate's error message alone. Diagnosing which one
actually occurred needs a permissions check (`ls -la`, `id`/`groups` — no secret values) before
assuming a data-corruption repeat.

**Fix:** `chgrp docker` + `chmod 640` on all three `secrets/*.env` files — no `sudo` required, since
a file's own owner may `chgrp` it to any group they belong to, and `pat` is already in `docker`.
Matches the scoping already used for `/etc/dgfy/age/keys.txt` (`root:docker 0640`) — `docker`
already contains both `pat` and `gha`, so this is consistent with, not a widening of, the existing
key-file access model.

**Lesson for future work in this space:** any file Runbook Phase 2 (or an equivalent manual step)
creates on the server must be group-owned `docker`, not left at its default per-user ownership, the
moment more than one account (a human operator and a CI service account, at minimum) needs to read
it. Verify this explicitly as part of Phase 2's own completion check next time, rather than
discovering it only when a different account first attempts a real deploy. No `binding` clause is
affected — Decision 6 and Decision 7 were both already correctly implemented; this is a file-mode
gap in Phase 2's execution, not a design flaw in either decision.

### 2026-08-31 — nginx's domain vars literal-ized, `.env` fully retired, compose split into 5 files (#1236)

The 2026-08-28 amendment above ("three buckets, literals in compose") landed EDIT 1-3 on
`dgfy-api`/`dgfy-migration-runner`/`mysql` the same day, but left `nginx`'s 11 domain vars
(`SKUPERVISOR_DOMAIN`, `POS_DOMAIN`, `STOREFRONT_DOMAIN`, `CERT_DOMAIN`, `DGFY_API_DOMAIN`, and
their `_PROD`/`_ALT` variants) `${VAR}`-interpolated from `.env`, deferred to #401. That amendment's
own "at most `IMAGE_TAG`" end-state language for `.env` was written against that gap still being
open — a #1155/#1236 audit found it was never closed, and separately that the `.env` cleanup delta
the fragment itself specified (stripping now-redundant bucket-A/dead vars once baked elsewhere) was
never executed either: live `.env` still held all ~100 original names, including inert plaintext
copies of every bucket-A secret, as of 2026-08-31.

**Corrected end state:** `infrastructure/docker/env/prod.sops-cutover-fragment.yml`'s EDIT 4
literal-izes nginx's 11 domain vars the same way EDIT 3 already did for `dgfy-api`, closing #401's
compose half. With EDIT 4 applied, **`.env` has zero remaining consumers on PROD** — not "at most
`IMAGE_TAG`" — since bucket C (`IMAGE_TAG`, every `SENTRY_*` var) already resolves from a
`${VAR:-default}` fallback in the compose file itself and is already shell-exported per-deploy by
`publish-platform.yml` or left at its default, never read from `.env`. The corrected instruction is
to delete `.env` outright once EDIT 4 is live and verified, not trim it.

**Compose file split (#1236):** alongside EDIT 4, both `infrastructure/docker/docker-compose.yml`
(the generic, multi-environment template used by DEV/QA/staging) and PROD's own hand-maintained
mirror are split into 5 files via Compose's top-level `include:` directive — an entry file
(`name:`, `networks:`, `mysql`, `redis`, `include:`) plus `docker-compose.migration.yml` /
`docker-compose.api.yml` / `docker-compose.frontend.yml` / `docker-compose.proxy.yml`. Confirmed
against current Compose documentation and by direct `docker compose config` validation that this
split is transparent to every existing caller (`publish-platform.yml`, `deploy-sops.sh`,
`verify-deployment.yml` all just `cd $DOCKER_DIR && docker compose ...`, none pass `-f` flags) and
that host/shell-exported env always takes precedence over `.env` regardless of file count — the
split does not change how `deploy-sops.sh`'s secrets mechanism resolves values. No `binding` clause
is affected; this is a `default`/untagged-tier correction and extension of the 2026-08-28
amendment, not a reversal of any Decision above.

**Scope, stated explicitly:** this amendment records the *design* — the repo-side split and the
fragment-doc update (Phase A of #1236, a `develop`-targeted PR with no production impact). Applying
EDIT 4 and the file split to the live server, then actually deleting `.env` there (Phase B), is a
separate, explicitly-gated follow-up: it restarts `nginx`/`dgfy-api` in production, which is exactly
the class of change the 2026-08-29 amendment above (`CORS_ORIGIN` incident) already shows can break
production silently if rushed. Phase B is not authorized by this amendment landing; it needs its
own sign-off and low-disruption sequencing.

