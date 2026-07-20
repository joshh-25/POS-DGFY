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
router.use(requireWorkflowCapability('hospitalityReservations', 'Hospitality'));
publicRouter.use(requireWorkflowCapability('hospitalityReservations', 'Hospitality'));

router.get('/dashboard', checkAnyPermission([hp.VIEW_DASHBOARD, reports.VIEW_REPORTS]), dashboard);
router.get('/availability', checkAnyPermission([hp.VIEW_RESERVATIONS, hp.VIEW_ROOMS]), availability);

router.get('/room-types', checkAnyPermission([hp.VIEW_ROOMS]), listRoomTypes);
router.post('/room-types', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_ROOMS]), createRoomType);
router.get('/rooms', checkAnyPermission([hp.VIEW_ROOMS]), listRooms);
router.post('/rooms', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_ROOMS]), createRoom);
router.patch('/rooms/:room_id/status', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_ROOMS, hp.MANAGE_HOUSEKEEPING]), updateRoomStatus);

router.get('/guests', checkAnyPermission([hp.VIEW_GUESTS, hp.VIEW_RESERVATIONS]), listGuests);
router.post('/guests', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_GUESTS, hp.MANAGE_RESERVATIONS]), createGuest);
router.get('/reservations', checkAnyPermission([hp.VIEW_RESERVATIONS]), listReservations);
router.post('/reservations', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RESERVATIONS]), createReservation);
router.patch('/reservations/:reservation_id/status', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RESERVATIONS]), updateReservationStatus);
router.patch('/reservations/:reservation_id/rooms/:reservation_room_id', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RESERVATIONS, hp.MANAGE_ROOMS]), updateReservationRoomAssignment);
router.get('/stays', checkAnyPermission([hp.VIEW_RESERVATIONS]), listStays);

router.get('/rate-plans', checkAnyPermission([hp.VIEW_RATES]), listRatePlans);
router.post('/rate-plans', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_RATES]), createRatePlan);

router.get('/folios', checkAnyPermission([hp.VIEW_FOLIOS]), listFolios);
router.post('/folios', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FOLIOS]), createFolio);
router.post('/folios/:folio_id/lines', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FOLIOS, pos.TRANSACT_POS]), addFolioLine);

router.get('/housekeeping/tasks', checkAnyPermission([hp.VIEW_HOUSEKEEPING]), listHousekeepingTasks);
router.post('/housekeeping/tasks', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_HOUSEKEEPING]), createHousekeepingTask);
router.patch('/housekeeping/tasks/:task_id', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_HOUSEKEEPING]), updateHousekeepingTask);

router.get('/maintenance/requests', checkAnyPermission([hp.VIEW_MAINTENANCE]), listMaintenanceRequests);
router.post('/maintenance/requests', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_MAINTENANCE]), createMaintenanceRequest);
router.patch('/maintenance/requests/:request_id', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_MAINTENANCE]), updateMaintenanceRequest);

router.get('/amenities', checkAnyPermission([hp.VIEW_AMENITIES]), listAmenities);
router.post('/amenities', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES]), createAmenity);
router.post('/room-amenities', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES, hp.MANAGE_ROOMS]), createRoomAmenity);
router.post('/property-amenities', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES]), createPropertyAmenity);
router.get('/facilities', checkAnyPermission([hp.VIEW_FACILITIES]), listFacilities);
router.post('/facilities', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FACILITIES]), createFacility);
router.post('/facilities/bookings', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_FACILITIES, hp.MANAGE_RESERVATIONS]), createFacilityBooking);
router.get('/packages', checkAnyPermission([hp.VIEW_AMENITIES, hp.VIEW_RATES]), listPackages);
router.post('/packages', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES, hp.MANAGE_RATES]), createPackage);
router.post('/packages/items', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_AMENITIES, hp.MANAGE_RATES]), createPackageItem);
router.get('/guest-messages', checkAnyPermission([hp.VIEW_GUESTS, hp.VIEW_RESERVATIONS]), listGuestMessages);
router.post('/guest-messages', setNoStoreCacheControl, checkAnyPermission([hp.MANAGE_GUESTS, hp.MANAGE_RESERVATIONS]), createGuestMessage);
router.get('/reports', checkAnyPermission([hp.VIEW_REPORTS, reports.VIEW_REPORTS]), hospitalityReports);

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
