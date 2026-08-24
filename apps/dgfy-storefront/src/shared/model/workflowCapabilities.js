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
  const patch = {};
  const workflowMode = typeof catalogData.workflow_mode === 'string'
    ? catalogData.workflow_mode.trim()
    : catalogData.workflow_mode;

  // Catalog responses from older or partially configured tenants may omit
  // workflow_mode. Do not let an absent overlay field erase the mode already
  // resolved from the storefront profile (services, retail, or msme).
  if (workflowMode) patch.workflow_mode = workflowMode;
  if (Array.isArray(catalogData.enabled_capabilities)) {
    patch.enabled_capabilities = catalogData.enabled_capabilities;
  }

  return Object.keys(patch).length > 0 ? patch : null;
};

export const hasEnabledCapability = (store = null, capability) => (
  Array.isArray(store?.enabled_capabilities) && store.enabled_capabilities.includes(capability)
);

export const hasServicesCapability = (store = null) => hasEnabledCapability(store, 'services');
