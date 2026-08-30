---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-storefront-delivery-timing-policy
classification: major
surfaces: payments,settings,store
reason_codes_impacted: CHECKOUT_LOCATION_UNAVAILABLE
policy_version: 2026.09.01
verification_evidence: node --check on changed API and migration files; npm run build:store; npm run build:skupervisor; npm run check:compliance observed failing before this declaration
rollback_note: Four tenant_locations columns are additive; down is symmetric and schema-pure. Rolling back loses only merchant-configured timing-policy values.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1218-STOREFRONT-DELIVERY-TIMING-POLICY
---

# Storefront per-location delivery timing policy (#1218)

## Compliance Impact Classification

Major: `modules/store` mechanically maps to `payments`, while IMS Settings maps to `settings`.
Payments is mechanical only: this change touches no capture, refund, settlement, downpayment, or price calculation.

## Affected Surfaces

Tenant locations gain additive timing columns, validated Settings writes, live storefront location serialization, and a best-effort discovery-index snapshot sync. Checkout rejects a `scheduled_for` value for a location with scheduling disabled with 409.

## Compliance Preconditions

The API remains the enforcement point for scheduled orders. Immediate fulfillment remains an expectation/presentation policy: deliberately no corresponding ASAP rejection is added, preserving legacy and API callers.

## Verification Evidence

Syntax checks cover changed API/migration files; storefront and IMS builds are required before PR merge. `check:compliance` was first observed failing for the sensitive changed files before this declaration was added.

## Residual Risks

Discovery sync is best effort: a failed mirror write can leave its fallback snapshot stale, while `GET /api/v1/store/locations` remains the live primary read. Tenant schema repair is column-presence based; restored tenants regain the four columns with database defaults, not merchant-entered values.

## Preflight Reconciliation

`NOT-EXECUTED-*` is expected for a develop-targeting PR; the live preflight sweep runs at promotion per the request-time protocol.
