---
status: executed
authority_level: reference
owner: engineering
last_reviewed: 2026-07-20
applies_to: production_cutover,infrastructure,deployment,beta_dgfy_ph,dgfy_ph,ci
topic: dgfy_ph_production_cutover_runbook
---

# dgfy.ph production cutover — runbook & topology of record

Status: **executed 2026-07-20.** `dgfy.ph`, `skupervisor.dgfy.ph`, `pos.dgfy.ph` are live in
production alongside `beta.dgfy.ph`, `skupervisor.beta.dgfy.ph`, `pos.beta.dgfy.ph`. All six
domains serve `200` over valid TLS.

This supersedes the earlier draft `docs/proposals/2026-07-20-dgfy-ph-production-cutover-plan.md`.

## Why the repo compose/nginx are NOT the source of truth

`/opt/dgfy-platform` on the server is **hand-maintained and is not a git checkout**. CI never
copies files there — `publish-platform.yml` only SSHes in and runs `docker compose pull && up -d`
against whatever compose/nginx/.env already live on the box. The repo's
`infrastructure/docker/docker-compose.yml` + `nginx.conf.template` have additionally diverged onto
the `dgfy-api` migration line (they carry a `dgfy-api` service that is **not** deployed), so they
do not describe the running server. **The server files are the operative artifact; this document
records what they contain.**

## Live server topology (what actually runs)

One compose project, one shared `backend` / `mysql` / `redis`, one nginx (the only host-port
binder, routes by `Host`), two frontend containers:

| Service | Image | Serves |
| --- | --- | --- |
| `backend` | `backend:${IMAGE_TAG}` (=`beta`) | shared `/api` + `/uploads` for **both** domain groups |
| `frontend-beta` | `frontend:${IMAGE_TAG}` (=`beta`) | `skupervisor.beta` :8081 / `pos.beta` :8082 / `beta.dgfy.ph` :8083 |
| `frontend` | `frontend:${FRONTEND_PROD_IMAGE_TAG}` (=`latest`) | `skupervisor.dgfy.ph` :8081 / `pos.dgfy.ph` :8082 / `dgfy.ph` :8083 |
| `nginx` | `nginx:1.27-alpine` | 3 beta `443` blocks → `frontend-beta`; 3 prod `443` blocks → `frontend`; shared `backend:5000` |
| `certbot` | `certbot/certbot` | renews both cert-names |

TLS: a **separate** Let's Encrypt cert `--cert-name dgfy.ph` (SAN: `dgfy.ph`, `pos.dgfy.ph`,
`skupervisor.dgfy.ph`), independent of the beta cert. The existing renew loop covers both.

Frontend images bake `VITE_*` at **build time**, so beta vs prod need distinct images: the beta
image has beta auth/handoff URLs frozen in, the prod image has the dgfy.ph ones. Serving the beta
image on prod domains would leak login/registration/reset/account links back to beta — hence the
two-container split.

## Server `.env` additions (the `_PROD` variables)

Added alongside the existing beta values (the file is owned by `gha`; edit as that user):

```
FRONTEND_PROD_IMAGE_TAG=latest
SKUPERVISOR_DOMAIN_PROD=skupervisor.dgfy.ph
POS_DOMAIN_PROD=pos.dgfy.ph
STOREFRONT_DOMAIN_PROD=dgfy.ph
STOREFRONT_ALT_DOMAIN_PROD=          # empty, no prod alt-domain
CERT_DOMAIN_PROD=dgfy.ph
# CORS_ORIGIN gains: https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph
```

**`SESSION_COOKIE_DOMAIN` stays unset.** With it unset, auth cookies are host-only (no `Domain`
attribute), which is what isolates beta and prod sessions on the shared backend. Setting it to
`.dgfy.ph` would make cookies match all subdomains and leak sessions between environments —
do not set it. (`apps/dgfy-api/src/utils/browserSessionCookies.js`.)

## GitHub Environments

- **PROD** now carries the 10 `VITE_*` vars (dgfy.ph values) and the deploy secrets
  (`SSH_PRIVATE_KEY`, `SSH_TARGET`, `DOCKER_DIR`). Validated end-to-end in this cutover.
- **BETA** is unchanged (10 `VITE_*` beta vars + same deploy secrets).
- The backend build (`deploy-backend.yml`) reads **no** per-env vars/secrets — the image is
  environment-agnostic; its runtime config is the server `.env`. Only the frontend build
  (`deploy-frontend.yml`) is environment-specific (the `VITE_*` build-args).
- Both environments keep their full var sets on purpose (rollback posture). `PROD`'s legacy `GHCR`
  secret is unused (safe to delete).

## CI: `main` deploys both (this PR)

`build-main.yml` now, on every push to `main`, builds `frontend:beta` (BETA env), `frontend:latest`
(PROD env) and the shared `backend:beta` (once), then a **single** `publish` SSH-deploys once
(`docker compose pull && up -d`) which refreshes all three on the box. Deploy is resolved from the
PROD Environment's SSH secrets. Every push restarts the shared backend both groups depend on, with
no approval gate — the accepted interim behaviour.

**Future cleanup (Option B, not done here):** make PROD the sole deploy owner and reduce BETA to
frontend-only vars. Deferred to avoid re-wiring deploy ownership right after go-live.

## Repeatable cert bootstrap

`nginx/init-letsencrypt-additional-domain.sh` — the parameterised version of the dummy-cert +
webroot-issue + reload dance used here, for adding a further domain group later. Reads the
`_PROD` vars from `.env`.

## Rollback (fast, no data/migration to unwind)

The change is additive. On the server:

```
cd /opt/dgfy-platform
cp docker-compose.yml.bak.<ts> docker-compose.yml
cp nginx/nginx.conf.template.bak.<ts> nginx/nginx.conf.template
# (revert .env as gha if needed)
docker compose up -d --remove-orphans        # reverts to the single frontend:beta container
```

Backups from the cutover: `*.bak.20260720-215135`. Reverting uses the local `frontend:beta` image
(no GHCR pull needed). DNS is untouched throughout; the unused `dgfy.ph` cert on disk is inert.

## Verification (rerun any time)

- `curl -I https://{beta.dgfy.ph,skupervisor.beta.dgfy.ph,pos.beta.dgfy.ph}` → `200`.
- `curl -I https://{dgfy.ph,skupervisor.dgfy.ph,pos.dgfy.ph}` → `200` with a valid (non-self-signed)
  cert; `https://dgfy.ph/api/v1/health` → `200` (shared backend).
- Prod frontend serves prod URLs: its JS bundle references `skupervisor.dgfy.ph`, never
  `skupervisor.beta.dgfy.ph`.
- Browser: login sets a host-only cookie (DevTools → no `Domain`); cross-app links stay prod↔prod
  and beta↔beta.

## 2026-08-23 update — beta.dgfy.ph retired

This runbook's "Future cleanup (Option B)" note above is what got carried out: the #329
beta-deprecation epic converted every `*.beta.dgfy.ph` host to a `301` redirect to its `*.dgfy.ph`
equivalent (nginx-side: #894/#896; CI-side removal of the `frontend-beta` build/deploy path:
#895), and the beta TLS cert was re-issued dropping its dead `bar.space.com.ph` SAN. This record
stays as-is — it is the historical, executed account of the dual-deploy cutover — see #329 and its
children for the retirement itself, not an edit here.
