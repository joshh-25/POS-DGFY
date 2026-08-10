import React from 'react';

import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';
import { GhostButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';

/**
 * ServicesPaginationBar — services catalog pager (page count, per-page selector,
 * prev/next + windowed page buttons). Pure view extracted verbatim from
 * StorefrontApp.jsx; the `sortedServices.length > 0 && totalServicePages > 1`
 * gate stays at the call site.
 */
export function ServicesPaginationBar({
  isMobileViewport,
  resolvedServicePage,
  totalServicePages,
  servicePageSize,
  onPageSizeChange,
  onPageChange,
  servicesPrimary
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobileViewport ? 'center' : 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: STYLES.colors.muted }}>
          Page {resolvedServicePage} of {totalServicePages}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: STYLES.colors.muted }}>
          Per page
          <StorefrontDropdown
            value={servicePageSize}
            onChange={(nextValue) => onPageSizeChange(Number(nextValue) || 8)}
            options={[4, 8, 12, 16].map((size) => ({ value: size, label: String(size) }))}
            triggerStyle={{ minHeight: 36, borderRadius: 14, minWidth: 88, padding: '8px 42px 8px 12px' }}
            containerStyle={{ minWidth: 88 }}
            menuStyle={{ borderRadius: 16 }}
            selectedLabelStyle={{ fontSize: 13 }}
          />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <GhostButton
          style={{ minHeight: 38, padding: '0 14px', opacity: resolvedServicePage === 1 ? 0.5 : 1 }}
          onClick={() => onPageChange((previous) => Math.max(1, previous - 1))}
          disabled={resolvedServicePage === 1}
        >
          Previous
        </GhostButton>
        {Array.from({ length: totalServicePages }, (_, index) => index + 1)
          .slice(Math.max(0, resolvedServicePage - 3), Math.max(0, resolvedServicePage - 3) + 5)
          .map((pageNumber) => (
            <button
              key={`service-page-${pageNumber}`}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              style={{
                minWidth: 38,
                minHeight: 38,
                borderRadius: 10,
                border: `1px solid ${pageNumber === resolvedServicePage ? servicesPrimary : '#e5e7eb'}`,
                background: pageNumber === resolvedServicePage ? servicesPrimary : '#fff',
                color: pageNumber === resolvedServicePage ? '#fff' : STYLES.colors.dark,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              {pageNumber}
            </button>
          ))}
        <GhostButton
          style={{ minHeight: 38, padding: '0 14px', opacity: resolvedServicePage === totalServicePages ? 0.5 : 1 }}
          onClick={() => onPageChange((previous) => Math.min(totalServicePages, previous + 1))}
          disabled={resolvedServicePage === totalServicePages}
        >
          Next
        </GhostButton>
      </div>
    </div>
  );
}
