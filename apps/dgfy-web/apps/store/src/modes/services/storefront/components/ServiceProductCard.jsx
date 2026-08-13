import React from 'react';
import { ServiceImage } from '../../ServiceImage.jsx';

export function ServiceProductCard({
  item,
  imageSources,
  available,
  money,
  styles,
  servicesPrimary,
  servicesPrimaryDark,
  CategoryIcon,
  Badge,
  GhostButton,
  PrimaryButton,
  addToCart,
  getCartFlySourceRect,
  onViewDetails
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 20, border: `1px solid ${styles.colors.border}`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'all 0.2s ease',
      boxShadow: styles.shadow.sm, cursor: 'pointer'
    }} onClick={() => onViewDetails(item)} data-cart-fly-origin="true">
      <div style={{ width: '100%', height: 184, minHeight: 184, maxHeight: 184, background: styles.colors.bg, position: 'relative', overflow: 'hidden' }}>
        <ServiceImage
          imageSources={imageSources}
          sizes="(max-width: 1199px) 50vw, 330px"
          alt={item.name}
          loading="lazy"
          decoding="async"
          fallbackLabel="No service image"
          width={400}
          height={300}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <Badge background="rgba(255,255,255,0.9)" color={styles.colors.dark} border={styles.colors.border}>{item.service_detail?.service_area === 'onsite' ? 'Home Visit' : 'In-Store'}</Badge>
        </div>
      </div>
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', marginBottom: 4 }}>
            <CategoryIcon size={13} />
            <span>{item.categoryMeta?.label || 'General'}</span>
          </div>
          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.3, color: styles.colors.dark }}>{item.variantName || item.name}</h4>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: styles.colors.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.description || 'Expert service selection.'}
        </p>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: servicesPrimaryDark, marginBottom: 12 }}>{money(item.default_sale_price ?? 0)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <GhostButton style={{ padding: '8px', minHeight: 40, fontSize: 13 }} onClick={(e) => { e.stopPropagation(); onViewDetails(item); }}>Details</GhostButton>
            <PrimaryButton accentColor={servicesPrimary} accentDarkColor={servicesPrimaryDark} shadowColor="rgba(15,118,110,0.24)" style={{ padding: '8px', minHeight: 40, fontSize: 13 }} onClick={(e) => { e.stopPropagation(); addToCart(item, { sourceRect: getCartFlySourceRect(e) }); }} disabled={!available}>Add</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
