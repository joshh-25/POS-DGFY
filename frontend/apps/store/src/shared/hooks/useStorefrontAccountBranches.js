import { useEffect, useState } from 'react';
import { fetchStorefrontAccountBranches } from '../model/storefrontAccountBranches.js';

const EMPTY_BRANCHES = [];

/**
 * Loads the other stores the signed-in DGFY account owns that share the current
 * store's business industry/type, for the header's "Other Stores" switcher.
 * Only attempts the lookup for authenticated storefront visitors — an anonymous
 * visitor can't own an account, so there's nothing to fetch, and skipping the
 * request entirely keeps the common case (most stores/visitors) free of any
 * extra network cost.
 */
export function useStorefrontAccountBranches({ isStorefrontAccountAuthenticated, selectedStore }) {
  const [branches, setBranches] = useState(EMPTY_BRANCHES);
  const [loading, setLoading] = useState(false);

  const tenantId = String(selectedStore?.tenant_id || '').trim();
  const slug = String(selectedStore?.slug || '').trim();
  const workflowMode = String(selectedStore?.workflow_mode || '').trim();
  const tenantName = String(selectedStore?.tenant_name || '').trim();
  const profileImageUrl = String(selectedStore?.storefront_profile_image_url || '').trim();

  useEffect(() => {
    // Edge case: industry/type missing on the current store — nothing reliable to
    // filter by, so don't show the switcher rather than guessing.
    if (!isStorefrontAccountAuthenticated || !tenantId || !slug || !workflowMode) {
      setBranches(EMPTY_BRANCHES);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    fetchStorefrontAccountBranches({
      currentTenantId: tenantId,
      currentSlug: slug,
      currentName: tenantName,
      currentLogoUrl: profileImageUrl,
      workflowMode
    })
      .then((result) => {
        if (cancelled) return;
        // Edge case: fetch failed — fetchStorefrontAccountBranches already resolves
        // to [] on any error, so the switcher simply stays hidden.
        setBranches(Array.isArray(result) ? result : EMPTY_BRANCHES);
      })
      .catch(() => {
        if (!cancelled) setBranches(EMPTY_BRANCHES);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isStorefrontAccountAuthenticated, tenantId, slug, workflowMode, tenantName, profileImageUrl]);

  return {
    accountBranches: branches,
    accountBranchesLoading: loading,
    // Edge case: only 1 store matches (itself) — hide the switcher.
    hasMultipleAccountBranches: branches.length > 1
  };
}
