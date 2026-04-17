# Production Rollback Rehearsal (Wave: 2026-04-17)

- Executed at (UTC): 2026-04-17T18:45:40Z
- Host: hermes-cloud
- Rollback action: enforce feature flag multi_location_inventory_enabled=false

## Steps Executed
1. Read current flag value from system_settings.
2. Applied rollback command (idempotent): set multi_location_inventory_enabled=false.
3. Re-read flag value from system_settings.

## Results
- Value before command: false
- Value after command: false
- Outcome: PASS

## Notes
- This rehearsal validates deterministic feature-flag rollback without schema rollback.
