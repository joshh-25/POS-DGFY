---
status: reference
owner: engineering
last_reviewed: 2026-09-06
related_adr: docs/architecture/adr/0080-item-multi-category-membership.md
declaration_id: 2026-09-05-pos-items-catalog-pagination
classification: major
surfaces: pos,terminal,catalog-api
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: 96 focused backend tests,23 focused POS Items UI tests,POS production build,npm run check:architecture,npm run lint:docs,git diff --check
rollback_note: Revert the opt-in catalog pagination contract and POS Items caller; no stored data, migration, payment, receipt, or production operation is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T11:20:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-297-LOCAL-ONLY
---

# POS Items catalog pagination (Phases 297-298)

## Compliance Impact Classification

Major. The authenticated POS catalog read contract gains opt-in pagination and
management filters. Legacy callers retain their array response. Catalog writes,
prices, discounts, tax, payments, receipts, fiscal records, and reports are unchanged.

## Affected Surfaces

- POS Items catalog search, category and stock filtering, counts, and pagination.
- Authenticated `GET /api/v1/pos/catalog` query validation and read behavior.

## Compliance Preconditions

- Existing authentication, POS permission, tenant context, and location authorization apply.
- POS visibility is enforced before paginated results and counts are returned.
- Location stock is read through the existing overlay; no stock quantity is written.
- Category matching retains ADR 0080 primary-plus-secondary membership semantics.
- Existing Sell, scanner, and other legacy catalog callers keep the array contract.

## Verification Evidence

- Six focused backend suites pass with 96 tests, including >500-row search,
  category, stock, location forwarding, pagination, and legacy response compatibility.
- Three focused POS Items UI suites pass with 23 tests. Coverage verifies the
  paginated search request and result count plus existing category and modal behavior.
- The POS production build, architecture guards, documentation checks, and diff checks pass.

Authenticated browser coverage remains pending because no local E2E credentials or
saved authentication state are configured, and the test fallback login returned 401.
The unauthenticated access browser test passes and confirms the route guard.

The request-time compliance preflight was not executed because this is authorized
local-only implementation with no PR, push, deployment, or production operation.
