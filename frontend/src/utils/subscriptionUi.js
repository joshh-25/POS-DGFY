export const shouldShowMigrateToPayPalSection = ({ company, isMasterAdmin }) => (
  Boolean(isMasterAdmin && company?.payment_method !== 'paypal')
);

export const resolveReactivatePayPalConfig = ({ plan, env }) => {
  const clientId = (env?.VITE_PAYPAL_CLIENT_ID || '').trim();
  const planId = plan === 'premium'
    ? (env?.VITE_PAYPAL_PREMIUM_PLAN_ID || env?.VITE_PAYPAL_PLAN_ID || '').trim()
    : (env?.VITE_PAYPAL_STANDARD_PLAN_ID || '').trim();

  if (!clientId) {
    return {
      canRender: false,
      reason: 'PayPal is not configured (missing VITE_PAYPAL_CLIENT_ID).',
      clientId: '',
      planId
    };
  }

  if (!planId) {
    return {
      canRender: false,
      reason: `PayPal ${plan} plan is not configured.`,
      clientId,
      planId: ''
    };
  }

  return {
    canRender: true,
    reason: null,
    clientId,
    planId
  };
};
