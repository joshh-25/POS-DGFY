import {
  fnbDashboardUseCase,
  listFnbModifierGroupsUseCase,
  createFnbModifierGroupUseCase,
  listFnbDiningAreasUseCase,
  createFnbDiningAreaUseCase,
  updateFnbDiningTableStatusUseCase,
  listFnbKitchenStationsUseCase,
  createFnbKitchenStationUseCase,
  listFnbItemKitchenRoutesUseCase,
  upsertFnbItemKitchenRouteUseCase,
  listFnbItemModifierGroupsUseCase,
  replaceFnbItemModifierGroupsUseCase,
  listFnbChecksUseCase,
  createFnbCheckUseCase,
  addFnbCheckLineUseCase,
  updateFnbCheckStatusUseCase,
  transferFnbCheckUseCase,
  splitFnbCheckUseCase,
  mergeFnbChecksUseCase,
  createFnbKitchenTicketUseCase,
  updateFnbKitchenTicketStatusUseCase,
  listFnbReservationsUseCase,
  createFnbReservationUseCase,
  updateFnbReservationStatusUseCase,
  getFnbServiceChargeSettingsUseCase,
  updateFnbServiceChargeSettingsUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;

const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});

const sendResult = (req, res, result, { statusCode = 200, message = null } = {}) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => statusCode,
  successPayloadResolver: () => ({
    success: true,
    data: result.data,
    ...(message ? { message } : {}),
    timestamp: timestamp()
  }),
  errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
});

export const dashboard = async (req, res, next) => {
  try {
    return sendResult(req, res, await fnbDashboardUseCase());
  } catch (error) {
    return next(error);
  }
};

export const listModifierGroups = async (req, res, next) => {
  try {
    return sendResult(req, res, await listFnbModifierGroupsUseCase({ query: req.validatedQuery || req.query }));
  } catch (error) {
    return next(error);
  }
};

export const createModifierGroup = async (req, res, next) => {
  try {
    return sendResult(req, res, await createFnbModifierGroupUseCase({ payload: req.validatedData || req.body }), {
      statusCode: 201
    });
  } catch (error) {
    return next(error);
  }
};

export const listDiningAreas = async (req, res, next) => {
  try {
    return sendResult(req, res, await listFnbDiningAreasUseCase({ query: req.validatedQuery || req.query }));
  } catch (error) {
    return next(error);
  }
};

export const createDiningArea = async (req, res, next) => {
  try {
    return sendResult(req, res, await createFnbDiningAreaUseCase({ payload: req.validatedData || req.body }), {
      statusCode: 201
    });
  } catch (error) {
    return next(error);
  }
};

