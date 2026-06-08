---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-05-21
applies_to: implementation_process
topic: architecture_governance
---

# Architecture Governance Playbook

## Goal
Keep every implementation aligned with the modular architecture and make drift fail fast in CI.

Target flow:

`routes -> controllers -> usecases -> repositories -> models`

## Ownership Model
1. Feature author owns design, implementation, and migration plan.
2. Reviewer enforces architecture checklist and evidence quality.
3. Tech lead approves any exception or temporary allowlist entry.

## Mandatory Process For Every Change
1. Classify the change:
- `no-architecture-impact`
- `within-existing-boundary`
- `cross-boundary`
2. Read planning docs in mandatory order:
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- relevant ADRs
3. If `cross-boundary`, create or update an ADR in `docs/architecture/adr/`.
4. Implement with module boundaries first; use legacy facades only for compatibility.
5. Provide proof in PR:
- `npm run check:architecture` output
- `npm run lint:docs` output (if docs changed)
- tests for changed behavior
- rollback notes for risky changes
6. Merge only when CI architecture gates pass.

## Implementation Hardening Contract
Every implementation that changes authentication, registration, invitations, account lifecycle, payment, checkout, tenant provisioning, or other cross-boundary user workflows must include a final hardening phase before it is considered done.

The hardening phase must address these common risks:

1. Replay and reuse risk: short-lived tokens, handoff artifacts, OTPs, invite links, and recovery codes must be single-use when the business action is single-use. Tests must prove replay rejection, not only successful first use.
2. Lifecycle completeness: when a flow introduces or depends on an account identity, it must cover the minimum expected account lifecycle for that surface, including profile update, password change or reset, logout/session cleanup, and explicitly deferred items.
3. Deferred verification honesty: if phone, email, identity, compliance, or permission verification is intentionally deferred, the contract must name the deferred field or behavior, state that it must not be treated as verified, and identify the future rollout path.
4. Submit-boundary safety: UI actions with different business effects must have separate form or action boundaries. Profile/password/settings mutations must not be nested inside create/register/checkout forms where accidental submits can perform the wrong mutation.
5. Backend boundary proof: controllers stay transport-only, business logic stays in use cases, persistence stays in repositories, and migrations/models are additive unless an ADR explicitly accepts destructive change.
6. Backend behavior proof: tests must cover success, validation failure, duplicate/conflict paths, replay/reuse attempts, and the persistence side effect that makes the behavior durable.
7. Frontend behavior proof: tests must cover the expected user-facing state, labels/copy that changed, disabled or gated states, and at least one negative proof that an adjacent form/action was not submitted accidentally.
8. Rendered UI proof: for user-facing React changes, run a local rendered check of the affected route with the in-app browser when available, or Playwright screenshot/DOM evidence as fallback. The check must include page identity, nonblank content, no framework overlay, console health for the target page, one primary interaction, and at least desktop plus one mobile viewport when practical.
9. Build-surface proof: run the build for every app surface affected by shared code or route ownership, not only the app where the file was edited.
10. Documentation closure: update the authoritative ADR or governed feature doc with the final hardening obligations, deferred risks, and validation commands so future similar work starts from the hardened contract instead of rediscovering it.

The final response or PR evidence must state which hardening items passed, which were intentionally deferred, and which residual risks remain.

## Guardrails (Automated)
1. `backend/scripts/check-architecture-guardrails.js`
- validates module structure (`index.js`, `README.md`)
- blocks non-repository model imports, except explicit allowlist entries
- blocks use-case imports from legacy services
- enforces module controller naming (`*Handlers.js`)
2. `backend/scripts/check-controller-boundaries.js`
- blocks direct model import in controllers
3. `.github/workflows/ci.yml`
- executes architecture checks before backend test suite
4. `.husky/pre-commit`
- runs architecture checks when architecture-sensitive files are staged
5. `scripts/lint-docs.js`
- validates governed docs metadata, authority conflicts, and internal links
6. `AGENTS.md`
- enforces mandatory documentation lookup order for AI agents

## Exception Policy
1. Add temporary exception in:
- `backend/src/config/architectureModelImportAllowlist.js`, or
- `backend/src/config/controllerModelImportAllowlist.js`
- `backend/src/config/architectureGuardrailsAllowlist.js`
2. Every exception must include:
- linked task ID
- planned removal phase/date
3. Exception without ADR + removal plan is non-compliant.

## Release Readiness Gates
1. Architecture gates pass in CI.
2. No new untracked exception entries.
3. Telemetry and logging updated for new user-facing behavior.
4. Rollback path documented for irreversible migrations.

## Audit Cadence
1. Per-PR: architecture checklist in PR template.
2. Weekly: remove stale allowlist entries.
3. Monthly: sample architecture integrity audit against production branch.
