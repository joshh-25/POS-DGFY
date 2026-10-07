---
status: reference
authority_level: reference
owner: dgfy-platform
date: 2026-10-07
last_reviewed: 2026-10-07
review_by: 2027-04-07
applies_to: dgfy_dglaundry_integration, staging_deployment, production_deployment
topic: dglaundry_oidc_key_provisioning
---

# DGLaundry OIDC signing key delivery

This runbook documents how an operator can deliver the DGFY OIDC keypair to `dgfy-api`. It does
not generate or install real key material as part of this repository change. Key generation,
registration, and installation remain human-run operations.

Both `dgfyLaundryOidcProvider.js` and `dglaundryPartnerAccessToken.js` resolve signing material
with `DGFY_OIDC_PRIVATE_KEY` first and `DGFY_OIDC_PRIVATE_KEY_FILE` second. The public JWKS reader
uses the matching `DGFY_OIDC_PUBLIC_KEY` / `DGFY_OIDC_PUBLIC_KEY_FILE` pair. Inline values are
supported for existing deployments; file paths are the documented deployment configuration.

## Staging, DEV, and QA

The generic Compose template bind-mounts the OIDC pair read-only:

| Compose project directory | Host source | Container path |
|---|---|---|
| `<compose-dir>` | `secrets/keys/dgfy-oidc-signing.pem` | `/run/secrets/dgfy-oidc-private.pem` |
| `<compose-dir>` | `secrets/keys/dgfy-oidc-signing.pub.pem` | `/run/secrets/dgfy-oidc-public.pem` |

Set these non-secret paths in that environment's `.env` (or use the defaults in
`docker-compose.api.yml`):

```dotenv
DGFY_OIDC_PRIVATE_KEY_FILE=/run/secrets/dgfy-oidc-private.pem
DGFY_OIDC_PUBLIC_KEY_FILE=/run/secrets/dgfy-oidc-public.pem
```

Run `scripts/dglaundry-connection-setup.mjs prepare` and `apply` with
`--config-dir <compose-dir>/secrets`. The tool creates the OIDC pair under `keys/`, matching the
mount sources above, and writes a host-path-based candidate env file. When copying that candidate
into the Compose `.env`, set its two OIDC `*_FILE` values to the **container paths** shown above;
host paths from the candidate cannot be read from inside the container. Review the candidate and
the environment-specific issuer before `apply --confirm`.

Run `prepare` before the first `docker compose up` that references these mounts. Docker may create
a missing file bind source as a directory; touching empty placeholders first is not compatible
with the setup tool, which correctly refuses to overwrite an incomplete keypair. Do not copy a
private key into this repository checkout. The generated `infrastructure/docker/secrets/` path is
git-ignored.

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

This delivery follows ADR 0060 Decision 6: decrypted material stays in the deploy process
environment and is not written to a plaintext file or sourced as shell code. The mounted file has
the same running-container exposure as other live secrets described in ADR 0060's threat model.
It does not change the binding rule or require a superseding ADR. It also does not authorize a
production cutover; follow the SOPS runbook's rehearsal and approval gates before any live change.

The production Compose fragment documenting the service environment and secret sources is
`infrastructure/docker/env/prod.sops-cutover-fragment.yml`.

## Verification boundary

After an operator installs a real, registered staging keypair and deploys it, verify
`GET https://api.stage.dgfy.ph/oidc/jwks` returns a valid JWKS. Production verification is a
separate human operation after its approved delivery path is installed. This runbook and the
implementation do not contact either deployed environment.
