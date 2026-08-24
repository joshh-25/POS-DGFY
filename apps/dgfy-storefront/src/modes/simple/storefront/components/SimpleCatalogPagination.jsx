import React from 'react';

import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';

export function SimpleCatalogPagination({ currentPage, end, isMobileViewport, onPageChange, onPageSizeChange, pageSize, start, totalItems, totalPages }) {
  if (totalPages <= 1) return null;
  const accent = '#176B3A';
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const buttonStyle = { minWidth: 36, minHeight: 36, borderRadius: 10, border: '1px solid #E4C98E', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '0 10px' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', columnGap: 16, rowGap: 10, marginTop: isMobileViewport ? 20 : 32 }}>
      <span style={{ color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>Showing {start}-{end} of {totalItems} items</span>
      <div className="no-scrollbar" style={{ display: 'flex', gridColumn: isMobileViewport ? '1 / -1' : '2', gridRow: isMobileViewport ? '2' : '1', justifyContent: isMobileViewport ? 'flex-start' : 'center', gap: 7, minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
        <button type="button" disabled={currentPage === 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))} style={{ ...buttonStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>Previous</button>
        {pages.map((page) => <button key={page} type="button" onClick={() => onPageChange(page)} style={{ ...buttonStyle, background: page === currentPage ? accent : '#fff', borderColor: page === currentPage ? accent : '#E4C98E', color: page === currentPage ? '#fff' : '#0f172a' }}>{page}</button>)}
        <button type="button" disabled={currentPage === totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} style={{ ...buttonStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>Next</button>
      </div>
      <label style={{ display: 'inline-flex', gridColumn: isMobileViewport ? '2' : '3', gridRow: '1', justifySelf: 'end', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
        Per page
        <StorefrontDropdown value={pageSize} onChange={(value) => onPageSizeChange(Number(value) || 8)} options={[4, 8, 12, 16].map((value) => ({ value, label: String(value) }))} containerStyle={{ minWidth: 68 }} triggerStyle={{ minHeight: 36, borderRadius: 10, border: '1px solid #E4C98E' }} selectedLabelStyle={{ fontSize: 13 }} />
      </label>
    </div>
  );
}
