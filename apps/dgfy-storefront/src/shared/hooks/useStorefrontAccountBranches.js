import { useEffect, useState } from 'react';
import { fetchStorefrontAccountBranches } from '../model/storefrontAccountBranches.js';

const EMPTY_BRANCHES = [];
const INITIAL_STATE = { branches: EMPTY_BRANCHES, loading: false, lookupKey: '' };

/**
 * Loads the other stores the signed-in DGFY account owns that share the current
 * store's business industry/type, for the header's "Other Stores" switcher.
 * Only attempts the lookup for authenticated storefront visitors — an anonymous
 * visitor can't own an account, so there's nothing to fetch, and skipping the
 * request entirely keeps the common case (most stores/visitors) free of any
 * extra network cost.
 */
export function useStorefrontAccountBranches({ isStorefrontAccountAuthenticated, selectedStore }) {
  const [state, setState] = useState(INITIAL_STATE);

  const tenantId = String(selectedStore?.tenant_id || '').trim();
  const slug = String(selectedStore?.slug || '').trim();
  const workflowMode = String(selectedStore?.workflow_mode || '').trim();
  const tenantName = String(selectedStore?.tenant_name || '').trim();
  const profileImageUrl = String(selectedStore?.storefront_profile_image_url || '').trim();
  // Edge case: industry/type missing on the current store — nothing reliable to
  // filter by, so don't show the switcher rather than guessing.
  const isEligibleForLookup = Boolean(isStorefrontAccountAuthenticated && tenantId && slug && workflowMode);
  const lookupKey = `${tenantId}::${slug}::${workflowMode.toLowerCase()}`;
  const visibleBranches = isEligibleForLookup && state.lookupKey === lookupKey
    ? state.branches
    : EMPTY_BRANCHES;
  const visibleLoading = isEligibleForLookup && state.lookupKey === lookupKey
    ? state.loading
    : isEligibleForLookup;

  useEffect(() => {
    if (!isEligibleForLookup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Resetting to initial state when inputs become invalid, not a synchronization loop.
      setState(INITIAL_STATE);
      return undefined;
    }
    let cancelled = false;
    setState({ branches: EMPTY_BRANCHES, loading: true, lookupKey });
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
        setState({ branches: Array.isArray(result) ? result : EMPTY_BRANCHES, loading: false, lookupKey });
      })
      .catch(() => {
        if (!cancelled) setState({ branches: EMPTY_BRANCHES, loading: false, lookupKey });
      });
    return () => {
      cancelled = true;
    };
  }, [isEligibleForLookup, lookupKey, tenantId, slug, workflowMode, tenantName, profileImageUrl]);

  return {
    accountBranches: visibleBranches,
    accountBranchesLoading: visibleLoading,
    // Edge case: only 1 store matches (itself) — hide the switcher.
    hasMultipleAccountBranches: visibleBranches.length > 1
  };
}
