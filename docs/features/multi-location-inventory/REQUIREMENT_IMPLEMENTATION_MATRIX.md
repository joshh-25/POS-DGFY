---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-18
applies_to: multi_location_inventory_rollout
topic: requirement_traceability
---

# Multi-Location Requirement-to-Implementation Matrix

## Usage
1. Each requirement must map to backend, frontend, migration/invariant, and tests.
2. Mark completion only when implementation and verification are both complete.
3. Keep test case IDs aligned with automated/manual suites.
4. Cross-check every requirement against [OPERATION_CONTRACT_MATRIX.md](/C:/xampp/htdocs/SKU-Inventory-Manager/docs/features/multi-location-inventory/OPERATION_CONTRACT_MATRIX.md) before wave sign-off.

| Req ID | Requirement | Backend Endpoint/Use Case | Frontend Surface | Migration/Invariant | Test Case ID | Status |
|---|---|---|---|---|---|---|
| ML-01 | Per-location stock authoritative | `stockMovementService`, POS/store repositories, item create/update stock deltas | Inventory, POS, storefront stock reads | `item_location_stocks`; `items.current_stock` derived sum parity | ML-TEST-001 | Completed |
| ML-02 | PO receive requires location | `POST /purchase-orders/:po_id/receive` (`receivePurchaseOrderUseCase`) | PO receive modal / QR receive PO path | receive validation + movement `location_id` invariant | ML-TEST-002 | Completed |
| ML-03 | JO source/destination location | `POST /job-orders/:jo_id/complete` (`jobOrderService.completeJobOrder`) | JO complete + QR receive JO path | source/destination required and different; source-scoped ingredient checks | ML-TEST-003 | Completed |
| ML-04 | Dedicated transfer flow | `POST /stock-movements` (`movement_type=transfer`) | IMS stock movement transfer flow | atomic source/destination location ledger update | ML-TEST-004 | Completed |
| ML-05 | Authenticated QR receive with location checks | `GET/POST /receive-tokens/:token/*` + authenticated receive use case | QR receive flow | auth required + location grant enforcement | ML-TEST-005 | Completed |
| ML-06 | Location permission gating | stock movement, PO receive, JO complete, QR receive, POS/store checkout | user location grants + location selectors | `user_location_grants` enforcement with explicit admin grants management + 403 contract | ML-TEST-006 | Completed |
| ML-07 | Single-location storefront checkout | `/store/cart/quote`, `/store/checkout` | storefront checkout location chooser | quote/checkout location resolution with hard-block on selected location | ML-TEST-007 | Completed |
| ML-08 | Storefront item-search location filter | store catalog/discovery use cases and repository location filter | map/list/grid storefront filters | location-scoped catalog stock overlay invariant | ML-TEST-008 | Completed |
| ML-09 | Availability-only storefront stock display | storefront read contracts (`is_available`, `availability_status`) | storefront item cards and cart notices | no exact quantity exposure on storefront | ML-TEST-009 | Completed |
| ML-10 | Legacy stock migration to primary location | migrations `20260416000007-add-multi-location-inventory-ledger.cjs` + `20260416000008-backfill-user-location-grants.cjs` | n/a | opening balances, null FIFO locations, and user location grants bootstrap | ML-TEST-010 | Completed |
| ML-11 | Oversell hard-block at selected location | POS/store checkout, stock movement validation, DO dispatch (`POST /dispatch-orders/:id/dispatch`) | POS/store/DO dispatch errors and location selectors | deterministic location-level stock violation response | ML-TEST-011 | Completed |
| ML-12 | Feature-flagged phased rollout | setting reads in movement/location resolution paths | admin/ops rollout controls | `multi_location_inventory_enabled` default `false` in migration | ML-TEST-012 | Completed |

## No-Omission Gate
Rollout phase cannot close while any in-scope row remains `Planned` or `In Progress`.
In-scope rows also cannot return to `Completed` unless mapped automated tests pass and a wave handoff packet includes linked evidence for parity, drift, rollback rehearsal, and UAT.
