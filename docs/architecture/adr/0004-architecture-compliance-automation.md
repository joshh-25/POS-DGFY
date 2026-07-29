---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-03-06
last_reviewed: 2026-03-06
review_by: 2026-09-06
applies_to: architecture_decision
topic: architecture_compliance_automation
---

# ADR 0004: Architecture Compliance Automation

## Status
Accepted (2026-03-06)

## Context
Architecture drift risk remains high during ongoing refactor and parallel feature work. Existing guidance was partially documented, but not fully enforced at commit and CI gates.

## Decision

> **Strictness tiers (ADR 0039).** Clauses below are tagged `[binding]`, `[default]`,
> or `[snapshot]`. `binding` needs a superseding ADR to change; `default` needs an
> amendment block in the implementing PR; `snapshot` is documentation and may be
> updated by ordinary work. Untagged clauses elsewhere in this document are `default`.

Adopt a compliance automation baseline:

1. Add `check-architecture-guardrails` script for module structure and layer boundary checks. `[binding]`
2. Run architecture checks in CI before backend test execution. `[binding]`
3. Run architecture checks in pre-commit for architecture-sensitive staged files. `[default]`
4. Standardize PR architecture checklist and evidence requirements. `[default]`

## Consequences
1. Non-compliant layering fails early in developer workflow.
2. Exception handling becomes explicit via allowlist + removal plan.
3. PRs include architecture proof instead of implicit assumptions.
4. Slightly higher local and CI validation time, with lower regression risk.
