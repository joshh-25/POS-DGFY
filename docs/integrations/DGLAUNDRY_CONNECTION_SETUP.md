# DGLaundry connection setup and qualification

This package installs the DGFY-owned side of the DGLaundry connection on a
protected qualification host. It is intentionally separate from deployment:
merging this change does not enable staff access, storefront bookings, or live
payments.

## Inputs and custody

Use a reviewed copy of `docs/integrations/dglaundry-connection-manifest.json`.
The manifest is non-secret and binds the setup to the exact issuer, callback,
contract versions, key roles, and payment mode. DGFY keeps all DGFY private
keys; DGLaundry keeps all DGLaundry private keys. Exchange public keys and
fingerprints only through the approved secret-management channel. Never put a
private key, client secret, token, or database credential in a PR, ticket,
shell argument, log, or handoff archive.

The checked-in manifest carries proposed browser, machine, service-client, and
partner-app IDs (`dglaundry-web`, `dglaundry-machine`, `dglaundry-service`, and
`dglaundry`) plus environment-specific key IDs. They are agreed names for
registration, not evidence that a client or key is installed. `prepare` checks
the supplied identifiers against the manifest; `apply` additionally requires
recorded registration evidence and all six public-key fingerprints. Do not
copy synthetic values from a test fixture into either hosted environment.

The qualification environment must use:

- issuer `https://api.stage.dgfy.ph/oidc`;
- callback `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback`;
- the protected `https://laundry.surebizcorp.com` staff origin; and
- sandbox payments only.

The utility refuses to prepare or apply production configuration. Production
requires a separately reviewed manifest/configuration and explicit release
authorization.

## Pat's staging sequence

Do not run `prepare` or install keys until the reviewed DGFY changes are merged
to `develop`, promoted through DGFY's governed `develop -> staging` flow, and
the staging VPS is confirmed to run that exact promoted SHA. On 2026-10-08,
`/opt/dgfy-stage` was a hand-maintained deployment directory rather than a Git
checkout, and its deployment did not include the current integration changes.
The tracked `infrastructure/docker/docker-compose.api.yml` is not proof that
the staging host's separate `docker-compose.yml` has those settings. A source
merge alone is not a staging deployment.

The reviewed release package must place these two **non-secret** files from
the exact promoted DGFY SHA at the paths below using the existing approved
release-transfer process (never download from a moving branch):

- `/opt/dgfy-stage/dglaundry-tools/dglaundry-connection-setup.mjs`
- `/opt/dgfy-stage/dglaundry-tools/dglaundry-connection-manifest.json`

The host-owned configuration directory is
`/etc/dgfy/dglaundry/staging`. Keep private files there under the existing
secret-management policy; do not put them in `/opt/dgfy-stage`, a Git checkout,
or a deployment artifact. The runtime-specific, non-secret manifest copy is
`/etc/dgfy/dglaundry/staging/dglaundry-connection-manifest.json`; record each
reviewed version by its SHA-256 in issue #519. Confirm the compose version and inspect the live
service inventory first:

```sh
cd /opt/dgfy-stage
docker compose version
docker compose config --services
docker compose ps
```

Stop if the staging SHA is not the promoted candidate, if the `dgfy-api`
service is absent, or if its reviewed configuration does not load connection
variables from `/opt/dgfy-stage/.env`, retain the read-only
`/run/dgfy-connection-source` key mount and `/run/dgfy-secrets` tmpfs, and use
the root-to-`app` key-copy entrypoint. The protected host directory remains
root-only; the CI SSH identity does not need read access because it uses the
deploy-owned `.env` for Compose configuration. The deployed staging compose is
hand-managed; resolve any drift through its reviewed release path before
continuing.

Create the owner-only config directory and run a read-only inventory:

