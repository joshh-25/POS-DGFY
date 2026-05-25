const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const selectDiscoveryPinLocations = ({
  activeLocations = [],
  hasSearchQuery = false,
  pinScope = 'tenant_primary',
  matchingLocationIds = [],
  nearestMatchingLocationId = null
} = {}) => {
  if (!Array.isArray(activeLocations) || activeLocations.length === 0) return [];

  const normalizedPinScope = String(pinScope || '').trim().toLowerCase();
  const resolvedNearestMatchingId = toPositiveInt(nearestMatchingLocationId);

  if (normalizedPinScope === 'tenant_primary') {
    const primary = activeLocations.find((location) => location?.is_primary_storefront === true) || activeLocations[0];
    return primary ? [primary] : activeLocations.slice(0, 1);
  }

  if (normalizedPinScope === 'nearest_matching_branch') {
    if (hasSearchQuery && resolvedNearestMatchingId != null) {
      const nearest = activeLocations.find((location) => Number(location?.location_id) === resolvedNearestMatchingId);
      if (nearest) return [nearest];
    }
    const primary = activeLocations.find((location) => location?.is_primary_storefront === true) || activeLocations[0];
    if (!hasSearchQuery) return primary ? [primary] : activeLocations.slice(0, 1);
    return activeLocations.slice(0, 1);
  }

  if (normalizedPinScope === 'all_matching_branches') {
    const matchingIds = new Set(
      (Array.isArray(matchingLocationIds) ? matchingLocationIds : [])
        .map(toPositiveInt)
        .filter((locationId) => locationId != null)
    );
    if (matchingIds.size > 0) {
      return activeLocations.filter((location) => matchingIds.has(Number(location?.location_id)));
    }
    return activeLocations;
  }

  return activeLocations;
};

export const getDiscoveryMatchBadges = (store = {}, hasSearchQuery = false) => {
  if (!hasSearchQuery) return [];
  const reasons = Array.isArray(store?.match_reasons)
    ? store.match_reasons.map((reason) => String(reason || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const reasonSet = new Set(reasons);
  const badges = [];

  if (reasonSet.has('store') && reasonSet.has('item')) {
    badges.push({ key: 'reason-both', label: 'Store + Item match', tone: 'teal' });
  } else if (reasonSet.has('item')) {
    badges.push({ key: 'reason-item', label: 'Item match', tone: 'blue' });
  } else if (reasonSet.has('store')) {
    badges.push({ key: 'reason-store', label: 'Store match', tone: 'slate' });
  }

  if (reasonSet.has('item')) {
    badges.push({
      key: 'stock-state',
      label: store?.has_in_stock_match === true ? 'In-stock match' : 'Out-of-stock match',
      tone: store?.has_in_stock_match === true ? 'emerald' : 'amber'
    });
  }

  return badges;
};

export const getPreferredDiscoveryLocationId = ({ store = {}, storePins = [] } = {}) => {
  const firstPinLocationId = Array.isArray(storePins)
    ? storePins
      .map((pin) => toPositiveInt(pin?.location_id))
      .find((locationId) => locationId != null)
    : null;
  if (firstPinLocationId != null) return firstPinLocationId;

  const nearestMatchingLocationId = toPositiveInt(store?.nearest_matching_location_id);
  if (nearestMatchingLocationId != null) return nearestMatchingLocationId;

  const nearestLocationId = toPositiveInt(store?.nearest_location_id);
  if (nearestLocationId != null) return nearestLocationId;

  return null;
};

export const getDiscoveryEmptyStateMessage = (query = '') => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return 'No visible storefronts yet. Tenant pages auto-activate once each tenant enables storefront visibility and active location setup.';
  }
  return `No stores matched "${normalizedQuery}". Try a broader product, service, or business name.`;
};
