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

The checked-in manifest intentionally leaves the browser-client and inbound
service-client IDs empty until the DGFY owner registers the separate clients.
`inspect` may report that blocker; `prepare` must remain blocked until the
reviewed manifest contains the real IDs. Do not copy the synthetic values from
a test fixture into either hosted environment.

The qualification environment must use:

- issuer `https://api.stage.dgfy.ph/oidc`;
- callback `https://laundry.surebizcorp.com/api/v1/session/dgfy/callback`;
- the protected `https://laundry.surebizcorp.com` staff origin; and
- sandbox payments only.

The utility refuses to prepare or apply production configuration. Production
requires a separately reviewed manifest/configuration and explicit release
authorization.

## Pat's installation sequence

Run from the DGFY checkout that contains this PR. Replace `CONFIG_DIR` with the
existing DGFY secret/config directory for the qualification host. Do not point
it at a shared repository checkout or at a production directory.

```sh
node scripts/dglaundry-connection-setup.mjs inspect \
  --environment staging --config-dir CONFIG_DIR
```

`prepare` creates only missing DGFY-owned key pairs and a candidate env file.
Review `CONFIG_DIR/dglaundry-connection.env.candidate`, the generated key
inventory, and the printed manifest SHA. If any existing key is only partially
present, or the candidate differs from the reviewed manifest, stop and report
the drift; the utility will not overwrite it.

Before `prepare`, set the following non-secret registration identifiers from
the approved staging registrations and trust exchange. Do not invent new IDs
to make the command pass. The OIDC key ID must match the key published by
staging JWKS; the event and P-256 request key IDs must match the receiver trust
registries. The service client ID is a distinct DGFY-to-DGLaundry client, not
the existing DGLaundry-to-DGFY machine-client ID.

The hosted DGFY caller must also have its private P-256 request key available
through `DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY_FILE` (or the approved secret
file equivalent) and an explicit `DGLAUNDRY_PARTNER_SIGNING_KEY_ID`. The public
key with that exact ID must be trusted by DGLaundry. There is no built-in
hosted key-ID fallback; startup validation fails closed if either value is
missing.

```sh
export DGFY_DGLAUNDRY_SERVICE_CLIENT_ID='<registered DGFY service client>'
export DGFY_OIDC_KEY_ID='<active staging OIDC signing key ID>'
export DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID='<DGFY event key ID trusted by DGLaundry>'
export DGLAUNDRY_PARTNER_SIGNING_KEY_ID='<DGFY P-256 request key ID trusted by DGLaundry>'
```

`prepare` refuses to proceed if any identifier is absent. It writes the
service-client ID, `https://laundry.surebizcorp.com` partner base origin and
matching audience, staging issuer, callback, and asymmetric profile into the
reviewed candidate. `verify` checks these configuration bindings and key
material; it does not prove a live token, signature, or application journey.
The installer deliberately does not rewrite DGFY-wide payment settings. The
staging DGFY service must independently use `PAYMONGO_MODE=test`; its hosted
preflight now fails closed if a staging laundry integration is configured with
live PayMongo mode.

```sh
node scripts/dglaundry-connection-setup.mjs prepare \
  --environment staging --config-dir CONFIG_DIR
```

Install the DGLaundry public keys and fingerprints into the DGFY trust store
using the existing host secret-management process. Do not copy DGLaundry
private keys. Register the browser client through that same process, with the
exact callback above. Then apply the reviewed candidate:

```sh
node scripts/dglaundry-connection-setup.mjs apply \
  --environment staging --config-dir CONFIG_DIR --confirm
node scripts/dglaundry-connection-setup.mjs verify \
  --environment staging --config-dir CONFIG_DIR
```

`apply` is bound to the candidate hash and stops if the candidate changed after
review. `verify` must report `passed: true`; a missing DGLaundry public key,
invalid key type, missing registration ID, mismatched audience/origin, missing
applied state, or wrong environment is a blocked result, not a pass. Save the
sanitized JSON output with the staging evidence.

If installation must be undone, first preserve the state report and then run:

```sh
node scripts/dglaundry-connection-setup.mjs rollback \
  --environment staging --config-dir CONFIG_DIR
```

Rollback is available only when an earlier active configuration was recorded.
It never deletes keys or changes unrelated environment settings.

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