```sh
sudo install -d -o root -g root -m 0700 /etc/dgfy/dglaundry/staging
sudo install -o root -g root -m 0640 \
  /opt/dgfy-stage/dglaundry-tools/dglaundry-connection-manifest.json \
  /etc/dgfy/dglaundry/staging/dglaundry-connection-manifest.json
sudo node /opt/dgfy-stage/dglaundry-tools/dglaundry-connection-setup.mjs inspect \
  --environment staging \
  --config-dir /etc/dgfy/dglaundry/staging \
  --manifest /etc/dgfy/dglaundry/staging/dglaundry-connection-manifest.json
```

Expected before registrations and key exchange: JSON reports
`registrationStatus: "proposed"`, missing key fingerprints, and
`privateValues: "not-read"`. This is a blocked prerequisite inventory, not a
connection failure or pass. Return the sanitized report and manifest SHA before
proceeding.

After DGFY has registered the browser, machine, and service clients; installed
its own staging signing keys; and received DGLaundry's **public-only** keys,
export the exact reviewed non-secret IDs from that manifest. The proposed IDs
are `dglaundry-web`, `dglaundry-machine`, `dglaundry-service`, and partner app
`dglaundry`; staging key IDs are `dgfy-oidc-stage-2026-10`,
`dgfy-request-stage-p256`, and `dgfy-event-stage-ed25519`. Use these only if
those exact values were actually registered. Never export a private key or
client secret in a shell command.

```sh
export DGFY_DGLAUNDRY_CLIENT_ID=dglaundry-web
export DGFY_DGLAUNDRY_MACHINE_CLIENT_ID=dglaundry-machine
export DGFY_DGLAUNDRY_SERVICE_CLIENT_ID=dglaundry-service
export DGFY_DGLAUNDRY_PARTNER_APP_ID=dglaundry
export DGFY_OIDC_KEY_ID=dgfy-oidc-stage-2026-10
export DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID=dgfy-event-stage-ed25519
export DGLAUNDRY_PARTNER_SIGNING_KEY_ID=dgfy-request-stage-p256

sudo env \
  DGFY_DGLAUNDRY_CLIENT_ID=dglaundry-web \
  DGFY_DGLAUNDRY_MACHINE_CLIENT_ID=dglaundry-machine \
  DGFY_DGLAUNDRY_SERVICE_CLIENT_ID=dglaundry-service \
  DGFY_DGLAUNDRY_PARTNER_APP_ID=dglaundry \
  DGFY_OIDC_KEY_ID=dgfy-oidc-stage-2026-10 \
  DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID=dgfy-event-stage-ed25519 \
  DGLAUNDRY_PARTNER_SIGNING_KEY_ID=dgfy-request-stage-p256 \
  node /opt/dgfy-stage/dglaundry-tools/dglaundry-connection-setup.mjs prepare \
  --environment staging \
  --config-dir /etc/dgfy/dglaundry/staging \
  --manifest /etc/dgfy/dglaundry/staging/dglaundry-connection-manifest.json
```

Review the emitted `manifestSha256`, generated-key inventory, public-key
fingerprints, and
`/etc/dgfy/dglaundry/staging/dglaundry-connection.env.candidate`. Stop on an
existing partial/mismatched key pair, any changed file, or any unexpected
existing setting. Update only the runtime manifest copy with **verified**
registrations, evidence references, and all six actual SPKI fingerprints using
the approved configuration-change process; do not alter the checked-in release
manifest on the host. Record the new manifest hash, then re-run `inspect` and
`prepare` against that reviewed runtime manifest. Install the browser client secret
through the approved secret manager at
`/etc/dgfy/dglaundry/staging/dglaundry-oidc-client-secret` with owner-only
permissions. Do not paste secret values into shell history, GitHub, chat, or a
report.

Only after an operator and reviewer approve the candidate, apply and verify the
local configuration:

```sh
sudo node /opt/dgfy-stage/dglaundry-tools/dglaundry-connection-setup.mjs apply \
  --environment staging \
  --config-dir /etc/dgfy/dglaundry/staging \
  --manifest /etc/dgfy/dglaundry/staging/dglaundry-connection-manifest.json \
  --compose-env-file /opt/dgfy-stage/.env \
  --confirm
sudo node /opt/dgfy-stage/dglaundry-tools/dglaundry-connection-setup.mjs verify \
  --environment staging \
  --config-dir /etc/dgfy/dglaundry/staging \
  --manifest /etc/dgfy/dglaundry/staging/dglaundry-connection-manifest.json
```

