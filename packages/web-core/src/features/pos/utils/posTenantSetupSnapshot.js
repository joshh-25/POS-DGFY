import {
  resolveProfileSetupReadiness,
  resolvePosSetupReadiness,
  resolveStarterItemSetupReadiness,
  resolveStorefrontSetupReadiness
} from './setupFlow.js';

const isTenantPosEnabled = (settingsPayload = {}) => {
  const value = settingsPayload?.tenant_pos_enabled?.value ?? settingsPayload?.tenant_pos_enabled;
  if (value === false || value === 0) return false;
  if (typeof value === 'string' && ['false', '0', 'no', 'off'].includes(value.trim().toLowerCase())) return false;
  return true;
};

export const buildTenantSetupStateSnapshot = ({
  settingsPayload = {},
  companyPayload = {},
  usersPayload = [],
  locationsPayload = [],
  itemsPayload = [],
  onboardingPayload = null,
  workflowMode = ''
} = {}) => {
  const profileRequirements = resolveProfileSetupReadiness(companyPayload, settingsPayload);
  const posRequirements = resolvePosSetupReadiness(settingsPayload, usersPayload);
  const storefrontRequirements = resolveStorefrontSetupReadiness(settingsPayload, locationsPayload);
  const starterItemRequirements = resolveStarterItemSetupReadiness(itemsPayload, onboardingPayload, workflowMode);
  const onboardingState = String(
    settingsPayload?.tenant_onboarding_state?.value || 'not_started'
  ).trim().toLowerCase();

  return {
    loading: false,
    tenantPosEnabled: isTenantPosEnabled(settingsPayload),
    onboardingState,
    onboardingCompleted: onboardingState === 'completed',
    profileReady: profileRequirements.ready,
    posSetupReady: posRequirements.ready,
    storefrontSetupReady: storefrontRequirements.ready,
    starterItemReady: starterItemRequirements.ready,
    profileRequirements,
    posRequirements,
    storefrontRequirements,
    starterItemRequirements,
    tenantUsers: Array.isArray(usersPayload) ? usersPayload : []
  };
};
