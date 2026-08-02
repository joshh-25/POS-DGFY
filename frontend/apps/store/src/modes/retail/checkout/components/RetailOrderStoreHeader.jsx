import React from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';

export function RetailOrderStoreHeader({
  displayFont,
  isDeliveryOrder,
  isMobileViewport,
  isResponsiveFlow,
  onBack,
  selectedStore,
  textOnBrand,
  brandColor,
  brandShadow,
  withAssetOrigin
}) {
  const profileImage = withAssetOrigin(selectedStore?.storefront_profile_image_url);
  const storeName = selectedStore?.tenant_name || 'Storefront';

  return (
    <section style={{ borderBottom: '1px solid #e2e8f0', background: '#fff', width: '100%', boxSizing: 'border-box', boxShadow: '0 6px 18px rgba(15,23,42,.05)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%', padding: isResponsiveFlow ? '10px 16px' : isMobileViewport ? '12px 16px' : '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button type="button" onClick={onBack} style={{ width: isResponsiveFlow ? 44 : 40, height: isResponsiveFlow ? 44 : 40, borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }} aria-label="Back to menu">
            <ArrowLeft size={18} />
          </button>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #dbe5ee', overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {profileImage ? <img src={profileImage} alt={`${storeName} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>Logo</span>}
          </div>
          <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{isDeliveryOrder ? 'Delivery order' : 'Pickup order'}</div>
            <div style={{ fontSize: isResponsiveFlow ? 18 : 20, fontWeight: 900, color: '#1e293b', lineHeight: 1.2, fontFamily: displayFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{storeName}</div>
          </div>
        </div>
        {!isResponsiveFlow && <button type="button" style={{ minHeight: 44, padding: isMobileViewport ? '0 14px' : '0 20px', borderRadius: 14, border: 'none', background: brandColor, color: textOnBrand, fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: `0 8px 22px ${brandShadow}`, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}><MessageCircle size={16} />{isMobileViewport ? 'Message' : 'Message Us'}</button>}
      </div>
    </section>
  );
}
