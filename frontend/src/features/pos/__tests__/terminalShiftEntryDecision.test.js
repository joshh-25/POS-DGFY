import { describe, expect, it } from 'vitest';
import { resolveTerminalShiftEntryDecision } from '../utils/terminalShiftEntryDecision.js';

describe('POS terminal shift entry decision', () => {
  it('resumes the authenticated cashier active shift on its existing terminal', () => {
    expect(resolveTerminalShiftEntryDecision({
      currentShift: {
        pos_terminal_shift_id: 81,
        terminal_id: 'counter-02',
        location_id: 9
      },
      selectedTerminalId: 'COUNTER-01',
      selectedLocationId: 8
    })).toEqual({
      mode: 'resume',
      shiftId: 81,
      terminalId: 'COUNTER-02',
      locationId: 9
    });
  });

  it('opens a new shift only when the cashier has no active shift and the terminal is available', () => {
    expect(resolveTerminalShiftEntryDecision({
      selectedTerminalId: 'counter-01',
      selectedLocationId: 8,
      terminalOccupancy: { status: 'available' }
    })).toEqual({
      mode: 'open',
      shiftId: null,
      terminalId: 'COUNTER-01',
      locationId: 8
    });
  });

  it('blocks a terminal owned by another cashier with one supervisor message', () => {
    expect(resolveTerminalShiftEntryDecision({
      selectedTerminalId: 'counter-01',
      selectedLocationId: 8,
      terminalOccupancy: { status: 'occupied_by_other', location_id: 8 }
    })).toEqual(expect.objectContaining({
      mode: 'blocked',
      terminalId: 'COUNTER-01',
      locationId: 8,
      message: 'Terminal COUNTER-01 is already in use by another cashier. Supervisor assistance is required.'
    }));
  });
});

