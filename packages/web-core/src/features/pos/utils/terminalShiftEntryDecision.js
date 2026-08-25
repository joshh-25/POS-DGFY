const normalizeTerminalId = (value) => String(value || '').trim().toUpperCase();

const normalizePositiveInteger = (value) => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

export const resolveTerminalShiftEntryDecision = ({
  currentShift = null,
  selectedLocationId = null,
  selectedTerminalId = '',
  terminalOccupancy = null
} = {}) => {
  if (currentShift) {
    return {
      mode: 'resume',
      locationId: normalizePositiveInteger(currentShift.location_id),
      shiftId: normalizePositiveInteger(currentShift.pos_terminal_shift_id),
      terminalId: normalizeTerminalId(currentShift.terminal_id)
    };
  }

  const terminalId = normalizeTerminalId(selectedTerminalId);
  if (terminalOccupancy?.status === 'occupied_by_other') {
    return {
      mode: 'blocked',
      locationId: normalizePositiveInteger(terminalOccupancy.location_id || selectedLocationId),
      shiftId: null,
      terminalId,
      message: `Terminal ${terminalId || 'selected'} is already in use by another cashier. Supervisor assistance is required.`
    };
  }

  return {
    mode: 'open',
    locationId: normalizePositiveInteger(selectedLocationId),
    shiftId: null,
    terminalId
  };
};

export const resolveActiveShiftResumeDecision = ({
  currentShift = null,
  terminalRegistry = []
} = {}) => {
  const decision = resolveTerminalShiftEntryDecision({ currentShift });
  if (decision.mode !== 'resume') return decision;

  const activeRegistryEntry = (Array.isArray(terminalRegistry) ? terminalRegistry : [])
    .filter((entry) => entry?.is_active !== false)
    .find((entry) => normalizeTerminalId(entry?.terminal_id) === decision.terminalId);
  const registryLocationId = normalizePositiveInteger(activeRegistryEntry?.location_id);

  if (
    !decision.terminalId
    || !decision.shiftId
    || !decision.locationId
    || !activeRegistryEntry
    || registryLocationId !== decision.locationId
  ) {
    return {
      ...decision,
      mode: 'blocked',
      message: 'Your active shift is linked to an unavailable terminal. A supervisor must review the terminal assignment.'
    };
  }

  return decision;
};

export const resolveStoredShiftUnlockMode = ({
  lockReason = '',
  activeShift = null
} = {}) => {
  if (lockReason === 'terminal_reunlock') return 'cashier_resume';
  if (lockReason === 'shift_start_required' && activeShift) return 'resume_shift';
  return 'shift_start';
};

export const resolveCashierRegisterEntryMode = ({
  shiftCashierId = null,
  authenticatedCashierId = null
} = {}) => (
  normalizePositiveInteger(shiftCashierId) === normalizePositiveInteger(authenticatedCashierId)
    && normalizePositiveInteger(shiftCashierId)
    ? 'resume'
    : 'takeover'
);

export const isPosOperatorAuthorityValid = ({ authorityValid = false } = {}) => authorityValid === true;

// The operator-authority endpoints are wired to the *throwing* feature resolver
// (apps/dgfy-api/src/modules/pos/index.js:357), so a location with the attendance
// lifecycle switched off answers POS_ATTENDANCE_FEATURE_DISABLED -- never the
// POS_OPERATOR_FEATURE_DISABLED this client used to look for alone. Both mean the
// same thing to the terminal: the register is not under operator authority, and the
// API's own mutation path already falls back to legacy behaviour.
export const POS_OPERATOR_FEATURE_DISABLED_REASON_CODES = Object.freeze([
  'POS_OPERATOR_FEATURE_DISABLED',
  'POS_ATTENDANCE_FEATURE_DISABLED'
]);

export const isPosOperatorFeatureDisabledReason = (reasonCode = '') => (
  POS_OPERATOR_FEATURE_DISABLED_REASON_CODES.includes(String(reasonCode || '').trim())
);

export const buildScopedCashierRequestConfig = ({ token = '', companyToken = '' } = {}) => {
  const normalizedToken = String(token || '').trim();
  const normalizedCompanyToken = String(companyToken || '').trim();
  if (!normalizedToken || !normalizedCompanyToken) {
    throw new Error('The cashier company session could not be verified. Sign in again.');
  }

  return {
    skipAuthRefresh: true,
    skipGlobalErrorToast: true,
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
      'x-company-token': normalizedCompanyToken
    }
  };
};

export const shouldRestorePosOperatorAuthority = ({
  authorityValid = false,
  operatorUserId = null,
  authenticatedUserId = null,
  alreadyAttempted = false
} = {}) => {
  if (alreadyAttempted || !normalizePositiveInteger(authenticatedUserId)) return false;

  // Only a missing or invalid authority session should be refreshed through the
  // backend resume flow; a valid scoped authority remains usable as-is.
  return authorityValid !== true || !normalizePositiveInteger(operatorUserId);
};
