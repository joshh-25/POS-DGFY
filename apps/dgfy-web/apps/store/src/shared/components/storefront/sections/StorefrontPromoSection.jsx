import React, { useState } from 'react';
import { Calendar, Check, Copy, Tag } from 'lucide-react';

const cleanPromoText = (value) => String(value || '').trim();

const parseDiscountLabel = (raw) => {
  const text = cleanPromoText(raw);
  const match = text.match(/^(\d+(?:\.\d+)?\s*%)\s*(OFF)?$/i);
  if (match) return { top: match[1].replace(/\s+/, ''), bottom: match[2] ? 'OFF' : '' };
  const parts = text.split(/\s+/);
  return { top: parts[0] || 'PROMO', bottom: parts.slice(1).join(' ') };
};

const formatDiscountPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, '');
};

const resolveDiscountParts = (promoEntry, fallbackOffer) => {
  const discountPercent = formatDiscountPercent(promoEntry.discountPercent ?? promoEntry.discount_percent);
  if (discountPercent) return { top: `${discountPercent}%`, bottom: 'OFF', fromPercent: true };
  const parsed = parseDiscountLabel(fallbackOffer);
  if (/^\d+(?:\.\d+)?%$/i.test(parsed.top)) {
    return { ...parsed, fromPercent: true };
  }
  return { top: 'PROMO', bottom: '', fromPercent: false };
};

