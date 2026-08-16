import React, { useState } from 'react';
import { Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { SIMPLE_CATEGORY_ICON_MAP } from '../model/simpleCategoryIconMap.jsx';

/**
 * MSME's own item card — not shared with any other mode. Container sizing/layout
 * (corner radius, image height, price badge, name/description, availability banner, and the
 * mobile list-view variant) mirrors modes/fnb/storefront/components/FnbProductCard.jsx exactly,
 * since catalogItemsToRender for MSME is already shaped by the same getFoodBeverageStorefrontViewModel
 * transform F&B uses (sectionVisualMeta/sectionLabel/descriptionPreview/availabilityMeta all
 * present — see useFnbCatalogRuntime.js, which runs for every mode). Differences from F&B: no
 * "View Details" button anywhere (a single full-width "Add to Cart" button replaces the split
 * View Details/cart-icon row in both the grid and list variants), and all Simple catalog colors
 * come from the mode's catalogPalette so this card does not inherit F&B styling.
 */
const SimpleProductCard = ({
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
  const catalogPalette = heroTheme.catalogPalette || heroTheme.palette || {};
  const typography = heroTheme.typography || {};
  const cardTitleTypography = typography.cardTitle || {};
  const priceTypography = typography.price || {};
  const actionTypography = typography.action || {};
  const accent = catalogPalette.primary || heroTheme.accent || '#176B3A';
  const accentDeep = catalogPalette.primaryHover || heroTheme.accentDark || '#0F5A30';
  const cardSurface = catalogPalette.surface || '#FFFDF7';
  const cardImageSurface = catalogPalette.surfaceSubtle || '#FFF7E6';
  const cardBorder = catalogPalette.border || '#E4C98E';
  const cardTextPrimary = catalogPalette.textPrimary || heroTheme.textPrimary || '#0f172a';
  const cardTextSecondary = catalogPalette.textSecondary || heroTheme.textMuted || '#475569';
  const CategoryIcon = SIMPLE_CATEGORY_ICON_MAP[sectionVisualMeta.iconToken] || Sparkles;
  const [isHovered, setIsHovered] = useState(false);
  const [isCartHovered, setIsCartHovered] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const detailsCopy = item.descriptionPreview || 'Item available in this storefront.';
  const cardUiFont = heroTheme.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif";
  const cardTitleFont = heroTheme.displayFont || cardUiFont;
  const imageUrl = imageSources?.src || '';
  const canRenderImage = Boolean(imageUrl) && failedImageUrl !== imageUrl;
  const categoryLabel = String(item.sectionLabel || item.categoryMeta?.label || item.productKind || '').trim();
  const availabilityTone = item.availabilityMeta?.tone || (available ? 'ready' : 'sold_out');
  const availabilityColor = availabilityTone === 'sold_out' ? '#be123c' : availabilityTone === 'limited' ? '#b45309' : '#047857';

  if (isMobileViewport && fnbViewMode === 'list') {
    return (
      <article
        data-cart-fly-origin="true"
        style={{
          background: cardSurface,
          borderRadius: 10,
          padding: 10,
          boxShadow: '0 4px 12px rgba(23,107,58,0.05)',
          border: `1px solid ${cardBorder}`,
          display: 'flex',
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          width: 'calc(100% - 8px)',
          maxWidth: 'calc(100% - 8px)',
          margin: '0 auto',
          height: 148,
          minHeight: 148,
          maxHeight: 148,
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{ width: 118, height: 118, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: cardImageSurface, position: 'relative', cursor: 'pointer' }}
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
            <div style={{ position: 'absolute', top: 6, left: 6, background: '#7c3aed', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, padding: '2px 6px', lineHeight: 1 }}>
              Affiliate price
            </div>
          )}

          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(35,23,18,0.0) 40%, rgba(32,20,15,0.2) 100%)', pointerEvents: 'none' }} />
          <div style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            background: accent,
            color: buttonTextOnAccent,
            padding: '6px 9px',
            borderRadius: 6,
            fontSize: priceTypography.mobile || 13,
            fontWeight: priceTypography.weight || 700,
            boxShadow: 'none',
            fontFamily: cardUiFont,
            lineHeight: 1
          }}>
            {money(item.default_sale_price ?? 0)}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '2px 0', minWidth: 0 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <h4 style={{ margin: 0, fontSize: cardTitleTypography.mobile || 16, fontWeight: cardTitleTypography.weight || 700, color: cardTextPrimary, lineHeight: cardTitleTypography.lineHeight || 1.25, fontFamily: cardTitleFont, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {item.name}
            </h4>
            <p style={{ margin: 0, fontSize: 13, color: cardTextSecondary, lineHeight: 1.4, fontFamily: cardUiFont, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
                height: 38,
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
                fontSize: actionTypography.mobile || 13,
                fontWeight: actionTypography.weight || 700
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

  const cardTitleFontSize = isMobileViewport ? (cardTitleTypography.mobile || 16) : (cardTitleTypography.desktop || 18);
  const imageHeight = isMobileViewport ? 140 : 214;
  const actionHeight = isMobileViewport ? 36 : 46;

  return (
    <article
      data-cart-fly-origin="true"
      style={{
        background: cardSurface,
        borderRadius: 10,
        padding: 0,
        boxShadow: isHovered ? '0 12px 24px rgba(23,107,58,0.10)' : '0 6px 16px rgba(23,107,58,0.05)',
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
        style={{ position: 'relative', width: '100%', height: imageHeight, overflow: 'hidden', borderRadius: isMobileViewport ? '0 0 12px 12px' : '0 0 8px 8px', cursor: 'pointer', background: cardImageSurface }}
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
            fontWeight: cardTitleTypography.weight || 700,
            fontFamily: cardUiFont,
            background: cardImageSurface
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
                boxShadow: '0 8px 16px rgba(23,107,58,0.06)'
              }}>
                <CategoryIcon size={isMobileViewport ? 24 : 28} />
              </div>
              <div style={{ fontSize: 14, letterSpacing: '-0.01em', display: isMobileViewport ? 'none' : 'block' }}>{item.sectionLabel || item.productKind || 'Item'}</div>
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(108,75,20,0.08) 100%)', pointerEvents: 'none' }} />
        {item.affiliate_price_applied && (
          <div style={{ position: 'absolute', top: isMobileViewport ? 10 : 16, left: isMobileViewport ? 10 : 16, background: '#7c3aed', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '3px 8px', lineHeight: 1 }}>
            Affiliate price
          </div>
        )}
        <div style={{
          position: 'absolute',
          right: isMobileViewport ? 10 : 16,
          bottom: isMobileViewport ? 10 : 16,
          background: accent,
          color: buttonTextOnAccent,
          padding: isMobileViewport ? '6px 10px' : '9px 16px',
          borderRadius: 999,
          fontSize: isMobileViewport ? (priceTypography.mobile || 13) : (priceTypography.desktop || 15),
          fontWeight: priceTypography.weight || 700,
          boxShadow: 'none',
          transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.2s ease',
          fontFamily: cardUiFont,
          lineHeight: 1
        }}>
          {money(item.default_sale_price ?? 0)}
        </div>
        {categoryLabel ? (
          <div style={{ position: 'absolute', left: isMobileViewport ? 10 : 12, bottom: isMobileViewport ? 10 : 12, maxWidth: '55%', padding: isMobileViewport ? '5px 8px' : '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.94)', color: accentDeep, fontSize: isMobileViewport ? 10 : 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: cardUiFont }}>
            {categoryLabel}
          </div>
        ) : null}
      </div>
      <div style={{ padding: isMobileViewport ? '12px 12px 12px' : '18px 18px 16px', flex: 1, display: 'grid', gap: isMobileViewport ? 8 : 14 }}>
        <div style={{ display: 'grid', gap: isMobileViewport ? 4 : 8 }}>
          <h4 style={{ margin: 0, fontSize: cardTitleFontSize, fontWeight: cardTitleTypography.weight || 700, lineHeight: cardTitleTypography.lineHeight || 1.25, color: cardTextPrimary, fontFamily: cardTitleFont, letterSpacing: '-0.02em', display: '-webkit-box', WebkitLineClamp: isMobileViewport ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</h4>
          <div style={{ position: 'relative', maxHeight: 40, overflow: 'hidden' }}>
            <p style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.4,
              color: cardTextSecondary,
              fontFamily: cardUiFont
            }}>
              {detailsCopy}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
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
              fontSize: isMobileViewport ? (actionTypography.mobile || 13) : (actionTypography.desktop || 15),
              fontWeight: actionTypography.weight || 700
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

export { SimpleProductCard };