`verify` must report `passed: true`; this is **local configuration/key
consistency evidence only**. It does not prove JWKS publication, token issuance,
signature interoperability, or an application journey. From `/opt/dgfy-stage`,
validate configuration without printing values. Compose reads the synchronized
`.env` automatically; CI intentionally cannot read the protected root-only key
directory:

```sh
cd /opt/dgfy-stage
docker compose config --quiet
```

After the DGFY release owner approves a staging API restart, run plain Compose
commands from `/opt/dgfy-stage`; the connection variables already come from
`.env`. First run the read-only config check above; then review the target image,
volumes, and environment diff before recreating only the staging API service:

```sh
docker compose up -d --no-deps dgfy-api
docker compose ps dgfy-api
```

Do not run a production deployment command from this handoff. If the reviewed
staging restart fails, restore the recorded previous staging image and
configuration using the release operator's approved rollback procedure before
retrying.
Keep `DGLAUNDRY_INTEGRATION_ENABLED=false` until the first staging runtime
configuration is reviewed; keep `PAYMONGO_MODE=test` and public/test admission
restricted to synthetic testers. Discovery must advertise the staging issuer
`https://api.stage.dgfy.ph/oidc`; JWKS must return HTTP 200 with the registered
active public key and any intentionally overlapping previous public key.

Then exchange public fingerprints with DGLaundry, run the six-suite acceptance
runner against `https://laundry.surebizcorp.com` and DGFY staging, and complete
human UAT before any production preparation. A `verify` pass alone is never
staging qualification.

Rollback before restarting the service by restoring the recorded prior managed
configuration:

```sh
sudo node /opt/dgfy-stage/dglaundry-tools/dglaundry-connection-setup.mjs rollback \
  --environment staging \
  --config-dir /etc/dgfy/dglaundry/staging \
  --manifest /etc/dgfy/dglaundry/staging/dglaundry-connection-manifest.json
```

If the API was restarted, first have the staging release operator restore the
recorded previous image/configuration and verify health; then run the setup
rollback and verify the previous configuration digest. Rollback never deletes
keys or changes unrelated environment settings. Stop on configuration drift,
missing evidence, a failed health check, or a changed deployment SHA.

## Qualification gate after installation

The setup utility proves configuration and key material only. The connection is
not qualified until the existing six-suite acceptance runner executes against
the actual applications and records both SHAs and the configuration revision:

1. fresh DGFY browser login (PAR, PKCE S256, callback, account/company switch,
   logout, and revocation);
2. P-256 partner requests and Ed25519 events through the real proxy, including
   tampering, expiry, unknown/rotated keys, replay, empty bodies, and queries;
3. catalog, availability, quotes, fixed/per-kilo/mixed bookings, sandbox
   payment/refund/receipt, progress, fulfillment, notifications, and counter
   activity;
4. MySQL 8.4 restart/concurrency/duplicate/retry/reconciliation/redrive;
5. desktop/mobile staff and customer journeys with privacy and live updates;
6. backup restore, rollback, alert acknowledgement, outage recovery, and kill
   switches.

Every result uses this record shape:

`flow | owner | DGFY SHA | DGLaundry SHA | environment/config revision | evidence | pass/fail/blocked | next action`

Keep public admission disabled and keep payments in sandbox while any suite is
blocked or failed. Only an independent reviewer and release owner may approve
promotion after all approved branches pass mapping, catalog, availability,
quote, callback, and fulfillment checks.

## Stop conditions

Stop and return a blocked report when discovery/JWKS is unavailable, staging
advertises production identity endpoints, a required secret or public key is
missing, a key pair does not match, the host/configuration changed concurrently,
the runner skips a required suite, or any branch fails readiness. Do not work
around these conditions with development mode, static bearer tokens, copied
production credentials, or an early public enablement.
