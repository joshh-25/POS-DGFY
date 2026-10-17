---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-17
related_adr: docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md
declaration_id: 2026-10-17-commerce-refund-failure-recovery
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.16
verification_evidence: commerce refund Jest suites 103/103 across 8 files,node --check on all 23 changed JavaScript files,npm run check:architecture PASS,npm run lint:docs PASS,npm run check:compliance PASS,app version-floor check PASS,git diff --check PASS,local disposable request-time preflight no_breach / ALLOWED
rollback_note: Revert the refund status applier, PayMongo reads, reconciler and scheduler, explicit retry route, customer-safe tracking payload, related contracts, tests, and this declaration together; no database migration or stored-data transformation is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-17T15:04:04.264Z
preflight_request_ref: PREFLIGHT-LOCAL-1792249298628-2026-10-17-COMMERCE-REFUND-FAILURE-RECOVERY
---

# Commerce refund failure recovery (#2549)

## Compliance Impact Classification

Major. The changed paths are classified as `payments` by the repository compliance
matrix. The change adds authenticated provider reads, an explicit administrator retry
route, refund-status reconciliation, and a customer-safe tracking summary. It does not
change payment capture, settlement eligibility, tax treatment, provider credentials,
or persisted schema.

## Affected Surfaces

- `payments` — PayMongo refund status reads and linking, the shared status applier,
  alerting, scheduled reconciliation, and the administrator retry route.
- Public Storefront order tracking — tenant-scoped lookup and a limited refund status,
  public reference, amount, and update timestamp.

## Compliance Preconditions

- PayMongo reads use server-held credentials and never log the authorization header,
  secret key, or provider payload in the customer response.
- A refund is retried only by an authenticated administrator after eligibility checks
  and a fresh provider read confirms no unlinked matching refund exists.
- Definite provider failures are never automatically retried; provider ambiguity is
  escalated for review rather than guessed or auto-linked.
- Customer tracking reveals no provider refund ID, failure code/reason, or provider
  payload, and the session lookup is scoped by authenticated tenant context and POS
  transaction identity.
- No database migration, tenant schema change, or permission relaxation is introduced.
- The request-time preflight passed `no_breach` / `ALLOWED` using the repository's
  disposable local MySQL and Redis fixture at `2026-10-17T15:04:04.264Z`, reference
  `PREFLIGHT-LOCAL-1792249298628-2026-10-17-COMMERCE-REFUND-FAILURE-RECOVERY`.

## Verification Evidence

All eight focused refund, reconciliation, retry, scheduler, PayMongo service, Store
tracking, route, and validator suites passed 103/103 tests. Syntax checks passed for all
23 changed JavaScript files. Compliance, architecture, docs/ADR lint, app-version-floor,
and whitespace checks passed. The disposable local request-time preflight returned
`no_breach` / `ALLOWED` at `2026-10-17T15:04:04.264Z` under reference
`PREFLIGHT-LOCAL-1792249298628-2026-10-17-COMMERCE-REFUND-FAILURE-RECOVERY`. Production
PayMongo webhook subscription confirmation remains a post-merge operator verification
under issue #2549 and is not claimed by this declaration.
