export const subscriptionsEnabled = (env = import.meta.env || {}) => env?.VITE_SUBSCRIPTIONS_ENABLED === 'true';

const normalizePlan = (plan) => {
  const normalized = String(plan || 'standard').toLowerCase();
  return normalized === 'premium' ? 'premium' : 'standard';
};

const getPayPalPlanId = (plan, env) => {
  if (plan === 'premium') {
    return env?.VITE_PAYPAL_PREMIUM_PLAN_ID || env?.VITE_PAYPAL_PLAN_ID || '';
  }
  return env?.VITE_PAYPAL_STANDARD_PLAN_ID || '';
};

export const resolveReactivatePayPalConfig = ({ plan, env } = {}) => {
  if (!subscriptionsEnabled(env)) {
    return {
      canRender: false,
      clientId: '',
      planId: '',
      reason: 'Subscription billing is currently disabled.'
    };
  }

  const selectedPlan = normalizePlan(plan);
  const clientId = env?.VITE_PAYPAL_CLIENT_ID || '';
  const planId = getPayPalPlanId(selectedPlan, env || {});

  if (!clientId) {
    return {
      canRender: false,
      clientId: '',
      planId,
      reason: 'PayPal is temporarily unavailable: missing VITE_PAYPAL_CLIENT_ID.'
    };
  }

  if (!planId) {
    return {
      canRender: false,
      clientId,
      planId: '',
      reason: `PayPal is temporarily unavailable: ${selectedPlan} plan is not configured.`
    };
  }

  return {
    canRender: true,
    clientId,
    planId,
    reason: ''
  };
};

export const shouldShowMigrateToPayMongoSection = ({ company, isMasterAdmin }) => {
  if (!subscriptionsEnabled()) return false;
  const paymentMethod = String(company?.payment_method || 'manual').toLowerCase();
  return Boolean(isMasterAdmin && paymentMethod === 'manual');
};

// Backward-compatible alias while remaining pages/tests are still being migrated.
export const shouldShowMigrateToPayPalSection = (args) => shouldShowMigrateToPayMongoSection(args);
