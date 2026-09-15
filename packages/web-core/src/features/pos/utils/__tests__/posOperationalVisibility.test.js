import { describe, expect, it } from 'vitest';
import {
  buildPosAdminLocationMonitorScopeKey,
  buildPosOperationalScopeKey,
  getIncomingOrderShiftReasonCode,
  hasUsableIncomingOrderShift,
  isIncomingOrderShiftUnavailableError,
  isPosOnlineOrderQueueEnabled,
  isCurrentPosOperationalRequest
} from '../posOperationalVisibility.js';

describe('POS operational visibility', () => {
  it('accepts an open incoming-order shift with valid location scope', () => {
    expect(hasUsableIncomingOrderShift({
      pos_terminal_shift_id: 123,
      location_id: 1,
      status: 'open'
    })).toBe(true);
  });

  it('rejects missing, closed, and completed shift contexts', () => {
    expect(hasUsableIncomingOrderShift()).toBe(false);
    expect(hasUsableIncomingOrderShift({
      pos_terminal_shift_id: 123,
      location_id: 1,
      status: 'closed'
    })).toBe(false);
    expect(hasUsableIncomingOrderShift({
      pos_terminal_shift_id: 123,
      location_id: 1,
      closed_at: '2026-08-20T10:00:00.000Z'
    })).toBe(false);
  });

  it('recognizes the backend closed-shift reason code', () => {
    const error = {
      response: {
        status: 422,
        data: {
          errors: { reason_code: 'POS_SHIFT_CLOSED' }
        }
      }
    };

    expect(getIncomingOrderShiftReasonCode(error)).toBe('POS_SHIFT_CLOSED');
    expect(isIncomingOrderShiftUnavailableError(error)).toBe(true);
  });

  it('keeps the online Orders queue enabled for MSME when the profile allows it', () => {
    expect(isPosOnlineOrderQueueEnabled({
      workflowMode: 'msme',
      posDefaults: { show_online_queue: true }
    })).toBe(true);
  });

  it('rejects late responses from an older request or operational scope', () => {
    const mainScope = buildPosOperationalScopeKey({ terminalId: 'POS-01', shiftId: 101, locationId: 1 });
    const eastScope = buildPosOperationalScopeKey({ terminalId: 'POS-01', shiftId: 102, locationId: 2 });

    expect(isCurrentPosOperationalRequest({
      requestSequence: 2,
      currentRequestSequence: 2,
      requestScopeKey: eastScope,
      currentScopeKey: eastScope
    })).toBe(true);
    expect(isCurrentPosOperationalRequest({
      requestSequence: 1,
      currentRequestSequence: 2,
      requestScopeKey: mainScope,
      currentScopeKey: eastScope
    })).toBe(false);
    expect(isCurrentPosOperationalRequest({
      requestSequence: 2,
      currentRequestSequence: 2,
      requestScopeKey: mainScope,
      currentScopeKey: eastScope
    })).toBe(false);
  });

  it('binds admin monitor responses to tenant, terminal, shift, and viewing branch', () => {
    const tenantAScope = buildPosAdminLocationMonitorScopeKey({
      tenantId: 'tenant-a',
      terminalId: 'POS-01',
      shiftId: 0,
      locationId: 2
    });
    const tenantBScope = buildPosAdminLocationMonitorScopeKey({
      tenantId: 'tenant-b',
      terminalId: 'POS-01',
      shiftId: 0,
      locationId: 2
    });

    expect(tenantAScope).not.toBe(tenantBScope);
    expect(isCurrentPosOperationalRequest({
      requestSequence: 3,
      currentRequestSequence: 3,
      requestScopeKey: tenantAScope,
      currentScopeKey: tenantAScope
    })).toBe(true);
    expect(isCurrentPosOperationalRequest({
      requestSequence: 3,
      currentRequestSequence: 3,
      requestScopeKey: tenantAScope,
      currentScopeKey: tenantBScope
    })).toBe(false);
  });
});
