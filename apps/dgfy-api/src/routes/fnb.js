import express from 'express';
import {
  dashboard,
  listModifierGroups,
  createModifierGroup,
  listDiningAreas,
  createDiningArea,
  updateTableStatus,
  listKitchenStations,
  createKitchenStation,
  listItemKitchenRoutes,
  upsertItemKitchenRoute,
  listItemModifierGroups,
  replaceItemModifierGroups,
  listChecks,
  createCheck,
  addCheckLine,
  updateCheckStatus,
  transferCheck,
  splitCheck,
  mergeChecks,
  createKitchenTicket,
  updateKitchenTicketStatus,
  listReservations,
  createReservation,
  updateReservationStatus,
  getServiceChargeSettings,
  updateServiceChargeSettings
} from '../modules/fnb/controllers/fnbHandlers.js';
import { authenticate, checkAnyPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { buildModePermissionRequirements } from '../config/modeRbacFallback.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import {
  validateFnbIncludeInactiveQuery,
  validateCreateFnbModifierGroup,
  validateCreateFnbDiningArea,
  validateFnbTableIdParam,
  validateUpdateFnbTableStatus,
  validateCreateFnbKitchenStation,
  validateFnbItemIdParam,
  validateFnbItemAssignmentQuery,
  validateUpsertFnbItemKitchenRoute,
  validateReplaceFnbItemModifierGroups,
  validateFnbChecksQuery,
  validateCreateFnbCheck,
  validateFnbCheckIdParam,
  validateUpdateFnbCheckStatus,
  validateTransferFnbCheck,
  validateSplitFnbCheck,
  validateMergeFnbChecks,
  validateCreateFnbCheckLine,
  validateCreateFnbKitchenTicket,
  validateFnbTicketIdParam,
  validateUpdateFnbTicketStatus,
  validateFnbReservationsQuery,
  validateCreateFnbReservation,
  validateFnbReservationIdParam,
  validateUpdateFnbReservationStatus,
  validateUpdateFnbServiceCharge
} from '../validators/fnbValidator.js';

const router = express.Router();

router.use(authenticate);

// Capability gating is per-route rather than a single `router.use` over all 26
// endpoints, because this router mixes two different concerns.
//
// Modifier groups are a *generic catalog* concept — "extra rice" on a dish,
// gift wrap on a retail SKU, an extended warranty on a repair. The tables
// already support this: `fnb_item_modifier_groups.item_id` is an FK onto the
// generic `items` table, and both checkout resolvers
// (`resolveFnbLineModifiers`, `resolveStorefrontLineModifiers`) read purely
// from those rows with no workflow-mode check. Only the management endpoints
// were gated to F&B, which is what kept add-ons restaurant-only. They now sit
// behind `menuModifiers` instead.
//
// The remaining restaurant-native surface is gated at sub-capability
// granularity so a template/profile can compose F&B tiers: a full-service
// restaurant runs tables + kitchen + service charge, a counter-service
// carenderia runs none of them, and both are still F&B.
//   dining areas / tables      -> `tableService`
//   kitchen stations / routes /
//   tickets                    -> `kitchenQueue`
//   service charge settings    -> `restaurantServiceCharge`
//   dashboard / checks /
//   reservations               -> `fnbDining` (the base F&B capability)
// The fnb mode holds all four, so fnb tenants see no change; composed-overlay
// tenants grant exactly the tiers they need.
//
// Note this must NOT be expressed as sub-routers with their own
// `.use()`: a sub-router's middleware runs for every request routed into it,
// not just the paths it defines, so `/fnb/dashboard` would be evaluated
// against the modifier capability first.
const requireFnbDining = requireWorkflowCapability('fnbDining', 'Food & Beverage');
const requireMenuModifiers = requireWorkflowCapability('menuModifiers', 'Menu Modifiers');
const requireTableService = requireWorkflowCapability('tableService', 'Table Service');
const requireKitchenQueue = requireWorkflowCapability('kitchenQueue', 'Kitchen Queue');
const requireRestaurantServiceCharge = requireWorkflowCapability('restaurantServiceCharge', 'Restaurant Service Charge');

const modePermission = (primary, fallback) => checkAnyPermission(buildModePermissionRequirements(primary, fallback));

router.get('/dashboard', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.VIEW_DASHBOARD, PERMISSIONS.REPORTS.actions.VIEW_REPORTS), dashboard);

