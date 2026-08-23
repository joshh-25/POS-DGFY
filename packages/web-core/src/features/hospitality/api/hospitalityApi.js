import api from '../../../services/api.js';

const unwrap = (response) => response.data?.data ?? response.data;

export const getHospitalityDashboard = () => api.get('/hospitality/dashboard').then(unwrap);

export const listHospitalityRoomTypes = (params = {}) => api.get('/hospitality/room-types', { params }).then(unwrap);

export const createHospitalityRoomType = (payload) => api.post('/hospitality/room-types', payload).then(unwrap);

export const listHospitalityRooms = (params = {}) => api.get('/hospitality/rooms', { params }).then(unwrap);

export const createHospitalityRoom = (payload) => api.post('/hospitality/rooms', payload).then(unwrap);

export const updateHospitalityRoomStatus = (roomId, payload) => (
  api.patch(`/hospitality/rooms/${roomId}/status`, payload).then(unwrap)
);

export const listHospitalityGuests = (params = {}) => api.get('/hospitality/guests', { params }).then(unwrap);

export const createHospitalityGuest = (payload) => api.post('/hospitality/guests', payload).then(unwrap);

export const listHospitalityReservations = (params = {}) => api.get('/hospitality/reservations', { params }).then(unwrap);

export const createHospitalityReservation = (payload) => api.post('/hospitality/reservations', payload).then(unwrap);

export const updateHospitalityReservationStatus = (reservationId, payload) => (
  api.patch(`/hospitality/reservations/${reservationId}/status`, payload).then(unwrap)
);

export const updateHospitalityReservationRoom = (reservationId, reservationRoomId, payload) => (
  api.patch(`/hospitality/reservations/${reservationId}/rooms/${reservationRoomId}`, payload).then(unwrap)
);

export const listHospitalityStays = (params = {}) => api.get('/hospitality/stays', { params }).then(unwrap);

export const listHospitalityRatePlans = (params = {}) => api.get('/hospitality/rate-plans', { params }).then(unwrap);

export const createHospitalityRatePlan = (payload) => api.post('/hospitality/rate-plans', payload).then(unwrap);

export const listHospitalityFolios = (params = {}) => api.get('/hospitality/folios', { params }).then(unwrap);

export const createHospitalityFolio = (payload) => api.post('/hospitality/folios', payload).then(unwrap);

export const addHospitalityFolioLine = (folioId, payload) => (
  api.post(`/hospitality/folios/${folioId}/lines`, payload).then(unwrap)
);

export const listHospitalityHousekeepingTasks = (params = {}) => (
  api.get('/hospitality/housekeeping/tasks', { params }).then(unwrap)
);

export const createHospitalityHousekeepingTask = (payload) => api.post('/hospitality/housekeeping/tasks', payload).then(unwrap);

export const updateHospitalityHousekeepingTask = (taskId, payload) => (
  api.patch(`/hospitality/housekeeping/tasks/${taskId}`, payload).then(unwrap)
);

export const listHospitalityMaintenanceRequests = (params = {}) => (
  api.get('/hospitality/maintenance/requests', { params }).then(unwrap)
);

export const createHospitalityMaintenanceRequest = (payload) => (
  api.post('/hospitality/maintenance/requests', payload).then(unwrap)
);

export const updateHospitalityMaintenanceRequest = (requestId, payload) => (
  api.patch(`/hospitality/maintenance/requests/${requestId}`, payload).then(unwrap)
);

export const listHospitalityAmenities = (params = {}) => api.get('/hospitality/amenities', { params }).then(unwrap);

export const createHospitalityAmenity = (payload) => api.post('/hospitality/amenities', payload).then(unwrap);

export const createHospitalityRoomAmenity = (payload) => api.post('/hospitality/room-amenities', payload).then(unwrap);

export const createHospitalityPropertyAmenity = (payload) => api.post('/hospitality/property-amenities', payload).then(unwrap);

export const listHospitalityFacilities = (params = {}) => api.get('/hospitality/facilities', { params }).then(unwrap);

export const createHospitalityFacility = (payload) => api.post('/hospitality/facilities', payload).then(unwrap);

export const createHospitalityFacilityBooking = (payload) => api.post('/hospitality/facilities/bookings', payload).then(unwrap);

export const listHospitalityPackages = (params = {}) => api.get('/hospitality/packages', { params }).then(unwrap);

export const createHospitalityPackage = (payload) => api.post('/hospitality/packages', payload).then(unwrap);

export const createHospitalityPackageItem = (payload) => api.post('/hospitality/packages/items', payload).then(unwrap);

export const listHospitalityGuestMessages = (params = {}) => api.get('/hospitality/guest-messages', { params }).then(unwrap);

export const createHospitalityGuestMessage = (payload) => api.post('/hospitality/guest-messages', payload).then(unwrap);

export const getHospitalityReports = (params = {}) => api.get('/hospitality/reports', { params }).then(unwrap);
