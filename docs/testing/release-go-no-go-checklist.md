# Release Go/No-Go Checklist (Current)

Status: reference  
Last updated: 2026-04-23

## Current Release State

1. Technical gates: passing
2. Overall readiness: `in_progress` until human/ops signoffs close

Use `docs/testing/pos-readiness-status.md` as canonical source-of-truth for readiness status and blockers.

## Must-Pass Technical Gates

1. `npm run gate:release:local`
2. `npm run gate:release:no-staging:qa-env`
3. `node scripts/verify-release-verdict.js --file ".tmp/release-gates/<sha>/release_verdict.json" --sha "<sha>"`

## Remaining Non-Technical Blockers (Go/No-Go)

1. Cashier/admin UAT signoff evidence completed and reviewed
2. Source-separation parity proof reviewed
3. Strict location-binding operational acceptance logged

## Evidence Artifacts

1. Local readiness artifact:
   - `.tmp/release-gates/<sha>/local_readiness.json`
2. No-staging release verdict:
   - `.tmp/release-gates/<sha>/release_verdict.json`
3. Canonical readiness tracking:
   - `docs/testing/pos-readiness-status.md`

## Historical Snapshots

Date-specific snapshots are archived under:
1. `docs/archive/testing/2026-04/`
