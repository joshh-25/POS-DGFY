import express from 'express';
import {
  addFolioLine,
  availability,
  bookingHold,
  createAmenity,
  createFacility,
  createFolio,
  createGuest,
  createHousekeepingTask,
  createMaintenanceRequest,
  createPackage,
  createPackageItem,
  createPropertyAmenity,
  createRoomAmenity,
  createFacilityBooking,
  createGuestMessage,
  createPublicReservation,
  claimPublicReservation,
  createRatePlan,
  createReservation,
  createRoom,
  createRoomType,
  dashboard,
  listAmenities,
  listFacilities,
  listFolios,
  listGuests,
  listGuestMessages,
  listHousekeepingTasks,
  listMaintenanceRequests,
  listPackages,
  listPublicReservationsForCustomer,
  listRatePlans,
  listReservations,
  listRooms,
  listRoomTypes,
  listStays,
  publicReservationLookup,
  quote,
  reports as hospitalityReports,
  updateHousekeepingTask,
  updateMaintenanceRequest,
  updateReservationRoomAssignment,
  updateReservationStatus,
  updateRoomStatus
} from '../modules/hospitality/controllers/hospitalityHandlers.js';
import { authenticate, checkAnyPermission } from '../middleware/auth.js';
import { authenticateStoreCustomer, optionalStoreCustomer } from '../middleware/storeAuth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import { setNoStoreCacheControl, setReadCacheControl } from '../middleware/cachePolicy.js';

const router = express.Router();
const publicRouter = express.Router();

const hp = PERMISSIONS.HOSPITALITY.actions;
const pos = PERMISSIONS.POS.actions;
const reports = PERMISSIONS.REPORTS.actions;

router.use(authenticate);

// The admin surface is gated per section rather than wholesale, so a
// template/profile can compose hospitality tiers (a guesthouse without
// housekeeping/maintenance boards, a resort with all of them). The
// hospitality mode holds every sub-capability, so hospitality tenants see no
// change. Kept as per-route middleware, not sub-routers (see fnb.js for why).
// The public storefront surface stays on the base reservations capability.
publicRouter.use(requireWorkflowCapability('hospitalityReservations', 'Hospitality'));

const requireReservations = requireWorkflowCapability('hospitalityReservations', 'Hospitality');
const requireRooms = requireWorkflowCapability('hospitalityRooms', 'Rooms');
const requireHousekeeping = requireWorkflowCapability('hospitalityHousekeeping', 'Housekeeping');
const requireMaintenance = requireWorkflowCapability('hospitalityMaintenance', 'Maintenance');
const requireFolios = requireWorkflowCapability('hospitalityFolios', 'Folios');
const requireRates = requireWorkflowCapability('hospitalityRates', 'Rates');
const requireAmenities = requireWorkflowCapability('hospitalityAmenities', 'Amenities');

router.get('/dashboard', requireReservations, checkAnyPermission([hp.VIEW_DASHBOARD, reports.VIEW_REPORTS]), dashboard);
router.get('/availability', requireReservations, checkAnyPermission([hp.VIEW_RESERVATIONS, hp.VIEW_ROOMS]), availability);

router.get('/room-types', requireRooms, checkAnyPermission([hp.VIEW_ROOMS]), listRoomTypes);
router.post('/room-types', requireRooms, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_ROOMS]), createRoomType);
router.get('/rooms', requireRooms, checkAnyPermission([hp.VIEW_ROOMS]), listRooms);
router.post('/rooms', requireRooms, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_ROOMS]), createRoom);
router.patch('/rooms/:room_id/status', requireRooms, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_ROOMS, hp.MANAGE_HOUSEKEEPING]), updateRoomStatus);

router.get('/guests', requireReservations, checkAnyPermission([hp.VIEW_GUESTS, hp.VIEW_RESERVATIONS]), listGuests);
router.post('/guests', requireReservations, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_GUESTS, hp.MANAGE_RESERVATIONS]), createGuest);
router.get('/reservations', requireReservations, checkAnyPermission([hp.VIEW_RESERVATIONS]), listReservations);
router.post('/reservations', requireReservations, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RESERVATIONS]), createReservation);
router.patch('/reservations/:reservation_id/status', requireReservations, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RESERVATIONS]), updateReservationStatus);
router.patch('/reservations/:reservation_id/rooms/:reservation_room_id', requireReservations, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RESERVATIONS, hp.MANAGE_ROOMS]), updateReservationRoomAssignment);
router.get('/stays', requireReservations, checkAnyPermission([hp.VIEW_RESERVATIONS]), listStays);

