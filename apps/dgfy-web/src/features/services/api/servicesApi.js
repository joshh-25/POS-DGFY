import api from '../../../services/api.js';

export const getServicesDashboard = () => api.get('/services/dashboard').then((response) => response.data?.data ?? response.data);

export const listServicesCatalog = (params = {}) => api.get('/services/catalog', { params }).then((response) => response.data?.data ?? response.data);

export const createServiceCatalogEntry = (payload) => api.post('/services/catalog', payload).then((response) => response.data?.data ?? response.data);

export const updateServiceCatalogEntry = (serviceItemId, payload) => (
  api.put(`/services/catalog/${serviceItemId}`, payload).then((response) => response.data?.data ?? response.data)
);

export const listServiceResources = () => api.get('/services/resources').then((response) => response.data?.data ?? response.data);

export const createServiceResource = (payload) => api.post('/services/resources', payload).then((response) => response.data?.data ?? response.data);

export const listServiceAssignments = (params = {}) => api.get('/services/assignments', { params }).then((response) => response.data?.data ?? response.data);

export const createServiceAssignment = (payload) => api.post('/services/assignments', payload).then((response) => response.data?.data ?? response.data);

export const updateServiceAssignment = (assignmentId, payload) => (
  api.patch(`/services/assignments/${assignmentId}`, payload).then((response) => response.data?.data ?? response.data)
);

export const listServiceBookings = (params = {}) => api.get('/services/bookings', { params }).then((response) => response.data?.data ?? response.data);

export const updateServiceBookingStatus = (bookingId, payload) => (
  api.patch(`/services/bookings/${bookingId}/status`, payload).then((response) => response.data?.data ?? response.data)
);

export const listServiceWaitlist = (params = {}) => api.get('/services/waitlist', { params }).then((response) => response.data?.data ?? response.data);

export const createServiceWaitlistEntry = (payload) => api.post('/services/waitlist', payload).then((response) => response.data?.data ?? response.data);

export const updateServiceWaitlistStatus = (waitlistEntryId, payload) => (
  api.patch(`/services/waitlist/${waitlistEntryId}/status`, payload).then((response) => response.data?.data ?? response.data)
);

export const listServiceClients = (params = {}) => api.get('/services/clients', { params }).then((response) => response.data?.data ?? response.data);

export const listServiceReminders = (params = {}) => api.get('/services/reminders', { params }).then((response) => response.data?.data ?? response.data);

export const queueDueServiceReminders = (payload = {}) => (
  api.post('/services/reminders/queue-due', payload).then((response) => response.data?.data ?? response.data)
);

export const sendDueServiceReminders = (params = {}) => (
  api.post('/services/reminders/send-due', null, { params }).then((response) => response.data?.data ?? response.data)
);

export const listServiceOptionGroups = (params = {}) => api.get('/services/option-groups', { params }).then((response) => response.data?.data ?? response.data);

export const createServiceOptionGroup = (payload) => api.post('/services/option-groups', payload).then((response) => response.data?.data ?? response.data);

export const updateServiceOptionGroup = (groupId, payload) => (
  api.patch(`/services/option-groups/${groupId}`, payload).then((response) => response.data?.data ?? response.data)
);

export const deactivateServiceOption = (optionId) => (
  api.post(`/services/options/${optionId}/deactivate`).then((response) => response.data?.data ?? response.data)
);

export const getItemOptionGroups = (itemId) => api.get(`/services/catalog/${itemId}/option-groups`).then((response) => response.data?.data ?? response.data);

export const assignItemOptionGroups = (itemId, groupIds) => (
  api.put(`/services/catalog/${itemId}/option-groups`, { group_ids: groupIds }).then((response) => response.data?.data ?? response.data)
);

export const calculateServiceQuote = (payload) => api.post('/services/quote', payload).then((response) => response.data?.data ?? response.data);
