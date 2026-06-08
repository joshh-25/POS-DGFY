export const commercePaymentsEnabled = process.env.COMMERCE_PAYMENTS_ENABLED === 'true';
export const commerceQrphEnabled = process.env.COMMERCE_QRPH_ENABLED === 'true';
export const commercePaymongoSplitEnabled = process.env.COMMERCE_PAYMONGO_SPLIT_ENABLED === 'true';
export const commercePaymentsDisabledMessage = 'Online commerce payments are not enabled for this storefront.';

export const requireCommerceQrphConfig = () => {
  const missing = [];
  if (!process.env.PAYMONGO_SECRET_KEY && !process.env.PAYMONGO_TEST_SECRET_KEY && !process.env.PAYMONGO_LIVE_SECRET_KEY) {
    missing.push('PAYMONGO_SECRET_KEY');
  }
  if (!process.env.PAYMONGO_DGFY_MERCHANT_ID) {
    missing.push('PAYMONGO_DGFY_MERCHANT_ID');
  }
  if (!process.env.PAYMONGO_WEBHOOK_SECRET && !process.env.PAYMONGO_TEST_WEBHOOK_SECRET && !process.env.PAYMONGO_LIVE_WEBHOOK_SECRET) {
    missing.push('PAYMONGO_WEBHOOK_SECRET');
  }
  return missing;
};
