import React, { useState } from 'react';
import { Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';

/**
 * Retail's own item card — not shared with any other mode. Container sizing/layout
 * (corner radius, image height, price badge, name/description, availability banner, and
 * the mobile list-view variant) mirrors modes/fnb/storefront/components/FnbProductCard.jsx
 * exactly, since catalogItemsToRender for retail is already shaped by the same
 * getFoodBeverageStorefrontViewModel transform F&B uses (sectionVisualMeta/sectionLabel/
 * descriptionPreview/availabilityMeta all present — see useFnbCatalogRuntime.js, which
 * runs for every mode). Differences from F&B: no "View Details" button anywhere (a single
 * full-width "Add to Cart" button replaces the split View Details/cart-icon row in both
 * the grid and list variants), and the fill colors (price badge, cart button, category
 * icon) read from retail's own heroTheme instead of F&B's — the card border/shadow tones
 * stay F&B's literal values per explicit instruction.
 */
const RetailProductCard = ({
  FNB_CATEGORY_ICON_MAP,
  available,
  addToCart,
  buttonTextOnAccent,
  fnbViewMode,
  getCartFlySourceRect,
  heroTheme,
  imageSources,
  isMobileViewport,
  item,
  money,
  onViewDetails
}) => {
  const sectionVisualMeta = item.sectionVisualMeta || {};
  const accent = heroTheme.accent || '#1A4E8D';
  const accentDeep = heroTheme.accentDark || '#1A4586';
  const cardSurface = '#ffffff';
  const cardBorder = heroTheme.borderSoft || '#E2E8F0';
  const cardTextPrimary = heroTheme.textPrimary || '#0F172A';
  const retailHighlight = heroTheme.palette?.retailHighlight || '#FF7A1A';
  const CategoryIcon = FNB_CATEGORY_ICON_MAP[sectionVisualMeta.iconToken] || Sparkles;
  const [isHovered, setIsHovered] = useState(false);
  const [isCartHovered, setIsCartHovered] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const detailsCopy = item.descriptionPreview || 'Item available in this storefront.';
  const categoryLabel = item.sectionLabel || item.productKind || 'Everyday';
  const cardUiFont = heroTheme.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif";
  const cardTitleFont = heroTheme.displayFont || cardUiFont;
  const imageUrl = imageSources?.src || '';
  const canRenderImage = Boolean(imageUrl) && failedImageUrl !== imageUrl;
  const availabilityTone = item.availabilityMeta?.tone || (available ? 'ready' : 'sold_out');
  const availabilityColor = availabilityTone === 'sold_out' ? '#be123c' : availabilityTone === 'limited' ? '#b45309' : '#047857';

  if (isMobileViewport && fnbViewMode === 'list') {
    return (
      <article
        data-cart-fly-origin="true"
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: 10,
          boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
          border: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          width: 'calc(100% - 8px)',
          maxWidth: 'calc(100% - 8px)',
          margin: '0 auto',
          minHeight: 154,
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{ width: 118, height: 118, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: '#f8fafc', position: 'relative', cursor: 'pointer' }}
          onClick={() => onViewDetails?.(item)}
        >
          {canRenderImage ? (
            <StorefrontResponsiveImage
              imageSources={imageSources}
              sizes="118px"
              alt={item.name}
              loading="lazy"
              decoding="async"
              width={118}
              height={118}
              onError={() => setFailedImageUrl(imageUrl)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
              <CategoryIcon size={32} />
            </div>
          )}
          {item.affiliate_price_applied && (
            <div style={{ position: 'absolute', top: 6, left: 6, background: retailHighlight, color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, padding: '2px 6px', lineHeight: 1 }}>
              Affiliate price
            </div>
          )}

          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.0) 40%, rgba(15,23,42,0.2) 100%)', pointerEvents: 'none' }} />
          <div style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            background: accent,
            color: buttonTextOnAccent,
            padding: '6px 9px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(26,78,141,0.24)',
            fontFamily: cardUiFont,
            lineHeight: 1
          }}>
            {money(item.default_sale_price ?? 0)}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '2px 0', minWidth: 0 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: cardTextPrimary, lineHeight: 1.15, fontFamily: cardTitleFont, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {item.name}
            </h4>
            <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.4, fontFamily: cardUiFont, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {detailsCopy}
            </p>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                addToCart(item, { sourceRect: getCartFlySourceRect(event) });
              }}
              disabled={!available}
              style={{
                width: '100%',
                minHeight: 44,
                borderRadius: 10,
                border: 'none',
                background: available ? accent : '#e2e8f0',
                color: buttonTextOnAccent,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: available ? 'pointer' : 'not-allowed',
                fontFamily: cardUiFont,
                fontSize: 13,
                fontWeight: 800
              }}
            >
              <span style={{ position: 'relative', display: 'flex' }}>
                <ShoppingCart size={16} strokeWidth={2.2} />
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#fff', color: available ? accent : '#94a3b8', borderRadius: '50%', width: 10, height: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={7} strokeWidth={4} />
                </span>
              </span>
              Add to Cart
            </button>
          </div>
        </div>
      </article>
    );
  }

  const cardTitleFontSize = isMobileViewport ? 17 : 18;
  const imageHeight = isMobileViewport ? 168 : 204;
  const actionHeight = isMobileViewport ? 44 : 48;

  return (
    <article
      data-cart-fly-origin="true"
      style={{
        background: cardSurface,
        borderRadius: 10,
        padding: 0,
        boxShadow: isHovered ? '0 16px 32px rgba(15,23,42,0.12)' : '0 6px 18px rgba(15,23,42,0.07)',
        border: `1px solid ${cardBorder}`,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        height: '100%',
        width: isMobileViewport ? 'calc(100% - 8px)' : '100%',
        maxWidth: isMobileViewport ? 'calc(100% - 8px)' : '100%',
        margin: isMobileViewport ? '0 auto' : 0,
        boxSizing: 'border-box'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{ position: 'relative', width: '100%', height: imageHeight, overflow: 'hidden', cursor: 'pointer' }}
        onClick={() => onViewDetails?.(item)}
      >
        {canRenderImage ? (
          <StorefrontResponsiveImage
            imageSources={imageSources}
            sizes={isMobileViewport ? 'calc(100vw - 40px)' : '(max-width: 1199px) 50vw, 330px'}
            alt={item.name}
            loading="lazy"
            decoding="async"
            width={400}
            height={300}
            onError={() => setFailedImageUrl(imageUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: accentDeep,
            fontWeight: 800,
            fontFamily: cardUiFont,
            background: '#f8fafc'
          }}>
            <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
              <div style={{
                width: isMobileViewport ? 48 : 64,
                height: isMobileViewport ? 48 : 64,
                borderRadius: 20,
                background: '#ffffffd9',
                color: accent,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 24px rgba(15,23,42,0.08)'
              }}>
                <CategoryIcon size={isMobileViewport ? 24 : 28} />
              </div>
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.08) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0) 44%, rgba(15,23,42,0.22) 100%)', pointerEvents: 'none' }} />
        {item.affiliate_price_applied && (
          <div style={{ position: 'absolute', top: isMobileViewport ? 10 : 16, left: isMobileViewport ? 10 : 16, background: retailHighlight, color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '3px 8px', lineHeight: 1 }}>
            Affiliate price
          </div>
        )}
        <div style={{
          position: 'absolute',
          left: isMobileViewport ? 10 : 12,
          bottom: isMobileViewport ? 10 : 12,
          maxWidth: 'calc(100% - 132px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          background: '#fff',
          color: accentDeep,
          padding: isMobileViewport ? '5px 9px' : '6px 11px',
          borderRadius: 8,
          border: `1px solid ${cardBorder}`,
          fontSize: isMobileViewport ? 11 : 12,
          fontWeight: 700,
          fontFamily: cardUiFont,
          lineHeight: 1,
          boxShadow: '0 4px 12px rgba(15,23,42,0.08)'
        }}>
          {categoryLabel}
        </div>
        <div style={{
          position: 'absolute',
          right: isMobileViewport ? 10 : 16,
          bottom: isMobileViewport ? 10 : 12,
          background: accent,
          color: buttonTextOnAccent,
          padding: isMobileViewport ? '7px 10px' : '8px 12px',
          borderRadius: 8,
          fontSize: isMobileViewport ? 13 : 14,
          fontWeight: 700,
          boxShadow: isHovered ? '0 12px 26px rgba(26,78,141,0.28)' : '0 10px 22px rgba(26,78,141,0.18)',
          transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.2s ease',
          fontFamily: cardUiFont,
          lineHeight: 1
        }}>
          {money(item.default_sale_price ?? 0)}
        </div>
      </div>
      <div style={{ padding: isMobileViewport ? 14 : '16px 18px 18px', flex: 1, display: 'grid', gap: isMobileViewport ? 12 : 16 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <h4 style={{ margin: 0, fontSize: cardTitleFontSize, fontWeight: 700, lineHeight: 1.15, color: cardTextPrimary, fontFamily: cardTitleFont, letterSpacing: '-0.015em', display: '-webkit-box', WebkitLineClamp: isMobileViewport ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</h4>
          <p style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: '#64748b',
            fontFamily: cardUiFont,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {detailsCopy}
          </p>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              addToCart(item, { sourceRect: getCartFlySourceRect(event) });
            }}
            disabled={!available}
            onMouseEnter={() => available && setIsCartHovered(true)}
            onMouseLeave={() => setIsCartHovered(false)}
            style={{
              width: '100%',
              minHeight: actionHeight,
              height: actionHeight,
              borderRadius: 10,
              border: 'none',
              background: available ? accent : '#e5e7eb',
              color: buttonTextOnAccent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: available ? 'pointer' : 'not-allowed',
              boxShadow: 'none',
              transform: available && isCartHovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'all 0.2s ease',
              fontFamily: cardUiFont,
              fontSize: isMobileViewport ? 14 : 15,
              fontWeight: 700
            }}
          >
            <span style={{ position: 'relative', width: isMobileViewport ? 18 : 22, height: isMobileViewport ? 18 : 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShoppingCart size={isMobileViewport ? 16 : 18} strokeWidth={2.2} />
              <span style={{
                position: 'absolute',
                top: -3,
                right: -4,
                width: isMobileViewport ? 10 : 12,
                height: isMobileViewport ? 10 : 12,
                borderRadius: 999,
                background: '#ffffff',
                color: available ? accent : '#94a3b8',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'none'
              }}>
                <Plus size={isMobileViewport ? 8 : 9} strokeWidth={3} />
              </span>
            </span>
            Add to Cart
          </button>
        </div>
        {!available && (
          <div style={{
            marginTop: 4,
            background: availabilityColor,
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '4px 8px',
            borderRadius: 8,
            textAlign: 'center'
          }}>
            {item.availabilityMeta?.reason || 'Sold Out'}
          </div>
        )}
      </div>
    </article>
  );
};

export { RetailProductCard };
