---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-16
applies_to: multi_location_inventory_rollout
topic: rollout_handoff_packet_execution
---

# Multi-Location Rollout Handoff Packet (Wave: Local Verification 2026-04-16)

## Wave Metadata
1. Wave ID: `wave-local-2026-04-16`
2. Date: `2026-04-16`
3. Owner: Engineering
4. Target tenants: Local development/test tenants
5. Feature flag state: `multi_location_inventory_enabled=false` by default (rollout-safe)
6. Evidence manifest path: `docs/features/multi-location-inventory/ROLLOUT_HANDOFF_EVIDENCE_WAVE-LOCAL-2026-04-16.json`

## Decision Snapshot
1. ADR reference: `docs/architecture/adr/0009-multi-location-inventory-ledger-and-safety-rollout.md`
2. Decision ledger: `docs/features/multi-location-inventory/DECISION_LEDGER.md`
3. Requirement matrix: `docs/features/multi-location-inventory/REQUIREMENT_IMPLEMENTATION_MATRIX.md`
4. Approved scope deltas in this wave:
- Dispatch execution requires and persists `location_id` in multi-location contexts.
- User location grant management endpoints/UI added.
- Permission bridge tightened when multi-location flag is enabled.
- Grant bootstrap migration added for safe feature-flag enablement.

## Contract Diffs
1. Backend API changes:
- `GET /users/:user_id/location-grants`
- `PUT /users/:user_id/location-grants`
- `POST /dispatch-orders/:id/dispatch` accepts `location_id`
2. Frontend UX changes:
- User Management modal includes per-user location scope editor.
- Dispatch modal includes location selector when multiple active locations exist.
3. Permission model changes:
- Explicit `user_location_grants` admin management + enforcement for enabled multi-location mode.
4. Migration set:
- `20260416000007-add-multi-location-inventory-ledger.cjs`
- `20260416000008-backfill-user-location-grants.cjs`

## Data Safety Evidence
1. Additive migration policy: PASS (no destructive drops/renames in rollout migrations).
2. Legacy stock bootstrap to primary location: PASS (migration `20260416000007`).
3. User-location-grant bootstrap for existing active users: PASS (migration `20260416000008`).
4. Backup/restore drill: Operational production gate (must be executed per tenant wave by ops before cutover).
5. Backfill parity report: PASS (artifact `docs/features/multi-location-inventory/evidence/wave-local-2026-04-16/location-stock-parity.json`).
6. FIFO integrity report: PASS (artifact `docs/features/multi-location-inventory/evidence/wave-local-2026-04-16/fifo-drift.json`).
7. Drift monitor soak: Operational production gate (must be executed per tenant wave by ops before cutover).
8. Location stock parity report: PASS (local-wave mode uses `--allow-missing-tables`; summary healthy with skipped legacy tenant).
9. FIFO drift JSON artifact: PASS (repair mode executed and summary healthy).
10. Local-only operational waivers:
- Backup/restore drill: waived_local with reason documented in evidence manifest and artifact.
- Drift soak: waived_local with reason documented in evidence manifest and artifact.
- Rollback rehearsal: waived_local with reason documented in evidence manifest and artifact.
- Pilot UAT: waived_local with reason documented in evidence manifest and artifact.

## Verification
1. Automated checks run:
- `npm run check:architecture` PASS
- `npm run check:compliance` PASS
- `npm run lint:docs` PASS
- `npm --prefix backend run lint` PASS
- `npm --prefix frontend run lint` PASS
2. Automated tests run:
- `npm --prefix backend test -- userUsecases.applicationResult.test.js userHandlers.transport.test.js dispatchOrderUsecases.applicationResult.test.js dispatchOrderHandlers.transport.test.js dispatchOrderToolRegistry.test.js` PASS
- `npm --prefix backend test -- posUsecases.applicationResult.test.js storeUsecases.applicationResult.test.js` PASS
3. Manual/UAT checklist run: waived_local for this local verification wave; production wave remains required.
4. Critical systems watchlist: PASS for code-level regression checks in this wave (`CRITICAL_SYSTEMS.md`).
5. Critical systems mapping (required before production wave):
- Item 1 tenant isolation/auth transport: local checks PASS; production-wave artifact required by ops policy.
- Item 2 POS/storefront source separation: local checks PASS; production-wave artifact required by ops policy.
- Item 3 checkout error contract: local checks PASS; production-wave artifact required by ops policy.
- Item 4 permission/location gating: local checks PASS; production-wave artifact required by ops policy.
- Item 5 inventory parity invariant: local checks PASS with parity/fifo artifacts; production-wave soak evidence required by ops policy.
6. Closure command for this wave:
- `npm run check:multi-location-rollout -- --handoff docs/features/multi-location-inventory/ROLLOUT_HANDOFF_PACKET_WAVE-LOCAL-2026-04-16.md --manifest docs/features/multi-location-inventory/ROLLOUT_HANDOFF_EVIDENCE_WAVE-LOCAL-2026-04-16.json`

## Closure Status
1. This local wave is superseded by the multi-location closure remediation wave dated 2026-04-17.
2. Matrix rows `ML-01`, `ML-02`, `ML-03`, `ML-05`, `ML-06`, `ML-09`, and `ML-12` were promoted to `Completed` for this local closure wave after automated tests and evidence artifacts passed.
3. Production rollout remains blocked until non-local ops gates (backup/restore, soak monitoring, rollback rehearsal, pilot UAT) are executed in deployment environments.

## Rollback Plan
1. Immediate rollback lever: keep or reset `multi_location_inventory_enabled=false`.
2. Service rollback steps: revert deployment to previous app revision; keep additive schema in place.
3. Data rollback trigger criteria:
- location-level stock mismatch incident
- unauthorized location write
- checkout/dispatch hard-block contract regression
4. Recovery owner + SLA: Engineering on-call + tenant ops protocol.