router.get('/modifier-groups', requireMenuModifiers, modePermission(PERMISSIONS.FNB.actions.VIEW_MENU, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateFnbIncludeInactiveQuery, listModifierGroups);
router.post('/modifier-groups', requireMenuModifiers, modePermission(PERMISSIONS.FNB.actions.MANAGE_MENU, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateCreateFnbModifierGroup, createModifierGroup);

router.get('/dining-areas', requireTableService, modePermission(PERMISSIONS.FNB.actions.VIEW_DINING, PERMISSIONS.POS.actions.VIEW_POS), validateFnbIncludeInactiveQuery, listDiningAreas);
router.post('/dining-areas', requireTableService, modePermission(PERMISSIONS.FNB.actions.MANAGE_DINING, PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbDiningArea, createDiningArea);
router.patch('/tables/:table_id/status', requireTableService, modePermission(PERMISSIONS.FNB.actions.MANAGE_DINING, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbTableIdParam, validateUpdateFnbTableStatus, updateTableStatus);

router.get('/kitchen-stations', requireKitchenQueue, modePermission(PERMISSIONS.FNB.actions.VIEW_KITCHEN, PERMISSIONS.POS.actions.VIEW_POS), validateFnbIncludeInactiveQuery, listKitchenStations);
router.post('/kitchen-stations', requireKitchenQueue, modePermission(PERMISSIONS.FNB.actions.MANAGE_KITCHEN, PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbKitchenStation, createKitchenStation);
router.get('/item-kitchen-routes', requireKitchenQueue, modePermission(PERMISSIONS.FNB.actions.VIEW_MENU, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateFnbItemAssignmentQuery, listItemKitchenRoutes);
router.put('/item-kitchen-routes/:item_id', requireKitchenQueue, modePermission(PERMISSIONS.FNB.actions.MANAGE_MENU, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateFnbItemIdParam, validateUpsertFnbItemKitchenRoute, upsertItemKitchenRoute);
router.get('/item-modifier-groups', requireMenuModifiers, modePermission(PERMISSIONS.FNB.actions.VIEW_MENU, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateFnbItemAssignmentQuery, listItemModifierGroups);
router.put('/item-modifier-groups/:item_id', requireMenuModifiers, modePermission(PERMISSIONS.FNB.actions.MANAGE_MENU, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateFnbItemIdParam, validateReplaceFnbItemModifierGroups, replaceItemModifierGroups);

router.get('/checks', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.VIEW_CHECKS, PERMISSIONS.POS.actions.VIEW_POS), validateFnbChecksQuery, listChecks);
router.post('/checks', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_CHECKS, PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbCheck, createCheck);
router.patch('/checks/:check_id/status', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_CHECKS, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateUpdateFnbCheckStatus, updateCheckStatus);
router.patch('/checks/:check_id/transfer', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_CHECKS, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateTransferFnbCheck, transferCheck);
router.post('/checks/:check_id/split', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_CHECKS, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateSplitFnbCheck, splitCheck);
router.post('/checks/:check_id/merge', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_CHECKS, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateMergeFnbChecks, mergeChecks);
router.post('/checks/:check_id/lines', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_CHECKS, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateCreateFnbCheckLine, addCheckLine);
router.post('/checks/:check_id/kitchen-tickets', requireKitchenQueue, modePermission(PERMISSIONS.FNB.actions.MANAGE_KITCHEN, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateCreateFnbKitchenTicket, createKitchenTicket);
router.patch('/kitchen-tickets/:ticket_id/status', requireKitchenQueue, modePermission(PERMISSIONS.FNB.actions.MANAGE_KITCHEN, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbTicketIdParam, validateUpdateFnbTicketStatus, updateKitchenTicketStatus);

router.get('/reservations', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.VIEW_RESERVATIONS, PERMISSIONS.POS.actions.VIEW_POS), validateFnbReservationsQuery, listReservations);
router.post('/reservations', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_RESERVATIONS, PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbReservation, createReservation);
router.patch('/reservations/:reservation_id/status', requireFnbDining, modePermission(PERMISSIONS.FNB.actions.MANAGE_RESERVATIONS, PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbReservationIdParam, validateUpdateFnbReservationStatus, updateReservationStatus);

router.get('/service-charge-settings', requireRestaurantServiceCharge, modePermission(PERMISSIONS.FNB.actions.VIEW_SERVICE_CHARGE, PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), getServiceChargeSettings);
router.put('/service-charge-settings', requireRestaurantServiceCharge, modePermission(PERMISSIONS.FNB.actions.MANAGE_SERVICE_CHARGE, PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateUpdateFnbServiceCharge, updateServiceChargeSettings);

export default router;
