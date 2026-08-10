import api from '../../../services/api.js';

const unwrap = (response) => response.data?.data ?? response.data;

export const getFnbDashboard = () => api.get('/fnb/dashboard').then(unwrap);

export const listFnbModifierGroups = (params = {}) => api.get('/fnb/modifier-groups', { params }).then(unwrap);
export const createFnbModifierGroup = (payload) => api.post('/fnb/modifier-groups', payload).then(unwrap);
export const updateFnbModifierGroup = (modifierGroupId, payload) => api.put(`/fnb/modifier-groups/${modifierGroupId}`, payload).then(unwrap);

export const listFnbDiningAreas = (params = {}) => api.get('/fnb/dining-areas', { params }).then(unwrap);
export const createFnbDiningArea = (payload) => api.post('/fnb/dining-areas', payload).then(unwrap);
export const updateFnbTableStatus = (tableId, payload) => api.patch(`/fnb/tables/${tableId}/status`, payload).then(unwrap);

export const listFnbKitchenStations = (params = {}) => api.get('/fnb/kitchen-stations', { params }).then(unwrap);
export const createFnbKitchenStation = (payload) => api.post('/fnb/kitchen-stations', payload).then(unwrap);
export const listFnbItemKitchenRoutes = (params = {}) => api.get('/fnb/item-kitchen-routes', { params }).then(unwrap);
export const upsertFnbItemKitchenRoute = (itemId, payload) => api.put(`/fnb/item-kitchen-routes/${itemId}`, payload).then(unwrap);
export const listFnbItemModifierGroups = (params = {}) => api.get('/fnb/item-modifier-groups', { params }).then(unwrap);
export const replaceFnbItemModifierGroups = (itemId, payload) => api.put(`/fnb/item-modifier-groups/${itemId}`, payload).then(unwrap);

export const listFnbChecks = (params = {}) => api.get('/fnb/checks', { params }).then(unwrap);
export const createFnbCheck = (payload) => api.post('/fnb/checks', payload).then(unwrap);
export const updateFnbCheckStatus = (checkId, payload) => api.patch(`/fnb/checks/${checkId}/status`, payload).then(unwrap);
export const transferFnbCheck = (checkId, payload) => api.patch(`/fnb/checks/${checkId}/transfer`, payload).then(unwrap);
export const splitFnbCheck = (checkId, payload) => api.post(`/fnb/checks/${checkId}/split`, payload).then(unwrap);
export const mergeFnbChecks = (checkId, payload) => api.post(`/fnb/checks/${checkId}/merge`, payload).then(unwrap);
export const addFnbCheckLine = (checkId, payload) => api.post(`/fnb/checks/${checkId}/lines`, payload).then(unwrap);
export const createFnbKitchenTicket = (checkId, payload = {}) => api.post(`/fnb/checks/${checkId}/kitchen-tickets`, payload).then(unwrap);
export const updateFnbKitchenTicketStatus = (ticketId, payload) => api.patch(`/fnb/kitchen-tickets/${ticketId}/status`, payload).then(unwrap);

export const listFnbReservations = (params = {}) => api.get('/fnb/reservations', { params }).then(unwrap);
export const createFnbReservation = (payload) => api.post('/fnb/reservations', payload).then(unwrap);
export const updateFnbReservationStatus = (reservationId, payload) => api.patch(`/fnb/reservations/${reservationId}/status`, payload).then(unwrap);

export const getFnbServiceChargeSettings = () => api.get('/fnb/service-charge-settings').then(unwrap);
export const updateFnbServiceChargeSettings = (payload) => api.put('/fnb/service-charge-settings', payload).then(unwrap);
