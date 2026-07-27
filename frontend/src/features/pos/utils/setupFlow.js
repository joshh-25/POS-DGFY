import { normalizeTerminalRegistry } from './terminalIdentity.js';

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

export const POS_TERMINAL_SETUP_VIEW_MODES = Object.freeze({
  [POS_TERMINAL_SETUP_STEPS.PROFILE]: 'settings_profile',
  [POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP]: 'settings_storefront',
  [POS_TERMINAL_SETUP_STEPS.STARTER_ITEM]: 'items',
  [POS_TERMINAL_SETUP_STEPS.POS_SETUP]: 'settings_pos'
});

export const buildTenantSetupSearch = (
  existingSearch = '',
  step = POS_TERMINAL_SETUP_STEPS.PROFILE
) => {
  const params = new URLSearchParams(existingSearch || '');
  const normalizedStep = resolveTenantSetupStepValue(step);
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
    profileImageUrl: storefrontProfileImageUrl
  };
};

export const resolveStarterItemSetupReadiness = (itemsPayload = null) => {
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

  return {
    ready: Boolean(readyItem),
    starterItemReady: Boolean(readyItem),
    starterItemId: Number(readyItem?.item_id || readyItem?.id || 0) || null
  };
};

export const resolveTenantSetupViewMode = (step = '') => (
  POS_TERMINAL_SETUP_VIEW_MODES[String(step || '').trim().toLowerCase()]
  || POS_TERMINAL_SETUP_VIEW_MODES[POS_TERMINAL_SETUP_STEPS.PROFILE]
);

export const resolveTenantSetupStepValue = (step = '') => {
  const normalizedStep = String(step || '').trim().toLowerCase();
  return (
    POS_TERMINAL_SETUP_ORDER.includes(normalizedStep)
    || normalizedStep === POS_TERMINAL_SETUP_STEPS.COMPLETE
  )
    ? normalizedStep
    : POS_TERMINAL_SETUP_STEPS.PROFILE;
};

export const getPreviousTenantSetupStep = (step = '') => {
  const normalizedStep = String(step || '').trim().toLowerCase();
  const index = POS_TERMINAL_SETUP_ORDER.indexOf(normalizedStep);
  if (index <= 0) return '';
  return POS_TERMINAL_SETUP_ORDER[index - 1];
};

export const getNextTenantSetupStep = (step = '') => {
  const normalizedStep = String(step || '').trim().toLowerCase();
  const index = POS_TERMINAL_SETUP_ORDER.indexOf(normalizedStep);
  if (index < 0 || index >= POS_TERMINAL_SETUP_ORDER.length - 1) return '';
  return POS_TERMINAL_SETUP_ORDER[index + 1];
};

export const resolveTenantSetupStep = ({
  requested = false,
  locked = false,
  isMasterAdmin = false,
  requestedStep = '',
  profileReady = false,
  posSetupReady = false,
  storefrontSetupReady = false,
  starterItemReady = false
} = {}) => {
  if (!requested || locked || isMasterAdmin !== true) {
    return POS_TERMINAL_SETUP_STEPS.COMPLETE;
  }

  if (!profileReady) {
    return POS_TERMINAL_SETUP_STEPS.PROFILE;
  }
  const normalizedRequestedStep = String(requestedStep || '').trim().toLowerCase();
  if (normalizedRequestedStep === POS_TERMINAL_SETUP_STEPS.COMPLETE) {
    return (profileReady && storefrontSetupReady && starterItemReady && posSetupReady)
      ? POS_TERMINAL_SETUP_STEPS.COMPLETE
      : (
        !storefrontSetupReady
          ? POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP
          : (!starterItemReady
            ? POS_TERMINAL_SETUP_STEPS.STARTER_ITEM
            : (!posSetupReady ? POS_TERMINAL_SETUP_STEPS.POS_SETUP : POS_TERMINAL_SETUP_STEPS.COMPLETE))
      );
  }
  if (normalizedRequestedStep === POS_TERMINAL_SETUP_STEPS.PROFILE) {
    return POS_TERMINAL_SETUP_STEPS.PROFILE;
  }
  if (normalizedRequestedStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP) {
    return POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP;
  }
  if (!storefrontSetupReady) {
    return POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP;
  }
  if (normalizedRequestedStep === POS_TERMINAL_SETUP_STEPS.STARTER_ITEM) {
    return POS_TERMINAL_SETUP_STEPS.STARTER_ITEM;
  }
  if (!starterItemReady) {
    return POS_TERMINAL_SETUP_STEPS.STARTER_ITEM;
  }
  if (normalizedRequestedStep === POS_TERMINAL_SETUP_STEPS.POS_SETUP) {
    return POS_TERMINAL_SETUP_STEPS.POS_SETUP;
  }
  if (!posSetupReady) {
    return POS_TERMINAL_SETUP_STEPS.POS_SETUP;
  }
  return POS_TERMINAL_SETUP_STEPS.COMPLETE;
};
