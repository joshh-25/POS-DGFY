---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-15
declaration_id: 2026-09-15-pos-manager-access-phase-366
classification: major
surfaces: pos,terminal
reason_codes_impacted: PERMISSION_DENIED,POS_OPERATOR_INACTIVE
policy_version: 2026.09.15
verification_evidence: focused POS navigation and terminal view-mode contract tests, credential-gated manager-access E2E coverage, documentation lint, compliance checks, git diff check
rollback_note: Revert the Phase 366 manager-entry, locked-terminal refresh, authentication feedback, navigation wording and focused tests/declaration together; preserve cashier shift, cart, terminal lock and server authorization behavior.
preflight_result: no_breach
preflight_reason_code: LOCAL_ONLY
preflight_run_at: 2026-09-15T20:46:59+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-366-LOCAL-ONLY
---

# POS manager access while terminal checkout is locked

## Compliance Impact Classification

Major because the change affects the POS terminal entry path for an authorized
manager while preserving the cashier checkout lock. It changes only navigation,
session feedback and background settings refresh behavior; it does not weaken
server-side company membership, permission, device or shift authorization.

## Affected Surfaces

- POS manager navigation and Business Admin entry.
- Terminal locked-state rendering and background settings synchronization.

## Compliance Preconditions

- The caller must have an authenticated terminal identity and Business Admin permission.
- Cashiers and unauthorized direct requests remain denied.
- Opening Business Admin must not open a shift, change cart state or bypass terminal/device policy.
- Expired or missing identity must produce actionable sign-in feedback.

## Verification Evidence

- Focused POS navigation and terminal view-mode contract coverage is staged with this change.
- Credential-gated manager-access and settings-synchronization E2E coverage is staged for execution in an authenticated environment.
- Repository compliance, documentation, architecture and whitespace checks run through the commit hooks.
