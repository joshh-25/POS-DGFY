export const shouldOpenBranchDirectoryOnHydrate = ({
  isDgfyPosSurface = false,
  dgfyTenantId,
  canViewBranchLocations = false,
  storedLockActive = false,
  background = false,
  branchDirectoryDismissed = false
} = {}) => Boolean(
  isDgfyPosSurface
  && !dgfyTenantId
  && canViewBranchLocations
  && !storedLockActive
  && !background
  && !branchDirectoryDismissed
);
