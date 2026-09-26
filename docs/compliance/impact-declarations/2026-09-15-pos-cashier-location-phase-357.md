---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-15
declaration_id: 2026-09-15-pos-cashier-location-phase-357
classification: major
surfaces: pos,terminal
reason_codes_impacted: POS_OPERATOR_ACTIVE_ELSEWHERE,POS_OPERATOR_LOCATION_GRANT_REQUIRED,POS_OPERATOR_CONCURRENT_CHANGE,POS_OPERATOR_INACTIVE,POS_SHIFT_OPEN_ONLINE_REQUIRED
policy_version: 2026.09.15
verification_evidence: disposable migrated MySQL acceptance matrix; read-only tenant grant/state/index audit; offline/reconnect queue retention tests; architecture, docs, lint and API-contract checks
rollback_note: Remove only the Phase 357 acceptance harness, audit command, documentation and compliance declaration together after review. No production rows, grants, schema, financial policy or authority behavior are changed by this phase.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.556Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-15-POS-CASHIER-LOCATION-PHASE-357
---

# Phase 357 cashier location hardening

## Compliance Impact Classification

Major test and acceptance coverage for POS terminal authority, branch grants,
operator concurrency and offline queue reconciliation. The implementation adds
no new financial, tax, invoice, tender, stock-valuation or production access
policy; it makes no production database or saved-grant writes.

## Affected Surfaces

POS and terminal acceptance evidence for the Phase 354 cashier-location
contract. The only compliance-sensitive source path is the shared POS offline /
reconnect test coverage; backend acceptance and audit files are local test and
read-only tooling.

## Compliance Preconditions

The existing server-authoritative operating-scope, tenant isolation, device
proof, attendance, drawer custody, idempotency and financial transaction
boundaries remain unchanged. Rejected authority must not create partial money,
stock, drawer, attendance or operator effects. Queued evidence must remain
available for manual resolution. Ambiguous saved item-edit grants are reported,
never rewritten automatically.

## Verification Evidence

The phase report and ledger record the disposable MySQL matrix, read-only tenant
audit, offline/reconnect tests, focused lint, documentation and architecture
checks. The repository-wide compliance scan may include unrelated dirty-worktree
declaration mismatches; the Phase 357 declaration is also validated with a
scoped changed-file invocation.

**Live request-time preflight was not executed.** The `no_breach` frontmatter is
the repository's documented local-only placeholder shape, not a runtime
compliance response. This phase has no commit, push or deployment. The
placeholder must be reconciled by the governed preflight process before
promotion; a passing declaration check alone does not certify production
readiness.
