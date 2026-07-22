import { withAssetOrigin } from '../../../app/runtime/storefrontRuntime.js';
import { sanitizeExternalLink } from '../../../shared/utils/externalLinks.js';

export { sanitizeExternalLink };

const parseOptionalArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseOptionalObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const normalizeStorefrontCategories = (value) => parseOptionalArray(value)
  .map((entry) => String(entry || '').trim())
  .filter(Boolean)
  .slice(0, 12);

export const normalizeDiscoveryCategoryKey = (value) => String(value || '').trim().toLowerCase();

export const resolveDiscoveryCategoryFilterValue = (label) => {
  const normalized = normalizeDiscoveryCategoryKey(label);
  if (!normalized || normalized === 'all categories') return 'all';
  if (normalized === 'beauty' || normalized === 'spa') return 'salon';
  return normalized;
};

export const normalizeStorefrontGallery = (value) => parseOptionalArray(value)
  .map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const url = String(entry.url || '').trim();
    const path = String(entry.path || '').trim();
    if (!url && !path) return null;
    return {
      url: withAssetOrigin(url) || '',
      path: withAssetOrigin(path) || '',
      caption: String(entry.caption || '').trim(),
      alt: String(entry.alt || '').trim(),
      sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
    };
  })
  .filter(Boolean)
  .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
  .slice(0, 24);

export const normalizeStorefrontDeliveryPartners = (value) => parseOptionalArray(value)
  .map((entry) => {
    if (typeof entry === 'string') {
      const partner = String(entry || '').trim().toLowerCase();
      if (!partner) return null;
      return { partner, label: partner, url: '' };
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const partner = String(entry.partner || '').trim().toLowerCase();
    if (!partner) return null;
    return {
      partner,
      label: String(entry.label || '').trim() || partner,
      url: sanitizeExternalLink(entry.url)
    };
  })
  .filter(Boolean)
  .slice(0, 8);

export const normalizeStorefrontReviewSummary = (value) => {
  const raw = parseOptionalObject(value);
  if (!raw) return null;
  const score = Number(raw.score);
  const totalCount = Number(raw.total_count);
  const starDistributionRaw = raw.star_distribution && typeof raw.star_distribution === 'object' ? raw.star_distribution : {};
  const starDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: Number.isInteger(Number(starDistributionRaw[star])) ? Number(starDistributionRaw[star]) : 0
  }));
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : null,
    total_count: Number.isInteger(totalCount) && totalCount >= 0 ? totalCount : null,
    star_distribution: starDistribution
  };
};

export const createStorePopupNode = (store = {}) => {
  const container = document.createElement('div');
  container.style.display = 'grid';
  container.style.gap = '4px';

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '8px';

  const profileImageUrl = withAssetOrigin(store?.storefront_profile_image_url);
  if (profileImageUrl) {
    const img = document.createElement('img');
    img.setAttribute('src', profileImageUrl);
    img.setAttribute('alt', '');
    img.style.width = '28px';
    img.style.height = '28px';
    img.style.borderRadius = '999px';
    img.style.objectFit = 'cover';
    img.style.border = '1px solid #d1d5db';
    img.onerror = () => {
      img.remove();
    };
    row.appendChild(img);
  }

  const title = document.createElement('strong');
  title.textContent = String(store?.location_name || store?.tenant_name || 'Store');
  row.appendChild(title);
  container.appendChild(row);

  const address = document.createElement('div');
  address.textContent = String(store?.address_line || '');
  container.appendChild(address);

  return container;
};

export const normalizeProfileLocations = (profile = {}) => (
  (Array.isArray(profile?.active_location_snapshot) ? profile.active_location_snapshot : [])
    .map((location) => ({
      location_id: location.location_id ?? null,
      name: location.name || profile.location_name || 'Main Branch',
      address_line: location.address_line || profile.address_line || '',
      latitude: location.latitude ?? profile.latitude ?? null,
      longitude: location.longitude ?? profile.longitude ?? null,
      is_open: location.is_open !== false,
      is_active: location.is_active !== false,
      is_primary_storefront: location.is_primary_storefront === true,
      supports_delivery: location.supports_delivery !== false,
      supports_pickup: location.supports_pickup !== false,
      supports_dine_in: location.supports_dine_in !== false
    }))
    .filter((location) => location.location_id != null)
);

export const locationsMatchProfileSnapshot = (locations = [], profile = {}) => {
  const profileLocations = normalizeProfileLocations(profile);
  if (!profileLocations.length) return true;
  const profilePrimary = profileLocations.find((location) => location.is_primary_storefront) || profileLocations[0];
  const returnedPrimary = (Array.isArray(locations) ? locations : [])
    .find((location) => Number(location.location_id) === Number(profilePrimary.location_id));
  if (!returnedPrimary) return false;
  return String(returnedPrimary.name || '').trim() === String(profilePrimary.name || '').trim()
    && String(returnedPrimary.address_line || '').trim() === String(profilePrimary.address_line || '').trim();
};
