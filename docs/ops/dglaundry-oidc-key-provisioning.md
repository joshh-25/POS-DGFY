---
status: reference
authority_level: reference
owner: dgfy-platform
date: 2026-10-08
last_reviewed: 2026-10-08
review_by: 2027-04-07
applies_to: dgfy_dglaundry_integration, staging_deployment, production_deployment
topic: dglaundry_oidc_key_provisioning
---

# DGLaundry OIDC signing key delivery

This runbook describes staging delivery of the DGFY OIDC keypair as part of the DGLaundry
connection package. The reviewed setup utility generates only DGFY-owned keypairs in the
environment's host-owned configuration directory. Registration, secret-manager delivery, review,
and hosted verification remain operator actions.

Both `dgfyLaundryOidcProvider.js` and `dglaundryPartnerAccessToken.js` resolve signing material
with `DGFY_OIDC_PRIVATE_KEY` first and `DGFY_OIDC_PRIVATE_KEY_FILE` second. The public JWKS reader
uses the matching `DGFY_OIDC_PUBLIC_KEY` / `DGFY_OIDC_PUBLIC_KEY_FILE` pair. Inline values are
supported for existing deployments; file paths are the documented deployment configuration.

## Protected staging profile

The connection Compose profile mounts the host-owned configuration directory read-only, then the
root entrypoint copies required files into `/run/dgfy-secrets` on an app-owned tmpfs before
dropping privileges. The app process never reads the host key directory directly:

| Host source | Container source mount | App-readable ephemeral file |
|---|---|---|
| `/etc/dgfy/dglaundry/staging/keys/dgfy-oidc-signing.pem` | `/run/dgfy-connection-source/keys/dgfy-oidc-signing.pem` (read-only) | `/run/dgfy-secrets/dgfy-oidc-private.pem` |
| `/etc/dgfy/dglaundry/staging/keys/dgfy-oidc-signing.pub.pem` | `/run/dgfy-connection-source/keys/dgfy-oidc-signing.pub.pem` (read-only) | `/run/dgfy-secrets/dgfy-oidc-public.pem` |

The setup utility renders these container paths into the candidate environment file:

```dotenv
DGFY_OIDC_PRIVATE_KEY_FILE=/run/dgfy-secrets/dgfy-oidc-private.pem
DGFY_OIDC_PUBLIC_KEY_FILE=/run/dgfy-secrets/dgfy-oidc-public.pem
```

Run `scripts/dglaundry-connection-setup.mjs inspect` and `prepare` with
`--config-dir /etc/dgfy/dglaundry/staging` and the reviewed manifest. The tool creates missing
DGFY-owned key pairs under `keys/` and a candidate env file; it refuses to replace partial pairs.
Install the browser client secret with the approved secret manager at the configured host path.
Apply only after the candidate, registration evidence, and public-key fingerprints are reviewed.
Compose must receive the generated env file as interpolation input and as the service env file, as
documented in `docs/integrations/DGLAUNDRY_CONNECTION_SETUP.md`. Create the configuration
directory before starting the compose profile so Docker does not create it with unexpected
ownership. Do not copy a private key into the repository or release artifact.

## Production

Production uses Compose environment-backed secrets so decrypted PEM contents are not written as
plaintext host files. Docker Compose reads the value of a host environment variable and presents it
to the service as a file under `/run/secrets/`. This requires Docker Compose (not `docker stack
deploy`); the environment source is supported in standalone Compose. The production server's
installed Compose version is not recorded in the repository, so an operator must run
`docker compose version` and validate `docker compose config` on that host before rollout.
The deploy process must receive `DGLAUNDRY_INTEGRATION_ENABLED=true` when the production Compose
configuration enables this integration; `deploy-sops.sh` uses that flag to require and decrypt both
OIDC ciphertext files. Keep the flag false until both files and the corresponding service secret
references are installed together.

Store the OIDC private and public PEM ciphertext as standalone SOPS-encrypted binary files in
`Sieitzz/dgfy-secrets`, under dedicated `.sops.yaml` path rules. The private repository is the
authoritative ciphertext store; `dgfy-platform` must contain neither ciphertext nor plaintext key
material. `deploy-sops.sh` decrypts each file directly into `DGFY_OIDC_PRIVATE_KEY` and
`DGFY_OIDC_PUBLIC_KEY` in its process environment, then Compose grants the corresponding secrets
to `dgfy-api` at `/run/secrets/dgfy-oidc-private.pem` and
`/run/secrets/dgfy-oidc-public.pem`. The script keeps this in a separate block from the existing
dotenv decrypt loop.

The matching narrow creation rule in `dgfy-secrets/.sops.yaml` is:

```yaml
- path_regex: prod/dgfy/dgfy-oidc-(private|public)\.pem$
  age: <the existing prod/dgfy age recipient>
```

The ciphertext files must be deployed to the server as
`secrets/dgfy-oidc-private.pem` and `secrets/dgfy-oidc-public.pem`; deploy only the ciphertext.
The `dgfy-secrets` repository change and the operator's key installation remain prerequisites to
enabling the integration. No PEM or ciphertext is present in this `dgfy-platform` change.

The staging profile uses a host-owned key directory and an ephemeral in-container tmpfs; it does
not change the DGFY-wide SOPS policy or authorize a production cutover. Production material
delivery remains governed by ADR 0060 and the SOPS runbook, with separate rehearsal and approval
gates. The staging setup utility refuses production mutation actions.

The production Compose fragment documenting the service environment and secret sources is
`infrastructure/docker/env/prod.sops-cutover-fragment.yml`.

## Verification boundary

After an operator installs a real, registered staging keypair and deploys it, verify
`GET https://api.stage.dgfy.ph/oidc/jwks` returns a valid JWKS. Production verification is a
separate human operation after its approved delivery path is installed. This runbook and the
implementation do not contact either deployed environment.
