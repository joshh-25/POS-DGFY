export function SimpleCheckoutStoreHeader({
  isMobileViewport = false,
  onBackToCatalog,
  selectedStore,
  servicesDisplayFont,
  withAssetOrigin
}) {
  const profileImageUrl = withAssetOrigin(selectedStore?.storefront_profile_image_url);
  const storeName = selectedStore?.tenant_name || 'Storefront';

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 0, background: '#fff', padding: isMobileViewport ? '12px 14px' : '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginLeft: 'calc(50% - 50vw)', width: '100vw', maxWidth: '100vw', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          type="button"
          onClick={onBackToCatalog}
          style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}
          aria-label="Back to catalog"
        >
          &larr;
        </button>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #dbe5ee', overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {profileImageUrl ? (
            <img src={profileImageUrl} alt={`${storeName} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>Logo</span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', lineHeight: 1.2, fontFamily: servicesDisplayFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {storeName}
          </div>
        </div>
      </div>
    </section>
  );
}
