---
status: reference
owner: engineering
last_reviewed: 2026-08-16
declaration_id: 2026-08-16-pos-audit-shift-handoff
classification: major
surfaces: pos,terminal,payments,discounts,audit,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.16
verification_evidence: complete backend test matrix,full frontend test suite,POS discount and reconciliation integration tests,parked-sale and split-payment contracts,audit route tests,Android bridge build,production web builds,architecture and compliance guardrails
rollback_note: Revert the POS audit workspace, shared parked-sale ownership, shift handoff, split-payment UI, discount authorization, device bridge, migrations, tests, ADR amendments, and this declaration together; preserve previously issued fiscal and payment records.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-16T17:40:00+08:00
preflight_request_ref: PHASE-97
---

# POS Audit, Shift Handoff, and Payment Operations

## Compliance Impact Classification

Major because the change touches POS authorization, discounts, payment
breakdowns, parked-sale ownership, shift lifecycle, audit evidence, and device
operation. It preserves immutable fiscal records and adds explicit actor,
terminal, shift, and event context for operational review.

## Affected Surfaces

1. Admin-only POS audit search and human-readable event descriptions.
2. Governed discount approval, application, and audit evidence.
3. Split-payment entry, reconciliation, and close-report breakdowns.
4. Location-shared parked sales and cashier/shift handoff.
5. Terminal login, resume, close-shift, notification, responsive UI, and iMin
   device bridge controls.

## Compliance Preconditions

1. Audit records are tenant scoped; the audit workspace requires an authorized
   tenant administrator and does not expose data across tenants.
2. Discount events record the specific action, actor, sale context, and governed
   approval result instead of a generic update label.
3. Parked carts may transfer between authorized cashiers at the same location,
   but payment, stock, and fiscal completion remain bound to the cashier and
   shift that actually complete the sale.
4. Closing a shift is no longer blocked by a location-shared parked cart; an
   active split-payment session still requires explicit resolution.
5. Tender breakdowns remain append-only reconciliation evidence and do not
   rewrite issued transaction totals or fiscal documents.
6. Database changes are forward migrations with tenant-schema repair coverage.
7. This declaration authorizes implementation validation only, not deployment
   or promotion to `main`.

## Verification Evidence

1. The complete backend inventory passed: 518 tests across authentication,
   payments, POS/fiscal, storefront, inventory, AI, database, and platform
   groups.
2. The complete frontend inventory passed: 332 files and 1,863 tests.
3. Focused discount, split-payment, parked-sale, audit, shift recovery, and
   sales-reconciliation tests passed after the database migrations were
   applied.
4. Production builds, frontend budget checks, backend/frontend lint (zero
   errors), architecture guardrails, controller boundaries, ADR/docs lint,
   compliance checks, dependency audit, and Android debug variants passed.
