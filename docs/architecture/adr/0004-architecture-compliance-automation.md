# ADR 0004: Architecture Compliance Automation

## Status
Accepted (2026-03-06)

## Context
Architecture drift risk remains high during ongoing refactor and parallel feature work. Existing guidance was partially documented, but not fully enforced at commit and CI gates.

## Decision
Adopt a compliance automation baseline:

1. Add `check-architecture-guardrails` script for module structure and layer boundary checks.
2. Run architecture checks in CI before backend test execution.
3. Run architecture checks in pre-commit for architecture-sensitive staged files.
4. Standardize PR architecture checklist and evidence requirements.

## Consequences
1. Non-compliant layering fails early in developer workflow.
2. Exception handling becomes explicit via allowlist + removal plan.
3. PRs include architecture proof instead of implicit assumptions.
4. Slightly higher local and CI validation time, with lower regression risk.
