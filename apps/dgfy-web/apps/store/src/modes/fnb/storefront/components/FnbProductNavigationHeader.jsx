import { ArrowLeft, MapPin, Store } from 'lucide-react';

/** Provides the F&B product-detail navigation and storefront identity header. */
export function FnbProductNavigationHeader({
  branchLabel,
  isMobileViewport,
  onBack,
  spacing,
  storeLogoUrl,
  storeName,
}) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, margin: 0, borderRadius: 0, background: '#ffffff', border: 'none', borderBottom: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.02)', transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobileViewport ? '10px 16px' : `${spacing(2)}px ${spacing(3)}px`, display: isMobileViewport ? 'flex' : 'grid', gridTemplateColumns: isMobileViewport ? undefined : '1fr auto 1fr', justifyContent: isMobileViewport ? 'space-between' : undefined, gap: isMobileViewport ? 12 : spacing(2), alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 10 : spacing(2), minWidth: 0, flex: isMobileViewport ? '1 1 auto' : undefined }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to menu"
            style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(226, 232, 240, 0.8)', background: '#fff', color: '#15803d', display: 'inline-grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.02)', transition: 'all 120ms ease' }}
          >
            <ArrowLeft size={16} />
          </button>
          {isMobileViewport ? (
            <StoreLogo size={34} storeLogoUrl={storeLogoUrl} />
          ) : (
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Back to Menu</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Review before adding to cart</div>
            </div>
          )}
        </div>

        {!isMobileViewport ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center', minWidth: 0 }}>
            <StoreLogo size={36} storeLogoUrl={storeLogoUrl} />
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{storeName}</div>
          </div>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, flexShrink: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569', fontWeight: 600, minHeight: isMobileViewport ? 36 : undefined, padding: isMobileViewport ? '0 10px' : undefined, borderRadius: isMobileViewport ? 999 : undefined, background: isMobileViewport ? '#f8fafc' : undefined, border: isMobileViewport ? '1px solid rgba(226, 232, 240, 0.9)' : undefined, maxWidth: isMobileViewport ? 140 : undefined }}>
            <MapPin size={15} color="#64748b" />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{branchLabel || 'Main Branch'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreLogo({ size, storeLogoUrl }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(226, 232, 240, 0.9)', display: 'grid', placeItems: 'center', background: '#f8fafc', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.01)' }}>
      {storeLogoUrl ? (
        <img src={storeLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Store size={size <= 34 ? 15 : 16} color="#475569" />
      )}
    </div>
  );
}
