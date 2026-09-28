---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-22
related_adr: 0085-pos-employee-credit-mixed-split-tender.md
declaration_id: 2026-09-22-pos-employee-credit-visibility-gate
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED,AUTHORIZATION_FAILED,VALIDATION_FAILED
policy_version: 2026.09.22
verification_evidence: split-payment UI behavior and contract tests; POS production build; git diff check
rollback_note: Remove the Employee Credit visibility gate, focused regression coverage, contract wording, declaration, and ledger entry; no transaction, ledger, tenant, or production-row rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.557Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-22-POS-EMPLOYEE-CREDIT-VISIBILITY-GATE
---

# POS Employee Credit split-payment visibility gate

## Compliance Impact Classification

Major because the change controls visibility of an existing POS payment tender
using the existing Employee Credit permission and active-location eligibility
boundary. It does not add a financial owner, change allocation settlement, or
replace the server-side authorization and account verification controls.

## Affected Surfaces

- POS split-payment tender selector.
- Terminal permission and active-location Employee Credit eligibility wiring.
- Existing Employee Credit payment panel and split allocation flow.

## Compliance Preconditions

- Unauthorized operators do not receive an Employee Credit selector or trigger
  the eligibility lookup.
- Authorized operators see Employee Credit only when the active location has at
  least one active, configured, eligible account.
- The existing Employee Credit selection verification and backend authorization
  remain authoritative; a hidden selector is only a UI safety boundary.
- The lookup fails closed and no payment, account, tenant, or production data is
  mutated by this local change.

## Verification Evidence

- Focused split-payment UI behavior and source-contract tests passed (29 tests),
  including unauthorized, authorized-but-unconfigured, and authorized-and-
  eligible cases.
- POS production build passed with only the existing Vite dynamic-import
  warnings.
- `git diff --check` passed. Targeted ESLint could not start because the shared
  package resolves `eslint-plugin-react` from `packages/web-core`, where that
  dependency is not installed; this is an existing workspace dependency
  resolution limitation, not a lint finding.

**Live request-time compliance preflight was not executed.** This local
declaration uses the documented `NOT-EXECUTED-*` placeholder and must be
reconciled by the governed preflight process before promotion. No production
deployment, transaction, ledger data mutation, or external provider call was
performed.
