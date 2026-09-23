---
status: reference
authority_level: reference
owner: DGFY POS/settings
last_reviewed: 2026-09-23
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-09-23-pos-backoffice-settings-layout
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.23
verification_evidence: focused_pos_settings_tests,pos_build,architecture_guardrails,git_diff_check
rollback_note: Revert the shared POS Storefront Settings layout alignment and this declaration; no settings data, payment state, fiscal record, permission, or tenant row rollback is required.
preflight_result: no_breach
preflight_reason_code: UI_LAYOUT_ONLY
preflight_run_at: 2026-09-23T13:30:00+08:00
preflight_request_ref: BACKOFFICE-SETTINGS-20260923-LOCAL-ONLY
---

# POS Back Office Settings layout alignment

## Compliance Impact Classification

Major by the repository path policy because the shared Settings component is under
`packages/web-core/src/features/pos/`. The change only aligns the Storefront
Settings subtab and panel rendering with the staging POS Settings design while
preserving the existing Back Office permission, read-only, and dirty-state
guards.

## Affected Surfaces

- POS Settings Storefront subtab navigation and its active panel relationship.
- POS Back Office Settings pages that reuse the shared POS Settings workspace.

## Compliance Preconditions

1. Existing `canEditSettings`, `readOnly`, `locked`, and dirty-state checks remain
   authoritative for all Settings mutations.
2. The change does not alter settings service calls, payloads, authorization,
   tenant scoping, payment behavior, tax/fiscal behavior, or persistence.
3. IMS Settings is not changed and no duplicate Settings owner is introduced.
4. This is local implementation evidence only; live request-time compliance
   preflight was not executed.

## Verification Evidence

- Focused POS Settings and Back Office contract/behavior tests passed: 4 files,
  131 tests.
- POS production build passed with only existing Vite dynamic-import warnings.
- POS split-payment API tests passed: 2 suites, 21 tests.
- Architecture guardrails and controller-boundary checks passed.
- The local POS stack reported all five services healthy, and the POS root and
  Back Office Settings URL returned HTTP 200.
- `git diff --check` passed. Shared-package ESLint could not start because the
  workspace does not install `eslint-plugin-react` under `packages/web-core`.

No production deployment, tenant data mutation, payment operation, or external
provider call was performed.
