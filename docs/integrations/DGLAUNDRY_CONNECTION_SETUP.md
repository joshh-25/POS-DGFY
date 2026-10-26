# DGLaundry connection setup and qualification

This package prepares the DGFY-owned side of the DGLaundry connection on a
protected DGFY DEV or STAGE host. Surebiz remains on its independent host and
connects to DGFY DEV over HTTPS; this runbook does not move DGLaundry runtime
or data onto DGFY servers. Merging this change does not enable a hosted
connection or authorize live payments.

## Inputs and custody

Use a reviewed copy of `docs/integrations/dglaundry-connection-manifest.json`.
The manifest is non-secret and binds the setup to the exact issuer, callback,
contract versions, key roles, and payment mode. DGFY keeps all DGFY private
keys; DGLaundry keeps all DGLaundry private keys. Exchange public keys and
fingerprints only through the approved secret-management channel. Never put a
private key, client secret, token, or database credential in a PR, ticket,
shell argument, log, or handoff archive.

The v1.2 manifest records a separate tuple and registration for each
environment. DEV uses `dglaundry-web-dev`, `dglaundry-machine-dev`, and
`dglaundry-service-dev`; STAGE and PROD retain their existing client labels in
independent registrations. All DGFY and DGLaundry signing key IDs are
environment-specific. These are proposed identities, not proof that a client
or key is installed. `prepare` checks supplied IDs; `apply` requires verified
registration evidence, a protected browser secret file, and all six actual
public-key fingerprints. Never copy test fixture keys, fingerprints,
registrations, or configuration into a hosted environment.

| DGLaundry deployment | DGFY environment | DGFY issuer | DGLaundry API/audience | Browser callback |
|---|---|---|---|---|
| Surebiz, independently hosted | DEV | `https://api.dev.dgfy.ph/oidc` | `https://laundry.surebizcorp.com` | `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback` |
| DGLaundry staging stack | STAGE | `https://api.stage.dgfy.ph/oidc` | `https://dglaundry.stage.dgfy.ph` | `https://dglaundry.stage.dgfy.ph/api/v1/session/dgfy/callback` |
| DGLaundry production stack | PROD | `https://api.dgfy.ph/oidc` | `https://dglaundry.dgfy.ph` | `https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback` |

