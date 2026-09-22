import { normalizeTerminalRegistry } from './terminalIdentity.js';
import { normalizeStorefrontBusinessHours } from '@/src/features/settings/storefrontBusinessHours.js';
import {
  DEFAULT_WORKFLOW_MODE,
  isHospitalityWorkflowMode
} from '@/src/features/settings/workflowMode.js';

export const POS_TERMINAL_SETUP_FLOW_QUERY_KEY = 'setup_flow';
export const POS_TERMINAL_SETUP_STEP_QUERY_KEY = 'setup_step';
export const POS_TERMINAL_SETUP_FLOW_VALUE = 'tenant_onboarding';

export const POS_TERMINAL_SETUP_STEPS = Object.freeze({
  PROFILE: 'profile',
  STARTER_ITEM: 'starter_item',
  POS_SETUP: 'pos_setup',
  STOREFRONT_SETUP: 'storefront_setup',
  COMPLETE: 'complete'
});

export const POS_TERMINAL_SETUP_ORDER = Object.freeze([
  POS_TERMINAL_SETUP_STEPS.PROFILE,
  POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP,
  POS_TERMINAL_SETUP_STEPS.STARTER_ITEM,
  POS_TERMINAL_SETUP_STEPS.POS_SETUP
]);

// Catalog items are never required during tenant onboarding. Hospitality keeps
// the shared starter step only for its room-type/room setup, which is not a
// catalog-item requirement.
export const isStarterItemSetupRequired = () => false;

export const isStarterSetupRequired = (workflowMode = DEFAULT_WORKFLOW_MODE) => (
  isHospitalityWorkflowMode(workflowMode)
);

export const getTenantSetupOrder = (workflowMode = DEFAULT_WORKFLOW_MODE) => (
  isStarterSetupRequired(workflowMode)
    ? POS_TERMINAL_SETUP_ORDER
    : POS_TERMINAL_SETUP_ORDER.filter((step) => step !== POS_TERMINAL_SETUP_STEPS.STARTER_ITEM)
);

export const POS_TERMINAL_SETUP_VIEW_MODES = Object.freeze({
  [POS_TERMINAL_SETUP_STEPS.PROFILE]: 'settings_profile',
  [POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP]: 'settings_storefront',
  [POS_TERMINAL_SETUP_STEPS.STARTER_ITEM]: 'items',
  [POS_TERMINAL_SETUP_STEPS.POS_SETUP]: 'settings_pos'
});

export const buildTenantSetupSearch = (
  existingSearch = '',
  step = POS_TERMINAL_SETUP_STEPS.PROFILE,
  workflowMode = DEFAULT_WORKFLOW_MODE
) => {
  const params = new URLSearchParams(existingSearch || '');
  const normalizedStep = resolveTenantSetupStepValue(step, workflowMode);
  params.set(POS_TERMINAL_SETUP_FLOW_QUERY_KEY, POS_TERMINAL_SETUP_FLOW_VALUE);
  params.set(POS_TERMINAL_SETUP_STEP_QUERY_KEY, normalizedStep);
  return params.toString() ? `?${params.toString()}` : '';
};

export const clearTenantSetupSearch = (existingSearch = '') => {
  const params = new URLSearchParams(existingSearch || '');
  params.delete(POS_TERMINAL_SETUP_FLOW_QUERY_KEY);
  params.delete(POS_TERMINAL_SETUP_STEP_QUERY_KEY);
  return params.toString() ? `?${params.toString()}` : '';
};

export const isTenantSetupFlowRequested = (searchParams) => (
  String(searchParams?.get?.(POS_TERMINAL_SETUP_FLOW_QUERY_KEY) || '')
    .trim()
    .toLowerCase() === POS_TERMINAL_SETUP_FLOW_VALUE
);

export const resolveProfileSetupReadiness = (companyPayload = {}, settingsPayload = {}) => {
  const companyName = String(
    companyPayload?.company_name
    || settingsPayload?.pos_business_name?.value
    || settingsPayload?.pos_registered_name?.value
    || ''
  ).trim();

  return {
    ready: Boolean(companyName),
    companyNameReady: Boolean(companyName),
    companyName
  };
};

