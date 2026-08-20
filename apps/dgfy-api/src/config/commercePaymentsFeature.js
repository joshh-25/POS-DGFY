import { tenantRevenueSharingEnabled } from './tenantRevenueFeature.js';

export const commercePaymentsEnabled = process.env.COMMERCE_PAYMENTS_ENABLED === 'true';
export const commerceQrphEnabled = process.env.COMMERCE_QRPH_ENABLED === 'true';
export const commercePaymongoSplitEnabled = process.env.COMMERCE_PAYMONGO_SPLIT_ENABLED === 'true';
export const commercePaymentsDisabledMessage = 'Online commerce payments are not enabled for this storefront.';

export const isCommercePaymongoSplitEnabled = () => process.env.COMMERCE_PAYMONGO_SPLIT_ENABLED === 'true';

export const isPayMongoLiveMode = () => process.env.PAYMONGO_MODE === 'live';

// Direct browser-side GCash attachment is opt-in. Live mode additionally
// requires an explicit confirmation so a copied test flag cannot silently
// change the production payment surface.
export const storefrontDirectGcashRequested = process.env.STOREFRONT_DIRECT_GCASH_ENABLED === 'true';
export const storefrontDirectGcashLiveConfirmed = process.env.STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED === 'true';
export const storefrontDirectGcashEnabled = storefrontDirectGcashRequested
  && (!isPayMongoLiveMode() || storefrontDirectGcashLiveConfirmed);
export const storefrontDirectMayaRequested = process.env.STOREFRONT_DIRECT_MAYA_ENABLED === 'true';
export const storefrontDirectMayaLiveConfirmed = process.env.STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED === 'true';
export const storefrontDirectMayaEnabled = storefrontDirectMayaRequested
  && (!isPayMongoLiveMode() || storefrontDirectMayaLiveConfirmed);

export const getPayMongoMode = () => (isPayMongoLiveMode() ? 'live' : 'test');

export const isPayMongoPlatformSplitConfirmed = () => {
  const globalConfirmation = process.env.PAYMONGO_PLATFORM_SPLIT_CONFIRMED === 'true';
  const liveConfirmation = process.env.PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED === 'true';
  return isPayMongoLiveMode() ? (globalConfirmation || liveConfirmation) : globalConfirmation;
};

/**
 * Shared configuration gate for PayMongo commerce flows. Hosted Checkout and
 * direct GCash/Maya use the landlord collection model and therefore do not
 * require a tenant Linked Account or a split recipient. QR Ph retains the
 * legacy split-account requirements through requireCommerceQrphConfig().
 */
export const requireCommercePaymentConfig = ({
  requiresSplitAccount = false,
  requiresDirectGcash = false,
  requiresDirectMaya = false
} = {}) => {
  const missing = [];
  const requiresDirectWallet = requiresDirectGcash || requiresDirectMaya;
  const modeSpecificPublicKey = isPayMongoLiveMode()
    ? process.env.PAYMONGO_LIVE_PUBLIC_KEY
    : process.env.PAYMONGO_TEST_PUBLIC_KEY;
  const modeSpecificSecretKey = isPayMongoLiveMode()
    ? process.env.PAYMONGO_LIVE_SECRET_KEY
    : process.env.PAYMONGO_TEST_SECRET_KEY;
  const modeSpecificWebhookSecret = isPayMongoLiveMode()
    ? process.env.PAYMONGO_LIVE_WEBHOOK_SECRET
    : process.env.PAYMONGO_TEST_WEBHOOK_SECRET;
  if (!modeSpecificSecretKey && !process.env.PAYMONGO_SECRET_KEY) {
    missing.push(isPayMongoLiveMode() ? 'PAYMONGO_LIVE_SECRET_KEY' : 'PAYMONGO_TEST_SECRET_KEY');
  }
  if (requiresDirectWallet && !modeSpecificPublicKey && !process.env.PAYMONGO_PUBLIC_KEY) {
    missing.push(isPayMongoLiveMode() ? 'PAYMONGO_LIVE_PUBLIC_KEY' : 'PAYMONGO_TEST_PUBLIC_KEY');
  }
  if (requiresDirectGcash && isPayMongoLiveMode() && !storefrontDirectGcashLiveConfirmed) {
    missing.push('STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED');
  }
  if (requiresDirectMaya && isPayMongoLiveMode() && !storefrontDirectMayaLiveConfirmed) {
    missing.push('STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED');
  }
  if (requiresSplitAccount && !tenantRevenueSharingEnabled && !process.env.PAYMONGO_DGFY_MERCHANT_ID) {
    missing.push('PAYMONGO_DGFY_MERCHANT_ID');
  }
  if (!modeSpecificWebhookSecret && !process.env.PAYMONGO_WEBHOOK_SECRET) {
    missing.push(isPayMongoLiveMode() ? 'PAYMONGO_LIVE_WEBHOOK_SECRET' : 'PAYMONGO_WEBHOOK_SECRET');
  }
  if (requiresSplitAccount && isCommercePaymongoSplitEnabled() && isPayMongoLiveMode() && !isPayMongoPlatformSplitConfirmed()) {
    missing.push('PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED');
  }
  return missing;
};

export const requireCommerceQrphConfig = () => (
  requireCommercePaymentConfig({ requiresSplitAccount: true })
);
