const compactStrings = (values = []) => values
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const compactLowercaseStrings = (values = []) => compactStrings(values)
  .map((value) => value.toLowerCase());

const findMatchingStore = (company = {}, knownStores = []) => {
  const companyTokens = compactStrings([
    company?.company_token,
    company?.token,
    company?.company?.token,
    company?.company?.company_token,
    company?.storefront_token,
    company?.storefront?.token,
    company?.slug,
    company?.company?.slug,
    company?.storefront?.slug
  ]);
  const companyTenantIds = compactStrings([
    company?.tenant_id,
    company?.tenantId,
    company?.id,
    company?.company?.tenant_id,
    company?.company?.id,
    company?.tenant?.id,
    company?.storefront?.tenant_id
  ]);
  const tokenMatch = knownStores.find((store) => {
    const storeTokens = compactStrings([
      store?.slug,
      store?.storefront_token,
      store?.company_token,
      store?.token
    ]);
    const storeTenantIds = compactStrings([store?.tenant_id, store?.id]);
    return companyTokens.some((token) => storeTokens.includes(token))
      || companyTenantIds.some((tenantId) => storeTenantIds.includes(tenantId));
  });
  if (tokenMatch) return tokenMatch;

  const companyNames = compactLowercaseStrings([
    company?.name,
    company?.company_name,
    company?.company?.name,
    company?.tenant_name,
    company?.storefront_name,
    company?.storefront?.tenant_name,
    company?.storefront?.name
  ]);
  const nameMatches = knownStores.filter((store) => {
    const storeNames = compactLowercaseStrings([
      store?.tenant_name,
      store?.name,
      store?.storefront_name
    ]);
    return companyNames.some((name) => storeNames.includes(name));
  });
  return nameMatches.length === 1 ? nameMatches[0] : null;
};

export const mapCustomerBusinessCompanies = (companies = [], knownStores = []) => (
  (Array.isArray(companies) ? companies : []).map((company) => {
    const matchedStore = findMatchingStore(company, Array.isArray(knownStores) ? knownStores : []);
    return {
      ...company,
      storefront_profile_image_url:
        matchedStore?.storefront_profile_image_url
        || matchedStore?.storefront_profile_image
        || matchedStore?.profile_image_url
        || matchedStore?.profile_url
        || matchedStore?.profile_image
        || matchedStore?.logo_url
        || matchedStore?.storefront_logo_url
        || company.storefront_profile_image_url
        || company.storefront_profile_image
        || company.profile_image_url
        || company.profile_url
        || company.logo_url
        || null,
      storefront_cover_image_url:
        matchedStore?.storefront_cover_image_url
        || matchedStore?.storefront_cover_image
        || matchedStore?.cover_image_url
        || matchedStore?.cover_photo
        || matchedStore?.cover_photo_url
        || matchedStore?.cover_url
        || matchedStore?.storefront_profile_image_url
        || matchedStore?.profile_image_url
        || company.storefront_cover_image_url
        || company.storefront_cover_image
        || company.cover_image_url
        || company.cover_photo
        || company.cover_photo_url
        || company.cover_url
        || null
    };
  })
);

const getBusinessImageSources = (company = {}) => ([
  company,
  company?.company,
  company?.business,
  company?.storefront,
  company?.storefront?.assets,
  company?.storefront_profile,
  company?.storefront_cover,
  company?.storefront_assets,
  company?.assets,
  company?.images,
  company?.tenant,
  company?.tenant_profile,
  company?.tenantProfile,
  company?.tenant?.assets,
  company?.membership?.company,
  company?.membership?.storefront,
  company?.membership?.tenant
].filter(Boolean));

const resolveBusinessImageFieldValue = (value) => {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return [value.url, value.src, value.path, value.asset_url, value.image_url, value.profile_image_url, value.cover_image_url]
    .map((candidate) => String(candidate || '').trim()).find(Boolean) || '';
};

const resolveBusinessImageUrl = (company, resolveAssetUrl, candidates) => {
  const raw = getBusinessImageSources(company)
    .flatMap((source) => candidates.map((key) => resolveBusinessImageFieldValue(source?.[key])))
    .find(Boolean);
  if (!raw) return '';
  return typeof resolveAssetUrl === 'function' ? String(resolveAssetUrl(raw) || '').trim() : raw;
};

export const getCustomerBusinessCoverUrl = (company = {}, resolveAssetUrl = null) => resolveBusinessImageUrl(company, resolveAssetUrl, [
  'storefront_cover_image_url', 'storefront_cover_image', 'storefront_cover', 'banner_url',
  'banner_image_url', 'cover_photo', 'cover_image_url', 'cover_photo_url', 'cover_url', 'image_url'
]);

export const getCustomerBusinessProfileUrl = (company = {}, resolveAssetUrl = null) => resolveBusinessImageUrl(company, resolveAssetUrl, [
  'storefront_profile_image_url', 'storefront_profile_image', 'storefront_logo', 'logo',
  'profile_image_url', 'profile_url', 'profile_image', 'profile_photo', 'profile_photo_url',
  'logo_url', 'storefront_logo_url', 'image_url'
]);

export const getCustomerBusinessCategoryLabel = (company = {}) => String(
  company?.category_label || company?.business_category || company?.category || company?.workflow_mode || ''
).trim();

export const getCustomerBusinessRoleLabel = (
  company = {},
  prettyStatus = (value) => String(value || '')
) => {
  const role = String(company?.role || company?.membership_role || '').trim().toLowerCase();
  const isOwner = company?.is_owner === true
    || company?.membership_type === 'owner'
    || role === 'owner'
    || role === 'business_owner';

  if (isOwner) return 'Business Owner';
  if (role === 'cashier') return 'Cashier';
  return role ? prettyStatus(role) : 'Business Member';
};

export const getCustomerBusinessStatusLabel = (company = {}, prettyStatus = (value) => String(value || '')) => {
  const membershipStatus = String(company?.membership_status || company?.status || '').trim();
  const tenantStatus = String(company?.tenant_status || '').trim();
  if (membershipStatus && tenantStatus && tenantStatus.toLowerCase() !== membershipStatus.toLowerCase()) {
    return `${prettyStatus(membershipStatus)} - ${prettyStatus(tenantStatus)}`;
  }
  return prettyStatus(membershipStatus || tenantStatus || 'active');
};