export const resolvePosSetupReadiness = (settingsPayload = {}, usersPayload = null) => {
  const terminalRegistry = normalizeTerminalRegistry(settingsPayload?.pos_terminal_registry?.value || []);
  const hasReadyTerminal = terminalRegistry.some((entry) => (
    entry?.is_active !== false
    && Number(entry?.location_id || 0) > 0
  ));
  const cashierCheckRequired = Array.isArray(usersPayload);
  const hasActiveCashier = !cashierCheckRequired || usersPayload.some((user) => (
    user?.is_active !== false
    && (
      String(user?.role || '').trim().toLowerCase() === 'cashier'
      || user?.is_master_admin === true
    )
  ));

  return {
    ready: hasReadyTerminal && hasActiveCashier,
    terminalRegistryReady: hasReadyTerminal,
    cashierReady: hasActiveCashier
  };
};

const isValidCoordinate = (value, min, max) => {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
};

export const resolveStorefrontSetupReadiness = (settingsPayload = {}, locationsPayload = null) => {
  const storefrontCoverImageUrl = String(settingsPayload?.storefront_cover_image_url?.value || '').trim();
  const storefrontProfileImageUrl = String(settingsPayload?.storefront_profile_image_url?.value || '').trim();
  const businessHours = normalizeStorefrontBusinessHours(settingsPayload?.storefront_hours?.value);
  const locationCheckRequired = Array.isArray(locationsPayload);
  const primaryLocation = locationCheckRequired
    ? locationsPayload.find((location) => (
      location?.is_active !== false
      && location?.is_primary_storefront === true
      && isValidCoordinate(location?.latitude, -90, 90)
      && isValidCoordinate(location?.longitude, -180, 180)
      && String(location?.address_line || '').trim().length >= 3
    ))
    : null;
  const locationReady = !locationCheckRequired || Boolean(primaryLocation);

  return {
    ready: Boolean(storefrontCoverImageUrl && storefrontProfileImageUrl && locationReady),
    coverImageReady: Boolean(storefrontCoverImageUrl),
    profileImageReady: Boolean(storefrontProfileImageUrl),
    locationReady,
    primaryLocationId: Number(primaryLocation?.location_id || 0) || null,
    coverImageUrl: storefrontCoverImageUrl,
    profileImageUrl: storefrontProfileImageUrl,
    businessHours
  };
};

export const resolveStarterItemSetupReadiness = (
  itemsPayload = null,
  onboardingPayload = null,
  workflowMode = DEFAULT_WORKFLOW_MODE
) => {
  const itemRows = Array.isArray(itemsPayload)
    ? itemsPayload
    : (Array.isArray(itemsPayload?.items) ? itemsPayload.items : []);
  const readyItem = itemRows.find((item) => (
    item?.status !== 'inactive'
    && Number(item?.default_sale_price ?? item?.price ?? 0) > 0
    && (
      item?.pos_visible === true
      || item?.storefront_visible === true
      || String(item?.mode_item_preset || '').trim()
    )
  ));
  const missingRequirements = onboardingPayload?.tenant_onboarding_progress
    ?.checklist_snapshot?.missing_requirements;
  const checklistConfirmsReady = !isStarterSetupRequired(workflowMode)
    || (Array.isArray(missingRequirements) && !missingRequirements.includes('has_priced_starter_item'));
  const resolvedItem = readyItem || (checklistConfirmsReady ? { item_id: null } : null);

  return {
    ready: Boolean(resolvedItem),
    starterItemReady: Boolean(resolvedItem),
    starterItemId: Number(resolvedItem?.item_id || resolvedItem?.id || 0) || null
  };
};

export const resolveTenantSetupViewMode = (step = '') => (
  POS_TERMINAL_SETUP_VIEW_MODES[String(step || '').trim().toLowerCase()]
  || POS_TERMINAL_SETUP_VIEW_MODES[POS_TERMINAL_SETUP_STEPS.PROFILE]
);

