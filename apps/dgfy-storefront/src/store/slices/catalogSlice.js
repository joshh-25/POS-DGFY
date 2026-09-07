/**
 * catalogSlice — shared storefront profile/catalog read state and catalog search.
 *
 * The network lifecycle remains in useStoreCatalogLoader for this in-place bridge. This slice
 * owns the values that multiple route surfaces read, while the loader keeps the existing request
 * sequencing, abort, fallback, and error behavior unchanged.
 */

export const catalogInitialState = {
  catalog: {
    selectedStore: null,
    items: [],
    loading: false,
    error: '',
    storeLocations: [],
    primaryLocationId: null,
    selectedLocationId: null,
    hasSelectedBranchFromMenu: false,
    branchSwitchFeedback: null,
    search: ''
  }
};

const updateCatalogField = (set, key, next) => set((s) => ({
  catalog: {
    ...s.catalog,
    [key]: typeof next === 'function' ? next(s.catalog[key]) : next
  }
}));

export const createCatalogSlice = (set) => ({
  ...catalogInitialState,

  catalogSetSelectedStore: (next) => updateCatalogField(set, 'selectedStore', next),
  catalogSetItems: (next) => updateCatalogField(set, 'items', next),
  catalogSetLoading: (next) => updateCatalogField(set, 'loading', next),
  catalogSetError: (next) => updateCatalogField(set, 'error', next),
  catalogSetStoreLocations: (next) => updateCatalogField(set, 'storeLocations', next),
  catalogSetPrimaryLocationId: (next) => updateCatalogField(set, 'primaryLocationId', next),
  catalogSetSelectedLocationId: (next) => updateCatalogField(set, 'selectedLocationId', next),
  catalogSetHasSelectedBranchFromMenu: (next) => updateCatalogField(set, 'hasSelectedBranchFromMenu', next),
  catalogSetBranchSwitchFeedback: (next) => updateCatalogField(set, 'branchSwitchFeedback', next),
  catalogSetSearch: (next) => updateCatalogField(set, 'search', next)
});