function PromoCard({
  promoEntry,
  index,
  isMobileViewport,
  accentColor,
  accentDark,
  accentTint,
  cardBorder,
  bodyFontFamily,
  titleFontFamily,
  activePromoCode
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const promoCode = cleanPromoText(promoEntry.promoCode || promoEntry.promo_code).toUpperCase();
  const title = cleanPromoText(promoEntry.title) || 'Storefront Promo';
  const offer = cleanPromoText(promoEntry.discountLabel) || cleanPromoText(promoEntry.headline) || title;
  const description = cleanPromoText(promoEntry.subtitle) || cleanPromoText(promoEntry.supportingText) || 'Limited-time offer available in this storefront.';
  const validity = cleanPromoText(promoEntry.validityText) || 'Limited time';
  const discount = resolveDiscountParts(promoEntry, offer);
  const promoLabel = title;
  const availabilityStatus = cleanPromoText(promoEntry.availabilityStatus || promoEntry.availability_status || 'available') || 'available';
  const isUnavailable = availabilityStatus !== 'available';
  const availabilityMessage = cleanPromoText(promoEntry.availabilityMessage) || 'Unavailable outside the scheduled promo window.';
  const isApplied = Boolean(promoCode) && promoCode === cleanPromoText(activePromoCode).toUpperCase();
  const cardMinHeight = isMobileViewport ? 184 : 178;

  const copyCode = async (event) => {
    event.stopPropagation();
    if (!promoCode) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promoCode);
      } else {
        const input = document.createElement('textarea');
        input.value = promoCode;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      setDidCopy(true);
      window.setTimeout(() => setDidCopy(false), 1800);
    } catch {
      setDidCopy(false);
    }
  };

  const faceStyle = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    borderRadius: isMobileViewport ? 20 : 24,
    overflow: 'hidden'
  };

  return (
    <div style={{ minHeight: cardMinHeight, perspective: '1200px' }}>
      <div
        style={{
          position: 'relative',
          minHeight: cardMinHeight,
          transformStyle: 'preserve-3d',
          transition: 'transform 560ms cubic-bezier(0.2, 0.72, 0.2, 1)',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          animation: `promoCardFloatIn 380ms ease ${index * 80}ms both`
        }}
      >
        <div
          role="button"
          tabIndex={isUnavailable ? -1 : 0}
          aria-label={isUnavailable ? `${title} is unavailable` : `Show promo code for ${title}`}
          aria-pressed={isFlipped}
          onClick={() => setIsFlipped(true)}
          onKeyDown={(event) => {
            if (isUnavailable) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsFlipped(true);
            }
          }}
          style={{
            ...faceStyle,
            display: 'flex',
            padding: 0,
            border: 'none',
            textAlign: 'left',
            cursor: isUnavailable ? 'not-allowed' : 'pointer',
            background: '#ffffff',
            boxShadow: `inset 0 0 0 1px ${cardBorder}, 0 4px 16px rgba(0,0,0,0.08)`,
            color: '#0f172a',
            opacity: isUnavailable ? 0.58 : 1,
            filter: isUnavailable ? 'grayscale(1)' : 'none'
          }}
        >
          <div style={{
            width: isMobileViewport ? 112 : 148,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            background: `linear-gradient(145deg, ${accentColor}, ${accentDark})`,
            color: '#ffffff',
            textAlign: 'center',
            padding: 12
          }}>
            <div>
              <div style={{ fontSize: isMobileViewport ? 34 : 48, fontWeight: 900, lineHeight: 0.95 }}>{discount.top}</div>
              {discount.bottom ? <div style={{ marginTop: 5, fontSize: isMobileViewport ? 15 : 21, fontWeight: 800, letterSpacing: '0.08em' }}>{discount.bottom}</div> : null}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'grid', alignContent: 'center', gap: 9, padding: isMobileViewport ? '16px 17px' : '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: accentColor, fontSize: 12, fontWeight: 900, fontFamily: bodyFontFamily, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%', background: accentTint }}><Tag size={14} /></span>
                  <span>{promoLabel}</span>
                </span>
              </div>
              {isApplied ? (
                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', minHeight: 34, padding: '0 14px', borderRadius: 999, border: `1px solid ${accentColor}`, color: accentColor, background: '#ffffff', fontSize: 12, fontWeight: 900, fontFamily: bodyFontFamily }}>
                  Applied
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: isMobileViewport ? 16 : 19, fontWeight: 800, lineHeight: 1.25, fontFamily: titleFontFamily }}>{description}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', color: '#166534', fontSize: 12, fontWeight: 700, fontFamily: bodyFontFamily }}>
              {promoCode ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 26, padding: '0 10px', borderRadius: 999, background: '#fff7ed', border: '1px solid #fed7aa', color: accentDark, fontSize: 11, fontWeight: 800 }}>
                  <span style={{ color: '#9a3412', fontWeight: 700 }}>Promo Code:</span>
                  <span>{promoCode}</span>
                </span>
              ) : null}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 26, padding: '0 10px', borderRadius: 999, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <Calendar size={14} /> {validity}
              </span>
            </div>
            {isUnavailable ? <span style={{ color: '#64748b', fontSize: 11, fontWeight: 800, fontFamily: bodyFontFamily }}>{availabilityMessage}</span> : null}
          </div>
        </div>

        <section
          aria-label={`${title} promo code`}
          style={{
            ...faceStyle,
            display: 'grid',
            alignContent: 'center',
            gap: 14,
            padding: isMobileViewport ? 18 : 24,
            boxSizing: 'border-box',
            transform: 'rotateY(180deg)',
            background: `linear-gradient(135deg, ${accentDark}, ${accentColor})`,
            color: '#ffffff',
            boxShadow: `inset 0 0 0 1px ${accentColor}, 0 4px 16px rgba(0,0,0,0.12)`
          }}
        >
          <div style={{ fontFamily: bodyFontFamily, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.82 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px dashed rgba(255,255,255,0.72)', borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.1)' }}>
            <code style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: isMobileViewport ? 17 : 21, fontWeight: 900, letterSpacing: '0.08em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{promoCode || 'NO CODE'}</code>
            {promoCode ? <button type="button" onClick={copyCode} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', background: '#ffffff', color: accentDark, fontSize: 12, fontWeight: 800 }}>{didCopy ? <Check size={15} /> : <Copy size={15} />}{didCopy ? 'Copied' : 'Copy'}</button> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setIsFlipped(false)} style={{ border: '1px solid rgba(255,255,255,0.65)', borderRadius: 999, padding: '7px 12px', background: 'transparent', color: '#ffffff', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>Back</button>
            {isApplied ? <span style={{ fontSize: 12, fontWeight: 800 }}>Applied</span> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export function StorefrontPromoSection({
  items,
  isMobileViewport,
  palette = 'orange',
  titleFontFamily,
  bodyFontFamily,
  sectionPadding = null,
  collapseSpacing = false,
  contentMaxWidth = 1320,
  sectionBackground = '#ffffff',
  mobileTrailingInset = 0,
  titleSize = null,
  subtitleSize = null,
  activePromoCode = ''
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const isTeal = palette === 'teal';
  const isFnb = palette === 'fnb';
  const accentColor = isFnb ? '#f97316' : (isTeal ? '#0f766e' : '#1a4e8d');
  const accentDark = isFnb ? '#c2410c' : (isTeal ? '#134e4a' : '#1e3a6e');
  const accentTint = isFnb ? '#fff7ed' : (isTeal ? '#ecfeff' : '#eef6fd');
  const cardBorder = isFnb ? '#ffe4c8' : (isTeal ? '#99f6e4' : '#dbe5ee');

  return (
    <section style={{ marginLeft: isMobileViewport ? 0 : 'calc(50% - 50vw)', width: isMobileViewport ? '100%' : '100vw', padding: sectionPadding || (isMobileViewport ? '32px 0' : '48px 0'), background: sectionBackground, borderTop: `1px solid ${collapseSpacing ? '#edf2f7' : '#f1f5f9'}`, borderBottom: collapseSpacing ? 'none' : '1px solid #f1f5f9' }}>
      <div style={{ maxWidth: contentMaxWidth, width: '100%', margin: '0 auto', paddingLeft: isMobileViewport ? 16 : 24, paddingRight: isMobileViewport ? 16 + Math.max(0, Number(mobileTrailingInset) || 0) : 24, boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gap: 6, marginBottom: isMobileViewport ? 16 : 24 }}>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: titleSize || (isMobileViewport ? 28 : 36), fontWeight: 800, lineHeight: 1.08, fontFamily: titleFontFamily }}>Current Promos</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: subtitleSize || (isMobileViewport ? 14 : 16), lineHeight: 1.45, fontFamily: bodyFontFamily }}>Limited-time offers available from this storefront.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(auto-fill, minmax(360px, 580px))', gap: isMobileViewport ? 16 : 20, justifyContent: 'start' }}>
          {items.map((promoEntry, index) => <PromoCard key={promoEntry.promoCode || promoEntry.promo_code || `${promoEntry.title}-${index}`} {...{ promoEntry, index, isMobileViewport, accentColor, accentDark, accentTint, cardBorder, bodyFontFamily, titleFontFamily, activePromoCode }} />)}
        </div>
      </div>
    </section>
  );
}

export default StorefrontPromoSection;
