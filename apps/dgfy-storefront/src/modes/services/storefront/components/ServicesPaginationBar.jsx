import React from 'react';

import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

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
  const visiblePages = Array.from({ length: totalServicePages }, (_, index) => index + 1)
    .slice(Math.max(0, resolvedServicePage - 3), Math.max(0, resolvedServicePage - 3) + 5);
  const pageButtons = visiblePages.map((pageNumber) => (
    <button
      key={`service-page-${pageNumber}`}
      type="button"
      onClick={() => onPageChange(pageNumber)}
      style={{
        minWidth: 40,
        minHeight: 40,
        borderRadius: 10,
        border: `1px solid ${pageNumber === resolvedServicePage ? servicesPrimary : SERVICES_PALETTE.border}`,
        background: pageNumber === resolvedServicePage ? servicesPrimary : SERVICES_PALETTE.surface,
        color: pageNumber === resolvedServicePage ? SERVICES_PALETTE.surface : SERVICES_PALETTE.textPrimary,
        fontWeight: 500,
        cursor: 'pointer'
      }}
    >
      {pageNumber}
    </button>
  ));
  const renderPreviousButton = (style = {}) => (
    <button
      type="button"
      aria-label="Previous page"
      title="Previous page"
      style={{ minWidth: 40, minHeight: 40, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 10, border: `1px solid ${SERVICES_PALETTE.border}`, background: SERVICES_PALETTE.surface, color: SERVICES_PALETTE.textPrimary, fontSize: 22, lineHeight: 1, cursor: resolvedServicePage === 1 ? 'not-allowed' : 'pointer', opacity: resolvedServicePage === 1 ? 0.5 : 1, ...style }}
      onClick={() => onPageChange((previous) => Math.max(1, previous - 1))}
      disabled={resolvedServicePage === 1}
    >
      ‹
    </button>
  );
  const renderNextButton = (style = {}) => (
    <button
      type="button"
      aria-label="Next page"
      title="Next page"
      style={{ minWidth: 40, minHeight: 40, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 10, border: `1px solid ${SERVICES_PALETTE.border}`, background: SERVICES_PALETTE.surface, color: SERVICES_PALETTE.textPrimary, fontSize: 22, lineHeight: 1, cursor: resolvedServicePage === totalServicePages ? 'not-allowed' : 'pointer', opacity: resolvedServicePage === totalServicePages ? 0.5 : 1, ...style }}
      onClick={() => onPageChange((previous) => Math.min(totalServicePages, previous + 1))}
      disabled={resolvedServicePage === totalServicePages}
    >
      ›
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobileViewport ? 'center' : 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: SERVICES_PALETTE.textMuted }}>
          Page {resolvedServicePage} of {totalServicePages}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: SERVICES_PALETTE.textMuted }}>
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
      {isMobileViewport ? (
        <div style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 40px', alignItems: 'center', columnGap: 8, width: '100%', minWidth: 0 }}>
          {renderPreviousButton({ gridColumn: '1' })}
          <div className="no-scrollbar" style={{ display: 'flex', alignItems: 'center', justifyContent: pageButtons.length <= 5 ? 'center' : 'flex-start', gap: 8, minWidth: 0, overflowX: 'auto', padding: '0 2px 2px', gridColumn: '2' }}>
            {pageButtons}
          </div>
          {renderNextButton({ gridColumn: '3' })}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {renderPreviousButton()}
          {pageButtons}
          {renderNextButton()}
        </div>
      )}
    </div>
  );
}
