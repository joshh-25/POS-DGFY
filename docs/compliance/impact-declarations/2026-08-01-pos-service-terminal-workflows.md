---
status: reference
owner: engineering
last_reviewed: 2026-08-01
related_adr: 0016-services-mode-independent-booking-and-ticketing.md
declaration_id: 2026-08-01-pos-service-terminal-workflows
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT
policy_version: 2026.08.01
verification_evidence: POS service workflow contract tests,POS terminal contract tests,backend service and payment tests
rollback_note: Revert the service workflow panels, option management, checkout validation, terminal safeguards, schema migrations, and associated tests together.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-01T19:30:00+08:00
preflight_request_ref: POS-SERVICE-TERMINAL-WORKFLOWS-20260801
---

# POS Service And Terminal Workflows

## Compliance Impact Classification

Major. This batch changes governed POS checkout and terminal behavior by adding
mode-specific service workflows, configurable service options, and checkout
validation. Payment, discount, inventory, shift, and receipt authority remains
server-side.

## Affected Surfaces

1. Service-mode checkout uses walk-in and appointment workflows instead of F&B fulfillment choices.
2. Service option groups and options are managed and quoted through governed service APIs.
3. Checkout is blocked until its selected workflow and customer payment data are valid.
4. Terminal recovery and error handling preserve authenticated-session boundaries.

## Compliance Preconditions

1. The backend remains authoritative for tenant membership, permissions, terminal assignment, shifts, prices, payments, and inventory.
2. Service options cannot bypass server-side quote and validation paths.
3. F&B workflows retain their existing order methods and calculations.
4. Existing financial and audit records are not rewritten by these changes.

## Verification Evidence

1. Backend focused validation passed 10 suites and 94 tests covering service options, payments, POS application results, schema audits, OTP, and tenant schema synchronization.
2. Frontend focused validation passed 9 files and 47 tests covering workflow resolution, service panels, service options, terminal behavior, employee credit, and responsive layout.
3. Architecture, controller-boundary, and tenant schema registry guardrails passed during pre-commit validation.
