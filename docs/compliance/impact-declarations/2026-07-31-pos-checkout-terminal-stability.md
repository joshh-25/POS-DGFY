---
status: reference
owner: engineering
last_reviewed: 2026-07-31
related_adr: 0007-dual-mode-pos-compliance-program.md,0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-31-pos-checkout-terminal-stability
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,CONFLICT,AUTHENTICATION_FAILED
policy_version: 2026.07.31
verification_evidence: POS checkout integration tests,POS terminal contract tests,Storefront contract tests
rollback_note: Revert the in-store convenience-fee exclusion, branch-scoped history query, terminal logout restoration, shift error diagnostics, and their tests together; no database migration is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-31T16:15:00+08:00
preflight_request_ref: POS-CHECKOUT-TERMINAL-20260731
---

# POS Checkout And Terminal Stability

## Compliance Impact Classification

Major. The change affects cashier checkout totals and terminal session behavior on
the governed POS and terminal surfaces. It removes the DGFY online convenience fee
from in-store cashier sales without changing tax, discount, receipt-numbering, or
Storefront online-order calculations.

## Affected Surfaces

1. In-store POS checkout persists zero DGFY convenience fee for every cashier order method.
2. POS history requests are scoped to the selected operating location.
3. Full cashier logout clears stale company authority and completes terminal restoration.
4. Shift-open failures preserve actionable backend conflict messages instead of reporting a false network outage.

## Compliance Preconditions

1. Storefront online-order convenience fees remain server-authoritative and unchanged.
2. Tax, restaurant service charge, discounts, inventory movements, and receipt numbering remain unchanged.
3. The backend remains authoritative for tenant membership, location access, terminal registration, and shift ownership.
4. Logout clears local authority before any subsequent protected workspace request can run.
5. Existing transaction and audit records are not rewritten.

## Verification Evidence

1. POS checkout DB, F&B contract, and reconciliation tests cover zero in-store convenience fees.
2. POS terminal contracts cover location-scoped history and complete cashier logout restoration.
3. Terminal unlock diagnostics tests cover backend conflict and generic server-failure messages.
4. Storefront contracts verify checkout item images receive the configured asset-origin resolver.
