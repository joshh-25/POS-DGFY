export const SETTINGS_TABS = Object.freeze([
  'profile',
  'company',
  'storefront',
  'subscription',
  'pos',
  'compliance',
  'system'
]);

export const SETTINGS_DEFAULT_TAB = 'profile';

export const SETTINGS_HASH_ALIASES = Object.freeze({
  '#section-activation': '#section-final-review'
});

export const SETTINGS_HASH_TO_TAB = Object.freeze({
  '#tab-profile': 'profile',
  '#tab-company': 'company',
  '#tab-storefront': 'storefront',
  '#tab-subscription': 'subscription',
  '#tab-pos': 'pos',
  '#tab-compliance': 'compliance',
  '#tab-system': 'system',
  '#business-mode-settings': 'company',
  '#storefront-operations-settings': 'storefront',
  '#storefront-access-settings': 'storefront',
  '#storefront-locations-settings': 'storefront',
  '#storefront-branding-settings': 'storefront',
  '#storefront-content-settings': 'storefront',
  '#receipt-contract-settings': 'pos',
  '#section-profile': 'compliance',
  '#section-artifacts': 'compliance',
  '#section-peripherals': 'compliance',
  '#section-final-review': 'compliance'
});

const TAB_SET = new Set(SETTINGS_TABS);

export const normalizeSettingsHash = (hash) => {
  const normalized = String(hash || '').trim();
  if (!normalized.startsWith('#')) return '';
  return SETTINGS_HASH_ALIASES[normalized] || normalized;
};

export const resolveSettingsHashTab = (hash) => {
  const normalizedHash = normalizeSettingsHash(hash);
  if (!normalizedHash) return null;
  if (SETTINGS_HASH_TO_TAB[normalizedHash]) return SETTINGS_HASH_TO_TAB[normalizedHash];
  if (normalizedHash.startsWith('#final-review-doc-')) return 'compliance';
  return null;
};

export const resolveSettingsTab = (requestedTab, { subscriptionEnabled = true } = {}) => {
  const normalized = String(requestedTab || '').trim();
  if (!TAB_SET.has(normalized)) return SETTINGS_DEFAULT_TAB;
  if (!subscriptionEnabled && normalized === 'subscription') return SETTINGS_DEFAULT_TAB;
  return normalized;
};

export const resolveSettingsDeepLink = ({
  search = '',
  hash = '',
  subscriptionEnabled = true
} = {}) => {
  const params = new URLSearchParams(search || '');
  const requestedTab = params.get('tab');
  const normalizedHash = normalizeSettingsHash(hash);
  const hashTargetTab = resolveSettingsHashTab(normalizedHash);
  const requestedResolvedTab = resolveSettingsTab(requestedTab, { subscriptionEnabled });

  let resolvedTab = requestedResolvedTab;
  let hashStatus = 'none';

  if (normalizedHash) {
    if (hashTargetTab) {
      hashStatus = 'known';
      resolvedTab = resolveSettingsTab(hashTargetTab, { subscriptionEnabled });
    } else {
      hashStatus = 'unknown';
    }
  }

  return {
    requestedTab,
    tab: resolvedTab,
    normalizedHash,
    hashStatus
  };
};

export const withSettingsTabInSearch = (search = '', tab = SETTINGS_DEFAULT_TAB) => {
  const params = new URLSearchParams(search || '');
  params.set('tab', tab);
  return params;
};
