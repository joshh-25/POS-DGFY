import { normalizeTerminalRegistry } from './terminalIdentity.js';

export const POS_TERMINAL_SETUP_FLOW_QUERY_KEY = 'setup_flow';
export const POS_TERMINAL_SETUP_STEP_QUERY_KEY = 'setup_step';
export const POS_TERMINAL_SETUP_FLOW_VALUE = 'tenant_onboarding';

export const POS_TERMINAL_SETUP_STEPS = Object.freeze({
  ONBOARDING: 'onboarding',
  POS_SETUP: 'pos_setup',
  STOREFRONT_SETUP: 'storefront_setup',
  COMPLETE: 'complete'
});

export const isTenantSetupFlowRequested = (searchParams) => (
  String(searchParams?.get?.(POS_TERMINAL_SETUP_FLOW_QUERY_KEY) || '')
    .trim()
    .toLowerCase() === POS_TERMINAL_SETUP_FLOW_VALUE
);

export const resolvePosSetupReadiness = (settingsPayload = {}) => {
  const businessName = String(settingsPayload?.pos_business_name?.value || '').trim();
  const businessAddress = String(settingsPayload?.pos_address?.value || '').trim();
  const terminalRegistry = normalizeTerminalRegistry(settingsPayload?.pos_terminal_registry?.value || []);
  const hasReadyTerminal = terminalRegistry.some((entry) => (
    entry?.is_active !== false
    && Number(entry?.location_id || 0) > 0
    && entry?.has_password === true
  ));

  return {
    ready: Boolean(businessName && businessAddress && hasReadyTerminal),
    businessNameReady: Boolean(businessName),
    businessAddressReady: Boolean(businessAddress),
    terminalRegistryReady: hasReadyTerminal
  };
};

export const resolveStorefrontSetupReadiness = (settingsPayload = {}) => {
  const storefrontPhone = String(settingsPayload?.storefront_phone?.value || '').trim();
  const storefrontEmail = String(settingsPayload?.storefront_email?.value || '').trim();

  return {
    ready: Boolean(storefrontPhone || storefrontEmail),
    contactReady: Boolean(storefrontPhone || storefrontEmail)
  };
};

export const resolveTenantSetupStep = ({
  requested = false,
  locked = false,
  isMasterAdmin = false,
  onboardingState = 'not_started',
  posSetupReady = false,
  storefrontSetupReady = false
} = {}) => {
  if (!requested || locked || isMasterAdmin !== true) {
    return POS_TERMINAL_SETUP_STEPS.COMPLETE;
  }

  const normalizedOnboardingState = String(onboardingState || 'not_started').trim().toLowerCase();
  if (normalizedOnboardingState !== 'completed') {
    return POS_TERMINAL_SETUP_STEPS.ONBOARDING;
  }
  if (!posSetupReady) {
    return POS_TERMINAL_SETUP_STEPS.POS_SETUP;
  }
  if (!storefrontSetupReady) {
    return POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP;
  }
  return POS_TERMINAL_SETUP_STEPS.COMPLETE;
};
