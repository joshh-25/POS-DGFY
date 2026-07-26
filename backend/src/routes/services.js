import express from 'express';
import {
    listCatalog,
    createCatalogItem,
    updateCatalogItem,
    listResources,
    createResource,
    listAssignments,
    createAssignment,
    updateAssignment,
    listBookings,
    createBooking,
    updateBookingStatus,
    dashboard,
    listWaitlist,
    createWaitlistEntry,
    updateWaitlistStatus,
    listClients,
    listReminders,
    queueDueReminders,
    sendDueReminders
} from '../modules/services/controllers/serviceHandlers.js';
import { authenticate, checkAnyPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { buildModePermissionRequirements } from '../config/modeRbacFallback.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import {
    validateServiceCatalogQuery,
    validateCreateServiceCatalogItem,
    validateUpdateServiceCatalogItem,
    validateServiceItemIdParam,
    validateServiceResourceQuery,
    validateCreateServiceResource,
    validateServiceAssignmentQuery,
    validateCreateServiceAssignment,
    validateUpdateServiceAssignment,
    validateServiceAssignmentIdParam,
    validateServiceBookingQuery,
    validateCreateAdminServiceBooking,
    validateServiceBookingIdParam,
    validateUpdateServiceBookingStatus,
    validateServiceWaitlistQuery,
    validateCreateServiceWaitlistEntry,
    validateServiceWaitlistEntryIdParam,
    validateUpdateServiceWaitlistStatus,
    validateServiceClientQuery,
    validateServiceReminderQuery,
    validateQueueServiceReminders
} from '../validators/serviceValidator.js';

const router = express.Router();

router.use(authenticate);
router.use(requireWorkflowCapability('services', 'Services'));

const modePermission = (primary, fallback) => checkAnyPermission(buildModePermissionRequirements(primary, fallback));

router.get('/dashboard', modePermission(PERMISSIONS.SERVICES.actions.VIEW_DASHBOARD, PERMISSIONS.REPORTS.actions.VIEW_REPORTS), dashboard);

router.get('/catalog', modePermission(PERMISSIONS.SERVICES.actions.VIEW_CATALOG, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateServiceCatalogQuery, listCatalog);
router.post('/catalog', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_CATALOG, PERMISSIONS.INVENTORY.actions.CREATE_ITEMS), validateCreateServiceCatalogItem, createCatalogItem);
router.put('/catalog/:item_id', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_CATALOG, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateServiceItemIdParam, validateUpdateServiceCatalogItem, updateCatalogItem);

router.get('/resources', modePermission(PERMISSIONS.SERVICES.actions.VIEW_RESOURCES, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateServiceResourceQuery, listResources);
router.post('/resources', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_RESOURCES, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateCreateServiceResource, createResource);

router.get('/assignments', modePermission(PERMISSIONS.SERVICES.actions.VIEW_RESOURCES, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateServiceAssignmentQuery, listAssignments);
router.post('/assignments', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_RESOURCES, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateCreateServiceAssignment, createAssignment);
router.patch('/assignments/:assignment_id', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_RESOURCES, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateServiceAssignmentIdParam, validateUpdateServiceAssignment, updateAssignment);

router.get('/bookings', modePermission(PERMISSIONS.SERVICES.actions.VIEW_BOOKINGS, PERMISSIONS.POS.actions.VIEW_POS), validateServiceBookingQuery, listBookings);
router.post('/bookings', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_BOOKINGS, PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateAdminServiceBooking, createBooking);
router.patch('/bookings/:booking_id/status', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_BOOKINGS, PERMISSIONS.POS.actions.TRANSACT_POS), validateServiceBookingIdParam, validateUpdateServiceBookingStatus, updateBookingStatus);

router.get('/waitlist', modePermission(PERMISSIONS.SERVICES.actions.VIEW_WAITLIST, PERMISSIONS.POS.actions.VIEW_POS), validateServiceWaitlistQuery, listWaitlist);
router.post('/waitlist', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_WAITLIST, PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateServiceWaitlistEntry, createWaitlistEntry);
router.patch('/waitlist/:waitlist_entry_id/status', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_WAITLIST, PERMISSIONS.POS.actions.TRANSACT_POS), validateServiceWaitlistEntryIdParam, validateUpdateServiceWaitlistStatus, updateWaitlistStatus);

router.get('/clients', modePermission(PERMISSIONS.SERVICES.actions.VIEW_CLIENTS, PERMISSIONS.REPORTS.actions.VIEW_REPORTS), validateServiceClientQuery, listClients);

router.get('/reminders', modePermission(PERMISSIONS.SERVICES.actions.VIEW_REMINDERS, PERMISSIONS.POS.actions.VIEW_POS), validateServiceReminderQuery, listReminders);
router.post('/reminders/queue-due', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_REMINDERS, PERMISSIONS.POS.actions.TRANSACT_POS), validateQueueServiceReminders, queueDueReminders);
router.post('/reminders/send-due', modePermission(PERMISSIONS.SERVICES.actions.MANAGE_REMINDERS, PERMISSIONS.POS.actions.TRANSACT_POS), validateServiceReminderQuery, sendDueReminders);

export default router;
