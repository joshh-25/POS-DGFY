---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-18
applies_to: multi_location_inventory_rollout
topic: rollout_handoff_packet
---

# Multi-Location Rollout Handoff Packet (Wave `wave-prod-2026-04-18`)

## Wave Metadata
1. Wave ID: `wave-prod-2026-04-18`
2. Date: 2026-04-18
3. Owner: Engineering
4. Target tenants: all active tenants (`6` total)
5. Feature flag state: `multi_location_inventory_enabled=false` (flag policy unchanged during closure wave)
6. Evidence manifest path: `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.summary.txt`

## Decision Snapshot
1. ADR reference: `docs/architecture/adr/0009-multi-location-inventory-ledger-and-safety-rollout.md`
2. Decision ledger commit hash: `07c1eb20e5dc0de8519d7dac89f4c70f37662db1`
3. Requirement matrix commit hash: `07c1eb20e5dc0de8519d7dac89f4c70f37662db1`
4. Operation contract matrix commit hash: `07c1eb20e5dc0de8519d7dac89f4c70f37662db1`
5. Approved scope deltas:
- strict deploy defaults enabled for schema/index closure (`DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1`, `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1`)
- baseline schema sync failures cleared after production remediation

## Contract Diffs
1. Backend API changes: none in this wave (closure/evidence wave).
2. Frontend UX changes: none in this wave.
3. Permission model changes: none in this wave.
4. Migration set: none (`migrations_changed=0` in deploy summary).

## Data Safety Evidence
1. Backup completed: `/var/www/skupervisor/backups/predeploy_20260418_032723.sql`
2. Restore drill result: preserved from prior rollout artifact (no new restore execution in this closure wave).
3. Backfill parity report: prior approved artifact retained (no schema/data mutation requiring new parity backfill run in this wave).
4. FIFO integrity report: prior approved artifact retained.
5. Drift monitor soak result: prior approved artifact retained.
6. Location stock parity report: prior approved artifact retained.
7. JSON audit artifacts:
- tenant schema sync: `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_schema_sync.json`
- tenant index headroom: `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.tenant_index_headroom.json`
- strict remediation run: `/var/www/skupervisor/logs/deploy/tenant-index-remediation-after-strict-gate.json`
- strict post-remediation audit: `/var/www/skupervisor/logs/deploy/tenant-index-headroom-after-strict-remediation.json`
8. Local-wave waiver policy:
- not used (production wave).

## Verification
1. Automated checks:
- local: `npm run check:architecture`, `npm run check:compliance`, `npm run lint:docs`, `npm test`, `npm run check:multi-location-rollout` (all pass before deploy)
- deploy pipeline: architecture/docs checks + strict tenant schema sync + strict tenant index headroom + runtime/public endpoint checks (all pass on final run)
2. Manual/UAT checklist run:
- production smoke performed for auth/register/login/users-me contract with current tenant token and HTTPS transport headers
- IMS/POS/storefront public endpoints verified reachable and healthy
3. Closure gate run:
- `npm run check:multi-location-rollout` passed before deployment
4. Critical systems regression watchlist:
- all items 1-5 remain green in this wave
5. Critical systems watchlist mapping (`CRITICAL_SYSTEMS.md` items 1-5):
- Item 1 -> `/var/www/skupervisor/logs/deploy/deploy_20260418_032723.summary.txt` + backend health endpoint
- Item 2 -> POS/storefront public health checks in deploy log
- Item 3 -> checkout error contract unchanged in this wave; regression suite remained green pre-deploy
- Item 4 -> permission/location contract unchanged in this wave; regression suite remained green pre-deploy
- Item 5 -> strict schema/index closure evidence and existing parity artifacts retained

## Rollback Plan
1. Flag rollback command: disable strict toggles only by explicit change-control approval (not default).
2. Service rollback steps: redeploy prior known-good commit via `scripts/deploy.sh --branch master --expect-commit <commit>`.
3. Data rollback trigger criteria: any post-deploy P1 integrity incident tied to tenant schema/index drift or write-path regression.
4. Recovery owner + SLA: Engineering on-call + Ops, immediate mitigation, data restoration from latest predeploy backup if required.