export const resolveTenantSetupStepValue = (step = '', workflowMode = DEFAULT_WORKFLOW_MODE) => {
  const normalizedStep = String(step || '').trim().toLowerCase();
  if (normalizedStep === POS_TERMINAL_SETUP_STEPS.STARTER_ITEM && !isStarterSetupRequired(workflowMode)) {
    return POS_TERMINAL_SETUP_STEPS.POS_SETUP;
  }
  return (
    POS_TERMINAL_SETUP_ORDER.includes(normalizedStep)
    || normalizedStep === POS_TERMINAL_SETUP_STEPS.COMPLETE
  )
    ? normalizedStep
    : POS_TERMINAL_SETUP_STEPS.PROFILE;
};

export const getPreviousTenantSetupStep = (step = '', workflowMode = DEFAULT_WORKFLOW_MODE) => {
  const normalizedStep = resolveTenantSetupStepValue(step, workflowMode);
  const setupOrder = getTenantSetupOrder(workflowMode);
  const index = setupOrder.indexOf(normalizedStep);
  if (index <= 0) return '';
  return setupOrder[index - 1];
};

export const getNextTenantSetupStep = (step = '', workflowMode = DEFAULT_WORKFLOW_MODE) => {
  const normalizedStep = resolveTenantSetupStepValue(step, workflowMode);
  const setupOrder = getTenantSetupOrder(workflowMode);
  const index = setupOrder.indexOf(normalizedStep);
  if (index < 0 || index >= setupOrder.length - 1) return '';
  return setupOrder[index + 1];
};

export const resolveTenantSetupStep = ({
  requested = false,
  locked = false,
  isMasterAdmin = false,
  requestedStep = '',
  profileReady = false,
  posSetupReady = false,
  storefrontSetupReady = false,
  starterItemReady = false,
  workflowMode = DEFAULT_WORKFLOW_MODE
} = {}) => {
  if (!requested || locked || isMasterAdmin !== true) {
    return POS_TERMINAL_SETUP_STEPS.COMPLETE;
  }

  if (!profileReady) {
    return POS_TERMINAL_SETUP_STEPS.PROFILE;
  }
  const normalizedRequestedStep = String(requestedStep || '').trim().toLowerCase();
  const starterSetupRequired = isStarterSetupRequired(workflowMode);
  const effectiveRequestedStep = normalizedRequestedStep === POS_TERMINAL_SETUP_STEPS.STARTER_ITEM
    && !starterSetupRequired
    ? POS_TERMINAL_SETUP_STEPS.POS_SETUP
    : normalizedRequestedStep;
  if (normalizedRequestedStep === POS_TERMINAL_SETUP_STEPS.COMPLETE) {
    return (profileReady && storefrontSetupReady && (!starterSetupRequired || starterItemReady) && posSetupReady)
      ? POS_TERMINAL_SETUP_STEPS.COMPLETE
      : (
        !storefrontSetupReady
          ? POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP
          : (starterSetupRequired && !starterItemReady
            ? POS_TERMINAL_SETUP_STEPS.STARTER_ITEM
            : (!posSetupReady ? POS_TERMINAL_SETUP_STEPS.POS_SETUP : POS_TERMINAL_SETUP_STEPS.COMPLETE))
      );
  }
  if (effectiveRequestedStep === POS_TERMINAL_SETUP_STEPS.PROFILE) {
    return POS_TERMINAL_SETUP_STEPS.PROFILE;
  }
  if (effectiveRequestedStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP) {
    return POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP;
  }
  if (!storefrontSetupReady) {
    return POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP;
  }
  if (starterSetupRequired && effectiveRequestedStep === POS_TERMINAL_SETUP_STEPS.STARTER_ITEM) {
    return POS_TERMINAL_SETUP_STEPS.STARTER_ITEM;
  }
  if (starterSetupRequired && !starterItemReady) {
    return POS_TERMINAL_SETUP_STEPS.STARTER_ITEM;
  }
  if (effectiveRequestedStep === POS_TERMINAL_SETUP_STEPS.POS_SETUP) {
    return POS_TERMINAL_SETUP_STEPS.POS_SETUP;
  }
  if (!posSetupReady) {
    return POS_TERMINAL_SETUP_STEPS.POS_SETUP;
  }
  return POS_TERMINAL_SETUP_STEPS.COMPLETE;
};
