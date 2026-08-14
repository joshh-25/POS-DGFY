import { fetchOnlineOrderHistory } from '../services/posService.js';

export const loadPosOrderHistoryState = async ({
  locked,
  canViewPos,
  isOnline,
  locationId,
  search = '',
  fulfillmentStatus = '',
  paymentStatus = '',
  page = 1
}) => {
  if (locked) {
    return {
      state: { loading: false, orders: [], pagination: null, accessState: 'locked', errorMessage: '' },
      toastMessage: ''
    };
  }
  if (!canViewPos) {
    return {
      state: {
        loading: false,
        orders: [],
        pagination: null,
        accessState: 'forbidden',
        errorMessage: 'You need POS view permission to access online order history.'
      },
      toastMessage: ''
    };
  }
  if (!isOnline) {
    return {
      state: {
        loading: false,
        orders: [],
        pagination: null,
        accessState: 'offline',
        errorMessage: 'Reconnect to view online order history.'
      },
      toastMessage: ''
    };
  }

  try {
    const payload = await fetchOnlineOrderHistory({
      ...(Number(locationId) > 0 ? { location_id: Number(locationId) } : {}),
      ...(String(search || '').trim() ? { search: String(search).trim() } : {}),
      ...(fulfillmentStatus ? { fulfillment_status: fulfillmentStatus } : {}),
      ...(paymentStatus ? { payment_status: paymentStatus } : {}),
      page: Math.max(1, Number.parseInt(page, 10) || 1),
      limit: 100
    });
    return {
      state: {
        loading: false,
        orders: Array.isArray(payload?.orders) ? payload.orders : [],
        pagination: payload?.pagination || null,
        accessState: 'allowed',
        errorMessage: ''
      },
      toastMessage: ''
    };
  } catch (error) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const message = offline
      ? 'You are offline. Online order history is temporarily unavailable.'
      : (error?.response?.data?.message || 'Failed to load online order history.');
    return {
      state: {
        loading: false,
        orders: [],
        pagination: null,
        accessState: offline ? 'offline' : 'error',
        errorMessage: message
      },
      toastMessage: offline ? '' : message
    };
  }
};
