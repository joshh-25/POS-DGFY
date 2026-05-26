import React from 'react';
import { Sparkles } from 'lucide-react';

export function StorefrontPromoSection({
  items,
  isMobileViewport,
  layoutVariant = 'feature',
  palette = 'orange',
  titleFontFamily
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const isTeal = palette === 'teal';
  const sectionBackground = isTeal ? 'linear-gradient(180deg, #f4fffd 0%, #ffffff 100%)' : 'linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)';
  const sectionBorderTop = isTeal ? '1px solid #99f6e4' : '1px solid #fed7aa';
  const sectionBorderBottom = isTeal ? '1px solid #d8f3ef' : '1px solid #ffedd5';
  const cardBorder = isTeal ? '#99f6e4' : '#fed7aa';
  const cardBackground = isTeal ? 'linear-gradient(135deg, #ffffff 0%, #f5fffd 58%, #ecfeff 100%)' : 'linear-gradient(135deg, #ffffff 0%, #fffaf5 58%, #fff7ed 100%)';
  const cardShadow = isTeal ? '0 14px 28px rgba(15, 118, 110, 0.10)' : '0 14px 28px rgba(249, 115, 22, 0.10)';
  const hoverShadow = isTeal ? '0 22px 36px rgba(15, 118, 110, 0.16)' : '0 22px 36px rgba(249, 115, 22, 0.16)';
  const accentGradient = isTeal ? 'linear-gradient(180deg, #14b8a6 0%, #0f766e 100%)' : 'linear-gradient(180deg, #fb923c 0%, #f97316 100%)';
  const accentGlow = isTeal ? '0 0 22px rgba(15, 118, 110, 0.22)' : '0 0 22px rgba(249, 115, 22, 0.25)';
  const iconBorder = isTeal ? '#99f6e4' : '#fdba74';
  const iconBackground = isTeal ? '#ecfeff' : '#fff7ed';
  const iconColor = isTeal ? '#0f766e' : '#f97316';
  const dividerColor = isTeal ? '#d8f3ef' : '#d4d4d8';
  const headlineColor = isTeal ? '#0f766e' : '#f97316';

  return (
    <section
      style={{
        marginLeft: 'calc(50% - 50vw)',
        width: '100vw',
        marginTop: isMobileViewport ? 20 : 28,
        padding: isMobileViewport ? '24px 0 20px' : '32px 0 26px',
        background: sectionBackground,
        borderTop: sectionBorderTop,
        borderBottom: sectionBorderBottom,
        display: 'grid',
        gap: 14
      }}
    >
      <div
        style={{
          maxWidth: 1220,
          width: '100%',
          margin: '0 auto',
          paddingLeft: isMobileViewport ? 16 : 24,
          paddingRight: isMobileViewport ? 16 : 24,
          display: 'grid',
          gap: 14
        }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: isMobileViewport ? 22 : 26, fontWeight: 900, color: '#0f172a', fontFamily: titleFontFamily }}>
            Current Promos
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Limited-time offers available from this storefront.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 18
          }}
        >
          {items.map((promoEntry, index) => (
            <article
              key={`promo-card-${index}`}
              style={{
                position: 'relative',
                borderRadius: 26,
                border: `1px solid ${cardBorder}`,
                background: cardBackground,
                boxShadow: cardShadow,
                padding: isMobileViewport ? '18px 16px' : '18px 20px',
                display: 'grid',
                gap: 14,
                overflow: 'hidden',
                transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
                animation: layoutVariant === 'feature' ? 'promoCardFloatIn 420ms ease both' : undefined,
                animationDelay: layoutVariant === 'feature' ? `${index * 90}ms` : undefined
              }}
              onMouseEnter={(event) => {
                if (isMobileViewport || layoutVariant !== 'feature') return;
                event.currentTarget.style.transform = 'translateY(-4px)';
                event.currentTarget.style.boxShadow = hoverShadow;
                event.currentTarget.style.borderColor = iconColor;
              }}
              onMouseLeave={(event) => {
                if (isMobileViewport || layoutVariant !== 'feature') return;
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = cardShadow;
                event.currentTarget.style.borderColor = cardBorder;
              }}
            >
              {layoutVariant === 'feature' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: '0 auto 0 0',
                    width: 4,
                    background: accentGradient,
                    boxShadow: accentGlow
                  }}
                />
              )}

              {layoutVariant === 'feature' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        border: `1px solid ${iconBorder}`,
                        background: iconBackground,
                        color: iconColor,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0
                      }}
                    >
                      <Sparkles size={17} />
                    </div>
                    <div style={{ fontSize: isMobileViewport ? 14 : 16, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', lineHeight: 1.2 }}>
                      {promoEntry.title || promoEntry.badge || 'Promo'}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(96px, 124px) minmax(0, 1fr)',
                      gap: isMobileViewport ? 12 : 14,
                      alignItems: 'stretch'
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        alignContent: 'center',
                        justifyItems: 'start',
                        paddingRight: isMobileViewport ? 0 : 14,
                        borderRight: isMobileViewport ? 'none' : `1px solid ${dividerColor}`
                      }}
                    >
                      <div style={{ fontSize: isMobileViewport ? 38 : 48, fontWeight: 900, lineHeight: 0.92, color: headlineColor, letterSpacing: '-0.04em' }}>
                        {promoEntry.headline || promoEntry.badge || 'Promo'}
                      </div>
                    </div>

                    <div style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0 }}>
                      <div style={{ fontSize: isMobileViewport ? 18 : 20, fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>
                        {promoEntry.subtitle || 'Storefront offer'}
                      </div>
                      {promoEntry.supportingText && (
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {promoEntry.supportingText}
                        </div>
                      )}
                      {promoEntry.validityText && (
                        <div style={{ fontSize: 13, color: '#6b7280' }}>
                          {promoEntry.validityText}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 900, color: headlineColor, textTransform: 'uppercase' }}>
                    {promoEntry.title || promoEntry.badge || 'Promo'}
                  </div>
                  <div style={{ fontSize: isMobileViewport ? 34 : 42, fontWeight: 900, color: '#0f172a', lineHeight: 0.95 }}>
                    {promoEntry.headline || promoEntry.badge || 'Promo'}
                  </div>
                  <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 800, color: '#111827' }}>
                    {promoEntry.subtitle || 'Storefront offer'}
                  </div>
                  {promoEntry.supportingText && (
                    <div style={{ fontSize: 14, color: '#374151' }}>{promoEntry.supportingText}</div>
                  )}
                  {promoEntry.validityText && (
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{promoEntry.validityText}</div>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default StorefrontPromoSection;
