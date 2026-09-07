import { ChefHat, Plus } from 'lucide-react';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';

export const FnbRecommendedPairings = ({
  accentColor = '#f97316',
  accentSoft = '#f0fdf4',
  borderSoft = '#86efac',
  displayFont,
  formatMoney,
  isMobileViewport,
  compactTypography = false,
  onQuickAdd,
  onSelectRelatedItem,
  relatedItems
}) => {
  if (!Array.isArray(relatedItems) || relatedItems.length === 0) return null;

  const renderAddButton = (recommended, size) => (
    <button
      type="button"
      aria-label={`Add ${recommended.name} to cart`}
      onClick={(event) => {
        event.stopPropagation();
        onQuickAdd?.(recommended, event);
      }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: accentSoft,
        border: `${size > 30 ? 1.5 : 1}px solid ${borderSoft}`,
        color: accentColor,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        flexShrink: 0
      }}
    >
      <Plus size={size > 30 ? 18 : 16} strokeWidth={size > 30 ? 2.5 : 2} />
    </button>
  );

  if (isMobileViewport) {
    return (
      <div style={{ borderTop: '1px solid rgba(226, 232, 240, 0.6)', paddingTop: 24, marginTop: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: compactTypography ? 700 : 800, color: '#0f172a', fontFamily: displayFont }}>Recommended Pairings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {relatedItems.slice(0, 5).map((recommended) => {
            const imageSources = resolveStorefrontImageSources(recommended, { preferred: 'thumbnail' });
            const imageUrl = imageSources.src;
            const category = String(recommended.sectionLabel || recommended.category || '').trim();
            return (
              <div key={`recommended-mob-${recommended.item_id}`} onClick={() => onSelectRelatedItem?.(recommended)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#fff', border: '1px solid rgba(226, 232, 240, 0.9)', borderRadius: 16, boxShadow: '0 2px 10px rgba(15,23,42,0.04)', cursor: 'pointer' }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: '#f1f5f9', flexShrink: 0, border: '1px solid rgba(226,232,240,0.7)' }}>
                  {imageUrl ? <StorefrontResponsiveImage imageSources={imageSources} sizes="64px" alt={recommended.name} loading="lazy" decoding="async" width={64} height={64} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#94a3b8' }}><ChefHat size={24} strokeWidth={1.5} /></div>}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{recommended.name}</div>
                  {category ? <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{category}</div> : null}
                  <div style={{ fontSize: 13, fontWeight: compactTypography ? 700 : 800, color: accentColor, marginTop: 2 }}>{formatMoney(recommended.default_sale_price)}</div>
                </div>
                {renderAddButton(recommended, 36)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid rgba(226, 232, 240, 0.6)', paddingTop: 24, marginTop: 24, display: 'grid', gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: compactTypography ? 700 : 800, color: '#0f172a', fontFamily: displayFont }}>Recommended Pairings</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, minWidth: 0, width: '100%' }}>
        {relatedItems.slice(0, 3).map((recommended) => {
          const imageSources = resolveStorefrontImageSources(recommended, { preferred: 'thumbnail' });
          const imageUrl = imageSources.src;
          return (
            <div key={`recommended-desk-${recommended.item_id}`} onClick={() => onSelectRelatedItem?.(recommended)} style={{ display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', background: '#fff', border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: 18, padding: 12, minWidth: 0, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', background: '#f8fafc', flexShrink: 0 }}>
                {imageUrl ? <StorefrontResponsiveImage imageSources={imageSources} sizes="110px" alt={recommended.name} loading="lazy" decoding="async" width={110} height={110} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#64748b' }}><ChefHat size={20} /></div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flexGrow: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recommended.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 'auto' }}>
                  <div style={{ fontSize: 12, fontWeight: compactTypography ? 700 : 800, color: accentColor }}>{formatMoney(recommended.default_sale_price)}</div>
                  {renderAddButton(recommended, 28)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
