import { describe, expect, it } from 'vitest';
import {
  isPosOperatorAuthorityOwnedByUser,
  resolveActiveShiftResumeDecision,
  resolveCashierRegisterEntryMode,
  resolveStoredShiftUnlockMode,
  resolveTerminalShiftEntryDecision
} from '../utils/terminalShiftEntryDecision.js';

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

  it('resumes an active shift only when its terminal and location remain available', () => {
    expect(resolveActiveShiftResumeDecision({
      currentShift: {
        pos_terminal_shift_id: 81,
        terminal_id: 'counter-02',
        location_id: 9
      },
      terminalRegistry: [
        { terminal_id: 'COUNTER-02', location_id: 9, is_active: true }
      ]
    })).toEqual({
      mode: 'resume',
      shiftId: 81,
      terminalId: 'COUNTER-02',
      locationId: 9
    });
  });

  it.each([
    ['missing terminal', []],
    ['inactive terminal', [{ terminal_id: 'COUNTER-02', location_id: 9, is_active: false }]],
    ['location mismatch', [{ terminal_id: 'COUNTER-02', location_id: 8, is_active: true }]]
  ])('blocks an active shift with an unavailable assignment: %s', (_label, terminalRegistry) => {
    expect(resolveActiveShiftResumeDecision({
      currentShift: {
        pos_terminal_shift_id: 81,
        terminal_id: 'counter-02',
        location_id: 9
      },
      terminalRegistry
    })).toEqual(expect.objectContaining({
      mode: 'blocked',
      message: 'Your active shift is linked to an unavailable terminal. A supervisor must review the terminal assignment.'
    }));
  });

  it('keeps the open-shift decision when no active shift exists', () => {
    expect(resolveActiveShiftResumeDecision({
      currentShift: null,
      terminalRegistry: [{ terminal_id: 'COUNTER-01', location_id: 8, is_active: true }]
    })).toEqual({
      mode: 'open',
      shiftId: null,
      terminalId: '',
      locationId: null
    });
  });

  it('preserves resume mode when lock restoration runs after an active-shift handoff', () => {
    expect(resolveStoredShiftUnlockMode({
      lockReason: 'shift_start_required',
      activeShift: { pos_terminal_shift_id: 81 }
    })).toBe('resume_shift');
  });

  it('uses open-shift mode only when shift-start lock has no active shift', () => {
    expect(resolveStoredShiftUnlockMode({
      lockReason: 'shift_start_required',
      activeShift: null
    })).toBe('shift_start');
  });

  it('automatically resumes the cashier who owns the open shift', () => {
    expect(resolveCashierRegisterEntryMode({
      shiftCashierId: 12,
      authenticatedCashierId: 12
    })).toBe('resume');
  });

  it('requires takeover for a different authenticated cashier', () => {
    expect(resolveCashierRegisterEntryMode({
      shiftCashierId: 12,
      authenticatedCashierId: 27
    })).toBe('takeover');
  });

  it('accepts operator authority only for the currently authenticated user', () => {
    expect(isPosOperatorAuthorityOwnedByUser({
      authorityValid: true,
      operatorUserId: 12,
      authenticatedUserId: 12
    })).toBe(true);
  });

  it('rejects valid operator authority left behind by a different signed-in account', () => {
    expect(isPosOperatorAuthorityOwnedByUser({
      authorityValid: true,
      operatorUserId: 12,
      authenticatedUserId: 27
    })).toBe(false);
  });
});
