import { describe, expect, it } from 'vitest';
import { evaluateFulfillmentLeadTime } from '../fulfillmentLeadTime.js';

describe('evaluateFulfillmentLeadTime', () => {
  it('does not require lead time when immediate fulfillment is enabled', () => {
    const result = evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: true,
      fulfillment_lead_time_min_days: '',
      fulfillment_lead_time_max_days: ''
    });
    expect(result).toEqual({ requiredMissing: false, rangeInverted: false });
  });

  it('flags missing min/max as required when immediate fulfillment is disabled', () => {
    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: false,
      fulfillment_lead_time_min_days: '',
      fulfillment_lead_time_max_days: ''
    })).toEqual({ requiredMissing: true, rangeInverted: false });

    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: false,
      fulfillment_lead_time_min_days: '2',
      fulfillment_lead_time_max_days: ''
    })).toEqual({ requiredMissing: true, rangeInverted: false });

    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: false,
      fulfillment_lead_time_min_days: null,
      fulfillment_lead_time_max_days: 5
    })).toEqual({ requiredMissing: true, rangeInverted: false });
  });

  it('does not flag missing when both days are present, even if immediate fulfillment is off', () => {
    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: false,
      fulfillment_lead_time_min_days: '2',
      fulfillment_lead_time_max_days: '5'
    })).toEqual({ requiredMissing: false, rangeInverted: false });
  });

  it('flags an inverted range regardless of immediate_fulfillment_enabled', () => {
    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: false,
      fulfillment_lead_time_min_days: '5',
      fulfillment_lead_time_max_days: '2'
    })).toEqual({ requiredMissing: false, rangeInverted: true });

    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: true,
      fulfillment_lead_time_min_days: '5',
      fulfillment_lead_time_max_days: '2'
    })).toEqual({ requiredMissing: false, rangeInverted: true });
  });

  it('does not flag a range as inverted when either side is empty', () => {
    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: true,
      fulfillment_lead_time_min_days: '5',
      fulfillment_lead_time_max_days: ''
    })).toEqual({ requiredMissing: false, rangeInverted: false });
  });

  it('treats an equal min/max range as valid, not inverted', () => {
    expect(evaluateFulfillmentLeadTime({
      immediate_fulfillment_enabled: false,
      fulfillment_lead_time_min_days: '3',
      fulfillment_lead_time_max_days: '3'
    })).toEqual({ requiredMissing: false, rangeInverted: false });
  });

  it('defaults safely when called with no argument', () => {
    expect(evaluateFulfillmentLeadTime()).toEqual({ requiredMissing: false, rangeInverted: false });
  });
});
