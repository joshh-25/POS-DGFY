import { hospitalityUseCases } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;

const sendResult = (req, res, result, { statusCode = 200, message = null } = {}) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => statusCode,
  successPayloadResolver: () => ({
    success: true,
    data: result.data,
    ...(message ? { message } : {}),
    timestamp: timestamp()
  }),
  errorPayloadResolver: (failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
  })
});

const body = (req) => req.validatedData || req.body || {};
const query = (req) => req.validatedQuery || req.query || {};
const param = (req, key) => req.validatedParams?.[key] || req.params?.[key];
const auditContext = (req, res) => ({
  actor_user_id: req.user?.user_id || null,
  store_customer_id: req.storeCustomer?.customer_id || null,
  request_id: requestId(req, res),
  ip_address: req.ip || req.headers?.['x-forwarded-for'] || null,
  user_agent: typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'] || null
});

export const dashboard = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.dashboard());
  } catch (error) {
    return next(error);
  }
};

export const listRoomTypes = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listRoomTypes({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createRoomType = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createRoomType({ payload: body(req) }), { statusCode: 201, message: 'Room type created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listRooms = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listRooms({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createRoom = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createRoom({ payload: body(req) }), { statusCode: 201, message: 'Room created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const updateRoomStatus = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.updateRoomStatus({ roomId: param(req, 'room_id'), payload: body(req) }));
  } catch (error) {
    return next(error);
  }
};

export const listGuests = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listGuests({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createGuest = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createGuest({ payload: body(req) }), { statusCode: 201, message: 'Guest profile created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listReservations = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listReservations({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const listStays = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listStays({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createReservation = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createReservation({ payload: body(req), source: 'admin', auditContext: auditContext(req, res) }), { statusCode: 201, message: 'Reservation created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const createPublicReservation = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createReservation({ payload: body(req), source: 'storefront', auditContext: auditContext(req, res) }), { statusCode: 201, message: 'Booking confirmed successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listPublicReservationsForCustomer = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listPublicReservationsForCustomer({ storeCustomer: req.storeCustomer }));
  } catch (error) {
    return next(error);
  }
};

export const claimPublicReservation = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.claimPublicReservation({ publicReference: param(req, 'public_reference'), storeCustomer: req.storeCustomer }));
  } catch (error) {
    return next(error);
  }
};

export const updateReservationStatus = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.updateReservationStatus({ reservationId: param(req, 'reservation_id'), payload: body(req), auditContext: auditContext(req, res) }));
  } catch (error) {
    return next(error);
  }
};

export const updateReservationRoomAssignment = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.updateReservationRoomAssignment({
      reservationId: param(req, 'reservation_id'),
      reservationRoomId: param(req, 'reservation_room_id'),
      payload: body(req),
      auditContext: auditContext(req, res)
    }));
  } catch (error) {
    return next(error);
  }
};

export const availability = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.availability({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const quote = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.quote({ payload: body(req) }));
  } catch (error) {
    return next(error);
  }
};

export const bookingHold = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.bookingHold({ payload: body(req) }), { statusCode: 201, message: 'Booking hold created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listRatePlans = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listRatePlans({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createRatePlan = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createRatePlan({ payload: body(req) }), { statusCode: 201, message: 'Rate plan created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listFolios = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listFolios({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createFolio = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createFolio({ payload: body(req) }), { statusCode: 201, message: 'Folio created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const addFolioLine = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.addFolioLine({ folioId: param(req, 'folio_id'), payload: body(req), auditContext: auditContext(req, res) }), { statusCode: 201, message: 'Folio line posted successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listHousekeepingTasks = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listHousekeepingTasks({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createHousekeepingTask = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createHousekeepingTask({ payload: body(req) }), { statusCode: 201, message: 'Housekeeping task created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const updateHousekeepingTask = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.updateHousekeepingTask({ taskId: param(req, 'task_id'), payload: body(req) }));
  } catch (error) {
    return next(error);
  }
};

export const listMaintenanceRequests = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listMaintenanceRequests({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createMaintenanceRequest = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createMaintenanceRequest({ payload: body(req), auditContext: auditContext(req, res) }), { statusCode: 201, message: 'Maintenance request created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const updateMaintenanceRequest = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.updateMaintenanceRequest({ requestId: param(req, 'request_id'), payload: body(req), auditContext: auditContext(req, res) }));
  } catch (error) {
    return next(error);
  }
};

export const listAmenities = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listAmenities({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createAmenity = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createAmenity({ payload: body(req) }), { statusCode: 201, message: 'Amenity created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listFacilities = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listFacilities({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createFacility = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createFacility({ payload: body(req) }), { statusCode: 201, message: 'Facility created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listPackages = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listPackages({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createPackage = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createPackage({ payload: body(req) }), { statusCode: 201, message: 'Package created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const createRoomAmenity = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createRoomAmenity({ payload: body(req) }), { statusCode: 201, message: 'Room amenity linked successfully' });
  } catch (error) {
    return next(error);
  }
};

export const createPropertyAmenity = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createPropertyAmenity({ payload: body(req) }), { statusCode: 201, message: 'Property amenity linked successfully' });
  } catch (error) {
    return next(error);
  }
};

export const createFacilityBooking = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createFacilityBooking({ payload: body(req) }), { statusCode: 201, message: 'Facility booking created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const createPackageItem = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createPackageItem({ payload: body(req) }), { statusCode: 201, message: 'Package item linked successfully' });
  } catch (error) {
    return next(error);
  }
};

export const listGuestMessages = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.listGuestMessages({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};

export const createGuestMessage = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.createGuestMessage({ payload: body(req) }), { statusCode: 201, message: 'Guest message created successfully' });
  } catch (error) {
    return next(error);
  }
};

export const publicReservationLookup = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.publicReservationLookup({ publicReference: param(req, 'public_reference') }));
  } catch (error) {
    return next(error);
  }
};

export const reports = async (req, res, next) => {
  try {
    return sendResult(req, res, await hospitalityUseCases.reports({ query: query(req) }));
  } catch (error) {
    return next(error);
  }
};
