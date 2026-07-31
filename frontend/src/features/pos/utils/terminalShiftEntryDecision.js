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

