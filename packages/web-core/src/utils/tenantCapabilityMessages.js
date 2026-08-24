export const CAPABILITY_BLOCK_TITLE = 'Platform admin changed your permissions';

export const TENANT_CAPABILITY_MESSAGES = Object.freeze({
  tenant_ims_enabled: 'IMS access is disabled for this company. Inventory, purchases, settings, reports, and related workspace tools are unavailable until platform admin enables IMS again.',
  tenant_pos_enabled: 'POS access is disabled for this company. Catalog, checkout, scanning, and POS transactions are unavailable until platform admin enables POS again.',
  store_is_visible: 'Storefront and map visibility are disabled for this company. Customers cannot find this store in public discovery until platform admin enables Storefront / Maps again.'
});

export const STOREFRONT_ACCESS_MODE_MESSAGES = Object.freeze({
  ghost: 'Customers can see your store profile, map location, and contact/social links, but catalog and checkout are hidden.',
  catalog: 'Customers can browse your catalog, but cart, quote, booking, and checkout are disabled.',
  inquiry: 'Customers can browse and contact you, but checkout and booking are disabled.',
  transaction: 'Online ordering is enabled, but this Storefront action is blocked by another readiness requirement.'
});

export const getCapabilityBlockMessage = (capability) => (
  TENANT_CAPABILITY_MESSAGES[String(capability || '').trim()] || ''
);

export const getStorefrontAccessModeMessage = (mode) => (
  STOREFRONT_ACCESS_MODE_MESSAGES[String(mode || '').trim().toLowerCase()] || ''
);

const settingValue = (settings, key) => {
  const entry = settings?.[key];
  if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return entry.value;
  }
  return entry;
};

const settingExists = (settings, key) => Object.prototype.hasOwnProperty.call(settings || {}, key);

const parseBooleanSetting = (value) => {
  if (value === true || value === false) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return null;
};

export const buildTenantCapabilityNoticeFromSettings = (settings = {}) => {
  const imsEnabled = parseBooleanSetting(settingValue(settings, 'tenant_ims_enabled'));
  if (imsEnabled === false) {
    return {
      title: CAPABILITY_BLOCK_TITLE,
      message: TENANT_CAPABILITY_MESSAGES.tenant_ims_enabled,
      capability: 'tenant_ims_enabled',
      source: 'settings'
    };
  }

  const posEnabled = parseBooleanSetting(settingValue(settings, 'tenant_pos_enabled'));
  if (posEnabled === false) {
    return {
      title: CAPABILITY_BLOCK_TITLE,
      message: TENANT_CAPABILITY_MESSAGES.tenant_pos_enabled,
      capability: 'tenant_pos_enabled',
      source: 'settings'
    };
  }

  const storeVisible = parseBooleanSetting(settingValue(settings, 'store_is_visible'));
  if (storeVisible === false) {
    return {
      title: CAPABILITY_BLOCK_TITLE,
      message: TENANT_CAPABILITY_MESSAGES.store_is_visible,
      capability: 'store_is_visible',
      source: 'settings'
    };
  }

  const mode = String(settingValue(settings, 'customer_access_mode') || '').trim().toLowerCase();
  if (settingExists(settings, 'customer_access_mode') && mode && mode !== 'transaction') {
    return {
      title: CAPABILITY_BLOCK_TITLE,
      message: getStorefrontAccessModeMessage(mode),
      code: 'CUSTOMER_ACCESS_MODE_BLOCKED',
      requestedMode: mode,
      effectiveMode: mode,
      source: 'settings'
    };
  }

  return null;
};
