---
status: reference
owner: engineering
last_reviewed: 2026-07-25
declaration_id: 2026-07-25-storefront-discovery-and-routing
classification: major
surfaces: storefront,discovery,checkout,settings,routing
reason_codes_impacted: POS_ORDERING_CLOSED
policy_version: 2026.07.25
verification_evidence: storefront-usecase-tests,discovery-flow-tests,route-contract-tests,diff-check
rollback_note: Revert the Storefront readiness, discovery, route-target, and settings changes together; no transaction or payment records are rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-25T16:00:00+08:00
preflight_request_ref: STOREFRONT-DISCOVERY-ROUTING-2026-07-25
---

# Storefront Discovery And Routing Hardening

## Compliance Impact Classification

Major. Storefront ordering readiness no longer inherits the POS terminal shift state. Public ordering remains governed by the selected location, supported fulfillment method, operating schedule, catalog availability, and server-side checkout validation.

## Affected Surfaces

- Storefront catalog discovery, geolocation restoration, and branch selection.
- Storefront quote and checkout operational-readiness validation.
- Customer account return targets and public route handling.
- Storefront location pin and gallery media settings.

## Compliance Preconditions

- POS shift state must not open or close public Storefront ordering.
- Storefront checkout remains server-authoritative for location, hours, fulfillment support, stock, price, and promotion validation.
- Absolute post-auth return targets remain restricted to approved DGFY origins and Storefront routes.
- Location pins require explicit, valid Philippines coordinates before persistence.

## Verification Evidence

- Store use-case tests cover open Storefront checkout while the POS shift is closed.
- Discovery integration and route contract tests cover public navigation behavior.
- Changed-file `DO NOT COMMIT` scan and `git diff --check` pass.
