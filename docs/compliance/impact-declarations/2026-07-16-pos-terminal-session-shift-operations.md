---
status: reference
owner: engineering
last_reviewed: 2026-07-16
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-16-pos-terminal-session-shift-operations
classification: major
surfaces: pos,terminal
reason_codes_impacted: TERMINAL_SESSION_REQUIRED,SHIFT_CONTEXT_REQUIRED,TERMINAL_SHIFT_ACTIVE
policy_version: 2026.07.16
verification_evidence: pos-terminal-readiness-tests,pos-terminal-contract-tests,frontend-store-contract-tests,pos-production-build,architecture-guardrails,controller-boundaries,diff-check
rollback_note: Revert POS terminal session validation, active-shift visibility, and queue presentation changes together; no transaction, payment, receipt, or inventory records are migrated or rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-16T17:50:00+08:00
preflight_request_ref: POS-DEVELOPMENT-2026-07-16
---

# POS Terminal Session And Shift Operations

## Compliance Impact Classification

Major. This work hardens POS terminal session validation, makes the terminal's active shift visible to the authorized master administrator, and improves queue presentation. It does not change payment authorization, fiscal receipt generation, transaction totals, inventory movements, or Storefront checkout contracts.

## Affected Surfaces

- POS terminal authentication: protected POS requests wait for a verified selected-company session.
- POS shifts: master administrators can view the active shift for the selected terminal to use the existing authorized closeout flow; cashier visibility remains restricted to the cashier's own shift.
- POS queue and workspace: active orders can be sorted locally and empty-state lifecycle guidance is shown only when no active orders exist.
- POS item media: primary item images are optimized before public delivery while original files remain private.

## Compliance Preconditions

- Cashier login remains subject to tenant context, premium and capability checks, request validation, and POS rate limiting before credentials are processed.
- Only the existing master-administrator authorization can view or close another cashier's active terminal shift; no new financial permission is granted.
- Queue sorting does not change order status, payment, fulfillment, receipt, or Storefront APIs.
- Image optimization does not alter item pricing, inventory quantities, transaction data, or payment records.

## Verification Evidence

- Backend image asset, upload configuration, and terminal shift readiness tests.
- Frontend POS terminal, DGFY session, Storefront image fallback, and account dashboard tests.
- POS production build, architecture guardrails, controller-boundary checks, and diff whitespace validation.
