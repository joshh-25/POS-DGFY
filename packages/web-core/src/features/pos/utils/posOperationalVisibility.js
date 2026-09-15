export const isPosOnlineOrderQueueEnabled = ({ workflowMode, posDefaults } = {}) => (
  String(workflowMode || '').trim().toLowerCase() !== 'services'
  && posDefaults?.show_online_queue !== false
);

const OPEN_SHIFT_STATUSES = new Set(['active', 'open']);
const INCOMING_ORDER_SHIFT_REASON_CODES = new Set([
  'POS_SHIFT_CLOSED',
  'POS_SHIFT_REQUIRED_FOR_INCOMING_QUEUE'
]);

export const hasUsableIncomingOrderShift = (shift = null) => {
  const shiftId = Number(shift?.pos_terminal_shift_id || 0);
  const locationId = Number(shift?.location_id || 0);
  if (!Number.isInteger(shiftId) || shiftId <= 0 || !Number.isInteger(locationId) || locationId <= 0) {
    return false;
  }

  const status = String(shift?.status || '').trim().toLowerCase();
  if (status && !OPEN_SHIFT_STATUSES.has(status)) return false;
  if (shift?.closed_at || shift?.closedAt) return false;
  return true;
};

export const getIncomingOrderShiftReasonCode = (error) => String(
  error?.response?.data?.errors?.reason_code
  || error?.response?.data?.details?.reason_code
  || ''
).trim().toUpperCase();

export const isIncomingOrderShiftUnavailableError = (error) => (
  INCOMING_ORDER_SHIFT_REASON_CODES.has(getIncomingOrderShiftReasonCode(error))
);

const normalizeOperationalScopeNumber = (value) => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
};

export const buildPosOperationalScopeKey = ({ terminalId = '', shiftId = 0, locationId = 0 } = {}) => [
  String(terminalId || '').trim(),
  normalizeOperationalScopeNumber(shiftId),
  normalizeOperationalScopeNumber(locationId)
].join(':');

// Phase 336: the admin branch monitor is read-only, but its response still has to be bound to
// the tenant and the terminal/shift context that requested it. A late response must never paint
// one branch's rows beneath another branch's label after a scope or session change.
export const buildPosAdminLocationMonitorScopeKey = ({
  tenantId = '',
  terminalId = '',
  shiftId = 0,
  locationId = 0
} = {}) => [
  String(tenantId || '').trim(),
  String(terminalId || '').trim(),
  normalizeOperationalScopeNumber(shiftId),
  normalizeOperationalScopeNumber(locationId)
].join(':');

export const isCurrentPosOperationalRequest = ({
  requestSequence,
  currentRequestSequence,
  requestScopeKey,
  currentScopeKey
} = {}) => (
  requestSequence === currentRequestSequence
  && String(requestScopeKey || '') === String(currentScopeKey || '')
);
