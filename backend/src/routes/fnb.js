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
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
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
router.use(requireWorkflowCapability('fnbDining', 'Food & Beverage'));

router.get('/dashboard', checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS), dashboard);

router.get('/modifier-groups', checkPermission(PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateFnbIncludeInactiveQuery, listModifierGroups);
router.post('/modifier-groups', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateCreateFnbModifierGroup, createModifierGroup);

router.get('/dining-areas', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateFnbIncludeInactiveQuery, listDiningAreas);
router.post('/dining-areas', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbDiningArea, createDiningArea);
router.patch('/tables/:table_id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbTableIdParam, validateUpdateFnbTableStatus, updateTableStatus);

router.get('/kitchen-stations', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateFnbIncludeInactiveQuery, listKitchenStations);
router.post('/kitchen-stations', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbKitchenStation, createKitchenStation);
router.get('/item-kitchen-routes', checkPermission(PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateFnbItemAssignmentQuery, listItemKitchenRoutes);
router.put('/item-kitchen-routes/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateFnbItemIdParam, validateUpsertFnbItemKitchenRoute, upsertItemKitchenRoute);
router.get('/item-modifier-groups', checkPermission(PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateFnbItemAssignmentQuery, listItemModifierGroups);
router.put('/item-modifier-groups/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateFnbItemIdParam, validateReplaceFnbItemModifierGroups, replaceItemModifierGroups);

router.get('/checks', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateFnbChecksQuery, listChecks);
router.post('/checks', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbCheck, createCheck);
router.patch('/checks/:check_id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateUpdateFnbCheckStatus, updateCheckStatus);
router.patch('/checks/:check_id/transfer', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateTransferFnbCheck, transferCheck);
router.post('/checks/:check_id/split', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateSplitFnbCheck, splitCheck);
router.post('/checks/:check_id/merge', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateMergeFnbChecks, mergeChecks);
router.post('/checks/:check_id/lines', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateCreateFnbCheckLine, addCheckLine);
router.post('/checks/:check_id/kitchen-tickets', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbCheckIdParam, validateCreateFnbKitchenTicket, createKitchenTicket);
router.patch('/kitchen-tickets/:ticket_id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbTicketIdParam, validateUpdateFnbTicketStatus, updateKitchenTicketStatus);

router.get('/reservations', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateFnbReservationsQuery, listReservations);
router.post('/reservations', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateFnbReservation, createReservation);
router.patch('/reservations/:reservation_id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateFnbReservationIdParam, validateUpdateFnbReservationStatus, updateReservationStatus);

router.get('/service-charge-settings', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), getServiceChargeSettings);
router.put('/service-charge-settings', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateUpdateFnbServiceCharge, updateServiceChargeSettings);

export default router;
