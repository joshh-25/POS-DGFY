/**
 * discoverySlice — discovery list/filter wiring state only.
 *
 * This slice never owns map runtime (viewport, markers, or clustering). Those remain in the
 * existing discovery map modules. The hook keeps refs for request coordination and exposes the
 * same setters while the values move to Zustand.
 */

export const discoveryInitialState = {
  discovery: {
    resultMode: 'union',
    stockFilter: 'include_out_of_stock',
    pinScope: 'tenant_primary',
    includeMatchMeta: true,
    appliedFilters: null,
    isSearchFocused: false,
    hasExplorationStarted: false,
    isNoMatchToastActive: false,
    resultsPage: 1,
    sortBy: 'nearest',
    categoryFilter: 'all',
    distanceFilter: 'all',
    openFilter: 'all',
    ratingFilter: 'all',
    availabilityFilter: 'all',
    activeFilterDropdown: null,
    renderResetButton: false,
    showResetButton: false,
    coords: null,
    locationMap: {},
    loadingLocations: false,
    highlightedMarkerKey: '',
    highlightedStoreSlug: '',
    selectedMapPin: null,
    isStoreListVisible: false,
    isMobileResultsCollapsed: false,
    viewMode: 'list',
    openFaqIndex: 0,
    isNavMenuOpen: false,
    activeNavItem: 'Explore',
    stores: [],
    loadingStores: true,
    storesError: ''
  }
};

const updateDiscoveryField = (set, key, next) => set((s) => ({
  discovery: {
    ...s.discovery,
    [key]: typeof next === 'function' ? next(s.discovery[key]) : next
  }
}));

const discoveryFields = {
  resultMode: 'ResultMode',
  stockFilter: 'StockFilter',
  pinScope: 'PinScope',
  includeMatchMeta: 'IncludeMatchMeta',
  appliedFilters: 'AppliedFilters',
  isSearchFocused: 'IsSearchFocused',
  hasExplorationStarted: 'HasExplorationStarted',
  isNoMatchToastActive: 'IsNoMatchToastActive',
  resultsPage: 'ResultsPage',
  sortBy: 'SortBy',
  categoryFilter: 'CategoryFilter',
  distanceFilter: 'DistanceFilter',
  openFilter: 'OpenFilter',
  ratingFilter: 'RatingFilter',
  availabilityFilter: 'AvailabilityFilter',
  activeFilterDropdown: 'ActiveFilterDropdown',
  renderResetButton: 'RenderResetButton',
  showResetButton: 'ShowResetButton',
  coords: 'Coords',
  locationMap: 'LocationMap',
  loadingLocations: 'LoadingLocations',
  highlightedMarkerKey: 'HighlightedMarkerKey',
  highlightedStoreSlug: 'HighlightedStoreSlug',
  selectedMapPin: 'SelectedMapPin',
  isStoreListVisible: 'IsStoreListVisible',
  isMobileResultsCollapsed: 'IsMobileResultsCollapsed',
  viewMode: 'ViewMode',
  openFaqIndex: 'OpenFaqIndex',
  isNavMenuOpen: 'IsNavMenuOpen',
  activeNavItem: 'ActiveNavItem',
  stores: 'Stores',
  loadingStores: 'LoadingStores',
  storesError: 'StoresError'
};

export const createDiscoverySlice = (set) => ({
  ...discoveryInitialState,

  ...Object.fromEntries(
    Object.entries(discoveryFields).map(([field, suffix]) => [
      `discoverySet${suffix}`,
      (next) => updateDiscoveryField(set, field, next)
    ])
  )
});
