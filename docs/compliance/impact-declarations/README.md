---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-07
applies_to: compliance_sensitive_changes
topic: compliance_impact_declaration
---

# Compliance Impact Declarations

Create one markdown file per compliance-sensitive change.

Required front matter keys in each declaration:
- `declaration_id` (`YYYY-MM-DD-slug`)
- `classification` (`minor|major|regulatory`)
- `surfaces` (comma-separated: `pos,terminal,settings,payments,compliance`)
- `reason_codes_impacted` (comma-separated reason codes)
- `policy_version` (`YYYY.MM.DD`)
- `verification_evidence` (comma-separated command/evidence refs)
- `rollback_note` (single-line rollback summary)

Additional required front matter keys when `classification` is `major` or `regulatory`:
- `preflight_result` (must be `no_breach`)
- `preflight_reason_code` (decision reason code from preflight)
- `preflight_run_at` (ISO datetime of preflight run)
- `preflight_request_ref` (ticket/PR/request reference for the preflight run)

Required sections in each declaration:
- `## Compliance Impact Classification`
- `## Affected Surfaces`
- `## Compliance Preconditions`
- `## Verification Evidence`

Recommended filename:
- `YYYY-MM-DD-short-change-name.md`

Example:
- `2026-04-06-dual-mode-pos-compliance-program.md`
