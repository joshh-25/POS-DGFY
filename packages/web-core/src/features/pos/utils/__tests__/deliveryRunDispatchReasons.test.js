// Phase 228 (#1273/#1271). Pure unit tests for the dispatch reason_code -> operator message map.

import { describe, expect, it } from 'vitest';
import {
  DELIVERY_RUN_DISPATCH_REASON_MESSAGES,
  getDeliveryRunDispatchReasonMessage
} from '../deliveryRunDispatchReasons.js';

describe('getDeliveryRunDispatchReasonMessage', () => {
  it('resolves every known per-order failed reason code to a distinct, non-empty message', () => {
    const perOrderCodes = [
      'ALREADY_DISPATCHED',
      'DELIVERY_ORDER_REQUIRED',
      'DELIVERY_JOB_REQUIRED',
      'MANUAL_DELIVERY_JOB_REQUIRED',
      'ORDER_STATUS_TRANSITION_INVALID',
      'ORDER_METHOD_DELIVERY_REQUIRED',
      'DELIVERY_ASSIGNMENT_REQUIRED',
      'DELIVERY_JOB_ASSIGNMENT_LOCKED',
      'DELIVERY_RUN_LOCATION_MISMATCH'
    ];
    const messages = perOrderCodes.map((code) => getDeliveryRunDispatchReasonMessage(code));
    messages.forEach((message) => expect(typeof message).toBe('string'));
    messages.forEach((message) => expect(message.length).toBeGreaterThan(0));
    expect(new Set(messages).size).toBe(perOrderCodes.length);
  });

  it('resolves every whole-run 409 precondition reason code to a distinct, non-empty message', () => {
    const runLevelCodes = [
      'DELIVERY_RUN_NOT_FOUND',
      'DELIVERY_RUN_LOCKED',
      'DELIVERY_RUN_ACCOUNTABLE_REQUIRED',
      'DELIVERY_RUN_EMPTY',
      'DELIVERY_RUN_UNPACKED_MEMBERS'
    ];
    runLevelCodes.forEach((code) => {
      expect(DELIVERY_RUN_DISPATCH_REASON_MESSAGES[code]).toBeTruthy();
    });
  });

  it('falls back to the default message for an unknown reason code', () => {
    expect(getDeliveryRunDispatchReasonMessage('SOMETHING_UNMAPPED')).toBe('This order could not be dispatched.');
  });

  it('accepts a custom fallback', () => {
    expect(getDeliveryRunDispatchReasonMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });
});
