// Storefront-side mirror of the backend's Phase 6a composed-capability
// overlay (`ops_enabled_capabilities`, see workflowCapabilitySettingsCache.js
// and packages/shared-constants/src/workflowModes.js). The catalog endpoint
// (`buildListStoreCatalogUseCase`) returns the tenant's live `workflow_mode`
// and `enabled_capabilities` alongside its items; this patches that onto
// `selectedStore` so `getStorefrontModeAdapter` can recognize a retail/fnb
// tenant that has the `services` capability composed in, not just a tenant
// whose scalar workflow_mode is literally 'services'.
export const buildWorkflowCapabilityStorePatch = (catalogData = null) => {
  if (!catalogData || typeof catalogData !== 'object') return null;
  if (catalogData.workflow_mode == null && !Array.isArray(catalogData.enabled_capabilities)) return null;
  return {
    workflow_mode: catalogData.workflow_mode,
    enabled_capabilities: Array.isArray(catalogData.enabled_capabilities) ? catalogData.enabled_capabilities : []
  };
};

export const hasEnabledCapability = (store = null, capability) => (
  Array.isArray(store?.enabled_capabilities) && store.enabled_capabilities.includes(capability)
);

export const hasServicesCapability = (store = null) => hasEnabledCapability(store, 'services');