export const updateTableStatus = async (req, res, next) => {
  try {
    return sendResult(req, res, await updateFnbDiningTableStatusUseCase({
      tableId: req.validatedParams?.table_id || req.params.table_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const listKitchenStations = async (req, res, next) => {
  try {
    return sendResult(req, res, await listFnbKitchenStationsUseCase({ query: req.validatedQuery || req.query }));
  } catch (error) {
    return next(error);
  }
};

export const createKitchenStation = async (req, res, next) => {
  try {
    return sendResult(req, res, await createFnbKitchenStationUseCase({ payload: req.validatedData || req.body }), {
      statusCode: 201
    });
  } catch (error) {
    return next(error);
  }
};

export const listItemKitchenRoutes = async (req, res, next) => {
  try {
    return sendResult(req, res, await listFnbItemKitchenRoutesUseCase({ query: req.validatedQuery || req.query }));
  } catch (error) {
    return next(error);
  }
};

export const upsertItemKitchenRoute = async (req, res, next) => {
  try {
    return sendResult(req, res, await upsertFnbItemKitchenRouteUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const listItemModifierGroups = async (req, res, next) => {
  try {
    return sendResult(req, res, await listFnbItemModifierGroupsUseCase({ query: req.validatedQuery || req.query }));
  } catch (error) {
    return next(error);
  }
};

export const replaceItemModifierGroups = async (req, res, next) => {
  try {
    return sendResult(req, res, await replaceFnbItemModifierGroupsUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const listChecks = async (req, res, next) => {
  try {
    return sendResult(req, res, await listFnbChecksUseCase({ query: req.validatedQuery || req.query }));
  } catch (error) {
    return next(error);
  }
};

export const createCheck = async (req, res, next) => {
  try {
    return sendResult(req, res, await createFnbCheckUseCase({
      payload: req.validatedData || req.body,
      actorUserId: req.user?.user_id
    }), { statusCode: 201 });
  } catch (error) {
    return next(error);
  }
};

export const addCheckLine = async (req, res, next) => {
  try {
    return sendResult(req, res, await addFnbCheckLineUseCase({
      checkId: req.validatedParams?.check_id || req.params.check_id,
      payload: req.validatedData || req.body
    }), { statusCode: 201 });
  } catch (error) {
    return next(error);
  }
};

export const updateCheckStatus = async (req, res, next) => {
  try {
    return sendResult(req, res, await updateFnbCheckStatusUseCase({
      checkId: req.validatedParams?.check_id || req.params.check_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const transferCheck = async (req, res, next) => {
  try {
    return sendResult(req, res, await transferFnbCheckUseCase({
      checkId: req.validatedParams?.check_id || req.params.check_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const splitCheck = async (req, res, next) => {
  try {
    return sendResult(req, res, await splitFnbCheckUseCase({
      checkId: req.validatedParams?.check_id || req.params.check_id,
      payload: req.validatedData || req.body
    }), { statusCode: 201 });
  } catch (error) {
    return next(error);
  }
};

export const mergeChecks = async (req, res, next) => {
  try {
    return sendResult(req, res, await mergeFnbChecksUseCase({
      checkId: req.validatedParams?.check_id || req.params.check_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const createKitchenTicket = async (req, res, next) => {
  try {
    return sendResult(req, res, await createFnbKitchenTicketUseCase({
      checkId: req.validatedParams?.check_id || req.params.check_id,
      payload: req.validatedData || req.body
    }), { statusCode: 201 });
  } catch (error) {
    return next(error);
  }
};

export const updateKitchenTicketStatus = async (req, res, next) => {
  try {
    return sendResult(req, res, await updateFnbKitchenTicketStatusUseCase({
      ticketId: req.validatedParams?.ticket_id || req.params.ticket_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const listReservations = async (req, res, next) => {
  try {
    return sendResult(req, res, await listFnbReservationsUseCase({ query: req.validatedQuery || req.query }));
  } catch (error) {
    return next(error);
  }
};

export const createReservation = async (req, res, next) => {
  try {
    return sendResult(req, res, await createFnbReservationUseCase({
      payload: req.validatedData || req.body,
      source: 'admin'
    }), { statusCode: 201 });
  } catch (error) {
    return next(error);
  }
};

export const createPublicReservation = async (req, res, next) => {
  try {
    return sendResult(req, res, await createFnbReservationUseCase({
      payload: req.validatedData || req.body,
      source: 'storefront'
    }), { statusCode: 201 });
  } catch (error) {
    return next(error);
  }
};

export const updateReservationStatus = async (req, res, next) => {
  try {
    return sendResult(req, res, await updateFnbReservationStatusUseCase({
      reservationId: req.validatedParams?.reservation_id || req.params.reservation_id,
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};

export const getServiceChargeSettings = async (req, res, next) => {
  try {
    return sendResult(req, res, await getFnbServiceChargeSettingsUseCase());
  } catch (error) {
    return next(error);
  }
};

export const updateServiceChargeSettings = async (req, res, next) => {
  try {
    return sendResult(req, res, await updateFnbServiceChargeSettingsUseCase({
      payload: req.validatedData || req.body
    }));
  } catch (error) {
    return next(error);
  }
};
