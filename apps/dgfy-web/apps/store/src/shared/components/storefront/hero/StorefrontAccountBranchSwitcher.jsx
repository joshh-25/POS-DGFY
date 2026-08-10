import React from 'react';
import { Store } from 'lucide-react';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';

/**
 * Lets a signed-in DGFY account holder switch between the other storefronts they
 * own within the same business industry/type as the one currently being viewed.
 * Rendered in the same header slot family as the existing branch (location)
 * selector, but a distinct concept: that one switches between locations of THIS
 * tenant; this one switches between separate tenants owned by the same account.
 * Hidden entirely unless at least one other store matches (fewer than 2 total
 * entries means there's nothing to switch to).
 */
export function StorefrontAccountBranchSwitcher({
  branches,
  currentSlug,
  onSelectStore,
  compactLabel = false
}) {
  if (!Array.isArray(branches) || branches.length < 2) return null;

  const options = branches.map((branch) => ({
    value: branch.slug,
    label: branch.name,
    icon: Store
  }));

  return (
    <StorefrontDropdown
      value={currentSlug}
      options={options}
      onChange={(slug) => {
        const normalizedSlug = String(slug || '').trim();
        if (!normalizedSlug || normalizedSlug === currentSlug) return;
        onSelectStore?.(normalizedSlug);
      }}
      label="Other Stores"
      placeholder="Switch store"
      compactLabel={compactLabel}
      containerStyle={{ minWidth: 168, maxWidth: 220 }}
      triggerStyle={{ minHeight: 40, borderRadius: 14 }}
    />
  );
}
