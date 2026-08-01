import { tenantRevenueSharingEnabled } from './tenantRevenueFeature.js';

export const commercePaymentsEnabled = process.env.COMMERCE_PAYMENTS_ENABLED === 'true';
export const commerceQrphEnabled = process.env.COMMERCE_QRPH_ENABLED === 'true';
export const commercePaymongoSplitEnabled = process.env.COMMERCE_PAYMONGO_SPLIT_ENABLED === 'true';
export const commercePaymentsDisabledMessage = 'Online commerce payments are not enabled for this storefront.';

export const isCommercePaymongoSplitEnabled = () => process.env.COMMERCE_PAYMONGO_SPLIT_ENABLED === 'true';

export const isPayMongoLiveMode = () => process.env.PAYMONGO_MODE === 'live';

export const getPayMongoMode = () => (isPayMongoLiveMode() ? 'live' : 'test');

export const isPayMongoPlatformSplitConfirmed = () => {
  const globalConfirmation = process.env.PAYMONGO_PLATFORM_SPLIT_CONFIRMED === 'true';
  const liveConfirmation = process.env.PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED === 'true';
  return isPayMongoLiveMode() ? (globalConfirmation || liveConfirmation) : globalConfirmation;
};

export const requireCommerceQrphConfig = () => {
  const missing = [];
  const modeSpecificSecretKey = isPayMongoLiveMode()
    ? process.env.PAYMONGO_LIVE_SECRET_KEY
    : process.env.PAYMONGO_TEST_SECRET_KEY;
  const modeSpecificWebhookSecret = isPayMongoLiveMode()
    ? process.env.PAYMONGO_LIVE_WEBHOOK_SECRET
    : process.env.PAYMONGO_TEST_WEBHOOK_SECRET;
  if (!modeSpecificSecretKey && !process.env.PAYMONGO_SECRET_KEY) {
    missing.push(isPayMongoLiveMode() ? 'PAYMONGO_LIVE_SECRET_KEY' : 'PAYMONGO_TEST_SECRET_KEY');
  }
  if (!tenantRevenueSharingEnabled && !process.env.PAYMONGO_DGFY_MERCHANT_ID) {
    missing.push('PAYMONGO_DGFY_MERCHANT_ID');
  }
  if (!modeSpecificWebhookSecret && !process.env.PAYMONGO_WEBHOOK_SECRET) {
    missing.push(isPayMongoLiveMode() ? 'PAYMONGO_LIVE_WEBHOOK_SECRET' : 'PAYMONGO_TEST_WEBHOOK_SECRET');
  }
  if (isCommercePaymongoSplitEnabled() && isPayMongoLiveMode() && !isPayMongoPlatformSplitConfirmed()) {
    missing.push('PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED');
  }
  return missing;
};
