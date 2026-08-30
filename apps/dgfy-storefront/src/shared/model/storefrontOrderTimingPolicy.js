export const LEAD_TIME_UNCONFIGURED_NOTICE = 'The store will confirm your fulfillment schedule after you place your order.';
const dayCount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};
export function resolveOrderTimingPolicy(location = null) {
  const leadTimeMinDays = dayCount(location?.fulfillment_lead_time_min_days);
  const leadTimeMaxDays = dayCount(location?.fulfillment_lead_time_max_days);
  const showSchedule = location?.scheduling_enabled !== false;
  const showImmediate = location?.immediate_fulfillment_enabled !== false;
  return { showSchedule, showImmediate, showTimingChooser: showSchedule && showImmediate, showTimingStep: showSchedule || showImmediate, leadTimeMinDays, leadTimeMaxDays, hasLeadTime: leadTimeMinDays !== null && leadTimeMaxDays !== null && leadTimeMaxDays >= leadTimeMinDays };
}
export function formatLeadTimeRangePhrase(minDays, maxDays) {
  const min = dayCount(minDays); const max = dayCount(maxDays);
  if (min === null || max === null || max < min) return '';
  return min === max ? `within ${min} ${min === 1 ? 'day' : 'days'}` : `in ${min}-${max} days`;
}
export function buildLeadTimeExpectationMessage({ policy, isDeliveryOrder }) {
  const phrase = formatLeadTimeRangePhrase(policy?.leadTimeMinDays, policy?.leadTimeMaxDays);
  if (!phrase) return LEAD_TIME_UNCONFIGURED_NOTICE;
  return isDeliveryOrder ? `Your order will be delivered ${phrase}.` : `Your order will be ready ${phrase}.`;
}
export function resolveTimingStepScheduleMode(policy, currentScheduleMode) {
  if (!policy?.showImmediate && policy?.showSchedule) return 'schedule';
  if (!policy?.showSchedule) return 'asap';
  return currentScheduleMode;
}
