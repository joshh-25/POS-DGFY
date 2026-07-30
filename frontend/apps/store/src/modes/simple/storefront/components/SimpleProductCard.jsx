import React from 'react';

const SimpleProductCard = ({
  Badge,
  GhostButton,
  PrimaryButton,
  accentDark,
  accentSoft,
  addToCart,
  available,
  bodyFont,
  displayFont,
  imageUrl,
  item,
  money,
  onViewDetails
}) => {
  const categoryLabel = item.folder_name || item.category || 'Product';
  const availabilityLabel = item?.inventory_display?.label || (available ? 'Available' : 'Not available');

  return (
    <article style={{
      background: '#fff',
      borderRadius: 18,
      border: '1px solid #dbe5ee',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 12px 26px rgba(15, 23, 42, 0.06)'
    }}>
      <div
        style={{ width: '100%', height: 184, background: '#f8fafc', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
        onClick={() => onViewDetails?.(item)}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 13, fontWeight: 700 }}>
            No image yet
          </div>
        )}
        <div style={{ position: 'absolute', top: 10, left: 10 }}>
          <Badge background={accentSoft} color={accentDark} border="#bfe8e4">{categoryLabel}</Badge>
        </div>
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 10, flex: 1 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: '#0f172a', fontFamily: displayFont }}>{item.name}</h4>
          <div style={{ position: 'relative', maxHeight: 38, overflow: 'hidden', marginTop: 6 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.45, fontFamily: bodyFont }}>
              {item.description || 'Simple mode product ready for quick ordering.'}
            </p>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 20,
              background: 'linear-gradient(to top, #ffffff 0%, transparent 100%)',
              pointerEvents: 'none'
            }} />
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <strong style={{ fontSize: 19, fontWeight: 800, color: accentDark, fontFamily: displayFont }}>{money(item.default_sale_price ?? 0)}</strong>
              {item.affiliate_price_applied && (
                // Phase 1 affiliate pricing rule engine: a buyer arriving through an affiliate
                // link sees a price that differs from the public catalog - this label is what
                // stops that from reading as a bug (see
                // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).
                <span style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', background: '#f3e8ff', borderRadius: 999, padding: '2px 7px' }}>
                  Affiliate price
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: available ? '#047857' : '#be123c' }}>{availabilityLabel}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <GhostButton
              style={{ minHeight: 40, padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: bodyFont }}
              onClick={() => onViewDetails?.(item)}
            >
              View Details
            </GhostButton>
            <PrimaryButton
              style={{ minHeight: 40, padding: '8px 12px', fontWeight: 700, fontFamily: bodyFont }}
              onClick={() => addToCart(item)}
              disabled={!available}
            >
              {available ? 'Add to Order' : 'Unavailable'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </article>
  );
};

export { SimpleProductCard };
