---
status: authoritative
authority_level: authoritative
owner: operations
last_reviewed: 2026-05-09
applies_to: deployment_and_runtime_operations
topic: hosting_profiles
---

# Hosting Profiles

## Purpose
Use one codebase for both shared hosting and Redis-capable hosting. Do not create long-lived `shared` and `vps` branches. Hosting differences are selected by environment variables, checked by preflight scripts, and verified by profile-specific smoke tests.

Authoritative planning inputs:
- `docs/START_HERE.md` (`authoritative`, last reviewed `2026-03-06`)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (`authoritative`, last reviewed `2026-03-06`)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (`authoritative`, last reviewed `2026-03-06`)
- `docs/architecture/adr/0001-modular-monolith-boundaries.md`
- `docs/architecture/adr/0003-migration-facade-strategy.md`
- `docs/architecture/adr/0004-architecture-compliance-automation.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`

Supporting operations context:
- Namecheap Node.js apps are managed through cPanel Setup Node.js App: <https://www.namecheap.com/support/knowledgebase/article.aspx/10047/2182/how-to-work-with-nodejs-app/>
- Namecheap shared plans run under LVE resource limits: <https://www.namecheap.com/support/knowledgebase/article.aspx/1127/103/a-handy-guide-to-resource-limits-or-what-is-lve/>
- Namecheap shared GitHub Actions artifact deployment is documented in `docs/ops/NAMECHEAP_SHARED_CICD.md`.

## Profiles
`shared` is the degraded shared-hosting profile. It assumes one constrained Node process, no Redis, local AI export temp files, fail-open token blacklist checks, in-process rate limits, and single-instance scheduler locks.

`vps` is the Redis-capable profile. It requires `REDIS_URL`, uses Redis-backed token blacklist/rate limiting/cache paths when connected, and requires fail-closed blacklist checks.

Both profiles keep `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard` as the default so public company registration provisions tenants immediately. Use `manual` only as an explicit rollback/admin-review mode; keep `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS=3600000` and `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS=5` or stricter because public registration can provision tenant databases.

## Runtime Surfaces
The backend exposes non-secret capability status at both endpoints:
- `/health`
- `/api/v1/health`

The Admin Portal exposes the same runtime view at `Admin > Hosting`. Use that screen for deploy and rollback checks because it shows:
- current hosting profile
- Redis configured/connected/required status
- token blacklist failure mode
- AI export temp storage mode
- rate-limit store mode
- scheduler lock mode
- profile readiness checklist
- operator runbook actions
- recent local status samples
- copyable non-secret diagnostics

## Shared Deployment
For Namecheap shared hosting, the supported automated lane is `.github/workflows/deploy-namecheap-shared.yml`. It uploads CI-built artifacts and token-protected PHP helper scripts over FTP, extracts the artifacts server-side, and restarts the Node.js app by touching `backend/tmp/restart.txt`.

1. Copy `backend/.env.shared.example` to `backend/.env` on the shared host.
2. Copy `frontend/.env.shared.example` to the frontend build environment.
3. Replace every placeholder value. Do not leave example domains, placeholder secrets, or `DB_AUTO_SYNC=true`.
4. Run:

```bash
npm run preflight:shared
npm run test:hosting:shared
```

5. Build and deploy the frontend assets using the shared profile.
6. Start the Node.js app through the host's Node app manager.
7. Check `/health`. Expected capability values include:
   - `hostingProfile: "shared"`
   - `redis.configured: false`
   - `redis.connected: false`
   - `tokenBlacklist.mode: "fail_open"`
   - `tempFileStorage.mode: "local"`
   - `rateLimitStore.mode: "memory"`
   - `schedulerLock.mode: "single_instance"`
8. In the Admin Portal, open `Admin > Hosting` after login. The screen shows the same non-secret capability status through `/api/v1/health`.

## VPS Redis Migration
1. Provision Redis and confirm the app server can reach it.
2. Copy `backend/.env.vps.example` to `backend/.env`, or update the existing env to set:
   - `HOSTING_PROFILE=vps`
   - `REDIS_URL=redis://...`
   - `AUTH_BLACKLIST_FAILURE_MODE=fail_closed`
   - `TEMP_FILE_STORAGE=auto`
3. Copy `frontend/.env.vps.example` to the frontend build environment if API origins or base paths changed.
4. Run:

```bash
npm run preflight:vps
npm run test:hosting:vps
```

5. Restart the backend and check `/health`. Expected capability values include:
   - `hostingProfile: "vps"`
   - `redis.configured: true`
   - `redis.connected: true`
   - `tokenBlacklist.mode: "fail_closed"`
   - `tempFileStorage.mode: "cache"` when Redis is connected
   - `rateLimitStore.mode: "redis"` after limiter stores initialize against Redis
   - `schedulerLock.mode: "distributed"`
6. In the Admin Portal, open `Admin > Hosting`. A Redis outage in the VPS profile should show action-required state instead of a healthy runtime.

## Security-Sensitive Behavior
Local AI export temp files are stored under `backend/storage/temp-ai-exports`, not under `backend/uploads`. The `/uploads` static tree remains public, so export metadata and content must never be written there.

Export downloads must be retrieved through the authenticated AI export route. The temp file service checks the stored export owner when a `userId` is supplied, so one authenticated user must not be able to download another user's export by guessing a file id.

Token blacklist runtime behavior must match the reported capability mode:
- `fail_open`: Redis/cache check failures allow the request.
- `fail_closed`: Redis/cache check failures deny the request with service-unavailable behavior.

Tenant registration approval mode is security-sensitive operational config:
- `auto_standard` immediately provisions non-subscription registrations and then the frontend performs a normal login call.
- `manual` keeps company registrations pending until platform-admin approval and is the explicit rollback/admin-review mode.
- Invalid values fall back to the default `auto_standard`; do not depend on typoed values for rollout state.
- New pending and active registrations are premium-capable by plan metadata, but provider subscription registration remains blocked while `PAYMENTS_ENABLED=false`.

In `vps` mode, Redis is a required capability. If `REDIS_URL` is configured but Redis is disconnected, `/health` and `/api/v1/health` should report degraded/unhealthy status so deploy automation and operators do not treat the runtime as fully ready.

## Rollback
Keep the previous deploy artifact and env snapshot. To roll back shared hosting, restore the previous artifact and previous `backend/.env`, restart the Node app, then check `/health`.

To roll back from VPS to shared mode, remove `REDIS_URL`, set `HOSTING_PROFILE=shared`, set `AUTH_BLACKLIST_FAILURE_MODE=fail_open`, set `TEMP_FILE_STORAGE=local`, run `npm run preflight:shared`, restart, then check `/health`.

## Known Degraded Guarantees
Shared mode is suitable for basic user operations when the weaker guarantees are accepted:
- Logout and refresh-token revocation are fail-open when Redis is absent.
- Rate limits are per process, not global.
- Scheduler locks assume one process.
- AI export temp files use local disk under `backend/storage/temp-ai-exports`, outside the public `/uploads` static tree.
- Cache loss can increase database/API work.

Do not use shared mode for multi-instance production scale or strict revocation requirements.

## Architecture Impact
This profile system stays within existing boundaries. It changes config, scripts, services, and ops docs only, and does not alter the modular flow `routes -> controllers -> usecases -> repositories -> models`. No architecture allowlist or exception is introduced.
