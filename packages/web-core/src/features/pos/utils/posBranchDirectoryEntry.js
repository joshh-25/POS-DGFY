export const shouldOpenBranchDirectoryOnHydrate = ({
  isDgfyPosSurface = false,
  dgfyTenantId,
  canViewBranchLocations = false,
  storedLockActive = false,
  background = false
} = {}) => Boolean(
  isDgfyPosSurface
  && !dgfyTenantId
  && canViewBranchLocations
  && !storedLockActive
  && !background
);
