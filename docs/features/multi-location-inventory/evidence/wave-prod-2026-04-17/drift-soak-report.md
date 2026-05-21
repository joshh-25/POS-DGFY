# Production Drift Soak Report (Wave: 2026-04-17)

- Executed at (UTC): 2026-04-17T18:44:48Z
- Host: hermes-cloud
- Iterations: 3
- Success iterations: 3/3
- Overall: PASS

## Iteration Results
- Iteration 1: fifo_status=healthy, fifo_drift_rows=0, parity_status=healthy, parity_drift_rows=0
- Iteration 2: fifo_status=healthy, fifo_drift_rows=0, parity_status=healthy, parity_drift_rows=0
- Iteration 3: fifo_status=healthy, fifo_drift_rows=0, parity_status=healthy, parity_drift_rows=0

## Commands
- node backend/scripts/audit-fifo-drift.js --json-output docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/fifo-drift-soak.tmp.json
- node backend/scripts/audit-location-stock-parity.js --allow-missing-tables --json-output docs/features/multi-location-inventory/evidence/wave-prod-2026-04-17/location-stock-parity-soak.tmp.json

## Notes
- Location parity uses allow-missing mode for tenants that have not enabled multi-location tables yet.
