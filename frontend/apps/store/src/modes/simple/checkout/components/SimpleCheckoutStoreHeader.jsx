import React from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';

const SIMPLE_BRAND = '#0f766e';
const SIMPLE_BRAND_SHADOW = 'rgba(15,118,110,.28)';

export function SimpleCheckoutStoreHeader({
  isDeliveryOrder = false,
  isMobileViewport = false,
  onBackToCatalog,
  selectedStore,
  servicesBodyFont,
  servicesDisplayFont,
  withAssetOrigin
}) {
  const profileImage = withAssetOrigin(selectedStore?.storefront_profile_image_url);
  const storeName = selectedStore?.tenant_name || 'Storefront';

  return (
    <section style={{ borderBottom: '1px solid #e2e8f0', background: '#fff', width: '100%', boxSizing: 'border-box', boxShadow: '0 6px 18px rgba(15,23,42,.05)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? '10px 16px' : '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button type="button" onClick={onBackToCatalog} style={{ width: isMobileViewport ? 44 : 40, height: isMobileViewport ? 44 : 40, borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }} aria-label="Back to menu">
            <ArrowLeft size={18} />
          </button>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #dbe5ee', overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {profileImage ? <img src={profileImage} alt={`${storeName} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>Logo</span>}
          </div>
          <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: servicesBodyFont }}>{isDeliveryOrder ? 'Delivery order' : 'Pickup order'}</div>
            <div style={{ fontSize: isMobileViewport ? 18 : 20, fontWeight: 900, color: '#1e293b', lineHeight: 1.2, fontFamily: servicesDisplayFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{storeName}</div>
          </div>
        </div>
        {!isMobileViewport && <button type="button" style={{ minHeight: 44, padding: isMobileViewport ? '0 14px' : '0 20px', borderRadius: 14, border: 'none', background: SIMPLE_BRAND, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: `0 8px 22px ${SIMPLE_BRAND_SHADOW}`, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}><MessageCircle size={16} />{isMobileViewport ? 'Message' : 'Message Us'}</button>}
      </div>
    </section>
  );
}
