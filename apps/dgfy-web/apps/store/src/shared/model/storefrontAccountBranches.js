import { listDgfyAccountCompaniesForTenantSession } from '../../../../../src/services/dgfyAuthService.js';
import { requestJson } from '../../services/requestJson.js';
import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';

const normalizeWorkflowMode = (value) => String(value || '').trim().toLowerCase();

// Wide enough to cover the discovery index in one request for the vast majority of
// accounts (most own a handful of storefronts); this only runs at all once we already
// know the account owns more than one tenant, so the cost is rare, not per-page-load.
const DISCOVERY_ACCOUNT_BRANCH_LOOKUP_LIMIT = 100;

/**
 * Resolves the storefronts a signed-in DGFY account owns that share the current
 * store's business industry/type (workflow_mode), for the header's "Other Stores"
 * switcher.
 *
 * Reuses the existing DGFY account-companies listing (the same data source the POS
 * terminal and customer dashboard already use for company switching) instead of a
 * new backend endpoint. That listing doesn't carry `workflow_mode`/`slug` per
 * company, so those are resolved by matching `tenant_id` against the public
 * storefront discovery index, which already exposes both.
 */
export async function fetchStorefrontAccountBranches({
  currentTenantId,
  currentSlug,
  currentName = '',
  currentLogoUrl = '',
  workflowMode
} = {}) {
  const normalizedCurrentTenantId = String(currentTenantId || '').trim();
  const normalizedCurrentSlug = String(currentSlug || '').trim();
  const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);
  if (!normalizedCurrentTenantId || !normalizedCurrentSlug || !normalizedWorkflowMode) return [];

  let ownedCompanies = [];
  try {
    const payload = await listDgfyAccountCompaniesForTenantSession();
    ownedCompanies = Array.isArray(payload?.owned_companies) ? payload.owned_companies : [];
  } catch (error) {
    // Swallowed by design (the switcher just doesn't render), but this call is
    // auth/cookie-dependent (tenant-membership bridge via withCredentials) and can
    // fail differently across environments — e.g. cross-subdomain cookie scoping or
    // CORS policy differences between local dev and a hosted deployment. Logging
    // keeps that failure diagnosable from the browser console/network tab instead
    // of looking identical to "no other stores exist".
    console.warn('[storefrontAccountBranches] Failed to list DGFY account companies', error);
    return [];
  }

  const otherOwnedTenantIds = [...new Set(
    ownedCompanies
      .map((company) => String(company?.tenant_id || '').trim())
      .filter((tenantId) => tenantId && tenantId !== normalizedCurrentTenantId)
  )];
  if (otherOwnedTenantIds.length === 0) return [];

  let discoveryRows = [];
  try {
    const response = await requestJson(
      `/api/v1/storefront/discovery?limit=${DISCOVERY_ACCOUNT_BRANCH_LOOKUP_LIMIT}`,
      { cache: 'no-store' }
    );
    discoveryRows = Array.isArray(response?.stores) ? response.stores : [];
  } catch (error) {
    console.warn('[storefrontAccountBranches] Failed to load storefront discovery index', error);
    return [];
  }

  const rowsByTenantId = new Map();
  discoveryRows.forEach((row) => {
    const tenantId = String(row?.tenant_id || '').trim();
    if (tenantId) rowsByTenantId.set(tenantId, row);
  });

  const otherBranches = otherOwnedTenantIds
    .map((tenantId) => {
      const row = rowsByTenantId.get(tenantId);
      const slug = String(row?.slug || '').trim();
      if (!slug || normalizeWorkflowMode(row?.workflow_mode) !== normalizedWorkflowMode) return null;
      const ownedCompany = ownedCompanies.find(
        (company) => String(company?.tenant_id || '').trim() === tenantId
      );
      return {
        tenantId,
        slug,
        name: String(ownedCompany?.company_name || row?.tenant_name || slug).trim(),
        logoUrl: withAssetOrigin(String(row?.storefront_profile_image_url || '').trim()) || '',
        isCurrent: false
      };
    })
    .filter(Boolean);

  // Only the current store matched itself, or none of the other owned tenants share
  // its industry/type (e.g. Lorem Ipsum 3/4 in the example) — nothing to show.
  if (otherBranches.length === 0) return [];

  const currentBranch = {
    tenantId: normalizedCurrentTenantId,
    slug: normalizedCurrentSlug,
    name: String(currentName || normalizedCurrentSlug).trim(),
    logoUrl: withAssetOrigin(String(currentLogoUrl || '').trim()) || '',
    isCurrent: true
  };

  return [currentBranch, ...otherBranches].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
