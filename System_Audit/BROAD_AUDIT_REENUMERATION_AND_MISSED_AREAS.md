# Broad Audit Re-Enumeration and Missed Areas

Status: Current summary
Audit date: 2026-06-02

## What The Previous Audit Already Looked Across

The archived March 2026 audit files show that the earlier audit was mostly issue-by-issue and code-path focused. It already looked across these broad system areas:

- Authentication and token lifecycle: token blacklist, logout auth, refresh rotation, stale frontend company token, token refresh races, logout state.
- Authorization and tenant permission boundaries: mixed authorization paradigms, permission update validation, tenant lookup exposure, invite validation.
- Tenant provisioning and lifecycle: tenant handler memory behavior, connection pool eviction, provisioning cleanup, auto-provisioning rate limits, DDL interpolation, model factory inheritance.
- Payment and subscription logic: webhook verification, scheduler offsets, payment processing atomicity, billing date drift, scheduler email idempotency, upgrade endpoint payment state, subscription activation, webhook period-end reset.
- AI and file ingestion: prompt injection through uploads, permission check time-of-check/time-of-use, unbounded memory uploads, AI cost controls.
- Inventory and operational transactions: lost update races, job order atomicity, void logic and batches.
- Import and CSV handling: import validation bypass, CSV formula injection, CSV memory use, supplier import transactions, BOM handling.
- Reporting and analytics: anomaly detection N+1 behavior, unlimited report date ranges, report operator injection.
- Cache, state, and temp files: cache key collision, in-memory state scaling, temp file leaks.
- Rate limiting and infrastructure fallback: auth rate limiting disabled, Redis permanent failure behavior.
- Frontend state and API ergonomics: refresh race conditions, stale logout state, inconsistent API error handling.
- Database hygiene: plaintext database credentials, missing indexes, inconsistent soft deletes.

## What Was Missed Or Under-Covered

The prior audit did not appear to fully cover these broader production-readiness surfaces as first-class audit categories:

- Supply-chain posture across all package scopes: root, backend, and frontend dependency advisories, outdated direct dependencies, and patched-version tracking.
- Release gate integrity: exact local release verdict, backend/frontend lint, frontend budget artifacts, and release artifact evidence.
- Test-suite health as a release blocker: current frontend contract failures and lack of current complete backend green evidence.
- Production fail-closed configuration: default admin credential fallback and production env validation that logs without stopping.
- Browser session storage model: long-lived auth and refresh authority stored in browser-readable `localStorage`.
- Governed invitation migration: legacy company-token invite-link exposure was under-covered and is now remediated with token-only generated invitation links.
- Frontend maintainability and build performance: `StorefrontApp.jsx` exceeding Babel's 500KB deoptimization threshold.
- High-volume data access patterns: high-limit query paths that should be paginated, streamed, or proven bounded.
- File upload rejection timing: arbitrary MIME acceptance at the transport layer before deeper validation.
- Mode-aware RBAC migration closure: default-enabled generic fallback and legacy role remapping evidence.
- Architecture exception lifecycle: active allowlist exceptions due for removal by 2026-06-30.
- AI governance beyond schema validation: orphan handler cleanup plus missing adversarial, tenant-isolation, and cost-abuse gate evidence.
- Regulatory proof boundary: RMO 24-2023 internal checks versus external BIR filing/accreditation evidence.
- Payment operations proof: live/sandbox canary, webhook replay rejection, refund/failure handling, and settlement reconciliation evidence.
- Observability and SLOs: current dashboard, alert, escalation, and incident-drill evidence.
- Release evidence drift: stale or bypassable QA deployed-head evidence paths. The local release gate now has a current passing artifact for SHA `1e3a741049c81f6c366a9fee8a42ac2569c398e7`, but production SHA and deployed asset parity remain separate evidence requirements.

## Current Broad Audit Areas

The current audit intentionally expands from bug-list auditing into release-grade system auditing:

1. Security and authentication
2. Authorization and tenant isolation
3. Dependency and supply-chain risk
4. Payment and webhook integrity
5. Billing and settlement operations
6. Frontend contracts and user-facing workflow correctness
7. Backend testability and release evidence
8. Frontend performance, bundle health, and maintainability
9. Database/query scalability
10. File upload safety
11. AI registry, prompt-injection, tool-abuse, and cost controls
12. Architecture governance and allowlist debt
13. Compliance and fiscal-readiness evidence
14. Observability, SLOs, and incident readiness
15. Deployment evidence, SHA parity, and release-gate reproducibility

## Strict Conclusion

Yes, there were missed or under-covered areas. The previous audit was valuable, but it was concentrated on specific code defects. The new audit adds production-readiness, release-governance, operational-proof, dependency, regulatory-evidence, and system-scale categories that need to be tracked before the project can be called fully production hardened.
