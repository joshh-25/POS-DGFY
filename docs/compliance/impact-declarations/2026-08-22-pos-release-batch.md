---
status: reference
owner: engineering
last_reviewed: 2026-08-22
declaration_id: 2026-08-22-pos-release-batch
classification: major
surfaces: pos,terminal,payments,settings
reason_codes_impacted: POS_PAYMENT_INVENTORY_RELEASE_HARDENING
policy_version: 2026.08.22
verification_evidence: backend-matrix-560-of-560,frontend-contracts,architecture-and-docs-lint,local-pwa-smoke
rollback_note: Revert the aggregate batch by domain, preserving additive inventory migrations until active reservations are released or converted. Do not remove tenant reservation tables from schemas that contain active holds.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T00:00:00+08:00
preflight_request_ref: #843
---

# POS Release Batch: Payments, PWA, Terminal, and Online Inventory Hardening

## Compliance Impact Classification

Major. This batch changes POS checkout, payment boundary, terminal/PWA update, authorization,
Storefront order, and location-scoped inventory reservation behavior. It does not change payment
credentials, tax calculation, fiscal receipt rules, or production deployment configuration.

## Affected Surfaces

1. POS and terminal workflows — checkout, refunds/voids, parked sales, split payments, receipts,
   shifts, hardware outcomes, and PWA update safety.
2. Storefront/payments — direct PayMongo payment boundaries, payment reconciliation contracts, and
   online order inventory reservation behavior.
3. Settings/security — production authentication and mode-RBAC fallback auditing/remediation.
4. Tenant schema and inventory — additive reservation tables, location references, and retry-safe
   migration behavior.

## Compliance Preconditions

- No production credentials, payment tokens, or production database access are used by local
  validation.
- Walk-in merchant-owned tender behavior remains separate from Storefront PayMongo sessions.
- Inventory reservations remain tenant- and location-scoped and fail closed on active-hold
  shortfall.
- Any production deployment requires a reviewed PR, CI evidence, staging/canary qualification,
  and separate release authorization.

## Verification Evidence

- Backend matrix: 560/560 active tests passed across 9 groups and 144 chunks.
- Tenant schema/migration evidence: all 14 active tenant schemas repaired and reservation tables
  reported by the runtime schema doctor.
- Local PWA checks: Chrome 2/2 Playwright tests and Edge-compatible smoke pass; installed-browser,
  offline-fixture, hardware, staging, and canary gates remain explicitly open.
- Architecture guardrails, controller boundaries, documentation/ADR lint, merge hygiene, and
  development-to-production script-contract tests pass locally.

