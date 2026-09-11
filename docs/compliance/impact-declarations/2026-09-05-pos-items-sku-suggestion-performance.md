---
status: reference
owner: engineering
last_reviewed: 2026-09-05
related_adr: docs/architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md
declaration_id: 2026-09-05-pos-items-sku-suggestion-performance
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: focused SKU and viewport suites,10000-row local computation benchmark,POS IMS and Storefront production builds,npm run check:architecture,npm run lint:docs,git diff --check
rollback_note: Revert the client-side SKU index and return to the existing scan; no stored data, migration, or external operation is involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T09:13:34.309Z
preflight_request_ref: PREFLIGHT-34459098510-2026-09-05-POS-ITEMS-SKU-SUGGESTION-PERFORMANCE
---

# POS Items SKU suggestion performance (Phase 294)

## Compliance Impact Classification

Major. The POS Add Item SKU suggestion implementation and shared frontend consumer
versions change. SKU formats, validation, persistence, authorization, payments,
discounts, tax, receipts, and reports remain unchanged.

## Affected Surfaces

- POS Add Item automatic SKU suggestion computation.
- Shared SKU suggestion utility used by frontend inventory forms.
- Frontend application version metadata for every `web-core` consumer.

## Compliance Preconditions

- Existing SKU formats and fallback behavior remain unchanged.
- The complete authorized seed remains the source for sequence maxima.
- Backend SKU validation and uniqueness enforcement remain authoritative.
- No persisted catalog data is rewritten by building or reading the index.

## Verification Evidence

- Focused SKU utility and Items modal viewport suites pass.
- The 10,000-row local computation benchmark confirms repeated catalog scans are removed.
- POS, IMS, and Storefront production builds and repository governance checks pass.

The request-time compliance preflight was not executed because this is authorized
local-only implementation with no PR, push, deployment, or production operation.
