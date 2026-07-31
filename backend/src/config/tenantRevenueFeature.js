const truthy = new Set(['1', 'true', 'yes', 'on']);

const readBoolean = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return truthy.has(String(value).trim().toLowerCase());
};

const readInteger = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

export const tenantRevenueSharingEnabled = readBoolean('TENANT_REVENUE_SHARING_ENABLED', false);
export const tenantRevenueAutomaticPayoutEnabled = readBoolean('TENANT_AUTOMATIC_PAYOUT_ENABLED', false);
export const tenantRevenueExternalPayoutApproved = readBoolean('TENANT_EXTERNAL_PAYOUT_APPROVED', false);
export const tenantRevenueDefaultRateBps = readInteger('TENANT_REVENUE_DEFAULT_RATE_BPS', 100, {
  min: 0,
  max: 10000
});
export const tenantRevenueDefaultSettlementCycleDays = readInteger(
  'TENANT_REVENUE_DEFAULT_SETTLEMENT_CYCLE_DAYS',
  15,
  { min: 15, max: 30 }
) === 30 ? 30 : 15;
export const canUseAutomaticTenantPayouts = (
  tenantRevenueSharingEnabled
  && tenantRevenueAutomaticPayoutEnabled
  && tenantRevenueExternalPayoutApproved
);
