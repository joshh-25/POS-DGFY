---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-21
related_adr: 0085-pos-employee-credit-mixed-split-tender.md
declaration_id: 2026-09-21-pos-split-payment-responsive-layout
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,UI_LAYOUT
policy_version: 2026.09.21
verification_evidence: POS split-payment UI contract; POS manual-tender behavior contract; app-local frontend ESLint; POS production build; git diff check
rollback_note: Restore the horizontally scrollable split-payment method row and its focused contract expectation; no payment, transaction, tenant, ledger, or production-data rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.557Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-21-POS-SPLIT-PAYMENT-RESPONSIVE-LAYOUT
---

# POS split-payment responsive layout

## Compliance Impact Classification

Major because the changed component is under the POS and terminal compliance
surface. The change is presentation-only: it removes horizontal overflow from
the split-payment tender selector and does not alter payment methods, amounts,
validation, allocation, completion, or Employee Credit ledger behavior.

## Affected Surfaces

- POS Split Payment tender-method selector on desktop and narrow screens.
- Responsive presentation of the existing Cash, GCash, Maya, Card, Bank
  Transfer, and Employee Credit controls.

## Compliance Preconditions

- Existing tender selection, duplicate-method prevention, disabled states,
  Employee Credit verification, and payment submission handlers remain
  unchanged.
- The layout remains keyboard-accessible through the existing buttons and keeps
  the existing ARIA group and pressed-state attributes.
- No API, schema, migration, payment, transaction, ledger, tenant, or
  production-data behavior changes.

## Verification Evidence

- Split-payment UI and manual-tender behavior contracts passed (27 tests).
- App-local ESLint passed with zero errors; the only remaining warning is the
  pre-existing `finishReadySession` Hook dependency warning.
- POS production build passed with 3,823 modules transformed and only the
  existing Vite dynamic-import warnings; `git diff --check` passed.

**Live request-time compliance preflight was not executed.** This local
declaration uses the documented `NOT-EXECUTED-*` placeholder and must be
reconciled by the governed preflight process before promotion. No production
deployment, payment transaction, or tenant data mutation was performed.
