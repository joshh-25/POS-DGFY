import { describe, expect, it } from 'vitest';
import {
  buildScopedCashierRequestConfig,
  isPosOperatorAuthorityValid,
  isPosOperatorAuthorityUnavailableError,
  isPosOperatorFeatureDisabledReason,
  resolveActiveShiftResumeDecision,
  resolveCashierRegisterEntryMode,
  resolveStoredShiftUnlockMode,
  resolveTerminalShiftEntryDecision,
  shouldRestorePosOperatorAuthority
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

  it('accepts a valid scoped operator authority independent of the DGFY session identity', () => {
    expect(isPosOperatorAuthorityValid({ authorityValid: true })).toBe(true);
  });

  it('recognizes both the operator and attendance feature-disabled reason codes', () => {
    expect(isPosOperatorFeatureDisabledReason('POS_OPERATOR_FEATURE_DISABLED')).toBe(true);
    expect(isPosOperatorFeatureDisabledReason('POS_ATTENDANCE_FEATURE_DISABLED')).toBe(true);
    expect(isPosOperatorFeatureDisabledReason(' POS_ATTENDANCE_FEATURE_DISABLED ')).toBe(true);
  });

  it('does not treat an unrelated or missing reason code as feature-disabled', () => {
    expect(isPosOperatorFeatureDisabledReason('POS_OPERATOR_SCOPE_MISMATCH')).toBe(false);
    expect(isPosOperatorFeatureDisabledReason('')).toBe(false);
    expect(isPosOperatorFeatureDisabledReason(undefined)).toBe(false);
  });

  it('binds cashier lifecycle requests to the verified cashier session without refreshing as the DGFY account', () => {
    expect(buildScopedCashierRequestConfig({
      token: ' cashier-access-token ',
      companyToken: ' tenant-company-token '
    })).toEqual({
      skipAuthRefresh: true,
      skipGlobalErrorToast: true,
      headers: {
        Authorization: 'Bearer cashier-access-token',
        'x-company-token': 'tenant-company-token'
      }
    });
  });

  it('fails closed when the verified cashier session is incomplete', () => {
    expect(() => buildScopedCashierRequestConfig({
      token: '',
      companyToken: 'tenant-company-token'
    })).toThrow('The cashier company session could not be verified. Sign in again.');
  });

  it.each([
    ['top-level feature code', {
      response: {
        status: 404,
        data: { error_code: 'POS_OPERATOR_FEATURE_DISABLED' }
      }
    }],
    ['details feature code', {
      response: {
        status: 404,
        data: { errors: { reason_code: 'POS_OPERATOR_FEATURE_DISABLED' } }
      }
    }],
    ['attendance feature-disabled code', {
      response: {
        status: 404,
        data: { error_code: 'POS_ATTENDANCE_FEATURE_DISABLED' }
      }
    }],
    ['route-level mixed-version response', {
      config: { url: '/pos/terminal/operator/current' },
      response: {
        status: 404,
        data: {
          message: 'Route /api/v1/pos/terminal/operator/current?terminal_id=COUNTER-01&location_id=1&shift_id=1 not found'
        }
      }
    }]
  ])('uses legacy operator behavior for an unavailable operator API: %s', (_label, error) => {
    expect(isPosOperatorAuthorityUnavailableError(error)).toBe(true);
  });

  it.each([
    ['unrelated missing route', {
      config: { url: '/pos/terminal/shifts/current' },
      response: {
        status: 404,
        data: { message: 'Route /api/v1/pos/terminal/shifts/current not found' }
      }
    }],
    ['operator domain failure', {
      config: { url: '/pos/terminal/operator/current' },
      response: {
        status: 404,
        data: {
          error_code: 'RESOURCE_NOT_FOUND',
          errors: { reason_code: 'POS_OPERATOR_SHIFT_NOT_OPEN' },
          message: 'The register shift is no longer open.'
        }
      }
    }],
    ['authorization failure', {
      config: { url: '/pos/terminal/operator/current' },
      response: {
        status: 403,
        data: { error_code: 'AUTHORIZATION_FAILED' }
      }
    }]
  ])('keeps operator enforcement for a real failure: %s', (_label, error) => {
    expect(isPosOperatorAuthorityUnavailableError(error)).toBe(false);
  });

  it('restores a missing operator authority session for an authenticated cashier', () => {
    expect(shouldRestorePosOperatorAuthority({
      authorityValid: false,
      operatorUserId: null,
      authenticatedUserId: 12,
      alreadyAttempted: false
    })).toBe(true);
  });

  it('does not replace a valid scoped authority session', () => {
    expect(shouldRestorePosOperatorAuthority({
      authorityValid: true,
      operatorUserId: 12,
      authenticatedUserId: 27,
      alreadyAttempted: false
    })).toBe(false);
  });

  it('attempts automatic authority recovery only once per register scope', () => {
    expect(shouldRestorePosOperatorAuthority({
      authorityValid: false,
      operatorUserId: null,
      authenticatedUserId: 12,
      alreadyAttempted: true
    })).toBe(false);
  });
});
