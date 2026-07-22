import React, { useState } from 'react';
import { Plus, ShoppingCart, Sparkles } from 'lucide-react';

const FnbProductCard = ({
  FNB_CATEGORY_ICON_MAP,
  available,
  addToCart,
  buttonTextOnAccent,
  fnbViewMode,
  getCartFlySourceRect,
  heroTheme,
  imageUrl,
  isMobileViewport,
  item,
  money,
  onViewDetails
}) => {
  const sectionVisualMeta = item.sectionVisualMeta || {};
  const accent = heroTheme.accent || '#c96a2b';
  const accentSoft = sectionVisualMeta.accentSoft || heroTheme.accentSoft || '#fff7ed';
  const accentDeep = heroTheme.accentDark || '#7c2d12';
  const cardSurface = '#ffffff';
  const cardBorder = heroTheme.borderSoft || '#edd4bc';
  const cardTextPrimary = heroTheme.textPrimary || '#2f1f16';
  const CategoryIcon = FNB_CATEGORY_ICON_MAP[sectionVisualMeta.iconToken] || Sparkles;
  const [isHovered, setIsHovered] = useState(false);
  const [isDetailsHovered, setIsDetailsHovered] = useState(false);
  const [isCartHovered, setIsCartHovered] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (imageUrl !== prevImageUrl) {
    setPrevImageUrl(imageUrl);
    setHasImageError(false);
  }
  const detailsCopy = item.descriptionPreview || 'Menu item available in this storefront.';
  const cardUiFont = heroTheme.bodyFont || "'Trebuchet MS', 'Segoe UI', sans-serif";
  const cardTitleFont = heroTheme.displayFont || cardUiFont;
  const canRenderImage = Boolean(imageUrl) && !hasImageError;
  const availabilityTone = item.availabilityMeta?.tone || (available ? 'ready' : 'sold_out');
  const availabilityColor = availabilityTone === 'sold_out' ? '#be123c' : availabilityTone === 'limited' ? '#b45309' : '#047857';

  if (isMobileViewport && fnbViewMode === 'list') {
    return (
      <article
        data-cart-fly-origin="true"
        style={{
          background: '#fff',
          borderRadius: 20,
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
          height: 148,
          minHeight: 148,
          maxHeight: 148,
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{ width: 118, height: 118, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: '#f8fafc', position: 'relative', cursor: 'pointer' }}
          onClick={() => onViewDetails?.(item)}
        >
          {canRenderImage ? (
            <img src={imageUrl} alt={item.name} onError={() => setHasImageError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
              <CategoryIcon size={32} />
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
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 900,
            boxShadow: '0 4px 12px rgba(217,119,6,0.3)',
            fontFamily: cardUiFont,
            lineHeight: 1
          }}>
            {money(item.default_sale_price ?? 0)}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '2px 0', minWidth: 0 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, fontFamily: cardTitleFont, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {item.name}
            </h4>
            <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.4, fontFamily: cardUiFont, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {detailsCopy}
            </p>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
              <button
                type="button"
                onClick={() => onViewDetails?.(item)}
                style={{
                  height: 38,
                  padding: '0 10px',
                  borderRadius: 18,
                  border: '1px solid #22c55e',
                  background: 'transparent',
                  color: '#15803d',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  flex: 1,
                  fontFamily: cardUiFont
                }}
              >
                View Details
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  addToCart(item, { sourceRect: getCartFlySourceRect(event) });
                }}
                disabled={!available}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: available ? '#16a34a' : '#e2e8f0',
                  color: '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: available ? 'pointer' : 'not-allowed',
                  flexShrink: 0
                }}
              >
                <span style={{ position: 'relative', display: 'flex' }}>
                  <ShoppingCart size={18} strokeWidth={2.2} />
                  <span style={{ position: 'absolute', top: -4, right: -4, background: '#fff', color: '#16a34a', borderRadius: '50%', width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={8} strokeWidth={4} />
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  const cardTitleFontSize = isMobileViewport ? 16 : 22;
  const imageHeight = isMobileViewport ? 140 : 214;
  const actionHeight = isMobileViewport ? 36 : 46;
  const cartButtonWidth = isMobileViewport ? 42 : 70;

  return (
    <article
      data-cart-fly-origin="true"
      style={{
        background: cardSurface,
        borderRadius: isMobileViewport ? 20 : 28,
        padding: 0,
        boxShadow: isHovered ? '0 22px 44px rgba(73, 38, 20, 0.14)' : '0 14px 32px rgba(73, 38, 20, 0.09)',
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
        style={{ position: 'relative', width: '100%', height: imageHeight, overflow: 'hidden', borderRadius: isMobileViewport ? '0 0 16px 16px' : '0 0 22px 22px', cursor: 'pointer' }}
        onClick={() => onViewDetails?.(item)}
      >
        {canRenderImage ? (
          <img src={imageUrl} alt={item.name} onError={() => setHasImageError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
                boxShadow: '0 12px 24px rgba(73,38,20,0.08)'
              }}>
                <CategoryIcon size={isMobileViewport ? 24 : 28} />
              </div>
              <div style={{ fontSize: 14, letterSpacing: '-0.01em', display: isMobileViewport ? 'none' : 'block' }}>{item.sectionLabel || item.productKind || 'Menu Item'}</div>
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(35,23,18,0.02) 0%, rgba(35,23,18,0.08) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0) 44%, rgba(32,20,15,0.22) 100%)', pointerEvents: 'none' }} />
        <div style={{
          position: 'absolute',
          right: isMobileViewport ? 10 : 16,
          bottom: isMobileViewport ? 10 : 16,
          background: accent,
          color: buttonTextOnAccent,
          padding: isMobileViewport ? '6px 10px' : '9px 16px',
          borderRadius: 999,
          fontSize: isMobileViewport ? 13 : 15,
          fontWeight: 900,
          boxShadow: isHovered ? '0 12px 26px rgba(217,119,6,0.32)' : '0 10px 22px rgba(217,119,6,0.24)',
          transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.2s ease',
          fontFamily: cardUiFont,
          lineHeight: 1
        }}>
          {money(item.default_sale_price ?? 0)}
        </div>
      </div>
      <div style={{ padding: isMobileViewport ? '12px 12px 12px' : '18px 18px 16px', flex: 1, display: 'grid', gap: isMobileViewport ? 8 : 14 }}>
        <div style={{ display: 'grid', gap: isMobileViewport ? 4 : 8 }}>
          <h4 style={{ margin: 0, fontSize: cardTitleFontSize, fontWeight: 800, lineHeight: 1.15, color: cardTextPrimary, fontFamily: cardTitleFont, letterSpacing: '-0.025em', display: '-webkit-box', WebkitLineClamp: isMobileViewport ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.name}</h4>
          <div style={{ position: 'relative', maxHeight: 40, overflow: 'hidden' }}>
            <p style={{
              margin: 0,
              fontSize: isMobileViewport ? 14 : 14,
              lineHeight: 1.4,
              color: '#475569',
              fontFamily: cardUiFont
            }}>
              {detailsCopy}
            </p>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 24,
              background: `linear-gradient(to top, ${cardSurface} 0%, transparent 100%)`,
              pointerEvents: 'none'
            }} />
          </div>
        </div>
        <div style={{
          marginTop: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
          paddingTop: 8
        }}>
          <button
            type="button"
            onClick={() => onViewDetails?.(item)}
            onMouseEnter={() => setIsDetailsHovered(true)}
            onMouseLeave={() => setIsDetailsHovered(false)}
            style={{
              minHeight: actionHeight,
              height: actionHeight,
              borderRadius: isMobileViewport ? 12 : 18,
              border: '1px solid #22C55E',
              background: '#ffffff',
              fontSize: isMobileViewport ? 12 : 15,
              fontWeight: 700,
              color: '#15803d',
              cursor: 'pointer',
              fontFamily: cardUiFont,
              transform: isDetailsHovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'all 0.2s ease',
              padding: isMobileViewport ? '0 8px' : '0 18px',
              boxShadow: 'none',
              width: '100%'
            }}
          >
            View Details
          </button>
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
              width: cartButtonWidth,
              minHeight: actionHeight,
              height: actionHeight,
              borderRadius: isMobileViewport ? 12 : 18,
              border: 'none',
              background: available ? '#16a34a' : '#e5e7eb',
              color: buttonTextOnAccent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: available ? 'pointer' : 'not-allowed',
              boxShadow: 'none',
              transform: available && isCartHovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'all 0.2s ease',
              padding: isMobileViewport ? '0' : '0 14px',
              fontFamily: cardUiFont,
              fontSize: 14,
              fontWeight: 800
            }}
          >
            <span style={{ position: 'relative', width: isMobileViewport ? 18 : 24, height: isMobileViewport ? 18 : 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCart size={isMobileViewport ? 16 : 20} strokeWidth={2.2} />
              <span style={{
                position: 'absolute',
                top: -3,
                right: -4,
                width: isMobileViewport ? 10 : 14,
                height: isMobileViewport ? 10 : 14,
                borderRadius: 999,
                background: '#ffffff',
                color: available ? '#22C55E' : '#94a3b8',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'none'
              }}>
                <Plus size={isMobileViewport ? 8 : 10} strokeWidth={3} />
              </span>
            </span>
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

export { FnbProductCard };
