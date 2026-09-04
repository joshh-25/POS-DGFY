---
status: reference
owner: engineering
last_reviewed: 2026-09-04
declaration_id: 2026-09-04-pos-discount-beneficiaries-and-stale-shift-recovery
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,POS_PARKED_SALES_UNRESOLVED,POS_PAYMENT_SESSIONS_FUNDED_UNRESOLVED
policy_version: 2026.09.04
verification_evidence: focused backend unit and database integration tests,focused frontend contract tests,POS production build,architecture and documentation gates,changed-file prohibited-marker scan
rollback_note: Revert the stale-shift frontend preflight and discount-beneficiary commits in reverse dependency order; retain the additive beneficiary table until dependent application code and persisted records have been assessed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T20:26:35+08:00
preflight_request_ref: LOCAL-POS-DEVELOPMENT-20260904
---

# POS Discount Beneficiaries and Stale-Shift Recovery

## Compliance Impact Classification

Major. The change adds normalized statutory discount beneficiaries and allocation
evidence to POS transactions, extends receipt and report presentation for those
beneficiaries, and corrects the master-admin stale-shift recovery preflight. It
does not change VAT computation, fiscal document classification, parked-sale
ownership, or the backend authority that blocks unresolved financial work.

## Affected Surfaces

1. POS Senior/PWD beneficiary validation, discount allocation, persistence, and reporting.
2. Customer receipt and iMin receipt presentation of multiple statutory beneficiaries.
3. Tenant schema synchronization and runtime schema checks for the additive beneficiary table.
4. Master-admin stale-shift recovery preflight and its existing parked-sale safeguards.

## Compliance Preconditions

1. Beneficiary quantities must be positive, non-overlapping, and no greater than eligible cart quantities.
2. Persisted beneficiary and allocation rows must remain linked to the authoritative POS transaction and transaction lines.
3. Existing VAT, statutory-discount, tenant, location, terminal, cashier, and fiscal-document controls remain authoritative.
4. Normal parked-sale reads and mutations remain restricted to the cashier who owns the shift.
5. Master-admin stale-shift recovery remains explicit, stale-age-gated, reasoned, idempotent, audited, and blocked by unresolved server parked sales or funded payment sessions.
6. The additive migration must remain registered in tenant schema synchronization and must not be reversed while dependent records exist.
7. This declaration covers local development commits only and does not authorize deployment or promotion.

## Verification Evidence

1. Backend discount calculator, policy, migration, and database integration suites passed (34 tests).
2. Backend stale-shift recovery suite passed (4 tests), including unresolved parked-sale rejection and idempotent replay.
3. Frontend discount and terminal contract suites passed (58 tests).
4. The POS production build completed successfully.
5. Architecture guardrails, controller boundaries, governed-document lint, and ADR validation passed.
6. `git diff --check` and the changed-file prohibited-marker scan passed before staging.
