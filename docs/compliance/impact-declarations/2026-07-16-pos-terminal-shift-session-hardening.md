---
status: reference
owner: engineering
last_reviewed: 2026-07-16
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-16-pos-terminal-shift-session-hardening
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: TERMINAL_SESSION_REQUIRED,SHIFT_CONTEXT_REQUIRED,TERMINAL_SHIFT_ACTIVE
policy_version: 2026.07.16
verification_evidence: pos-terminal-readiness-tests,pos-terminal-contract-tests,frontend-pos-terminal-integration-tests,pos-production-build,architecture-guardrails,controller-boundaries,compliance-api-contracts,diff-check
rollback_note: Revert the terminal session verification, active-shift visibility, location-scope presentation, and queue sort changes together; no transaction, payment, receipt, or inventory records are migrated or rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-16T17:54:00+08:00
preflight_request_ref: POS-TERMINAL-SHIFT-2026-07-16
---

# POS Terminal Shift And Session Hardening

## Compliance Impact Classification

Major. This work verifies the selected-company POS session before protected workspace requests, exposes the existing active terminal shift to the authorized master administrator, and improves terminal queue/location presentation. It does not change payment authorization, fiscal receipt generation, transaction totals, inventory movements, or Storefront contracts.

## Affected Surfaces

- POS terminal authentication and cashier bootstrap route ordering.
- POS active-shift read model, master-administrator closeout visibility, and location scope presentation.
- POS incoming-order queue sorting and empty-state lifecycle guidance.

## Compliance Preconditions

- Cashier login retains tenant context, premium and capability checks, POS rate limiting, and credential validation before the login use case runs.
- Cashier users remain limited to their own shift; only the existing master-administrator authorization can view another cashier's active shift for authorized closeout.
- Local queue sorting changes no order status, payment, fulfillment, receipt, or Storefront API.
- Location selection before an admin shift is navigation-only; terminal assignment continues to govern shift opening.

## Verification Evidence

- Backend terminal readiness tests cover master-admin and cashier active-shift scopes.
- Frontend terminal view-mode and location-scope integration tests cover protected startup, active-shift presentation, and queue behavior.
- POS production build, architecture guardrails, controller-boundary checks, compliance API contracts, and diff whitespace validation pass.
