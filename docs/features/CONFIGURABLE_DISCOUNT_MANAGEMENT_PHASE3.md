---
status: complete
authority_level: implementation-reference
owner: pos-platform
applies_to: apps/dgfy-api tenant-scoped Discount Management API
topic: configurable_discount_management_phase3
---

# Configurable Discount Management — Phase 3 API

## Scope

Phase 3 delivers the tenant-scoped backend management contract for the browser
POS Discount Management settings surface. It does not change checkout
resolution, cashier discount authorization, the POS UI, or historical
transaction snapshots.

## API contract

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/settings/discount-rules` | `settings:view` | List every configured rule, including disabled and unapproved rules |
| `POST` | `/api/v1/settings/discount-rules` | `settings:edit` | Create a custom percentage rule |
| `PATCH` | `/api/v1/settings/discount-rules/:discountRuleId` | `settings:edit` | Edit name, percentage, description, Enabled, or Approved |

New rules receive a server-generated stable machine key, `type=custom`, and
`method=percentage`. Unless explicitly enabled and approved by the request,
new rules start disabled and unapproved. There is no delete endpoint; disabling
a rule preserves its identity for audit and future transaction references.

## Safety rules

- All reads and writes use the active tenant model registry.
- Updates require `expected_configuration_version`; stale writes return a
  conflict and do not mutate the rule.
- Configuration versions increment on every successful update.
- Create and update plus their audit records commit in one database transaction.
- Discount names are checked case-insensitively within the tenant.
- Existing fixed-amount rules remain readable but cannot be edited through the
  percentage-only Phase 3 editor.
- The `Enabled AND Approved` availability rule is intentionally enforced in the
  later transaction-integration phase, not silently introduced here.

## Verification

The focused backend suite covers creation defaults, approval/enabled updates,
stale-version conflicts, management visibility, input validation, schema
migration contracts, and tenant schema coverage. Architecture guardrails,
controller boundaries, route RBAC coverage, and settings-route module loading
also pass.

The next phase is the browser/PWA settings editor that consumes this API.
