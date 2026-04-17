---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-17
applies_to: multi_location_inventory_rollout
topic: production_wave_execution_guide
---

# Multi-Location Production Wave Guide (Step-by-Step, Super Simple)

This is for the 3 things I cannot do by myself:
1. Real backup + restore drill
2. Real soak monitoring
3. Real pilot tenant UAT

Think of this like a school checklist.  
Do one box at a time. Do not skip.

## Step 0: Make your production evidence files/folders
1. Pick a wave id. Example: `wave-prod-2026-04-17`
2. Create folder:
   - `docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17`
3. Copy the local manifest template and rename it:
   - from: `docs/features/multi-location-inventory/ROLLOUT_HANDOFF_EVIDENCE_TEMPLATE.json`
   - to: `docs/features/multi-location-inventory/ROLLOUT_HANDOFF_EVIDENCE_WAVE-PROD-2026-04-17.json`
4. In that JSON file:
   - set `"stage": "production"`
   - set `"wave_id": "wave-prod-2026-04-17"`
   - set each `artifact_path` to your new production evidence files
   - keep all `status` as `pending` for now

## Step 1: Backup + Restore drill (real production)
1. Ask ops to run real DB backup for target tenant(s).
2. Ask ops to restore that backup to a safe verification environment.
3. Verify app can read data after restore.
4. Save proof in:
   - `docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/backup-restore-drill.md`
5. In that file include:
   - who ran it
   - timestamp
   - tenant(s)
   - backup id / snapshot id
   - restore result: PASS/FAIL

## Step 2: Generate parity + FIFO artifacts (real command outputs)
Run these from repo root:

```bash
node backend/scripts/audit-location-stock-parity.js --repair-current-stock --json-output ../docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/location-stock-parity.json
node backend/scripts/audit-fifo-drift.js --repair-positive-drift --json-output ../docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/fifo-drift.json
```

Expected:
1. Both commands finish.
2. JSON files are created in your production wave folder.
3. Status should be healthy or explicitly documented with accepted exceptions.

## Step 3: Drift soak monitoring (real production window)
1. Choose soak window (example: 24h or 48h).
2. Monitor drift alerts and unresolved mismatch count.
3. Save proof in:
   - `docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/drift-soak-report.md`
4. Write:
   - window start/end
   - unresolved mismatches count
   - final result: PASS/FAIL

## Step 4: Rollback rehearsal (real production procedure)
1. Practice rollback steps in a controlled environment.
2. Confirm feature-flag rollback works.
3. Confirm service rollback procedure works.
4. Save proof in:
   - `docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/rollback-rehearsal.md`
5. Write:
   - commands used
   - timing
   - result: PASS/FAIL

## Step 5: Pilot tenant UAT (real users + real workflow)
1. Run full flow for pilot tenant:
   - IMS PO receive
   - IMS JO complete
   - QR receive
   - POS checkout
   - storefront checkout
   - permission/location denial checks
2. Save proof in:
   - `docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/pilot-uat.md`
3. Include:
   - test owner
   - scenarios run
   - incidents
   - final result: PASS/FAIL

## Step 6: Mark all evidence as passed automatically
After all files exist, run:

```bash
npm run finalize:multi-location-evidence -- --manifest docs/features/multi-location-inventory/ROLLOUT_HANDOFF_EVIDENCE_WAVE-PROD-2026-04-17.json
```

This does:
1. verifies all required evidence files exist
2. computes SHA-256 hashes
3. sets all required statuses to `passed`

## Step 7: Run rollout closure gate
Run:

```bash
npm run check:multi-location-rollout -- --handoff docs/features/multi-location-inventory/ROLLOUT_HANDOFF_PACKET_WAVE-PROD-2026-04-17.md --manifest docs/features/multi-location-inventory/ROLLOUT_HANDOFF_EVIDENCE_WAVE-PROD-2026-04-17.json
```

If PASS:
1. you are closure-ready for this production wave.

If FAIL:
1. read each bullet in the error output
2. fix exactly that item
3. rerun command

## Step 8: Final safety checks
Run:

```bash
npm run check:architecture
npm run check:compliance
npm run lint:docs
```

All must pass before enabling broader rollout.
