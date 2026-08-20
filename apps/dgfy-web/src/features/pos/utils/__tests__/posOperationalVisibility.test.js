import { describe, expect, it } from 'vitest';
import {
  getIncomingOrderShiftReasonCode,
  hasUsableIncomingOrderShift,
  isIncomingOrderShiftUnavailableError
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
});
