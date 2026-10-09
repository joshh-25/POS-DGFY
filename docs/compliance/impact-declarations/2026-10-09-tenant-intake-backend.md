---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-09
related_adr: docs/architecture/adr/0090-tenant-intake-proposal-confirmation.md
declaration_id: 2026-10-09-tenant-intake-backend
classification: regulatory
surfaces: pos,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.10.09
verification_evidence: 83 tests passed in 5 focused Jest suites and 7 compliance-floor regression tests passed; disposable MySQL migration up/re-run and real OFFICIAL/DEMO 157-table provisioning passed with concurrent/replay denial; changed-file node --check, targeted ESLint, architecture and docs/ADR checks passed (Phase 485 and PR evidence)
rollback_note: Revert API callers and retain landlord proposals/audits/is_demo. Migration down refuses automatic destructive rollback; preserve and reconcile executing/failed records before any operator-reviewed schema change.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-09T05:03:27.846Z
preflight_request_ref: PREFLIGHT-37886055710-2026-10-09-TENANT-INTAKE-BACKEND
---

# Tenant intake backend (#2372, Phase 485)

## Compliance Impact Classification

Regulatory classification approved by Pat on 2026-10-09 in the implementation session (reply:
`approve`), matching the tenant-admin repository's
`settings,compliance` path floor. The existing auth-middleware classifier also includes the `pos` surface. Intake adds a proposal/approval boundary around the existing
account-and-tenant provisioning path; it changes no fiscal-document, payment or settlement rules.

## Affected Surfaces

- Platform Admin authentication route matrix: both tenant and DGFY account permissions.
- Tenant provisioning: shared validators, DEMO defense in depth, persisted target classification.
- Landlord proposal/audit data: one-hour expiry, atomic single-use approval, PII-minimized provenance.
- OpenAI extraction: no tools, strict fields, no credentials or raw-document persistence.

## Compliance Preconditions

Human review must precede confirmation. The token/tool distinction does not enforce cryptographic
human presence. Model-provided contact data is unverified; existing admin-provisioned identity
semantics are preserved. DEMO must fail outside the #653 environment guard.

**Live request-time preflight was not executed.** The front matter contains the established
develop-PR placeholder shape, not runtime evidence. `NOT-EXECUTED-*` must be reconciled by the
governed sweep before promotion. Pat approved this regulatory declaration and the concrete landlord migration before committing
on 2026-10-09. This human checkpoint does not substitute for live request-time preflight.

## Verification Evidence

Focused tests, real disposable MySQL proof and final check results are recorded in Phase 485 and
the PR's Testing Evidence. UI, MCP, live provider and deployed-environment proof are deferred to the
later #2372 PRs and post-merge verification. No merge or deployment is authorized by this declaration.
