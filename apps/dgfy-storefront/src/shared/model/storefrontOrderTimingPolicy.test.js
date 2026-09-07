import { describe, expect, it } from 'vitest';
import {
  LEAD_TIME_UNCONFIGURED_NOTICE,
  buildLeadTimeExpectationMessage,
  resolveCheckoutScheduleLabel,
  formatLeadTimeRangePhrase,
  resolveOrderTimingPolicy,
  resolveTimingStepScheduleMode
} from './storefrontOrderTimingPolicy.js';

describe('storefront order timing policy', () => {
  it('fails open for null, {}, and every flag combination', () => {
    expect(resolveOrderTimingPolicy(null)).toMatchObject({ showSchedule: true, showImmediate: true, showTimingChooser: true, showTimingStep: true });
    expect(resolveOrderTimingPolicy({})).toMatchObject({ showSchedule: true, showImmediate: true, showTimingChooser: true, showTimingStep: true });
    expect(resolveOrderTimingPolicy()).toMatchObject({ showSchedule: true, showImmediate: true, showTimingChooser: true, showTimingStep: true });
    expect(resolveOrderTimingPolicy({ scheduling_enabled: false })).toMatchObject({ showSchedule: false, showImmediate: true, showTimingChooser: false, showTimingStep: true });
    expect(resolveOrderTimingPolicy({ immediate_fulfillment_enabled: false })).toMatchObject({ showSchedule: true, showImmediate: false, showTimingChooser: false, showTimingStep: true });
    expect(resolveOrderTimingPolicy({ scheduling_enabled: false, immediate_fulfillment_enabled: false })).toMatchObject({ showSchedule: false, showImmediate: false, showTimingChooser: false, showTimingStep: false });
  });
  it('formats lead-time copy and chooses only permitted schedule modes', () => {
    expect(formatLeadTimeRangePhrase(3, 3)).toBe('within 3 days');
    expect(formatLeadTimeRangePhrase(1, 1)).toBe('within 1 day');
    expect(formatLeadTimeRangePhrase(7, 14)).toBe('in 7-14 days');
    expect(formatLeadTimeRangePhrase(null, 3)).toBe('');
    const policy = resolveOrderTimingPolicy({ immediate_fulfillment_enabled: false, fulfillment_lead_time_min_days: 3, fulfillment_lead_time_max_days: 3 });
    expect(buildLeadTimeExpectationMessage({ policy, isDeliveryOrder: true })).toBe('Your order will be delivered within 3 days.');
    expect(resolveTimingStepScheduleMode(policy, 'asap')).toBe('schedule');
    expect(buildLeadTimeExpectationMessage({ policy: resolveOrderTimingPolicy({ immediate_fulfillment_enabled: false }), isDeliveryOrder: false })).toBe(LEAD_TIME_UNCONFIGURED_NOTICE);
  });
  it('resolves the permitted schedule mode for all four flag combinations', () => {
    const both = resolveOrderTimingPolicy();
    const scheduleOnly = resolveOrderTimingPolicy({ immediate_fulfillment_enabled: false });
    const immediateOnly = resolveOrderTimingPolicy({ scheduling_enabled: false });
    const neither = resolveOrderTimingPolicy({ scheduling_enabled: false, immediate_fulfillment_enabled: false });
    expect(resolveTimingStepScheduleMode(both, 'asap')).toBe('asap');
    expect(resolveTimingStepScheduleMode(both, 'schedule')).toBe('schedule');
    expect(resolveTimingStepScheduleMode(scheduleOnly, 'asap')).toBe('schedule');
    expect(resolveTimingStepScheduleMode(immediateOnly, 'schedule')).toBe('asap');
    expect(resolveTimingStepScheduleMode(neither, 'schedule')).toBe('asap');
  });

  it('keeps the summary aligned with the selected timing mode before a date is entered', () => {
    expect(resolveCheckoutScheduleLabel('asap', '')).toBe('NOW');
    expect(resolveCheckoutScheduleLabel('asap', '2026-08-01T10:30')).toBe('NOW');
    expect(resolveCheckoutScheduleLabel('schedule', '')).toBe('SCHEDULE');
    expect(resolveCheckoutScheduleLabel('schedule', 'not-a-date')).toBe('SCHEDULE');
    expect(resolveCheckoutScheduleLabel('schedule', '2026-08-01T10:30')).not.toBe('NOW');
  });
});
