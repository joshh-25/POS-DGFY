import { describe, expect, it } from 'vitest';
import {
  preferOwnedCurrentTerminalShift,
  shouldRetryUnscopedTerminalShift
} from '../utils/posOperationalVisibility.js';

describe('POS operational shift visibility', () => {
  it('recovers an authenticated owner shift hidden by a stale location scope', () => {
    const scopedResult = {
      shift: null,
      terminal_occupancy: {
        status: 'available',
        terminal_id: 'COUNTER-01',
        location_id: 1
      }
    };
    const unscopedResult = {
      shift: {
        pos_terminal_shift_id: 152,
        terminal_id: 'COUNTER-01',
        location_id: 3,
        status: 'open'
      }
    };

    expect(shouldRetryUnscopedTerminalShift({
      scopedLocationId: 1,
      currentShiftResult: scopedResult
    })).toBe(true);
    expect(preferOwnedCurrentTerminalShift({
      scopedResult,
      unscopedResult
    })).toBe(unscopedResult);
  });

  it('does not retry or replace a terminal occupied by another cashier', () => {
    const scopedResult = {
      shift: null,
      terminal_occupancy: { status: 'occupied_by_other' }
    };

    expect(shouldRetryUnscopedTerminalShift({
      scopedLocationId: 1,
      currentShiftResult: scopedResult
    })).toBe(false);
    expect(preferOwnedCurrentTerminalShift({
      scopedResult,
      unscopedResult: {
        shift: {
          pos_terminal_shift_id: 999,
          status: 'open'
        }
      }
    })).toBe(scopedResult);
  });

  it('does not perform a cross-location retry when no location scope was requested', () => {
    expect(shouldRetryUnscopedTerminalShift({
      scopedLocationId: null,
      currentShiftResult: { shift: null }
    })).toBe(false);
  });
});
