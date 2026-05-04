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
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
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
    validateCreateServiceBooking,
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

router.get('/dashboard', checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS), dashboard);

router.get('/catalog', checkPermission(PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateServiceCatalogQuery, listCatalog);
router.post('/catalog', checkPermission(PERMISSIONS.INVENTORY.actions.CREATE_ITEMS), validateCreateServiceCatalogItem, createCatalogItem);
router.put('/catalog/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateServiceItemIdParam, validateUpdateServiceCatalogItem, updateCatalogItem);

router.get('/resources', checkPermission(PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateServiceResourceQuery, listResources);
router.post('/resources', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateCreateServiceResource, createResource);

router.get('/assignments', checkPermission(PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateServiceAssignmentQuery, listAssignments);
router.post('/assignments', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateCreateServiceAssignment, createAssignment);
router.patch('/assignments/:assignment_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateServiceAssignmentIdParam, validateUpdateServiceAssignment, updateAssignment);

router.get('/bookings', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateServiceBookingQuery, listBookings);
router.post('/bookings', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateServiceBooking, createBooking);
router.patch('/bookings/:booking_id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateServiceBookingIdParam, validateUpdateServiceBookingStatus, updateBookingStatus);

router.get('/waitlist', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateServiceWaitlistQuery, listWaitlist);
router.post('/waitlist', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreateServiceWaitlistEntry, createWaitlistEntry);
router.patch('/waitlist/:waitlist_entry_id/status', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateServiceWaitlistEntryIdParam, validateUpdateServiceWaitlistStatus, updateWaitlistStatus);

router.get('/clients', checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS), validateServiceClientQuery, listClients);

router.get('/reminders', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateServiceReminderQuery, listReminders);
router.post('/reminders/queue-due', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateQueueServiceReminders, queueDueReminders);
router.post('/reminders/send-due', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateServiceReminderQuery, sendDueReminders);

export default router;
