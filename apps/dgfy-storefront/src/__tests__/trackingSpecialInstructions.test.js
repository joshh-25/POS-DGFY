import { describe, expect, it } from 'vitest';

import { toFnbTrackingViewState } from '../modes/fnb/tracking/model/fnbTrackingPayload.js';
import { toRetailTrackingViewState } from '../modes/retail/tracking/model/retailTrackingPayload.js';
import { toSimpleTrackingViewState } from '../modes/simple/tracking/model/simpleTrackingPayload.js';

const payload = {
  data: {
    order: {
      special_instructions: 'Please call before delivery.'
    }
  }
};

describe('tracking special-instructions mapping', () => {
  it.each([
    ['F&B', toFnbTrackingViewState],
    ['Retail', toRetailTrackingViewState],
    ['Simple/MSME', toSimpleTrackingViewState],
  ])('preserves the persisted value for %s', (_mode, toViewState) => {
    expect(toViewState({ raw: payload }).specialInstructions).toBe('Please call before delivery.');
  });
});
