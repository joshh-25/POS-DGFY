import React from 'react';
import { Percent, Tag, Sparkles, Calendar } from 'lucide-react';

const cleanPromoText = (value) => String(value || '').trim();

export function StorefrontPromoSection({
  items,
  isMobileViewport,
  layoutVariant = 'feature',
  palette = 'orange',
  titleFontFamily,
  sectionPadding = null,
  collapseSpacing = false,
  contentMaxWidth = 1320,
  sectionBackground = '#ffffff'
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const isTeal = palette === 'teal';
  const isFnb = palette === 'fnb';

  /* ── Section & card colour tokens ── */
  const accentColor = isFnb ? '#f97316' : (isTeal ? '#0f766e' : '#1a4e8d');
  const accentDark  = isFnb ? '#c2410c' : (isTeal ? '#134e4a' : '#1e3a6e');
  const accentSoft  = isFnb ? '#16a34a' : accentColor;
  const accentTint  = isFnb ? '#fff7ed' : (isTeal ? '#ecfeff' : '#eef6fd');
  const cardBorder  = isFnb ? '#ffe4c8' : (isTeal ? '#99f6e4' : '#dbe5ee');

  return (
    <section
      style={{
        marginLeft: 'calc(50% - 50vw)',
        width: '100vw',
        marginTop: 0,
        marginBottom: 0,
        padding: sectionPadding || (isMobileViewport ? '16px 0 18px' : '20px 0 22px'),
        background: sectionBackground,
        display: 'grid',
        gap: 0,
        borderTop: `1px solid ${collapseSpacing ? '#edf2f7' : '#f1f5f9'}`,
        borderBottom: collapseSpacing ? 'none' : '1px solid #f1f5f9'
      }}
    >
      <div
        style={{
          maxWidth: contentMaxWidth,
          width: '100%',
          margin: '0 auto',
          paddingLeft: isMobileViewport ? 16 : 24,
          paddingRight: isMobileViewport ? 16 : 24,
          display: 'grid',
          gap: isFnb ? (isMobileViewport ? 18 : 24) : 14
        }}
      >
        {/* Section heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: isFnb ? 36 : 32,
              height: isFnb ? 36 : 32,
              borderRadius: 10,
              background: accentTint,
              border: `1px solid ${cardBorder}`,
              color: accentColor,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
          >
            <Tag size={15} strokeWidth={2.4} />
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: isFnb ? (isMobileViewport ? 24 : 36) : (isMobileViewport ? 18 : 22),
                fontWeight: isFnb ? 800 : 900,
                color: '#0f172a',
                fontFamily: titleFontFamily,
                lineHeight: isFnb ? 1.05 : 1.1
              }}
            >
              Current Promos
            </h2>
            <p style={{ margin: isFnb ? '4px 0 0 0' : 0, fontSize: isFnb ? (isMobileViewport ? 14 : 16) : 12, color: '#64748b', lineHeight: isFnb ? 1.35 : 1 }}>
              Limited-time offers available from this storefront.
            </p>
          </div>
        </div>

        {/* Promo cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileViewport ? '1fr' : (isFnb ? 'repeat(auto-fit, minmax(260px, 320px))' : 'repeat(auto-fill, minmax(300px, 1fr))'),
            gap: isMobileViewport ? 12 : (isFnb ? 18 : 14),
            justifyContent: isFnb ? 'start' : 'stretch',
          }}
        >
          {items.map((promoEntry, index) => {
            const badgeText      = cleanPromoText(promoEntry.badge);
            const titleText      = cleanPromoText(promoEntry.title);
            const headlineText   = cleanPromoText(promoEntry.headline);
            const subtitleText   = cleanPromoText(promoEntry.subtitle);
            const supportingText = cleanPromoText(promoEntry.supportingText);
            const validityText   = cleanPromoText(promoEntry.validityText);

            const title = titleText || badgeText || headlineText || 'Storefront Promo';
            const descriptionParts = [];
            if (headlineText && headlineText !== title) descriptionParts.push(headlineText);
            if (subtitleText && subtitleText !== title && !descriptionParts.includes(subtitleText)) descriptionParts.push(subtitleText);
            if (supportingText && !descriptionParts.includes(supportingText)) descriptionParts.push(supportingText);
            if (badgeText && badgeText !== title && !descriptionParts.includes(badgeText)) descriptionParts.push(badgeText);
            const description = descriptionParts.join(' | ') || 'Limited-time offer available in this storefront.';

            return (
              <article
                key={`promo-card-${index}`}
                style={{
                  borderRadius: 20,
                  border: `1px solid ${cardBorder}`,
                  background: '#ffffff',
                  boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  minHeight: isFnb ? 132 : 112,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  animation: layoutVariant === 'feature' ? 'promoCardFloatIn 380ms ease both' : undefined,
                  animationDelay: layoutVariant === 'feature' ? `${index * 80}ms` : undefined
                }}
                onMouseEnter={(e) => {
                  if (isMobileViewport) return;
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = `0 14px 30px rgba(15,23,42,0.10)`;
                }}
                onMouseLeave={(e) => {
                  if (isMobileViewport) return;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.06)';
                }}
              >
                {/* Left accent bar */}
                <div
                  style={{
                    width: isFnb ? 4 : 6,
                    flexShrink: 0,
                    background: isFnb ? accentColor : `linear-gradient(180deg, ${accentColor} 0%, ${accentDark} 100%)`,
                    borderRadius: '0'
                  }}
                />

                {/* Card body */}
                <div
                  style={{
                    flex: 1,
                    padding: isMobileViewport ? '14px 14px 12px' : (isFnb ? '18px 20px 16px' : '16px 18px 14px'),
                    display: 'grid',
                    gap: isFnb ? 10 : 8
                  }}
                >
                  {/* Top row: icon + badge pill + dot */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          background: accentTint,
                          border: `1px solid ${cardBorder}`,
                          color: accentColor,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0
                        }}
                      >
                        <Percent size={15} strokeWidth={2.5} />
                      </div>

                      {/* Badge pill */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px 3px 8px',
                          borderRadius: 999,
                          background: accentTint,
                          border: `1px solid ${cardBorder}`,
                          color: accentColor,
                          fontSize: isFnb ? 11 : 10,
                          fontWeight: isFnb ? 800 : 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.07em',
                          lineHeight: 1
                        }}
                      >
                        <Sparkles size={10} strokeWidth={2.4} />
                        {badgeText || 'Promo'}
                      </span>
                    </div>

                    {/* Live dot */}
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: accentSoft,
                        flexShrink: 0,
                        boxShadow: `0 0 0 3px ${accentTint}`
                      }}
                    />
                  </div>

                  {/* Headline & description */}
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div
                      style={{
                        fontSize: isFnb ? (isMobileViewport ? 24 : 30) : (isMobileViewport ? 20 : 24),
                        lineHeight: 1,
                        fontWeight: isFnb ? 800 : 900,
                        color: '#0f172a',
                        letterSpacing: '-0.03em',
                        fontFamily: titleFontFamily || 'inherit'
                      }}
                    >
                      {title}
                    </div>
                    <div style={{ fontSize: isFnb ? 13 : 12, lineHeight: 1.5, color: '#64748b', maxWidth: 500 }}>
                      {description}
                    </div>
                  </div>

                  {/* Validity pill */}
                  {validityText ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        width: 'fit-content',
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: isFnb ? 12 : 11,
                        fontWeight: 700
                      }}
                    >
                      <Calendar size={11} strokeWidth={2.5} color={accentColor} />
                      {validityText}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default StorefrontPromoSection;
