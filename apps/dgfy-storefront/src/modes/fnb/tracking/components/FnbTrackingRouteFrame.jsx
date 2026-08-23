import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * Shared F&B tracking route layout. It owns route chrome only; tracking result
 * views remain separate slices so each presentation unit stays reviewable.
 */
export function FnbTrackingRouteFrame({
  children,
  displayFont,
  goStoreCatalogPage,
  isMobileViewport,
  routeSlug,
  selectedStore,
  storePath,
  toSlug,
  withAssetOrigin,
}) {
  const storeSlug = toSlug(selectedStore?.slug || routeSlug);
  const profileImageUrl = withAssetOrigin(selectedStore?.storefront_profile_image_url);
  const storeName = selectedStore?.tenant_name || 'Storefront';

  return (
    <div
      style={{
        maxWidth: 1240,
        margin: '0 auto',
        width: '100%',
        padding: isMobileViewport ? '16px' : '32px 40px',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
        <button
          type="button"
          onClick={goStoreCatalogPage}
          style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}
          aria-label="Back to menu"
        >
          <ArrowLeft size={18} />
        </button>
        <a
          href={storePath(storeSlug)}
          onClick={(event) => {
            event.preventDefault();
            goStoreCatalogPage();
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, textDecoration: 'none', cursor: 'pointer' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #dbe5ee', overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {profileImageUrl ? (
              <img src={profileImageUrl} alt={`${storeName} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>Logo</span>
            )}
          </div>
          <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Back to Store
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', lineHeight: 1.2, fontFamily: displayFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {storeName}
            </div>
          </div>
        </a>
      </header>
      {children}
    </div>
  );
}
