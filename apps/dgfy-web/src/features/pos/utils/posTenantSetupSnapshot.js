import {
  resolveProfileSetupReadiness,
  resolvePosSetupReadiness,
  resolveStarterItemSetupReadiness,
  resolveStorefrontSetupReadiness
} from './setupFlow.js';

export const buildTenantSetupStateSnapshot = ({
  settingsPayload = {},
  companyPayload = {},
  usersPayload = [],
  locationsPayload = [],
  itemsPayload = []
} = {}) => {
  const profileRequirements = resolveProfileSetupReadiness(companyPayload, settingsPayload);
  const posRequirements = resolvePosSetupReadiness(settingsPayload, usersPayload);
  const storefrontRequirements = resolveStorefrontSetupReadiness(settingsPayload, locationsPayload);
  const starterItemRequirements = resolveStarterItemSetupReadiness(itemsPayload);
  const onboardingState = String(
    settingsPayload?.tenant_onboarding_state?.value || 'not_started'
  ).trim().toLowerCase();

  return {
    loading: false,
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