router.get('/rate-plans', requireRates, checkAnyPermission([hp.VIEW_RATES]), listRatePlans);
router.post('/rate-plans', requireRates, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RATES]), createRatePlan);

router.get('/folios', requireFolios, checkAnyPermission([hp.VIEW_FOLIOS]), listFolios);
router.post('/folios', requireFolios, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FOLIOS]), createFolio);
router.post('/folios/:folio_id/lines', requireFolios, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FOLIOS, pos.TRANSACT_POS]), addFolioLine);

router.get('/housekeeping/tasks', requireHousekeeping, checkAnyPermission([hp.VIEW_HOUSEKEEPING]), listHousekeepingTasks);
router.post('/housekeeping/tasks', requireHousekeeping, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_HOUSEKEEPING]), createHousekeepingTask);
router.patch('/housekeeping/tasks/:task_id', requireHousekeeping, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_HOUSEKEEPING]), updateHousekeepingTask);

router.get('/maintenance/requests', requireMaintenance, checkAnyPermission([hp.VIEW_MAINTENANCE]), listMaintenanceRequests);
router.post('/maintenance/requests', requireMaintenance, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_MAINTENANCE]), createMaintenanceRequest);
router.patch('/maintenance/requests/:request_id', requireMaintenance, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_MAINTENANCE]), updateMaintenanceRequest);

router.get('/amenities', requireAmenities, checkAnyPermission([hp.VIEW_AMENITIES]), listAmenities);
router.post('/amenities', requireAmenities, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES]), createAmenity);
router.post('/room-amenities', requireAmenities, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES, hp.MANAGE_ROOMS]), createRoomAmenity);
router.post('/property-amenities', requireAmenities, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES]), createPropertyAmenity);
router.get('/facilities', requireAmenities, checkAnyPermission([hp.VIEW_FACILITIES]), listFacilities);
router.post('/facilities', requireAmenities, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FACILITIES]), createFacility);
router.post('/facilities/bookings', requireAmenities, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FACILITIES, hp.MANAGE_RESERVATIONS]), createFacilityBooking);
router.get('/packages', requireAmenities, checkAnyPermission([hp.VIEW_AMENITIES, hp.VIEW_RATES]), listPackages);
router.post('/packages', requireAmenities, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES, hp.MANAGE_RATES]), createPackage);
router.post('/packages/items', requireAmenities, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES, hp.MANAGE_RATES]), createPackageItem);
router.get('/guest-messages', requireReservations, checkAnyPermission([hp.VIEW_GUESTS, hp.VIEW_RESERVATIONS]), listGuestMessages);
router.post('/guest-messages', requireReservations, setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_GUESTS, hp.MANAGE_RESERVATIONS]), createGuestMessage);
router.get('/reports', requireReservations, checkAnyPermission([hp.VIEW_REPORTS, reports.VIEW_REPORTS]), hospitalityReports);

publicRouter.get('/availability', setReadCacheControl({ maxAgeSeconds: 15, sMaxAgeSeconds: 15 }), availability);
publicRouter.post('/quote', setNoStoreCacheControl, quote);
publicRouter.post('/booking-holds', setNoStoreCacheControl, bookingHold);
publicRouter.get('/amenities', setReadCacheControl({ maxAgeSeconds: 60, sMaxAgeSeconds: 60 }), listAmenities);
publicRouter.get('/packages', setReadCacheControl({ maxAgeSeconds: 60, sMaxAgeSeconds: 60 }), listPackages);
publicRouter.post('/bookings', setNoStoreCacheControl, optionalStoreCustomer, createPublicReservation);
publicRouter.get('/bookings', setNoStoreCacheControl, authenticateStoreCustomer, listPublicReservationsForCustomer);
publicRouter.post('/bookings/:public_reference/claim', setNoStoreCacheControl, authenticateStoreCustomer, claimPublicReservation);
publicRouter.get('/bookings/:public_reference', setNoStoreCacheControl, publicReservationLookup);

export { publicRouter as hospitalityStorefrontRoutes };
export default router;
