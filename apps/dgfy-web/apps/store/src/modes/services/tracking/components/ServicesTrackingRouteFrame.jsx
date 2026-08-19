import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { ServiceImage } from '../../ServiceImage.jsx';
import { SERVICES_BODY_FONT, SERVICES_DISPLAY_FONT } from '../../servicesTypography.js';

export function ServicesTrackingRouteFrame({
  children,
  bodyFont = SERVICES_BODY_FONT,
  displayFont = SERVICES_DISPLAY_FONT,
  goStoreCatalogPage,
  isMobileViewport,
  selectedStore,
  withAssetOrigin
}) {
  const storeName = String(selectedStore?.tenant_name || selectedStore?.name || 'Storefront').trim();

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? '16px' : '32px 40px', boxSizing: 'border-box', fontFamily: bodyFont, color: '#10233f' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
        <button type="button" onClick={goStoreCatalogPage} style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)', fontFamily: bodyFont }} aria-label="Back to services">
          <ArrowLeft size={18} />
        </button>
        <button type="button" onClick={goStoreCatalogPage} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, textDecoration: 'none', cursor: 'pointer', border: 0, background: 'transparent', padding: 0, textAlign: 'left', fontFamily: bodyFont }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #dbe5ee', overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <ServiceImage
              item={{ image_url: withAssetOrigin(selectedStore?.storefront_profile_image_url) }}
              alt={`${storeName} profile`}
              sizes="40px"
              width={40}
              height={40}
              fallbackLabel=""
              fallbackStyle={{ borderRadius: '50%' }}
              fallbackIcon={<span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>Logo</span>}
            />
          </div>
          <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Back to Store</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', lineHeight: 1.2, fontFamily: displayFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{storeName}</div>
          </div>
        </button>
      </header>
      {children}
    </div>
  );
}
