import React from 'react';

import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';

export function RetailCatalogPagination({ currentPage, end, isMobileViewport, onPageChange, onPageSizeChange, pageSize, start, totalItems, totalPages }) {
  if (totalPages <= 1) return null;
  const accent = '#1A4E8D';
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const buttonStyle = { minWidth: 40, minHeight: 40, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '0 10px' };
  const pageButtons = pages.map((page) => <button key={page} type="button" onClick={() => onPageChange(page)} style={{ ...buttonStyle, background: page === currentPage ? accent : '#fff', borderColor: page === currentPage ? accent : '#E2E8F0', color: page === currentPage ? '#fff' : '#0f172a', boxShadow: page === currentPage ? '0 8px 18px rgba(26,78,141,0.22)' : 'none' }}>{page}</button>);
  const pageNumbersStyle = { display: 'flex', alignItems: 'center', justifyContent: pages.length <= 5 ? 'center' : 'flex-start', gap: 7, minWidth: 0, overflowX: 'auto', padding: '0 2px 2px' };
  const renderPreviousButton = (style = {}) => <button type="button" aria-label="Previous page" title="Previous page" disabled={currentPage === 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))} style={{ ...buttonStyle, ...style, fontSize: 22, lineHeight: 1, padding: 0, display: 'grid', placeItems: 'center', opacity: currentPage === 1 ? 0.5 : 1 }}>‹</button>;
  const renderNextButton = (style = {}) => <button type="button" aria-label="Next page" title="Next page" disabled={currentPage === totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} style={{ ...buttonStyle, ...style, fontSize: 22, lineHeight: 1, padding: 0, display: 'grid', placeItems: 'center', opacity: currentPage === totalPages ? 0.5 : 1 }}>›</button>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', columnGap: 16, rowGap: 10, marginTop: isMobileViewport ? 20 : 32 }}>
      <span style={{ color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>Showing {start}-{end} of {totalItems} items</span>
      {isMobileViewport ? (
        <div className="no-scrollbar" style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 40px', alignItems: 'center', columnGap: 8, gridColumn: '1 / -1', gridRow: '2', width: '100%', minWidth: 0 }}>
          {renderPreviousButton({ gridColumn: '1' })}
          <div className="no-scrollbar" style={{ ...pageNumbersStyle, gridColumn: '2', width: '100%' }}>{pageButtons}</div>
          {renderNextButton({ gridColumn: '3' })}
        </div>
      ) : (
        <div className="no-scrollbar" style={{ display: 'flex', gridColumn: '2', gridRow: '1', justifyContent: 'center', gap: 7, minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
          {renderPreviousButton()}
          {pageButtons}
          {renderNextButton()}
        </div>
      )}
      <label style={{ display: 'inline-flex', gridColumn: isMobileViewport ? '2' : '3', gridRow: '1', justifySelf: 'end', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
        Per page
        <StorefrontDropdown value={pageSize} onChange={(value) => onPageSizeChange(Number(value) || 8)} options={[4, 8, 12, 16].map((value) => ({ value, label: String(value) }))} containerStyle={{ minWidth: 68 }} triggerStyle={{ minHeight: 36, borderRadius: 10, border: '1px solid #E2E8F0' }} selectedLabelStyle={{ fontSize: 13 }} />
      </label>
    </div>
  );
}