Origins are per environment (#2513): each `environments.<name>` entry carries
its own explicit `staffOrigin`, `apiOrigin`, and `callback`; the setup tool
rejects a blank or omitted per-environment origin or callback. Validation
requires each callback to be the HTTPS `/api/v1/session/dgfy/callback` on the
same origin as its `staffOrigin`, and the rendered
`DGFY_DGLAUNDRY_REDIRECT_URI`, `DGLAUNDRY_PARTNER_BASE_URL`, and
`DGLAUNDRY_PARTNER_AUDIENCE` follow that environment's DGLaundry host.

The callback must equal `<staffOrigin>/api/v1/session/dgfy/callback` byte for
byte (it is rendered verbatim and DGFY's boot validator pins it by exact
string). `verify` checks the issuer/callback and partner origin/audience
against the selected explicit environment tuple.

The utility refuses to prepare or apply production configuration. Production
requires a separately reviewed manifest/configuration and explicit release
authorization.

## Pat's DEV connection sequence

This is the DGFY half of the Surebiz → DEV connection. The DGLaundry owner must
separately reconcile the Surebiz demo profile, deploy a connected DEV profile
on its existing host, and retain a verified backup of the old demo. Use fresh
DEV credentials, keys, sessions, and a fresh DGLaundry database; do not import
mock identities, mappings, sessions, or pending events. DGFY and Surebiz have
no shared Docker/private network, runtime, database, Redis, or private keys.

The DEV host root is `/opt/dgfy-dev` (SSH alias `sieitz-dgfy-remote`). Before
planning a host change, recheck the live Compose file and active services
read-only; the deployed file is hand-maintained and can differ from the
repository fragments:

```sh
ssh sieitz-dgfy-remote
cd /opt/dgfy-dev
docker compose version
docker compose config --services
docker compose ps
docker compose config --quiet
```

Confirm the API service uses the reviewed DGFY API entrypoint, reads its
settings from the deploy-owned `.env`, mounts
`${DGLAUNDRY_CONNECTION_CONFIG_DIR:-./secrets}` read-only at
`/run/dgfy-connection-source`, and provides `/run/dgfy-secrets` as tmpfs. The
entrypoint copies required files into that app-owned tmpfs before dropping to
the unprivileged user. If the actual DEV service lacks these mounts, add only
the `volumes` and `tmpfs` entries shown in
[`docker-compose.api.yml`](../../infrastructure/docker/docker-compose.api.yml)
to the existing API service after review. Do not add per-variable Compose
`environment` overrides: those override `.env` values and can replace the
installer-rendered paths or environment IDs.

Create the protected config root and reviewed runtime manifest:

```sh
sudo install -d -o root -g root -m 0700 /etc/dgfy/dglaundry/development
sudo install -o root -g root -m 0640 \
  /opt/dgfy-dev/dglaundry-tools/dglaundry-connection-manifest.json \
  /etc/dgfy/dglaundry/development/dglaundry-connection-manifest.json
sudo node /opt/dgfy-dev/dglaundry-tools/dglaundry-connection-setup.mjs inspect \
  --environment development \
  --config-dir /etc/dgfy/dglaundry/development \
  --manifest /etc/dgfy/dglaundry/development/dglaundry-connection-manifest.json
```

Coordinate the independent DEV browser, machine, and service-client
registration, trusted Surebiz origin, exact callback, public-key exchange,
accepted company/location mappings, and DGFY key installation before applying.
The checked-in manifest begins with `registrationStatus: "proposed"` and blank
fingerprints. The setup tool blocks apply until a reviewed runtime copy has
real registration evidence and all six public-key fingerprints. Keep private
keys and the browser secret in approved custody; use owner-only files (private
keys and client secret `0600`, public keys readable only through the protected
`0700` directory).

DEV runs the hosted API with `NODE_ENV=production`,
`DEPLOY_ENV_LABEL=dev`, `DGLAUNDRY_INTEGRATION_ENVIRONMENT=development`, and
`PAYMONGO_MODE=test`. Enabling this integration changes the runtime mode of
the whole DEV API and turns on production startup validation. Before applying
the candidate, the DGFY release operator must preflight the complete effective
DEV API configuration, including database safety, admin credentials, CORS,
secure cookies, rate limits, Redis, payment mode, and all required secrets.
The source fixture command `npm run check:production-env` is not a substitute
for that host-specific review. Do not weaken validators or apply if the full
configuration does not pass.

Use only DEV IDs from the reviewed runtime manifest: `dglaundry-web-dev`,
`dglaundry-machine-dev`, `dglaundry-service-dev`, and partner app `dglaundry`.
The candidate sets the DEV issuer, Surebiz callback, Surebiz service-token
audience, production-mode runtime, `DEPLOY_ENV_LABEL=dev`, and sandbox payment
mode. Review the candidate and prospective merged `/opt/dgfy-dev/.env` before
`apply`; apply writes `DGLAUNDRY_INTEGRATION_ENABLED=true` and synchronizes
managed settings into the existing `.env`. The `.env` must already exist.
Rollback restores prior managed Compose settings and refuses to overwrite
later edits.

Applying configuration does not restart the service. Restart only through the
approved DGFY DEV release procedure after the preflight and reviewed source SHA
are recorded. Hosted verification must show DEV-only OIDC discovery,
`/oidc/jwks` HTTP 200 with the registered DEV key, working browser login and
session, machine and service authorization, signed requests/events, replay and
wrong-company/location rejection, and sandbox-only payments. Health alone is
not connection qualification. Do not reuse staging or production registrations
or credentials, and do not retarget either environment.

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
retrying. Before `apply`, keep `DGLAUNDRY_INTEGRATION_ENABLED=false` and do not
proceed until registration, keys, and the complete runtime candidate are
reviewed. `apply` writes the enabled setting; keep public/test admission
restricted to synthetic testers and `PAYMONGO_MODE=test`. Discovery must
advertise the staging issuer
`https://api.stage.dgfy.ph/oidc`; JWKS must return HTTP 200 with the registered
active public key and any intentionally overlapping previous public key.

Then exchange public fingerprints with DGLaundry, run the six-suite acceptance
runner against `https://dglaundry.stage.dgfy.ph` and DGFY staging, and complete
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
