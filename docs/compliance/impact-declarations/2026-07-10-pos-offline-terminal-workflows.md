---
status: reference
owner: engineering
last_reviewed: 2026-07-10
related_adr: 0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-07-10-pos-offline-terminal-workflows
classification: major
surfaces: pos,terminal,pwa
reason_codes_impacted: ALLOWED
policy_version: 2026.07.10
verification_evidence: POS production build,focused POS contract tests,docs lint
rollback_note: Revert the offline terminal workflow commit; queued records remain durable and must be reconciled manually before removing the UI surface.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T21:00:00+08:00
preflight_request_ref: POS-OFFLINE-TERMINAL-2026-07-10
---

# POS Offline Terminal Workflows

## Compliance Impact Classification

Major. This changes client-side offline queue control and browser-local operational snapshots. It does not change the backend fiscal transaction contract, payment authorization, or Storefront API routes.

## Affected Surfaces

- POS checkout queue, provisional receipts, cached report viewing, and data-only item drafts.
- POS terminal offline navigation and manual sync policy.
- iPhone PWA input and responsive QA behavior.

## Compliance Preconditions

- Final checkout replay remains server-authoritative and uses the existing checkout idempotency contract.
- Offline cash sales remain provisional until sync; fiscal printing remains blocked while pending.
- Item drafts with uncertain create results require manual resolution and are not retried automatically.
- Manual Sync is operator-controlled and limited locally to two attempts per terminal/user day.

## Verification Evidence

- `npm --prefix frontend run build:pos`
- `npm --prefix frontend exec vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/posPageShell.contract.test.js`
- `npm run lint:docs`
