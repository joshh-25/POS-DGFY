---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-04-07
applies_to: compliance_sensitive_feature_work
topic: request_time_preflight_protocol
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Request-Time Compliance Preflight Protocol

## Purpose
Ensure all compliance-sensitive feature work is classified and evaluated before implementation starts.

## Regulatory Source Chain (2026-04-07 Refresh)
1. BIR RR 7-2024, RR 11-2025, RR 26-2025
2. BIR RMO 24-2023, RMC 72-2025
3. NPC Circular 2022-04 + current NPC operational/security updates
4. BSP Circular 1049 + PSOF/MORPS framework context

Reference URLs:
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%207-2024%20%28final%29.pdf
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%2011-2025%20Digest.pdf
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025%20Digest.pdf
- https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023%20Digest%20FINAL.pdf
- https://www.bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2072-2025%20Digest.pdf
- https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf
- https://privacy.gov.ph/
- https://www.bsp.gov.ph/Regulations/Issuances/2019/c1049.pdf
- https://www.bsp.gov.ph/Regulations/Issuances/2020/1089.pdf
- https://www.bsp.gov.ph/Regulations/Issuances/2024/1191.pdf

## Mandatory Workflow
1. Classify requested work surfaces (`pos`, `terminal`, `settings`, `payments`, `compliance`).
2. Prepare `impact_declaration` payload with:
   - `declaration_id`
   - `classification`
   - `summary`
   - `affected_surfaces`
   - `reason_codes_impacted`
   - `policy_version`
   - `verification_evidence`
   - `rollback_note`
3. Call `POST /api/v1/compliance/preflight`.
4. Execute only if response is:
   - `result=no_breach`, `can_proceed=true`.
5. Block implementation when response is:
   - `result=breach` or `result=review_required`.

## API Contract Summary
- Endpoint: `POST /api/v1/compliance/preflight`
- Request body keys:
  - `request_name`
  - `surfaces`
  - `setting_keys`
  - `setting_updates`
  - `requested_document_type`
  - `terminal_id`
  - `impact_declaration`
- Response keys:
  - `result`
  - `can_proceed`
  - `reason_code`
  - `decisions[]`
  - `required_actions[]`
  - `declaration_id`

## CI/Developer Gates
1. `npm run check:compliance` enforces declaration quality for sensitive file changes.
2. `.husky/pre-commit` enforces declaration checks on staged sensitive files.
3. CI runs compliance check before backend tests.

## Dirty Worktree Handling
1. Use path-scoped diffs while preparing declaration evidence:
   - `git diff -- backend/src/modules/compliance`
   - `git diff -- frontend/Pages/Settings.jsx`
2. Stage only files belonging to declared surfaces.
3. If unrelated dirty files exist, do not include them in declaration evidence.
4. If declaration surfaces do not match staged sensitive files, treat as preflight failure.

## Operational Rule
When a user request conflicts with policy decisions, communicate the breach reason code first and block execution until controls are satisfied.
