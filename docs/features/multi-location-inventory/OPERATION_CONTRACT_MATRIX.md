---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-18
applies_to: multi_location_inventory_rollout
topic: frontend_backend_operation_contracts
---

# Multi-Location Operation Contract Matrix

This matrix is the operation-level parity audit for inventory + commerce surfaces.
It complements the requirement matrix by mapping each stock-affecting contract to:
1. Backend contract (validation, permission, side effects)
2. Frontend UX contract (input fields, selectors, error handling)
3. Verification evidence

Mismatch tags:
- `missing_field`
- `ui_missing_selector`
- `wrong_error_mapping`
- `overexposed_data`
- `permission_gap`

All rows below are currently `resolved` and must be re-audited before each rollout wave.

| Op ID | Domain | Backend Contract | Frontend UX Contract | Mismatch Tag | Evidence |
|---|---|---|---|---|---|
| OP-01 | PO receive (IMS) | `POST /purchase-orders/:po_id/receive` requires `location_id`; location grant enforced when flag enabled | PO receipt modal requires location selection; single-location auto-selects | resolved:`ui_missing_selector` | `backend/tests/purchaseOrderHandlers.transport.test.js`, `frontend/Components/po/POReceiptModal.jsx` |
| OP-02 | PO receive (QR) | `POST /receive-tokens/:token/receive` (PO path) requires `location_id` | Mobile Receive PO path blocks submit without location | resolved:`missing_field` | `backend/tests/receiveTokenHandlers.transport.test.js`, `frontend/Pages/MobileReceive.jsx` |
| OP-03 | PO receive (AI) | `receive_purchase_order` requires `po_id`, `location_id`, `received_items` | AI action confirmation shows location-bound receive intent | resolved:`missing_field` | `backend/tests/purchaseOrderToolRegistry.test.js`, `backend/src/config/aiTools.js` |
| OP-04 | JO complete (IMS) | `POST /job-orders/:jo_id/complete` requires `source_location_id` + `destination_location_id` and different locations | JO completion modal requires source + destination; blocks same-location submit | resolved:`ui_missing_selector` | `backend/tests/jobOrderHandlers.transport.test.js`, `frontend/Components/jo/JODetailsModal.jsx` |
| OP-05 | JO complete (QR) | `POST /receive-tokens/:token/receive` (JO path) requires source + destination locations | Mobile Receive JO path requires both selectors; same-location blocked | resolved:`missing_field` | `backend/tests/receiveTokenHandlers.transport.test.js`, `frontend/Pages/MobileReceive.jsx` |
| OP-06 | JO complete (AI) | `complete_job_order` requires `jo_id`, `quantity_produced`, source + destination locations | AI completion payload includes deterministic location context | resolved:`missing_field` | `backend/tests/jobOrderToolRegistry.test.js`, `backend/src/config/aiTools.js` |
| OP-07 | Stock transfer | `POST /stock-movements` transfer requires source + destination locations; permission checks | Transfer UI sends source + destination and blocks invalid location pairs | resolved:`permission_gap` | `backend/src/validators/stockMovementValidator.js`, `frontend/Components/movements/MovementCreateModal.jsx` |
| OP-08 | Item create/edit stock | Item create/update accepts `location_id` for stock deltas; ledger updates location stock and derived total | Item modal requires location for stock changes in multi-location tenants | resolved:`ui_missing_selector` | `frontend/Components/items/ItemFormModal.jsx`, `frontend/src/features/inventory/__tests__/msmeItemPatch.contract.test.js` |
| OP-09 | Product wizard stock | Product create/edit stock delta accepts location-aware stock adjustment | Product wizard requires location when stock adjustment exists and multiple locations active | resolved:`ui_missing_selector` | `frontend/Components/products/ProductCreateWizard.jsx`, `frontend/Components/products/wizard/BasicInfoStep.jsx` |
| OP-10 | Dispatch execution | `POST /dispatch-orders/:id/dispatch` accepts location context; enforces location-level stock guard | Dispatch UI passes chosen location for stock-affecting dispatch actions | resolved:`permission_gap` | `backend/src/validators/dispatchOrderValidator.js`, `frontend/src/services/dispatchOrderService.js` |
| OP-11 | POS checkout | POS checkout validates stock against selected location and grant scope | POS terminal location selector drives checkout payload + error recovery copy | resolved:`wrong_error_mapping` | `backend/tests/posCheckout.db.integration.test.js`, `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` |
| OP-12 | Store quote/checkout | `/store/cart/quote` + `/store/checkout` bind stock validation to single location | Storefront checkout requires one fulfillment location and maps location conflict errors | resolved:`wrong_error_mapping` | `backend/tests/storeUsecases.applicationResult.test.js`, `frontend/apps/store/src/main.jsx`, `frontend/apps/store/src/__tests__/storefrontErrorMessages.test.js` |
| OP-13 | Store catalog/discovery visibility | Store catalog/discovery returns `is_available`/`availability_status` for public reads | Storefront list/grid/map uses availability-only behavior with no quantity fallback | resolved:`overexposed_data` | `backend/tests/storeHandlers.transport.test.js`, `backend/tests/storeUsecases.applicationResult.test.js`, `frontend/apps/store/src/main.jsx` |
| OP-14 | Location grants management | `GET/PUT /users/:user_id/location-grants` controls writable location scope | User management UI allows explicit grant curation and save | resolved:`permission_gap` | `backend/src/modules/users/controllers/userHandlers.js`, `frontend/Components/users/UserManagementModal.jsx` |
| OP-15 | Validation + permission error envelope | Missing required location fields => deterministic validation payload; location denial => deterministic 403 | Frontend maps field-level vs blocking errors consistently across IMS/POS/store/QR | resolved:`wrong_error_mapping` | `backend/tests/locationTransportValidators.contract.test.js`, `frontend/src/utils/errorHandler.js`, `frontend/apps/store/src/storefrontErrorMessages.js` |
| OP-16 | Item FIFO batch query location scoping | `GET /items/:item_id/batches` accepts optional `location_id` and returns location-enriched batch rows | Stock movement creation filters batch options by selected location before deduction | resolved:`ui_missing_selector` | `backend/src/modules/inventory/controllers/itemHandlers.js`, `backend/src/modules/inventory/repositories/itemRepository.js`, `frontend/Components/movements/MovementCreateModal.jsx`, `frontend/src/services/itemService.js` |
| OP-17 | Expiry/aging report location parity | `/reports/expiry`, `/reports/stock-aging-enhanced`, and `/reports/export` honor optional `location_id`; payload/CSV includes location identity | Reports page exposes location filter and location column in expiry/aging tables | resolved:`missing_field` | `backend/src/modules/reports/controllers/reportHandlers.js`, `backend/src/services/reportService.js`, `frontend/Pages/Reports.jsx`, `frontend/src/hooks/useReports.js` |
| OP-18 | Stock movement export location dimensions | `/stock-movements/export?format=csv` includes movement, source, and destination location columns | Stock movements list/details surfaces render single-location and transfer labels consistently | resolved:`wrong_error_mapping` | `backend/src/services/stockMovementService.js`, `frontend/src/features/stockMovements/pages/StockMovementsPage.jsx`, `frontend/Components/movements/MovementDetailsModal.jsx` |
| OP-19 | Active SKU conflict hardening | Item create/update/finalize paths trim SKU and normalize DB unique conflict to deterministic 409 | Item/product wizards preserve manual SKU override while using deterministic suggestion seed | resolved:`missing_field` | `backend/src/modules/inventory/repositories/itemRepository.js`, `backend/tests/inventoryItemRepository.test.js`, `frontend/Components/items/ItemFormModal.jsx`, `frontend/Components/products/ProductCreateWizard.jsx` |

## Re-Audit Gate
1. If any row regresses, mark row status as `open` in PR notes and block wave closure.
2. Do not mark requirement rows complete unless matching operation rows and evidence are green.
3. Attach this matrix in the rollout handoff packet for each wave.
