---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-13
last_reviewed: 2026-08-28
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

None yet. This ADR will need an amendment (or a new ADR, if any `binding`
clause above changes) once the real cutover executes and any deviation from
the plan is discovered — expected, since Decision 2's exact 18/75 split and
Decision 4's repository name are working assumptions to be confirmed at
execution time, not verified against the live server's full 93-variable set
in this session.

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

