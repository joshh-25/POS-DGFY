import React from 'react';
import { Percent, Sparkles, Calendar, Tag, Coffee, Utensils } from 'lucide-react';

const cleanPromoText = (value) => String(value || '').trim();

/* ── Parse "10% OFF" → { top: "10%", bottom: "OFF" } ── */
const parseDiscountLabel = (raw) => {
  const text = String(raw || '').trim();
  // Match "10% OFF" or "10%OFF" or "10%" patterns
  const m = text.match(/^(\d+(?:\.\d+)?\s*%)\s*(OFF)?$/i);
  if (m) return { top: m[1].replace(/\s+/, ''), bottom: m[2] ? 'OFF' : '' };
  // Match "FREE" or standalone words
  const parts = text.split(/\s+/);
  if (parts.length >= 2) return { top: parts[0], bottom: parts.slice(1).join(' ') };
  return { top: text, bottom: '' };
};

export function StorefrontPromoSection({
  items,
  onPromoSelect,
  isMobileViewport,
  layoutVariant = 'feature',
  palette = 'orange',
  titleFontFamily,
  bodyFontFamily,
  sectionPadding = null,
  collapseSpacing = false,
  contentMaxWidth = 1320,
  sectionBackground = '#ffffff',
  mobileTrailingInset = 0,
  titleSize = null,
  subtitleSize = null
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const isTeal = palette === 'teal';
  const isFnb  = palette === 'fnb';

  /* ── Section & card colour tokens ── */
  const accentColor = isFnb ? '#f97316' : (isTeal ? '#0f766e' : '#1a4e8d');
  const accentDark  = isFnb ? '#c2410c' : (isTeal ? '#134e4a' : '#1e3a6e');
  const accentSoft  = isFnb ? '#16a34a' : accentColor;
  const accentTint  = isFnb ? '#fff7ed' : (isTeal ? '#ecfeff' : '#eef6fd');
  const cardBorder  = isFnb ? '#ffe4c8' : (isTeal ? '#99f6e4' : '#dbe5ee');
  const mobileTrailingSpace = Math.max(0, Number(mobileTrailingInset) || 0);
  const mobileContentPaddingRight = 16 + mobileTrailingSpace;

  return (
    <section
      style={{
        marginLeft: isMobileViewport ? 0 : 'calc(50% - 50vw)',
        width: isMobileViewport ? '100%' : '100vw',
        marginTop: 0,
        marginBottom: 0,
        padding: sectionPadding || (isMobileViewport ? '32px 0' : '48px 0'),
        background: sectionBackground,
        display: 'grid',
        gap: 0,
        boxSizing: 'border-box',
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
          paddingRight: isMobileViewport ? mobileContentPaddingRight : 24,
          boxSizing: 'border-box',
          display: 'grid',
          gap: isMobileViewport ? 16 : 24
        }}
      >
        {/* Section heading */}
        <div style={{ display: 'grid', gap: 6 }}>
          <h2
            style={{
              margin: 0,
              fontSize: titleSize || (isMobileViewport ? 28 : 36),
              fontWeight: 800,
              color: '#0f172a',
              fontFamily: titleFontFamily,
              lineHeight: 1.08
            }}
          >
            Current Promos
          </h2>
          <p style={{ margin: 0, fontSize: subtitleSize || (isMobileViewport ? 14 : 16), color: '#64748b', lineHeight: 1.45, fontFamily: bodyFontFamily }}>
            Limited-time offers available from this storefront.
          </p>
        </div>

        {/* Promo cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(auto-fill, minmax(360px, 580px))',
            gap: isMobileViewport ? 16 : 20,
            justifyContent: 'start',
          }}
        >
          {items.map((promoEntry, index) => {
            const badgeText      = cleanPromoText(promoEntry.badge);
            const promoCode      = cleanPromoText(promoEntry.promoCode).toUpperCase();
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

            const promoBadgeLabel    = badgeText || titleText || 'Promo';
            const promoOfferLabel    = headlineText || titleText || badgeText || 'Special Offer';
            const promoDescLabel     = subtitleText || supportingText || description;
            const validityBadgeLabel = validityText || 'Limited time';

            /* ─────────────────────────────────────────────────
               Modern food-delivery coupon style (applied universally)
            ───────────────────────────────────────────────── */
            /* Sizing tokens */
            const leftW    = isMobileViewport ? 110 : 148;
            const notchR   = isMobileViewport ? 13 : 15;
            const cardMinH = isMobileViewport ? 138 : 164;
            const disc     = parseDiscountLabel(promoOfferLabel);
            const isClickable = typeof onPromoSelect === 'function' && Boolean(promoCode);

            return (
              <article
                key={`promo-wrap-${index}`}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                aria-label={isClickable ? `Apply promo code ${promoCode}` : undefined}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  minHeight: cardMinH,
                  borderRadius: isMobileViewport ? 20 : 24,
                  background: '#ffffff',
                  // Use inset box shadow instead of border so inner notches can sit "on top" of the stroke
                  boxShadow: `inset 0 0 0 1px ${cardBorder}, 0 4px 16px rgba(0,0,0,0.08)`,
                  overflow: 'hidden',
                  transition: 'transform 0.22s ease, box-shadow 0.22s ease',
                  cursor: isClickable ? 'pointer' : 'default',
                  animation: layoutVariant === 'feature' ? 'promoCardFloatIn 380ms ease both' : undefined,
                  animationDelay: layoutVariant === 'feature' ? `${index * 80}ms` : undefined,
                }}
                onClick={() => {
                  if (isClickable) onPromoSelect(promoCode);
                }}
                onKeyDown={(event) => {
                  if (!isClickable) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPromoSelect(promoCode);
                  }
                }}
                onMouseEnter={(e) => {
                  if (isMobileViewport) return;
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${cardBorder}, 0 12px 32px rgba(0,0,0,0.13)`;
                }}
                onMouseLeave={(e) => {
                  if (isMobileViewport) return;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${cardBorder}, 0 4px 16px rgba(0,0,0,0.08)`;
                }}
              >
                {/* ── Left inner notch (ticket punch) ── */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: -notchR,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: notchR * 2,
                    height: notchR * 2,
                    borderRadius: '50%',
                    background: sectionBackground,
                    boxShadow: `inset 0 0 0 1px ${cardBorder}`,
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                />
                {/* ── Right inner notch (ticket punch) ── */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: -notchR,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: notchR * 2,
                    height: notchR * 2,
                    borderRadius: '50%',
                    background: sectionBackground,
                    boxShadow: `inset 0 0 0 1px ${cardBorder}`,
                    zIndex: 10,
                    pointerEvents: 'none',
                  }}
                />

                {/* ── LEFT: Theme colored discount panel ── */}
                <div
                  style={{
                    position: 'relative',
                    width: leftW,
                    flexShrink: 0,
                    background: `linear-gradient(145deg, ${accentColor} 0%, ${accentDark} 100%)`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: isMobileViewport ? '14px 10px' : '20px 14px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Soft radial highlight top-left */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'radial-gradient(circle at 28% 18%, rgba(255,255,255,0.22) 0%, transparent 55%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Watermark F&B icons — low opacity bottom-right */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      bottom: isMobileViewport ? 6 : 10,
                      right: isMobileViewport ? 6 : 10,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: isMobileViewport ? 3 : 5,
                      opacity: 0.14,
                      color: '#ffffff',
                      transform: 'rotate(-8deg)',
                      pointerEvents: 'none',
                    }}
                  >
                    <Coffee   size={isMobileViewport ? 22 : 30} strokeWidth={1.4} />
                    <Utensils size={isMobileViewport ? 20 : 26} strokeWidth={1.4} />
                  </div>

                  {/* Perforated seam on right edge */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      width: 2,
                      background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.38) 0px, rgba(255,255,255,0.38) 5px, transparent 5px, transparent 10px)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Discount text */}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      textAlign: 'center',
                      color: '#ffffff',
                      fontFamily: titleFontFamily || 'inherit',
                      userSelect: 'none',
                    }}
                  >
                    <div
                      style={{
                        fontSize: isMobileViewport ? 36 : 48,
                        fontWeight: 900,
                        lineHeight: 0.92,
                        letterSpacing: '-0.04em',
                      }}
                    >
                      {disc.top}
                    </div>
                    {disc.bottom && (
                      <div
                        style={{
                          fontSize: isMobileViewport ? 17 : 23,
                          fontWeight: 800,
                          lineHeight: 1.15,
                          letterSpacing: '0.08em',
                          marginTop: isMobileViewport ? 4 : 6,
                        }}
                      >
                        {disc.bottom}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── RIGHT: Content panel ── */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: isMobileViewport ? 7 : 10,
                    padding: isMobileViewport ? '13px 14px 13px 18px' : '18px 22px 18px 22px',
                    minWidth: 0,
                    background: '#ffffff',
                  }}
                >
                  {/* Promo badge row: colored circle icon + label */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <div
                      style={{
                        width: isMobileViewport ? 26 : 30,
                        height: isMobileViewport ? 26 : 30,
                        borderRadius: '50%',
                        background: accentTint,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Tag size={isMobileViewport ? 12 : 14} color={accentColor} strokeWidth={2.2} />
                    </div>
                    <span
                      style={{
                        fontSize: isMobileViewport ? 10 : 12,
                        fontWeight: 600,
                        color: accentColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontFamily: bodyFontFamily,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {promoBadgeLabel}
                    </span>
                  </div>

                  {/* Main offer description — largest text, 2-line clamp */}
                  <div
                    style={{
                      fontSize: isMobileViewport ? 15 : 19,
                      fontWeight: 700,
                      color: '#0F172A',
                      lineHeight: 1.3,
                      letterSpacing: '-0.02em',
                      fontFamily: titleFontFamily || 'inherit',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {promoDescLabel}
                  </div>

                  {/* Thin dashed divider */}
                  <div
                    style={{
                      borderTop: '1px dashed rgba(0,0,0,0.1)',
                      flexShrink: 0,
                    }}
                  />

                  {/* Validity pill — green, left-aligned */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignSelf: 'flex-start',
                      alignItems: 'center',
                      gap: 5,
                      padding: isMobileViewport ? '4px 9px' : '5px 11px',
                      borderRadius: 999,
                      background: '#EAF8EC',
                      border: '1px solid #BBF7D0',
                      color: '#166534',
                      fontSize: isMobileViewport ? 10 : 12,
                      fontWeight: 600,
                      lineHeight: 1,
                      fontFamily: bodyFontFamily,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Calendar size={isMobileViewport ? 11 : 12} strokeWidth={2} color="#166534" />
                    {validityBadgeLabel}
                  </span>
                  {promoCode ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignSelf: 'flex-start',
                        marginTop: 2,
                        fontSize: isMobileViewport ? 11 : 12,
                        fontWeight: 800,
                        color: accentColor,
                        fontFamily: bodyFontFamily
                      }}
                    >
                      Click to apply {promoCode}
                    </span>
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
