// #1246: shared pure helper for the #1218 fulfillment-lead-time client-side validation rule --
// mirrors apps/dgfy-api/src/modules/tenantLocations/usecases/tenantLocationUseCases.js's
// assertFulfillmentLeadTimeValid. The server 422s either way -- this exists so the merchant/cashier
// is told before the round trip, not instead of it. Extracted here so IMS's Settings.jsx and POS's
// TerminalOperationsWorkspace.jsx (both of which hand-roll their own copy of the tenant-location
// form) share one copy of this one non-trivial rule rather than drifting apart on it.
export const evaluateFulfillmentLeadTime = ({
  immediate_fulfillment_enabled,
  fulfillment_lead_time_min_days,
  fulfillment_lead_time_max_days
} = {}) => {
  const minRaw = fulfillment_lead_time_min_days;
  const maxRaw = fulfillment_lead_time_max_days;
  const requiredMissing = immediate_fulfillment_enabled === false
    && (minRaw === '' || minRaw === null || minRaw === undefined
      || maxRaw === '' || maxRaw === null || maxRaw === undefined);
  const rangeInverted = minRaw !== '' && minRaw !== null && minRaw !== undefined
    && maxRaw !== '' && maxRaw !== null && maxRaw !== undefined
    && Number(maxRaw) < Number(minRaw);
  return { requiredMissing, rangeInverted };
};

export default { evaluateFulfillmentLeadTime };
