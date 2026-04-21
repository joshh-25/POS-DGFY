# Release Go/No-Go Checklist (2026-04-21)

## Current Verdict

No-Go

Reason:
1. Human UAT and operations acceptance blockers in canonical POS readiness remain open.

Update (2026-04-21, night):
1. QA env wiring is now configured locally via `.env.qa.local`.
2. No-staging release gate is passing for target SHA `b315629978b9e772dc93d406c6ac15a8af53c655`.
3. Release verdict artifact confirms `verdict: pass` and `failed_gate_count: 0`.

## Evidence Snapshot

Automated checks passed:
1. `npm run doctor:runtime`
2. `npm --prefix frontend test`
3. `npm --prefix backend test`
4. `npm --prefix backend run test:frontend-ims-pos-sales-e2e:matrix`
5. `npm --prefix frontend run build:all`
6. `npm run check:architecture`
7. `npm run lint:docs`
8. `npm run check:compliance`
9. `npm run check:frontend-budgets`

Release-gate artifact generated (failed verdict):
1. `.tmp/release-gates/b315629978b9e772dc93d406c6ac15a8af53c655/release_verdict.json`

## Blocking Items (Must Close For Go)

1. QA smoke contract run
- Owner: Release/Ops
- Required input: `QA_BASE_URL`, `QA_COMPANY_TOKEN`, `QA_EMAIL`, `QA_PASSWORD` (or `QA_AUTH_JWT`)
- Exit condition: `qa.smoke.command` and `qa.smoke.artifact.ok` are `true`
- Status (2026-04-21 night): closed for current target SHA

2. QA rollback drill connectivity
- Owner: Release/Ops
- Required input: `QA_SSH_HOST` (+ optional `QA_SSH_PORT`, `QA_SSH_USER`, `QA_APP_DIR`)
- Exit condition: `qa.rollback.command` and `qa.rollback.artifact.ok` are `true`
- Status (2026-04-21 night): closed for current target SHA

3. QA restore drill connectivity
- Owner: Release/Ops
- Required input: `QA_SSH_HOST` (+ optional `QA_SSH_PORT`, `QA_SSH_USER`, `QA_APP_DIR`)
- Exit condition: `qa.restore.command` and `qa.restore.artifact.ok` are `true`
- Status (2026-04-21 night): closed for current target SHA

4. QA deploy summary evidence
- Owner: Release/Ops
- Required artifact: `.tmp/release-gates/<sha>/qa_deploy_summary.txt`
- Exit condition: `qa.deploy.summary.sha_match` is `true`
- Status (2026-04-21 night): closed for current target SHA

5. Human UAT signoff pack
- Owner: Cashier lead + Admin lead
- Required artifacts:
  - `docs/testing/pos-e2e-uat-checklist.md` (completed)
  - `docs/testing/pos-e2e-uat-run-2026-04-16.md` (updated with new run evidence)
- Exit condition: both roles sign off all critical flows

6. Source-separation parity proof
- Owner: Product QA
- Required evidence: POS History filter, Sales POS channel filter, CSV `pos_order_source` parity capture
- Exit condition: parity evidence attached and reviewed

7. Strict location-binding operational acceptance
- Owner: Operations
- Required evidence: remediation/provenance audit reviewed and approved for enforced rollout
- Exit condition: formal ops acceptance logged

## Re-run Sequence After Blocker Closure

1. `npm run gate:release:no-staging`
2. `node scripts/verify-release-verdict.js --file ".tmp/release-gates/<sha>/release_verdict.json" --sha "<sha>"`
3. Update `docs/testing/pos-readiness-status.md` overall status when all blockers are closed.
