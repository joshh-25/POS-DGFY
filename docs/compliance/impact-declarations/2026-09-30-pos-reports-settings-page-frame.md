---
status: draft_pr
owner: DGFY POS/shared UI
last_reviewed: 2026-09-30
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-09-30-pos-reports-settings-page-frame
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: Focused POS contract tests and production build; architecture and compliance checks
rollback_note: Revert the shared POS shell change and this declaration together; no persisted data or API behavior changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-30T12:59:30.161Z
preflight_request_ref: PREFLIGHT-36717925034-2026-09-30-POS-REPORTS-SETTINGS-PAGE-FRAME
---

# POS Reports and Settings page frame

## Compliance Impact Classification

The shared POS frontend path has a mechanical `major` floor for the `pos` and
`terminal` surfaces. This change honors the existing bare-frame request from
Reports and Settings, removing only their redundant outer border, background,
rounding, and shadow. The normal and Incoming Online Queue frames are unchanged.

## Affected Surfaces

- `pos` — Reports and Settings page framing.
- `terminal` — shared terminal workspace shell presentation.

## Compliance Preconditions

No authorization, location scope, transaction, fiscal calculation, payment,
API, schema, or persisted data behavior changes. No live request-time preflight
was run. The `NOT-EXECUTED-*` reference is a develop-PR placeholder requiring
reconciliation through the established compliance sweep before promotion.

## Verification Evidence

Focused POS contracts, the POS production build, and repository architecture
and compliance checks are required before this change is pushed.
