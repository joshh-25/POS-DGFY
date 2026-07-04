const normalizePromoCode = (value = '') => String(value || '').trim().toUpperCase().slice(0, 40);

export function PromoCodePanel({
  code = '',
  onChange,
  onClear,
  compact = false,
  accentColor = '#0f766e',
  bodyFont = "'Avenir Next', 'Segoe UI', sans-serif",
  promoMeta = null,
  statusMessage = '',
  statusTone = 'neutral'
}) {
  const normalizedCode = normalizePromoCode(code);
  const hasCode = normalizedCode.length > 0;
  const tonePalette = statusTone === 'success'
    ? { border: '#bbf7d0', background: '#f0fdf4', text: '#166534' }
    : (statusTone === 'error'
      ? { border: '#fecaca', background: '#fef2f2', text: '#b91c1c' }
      : { border: '#e2e8f0', background: '#ffffff', text: '#64748b' });
  const discountLabel = String(promoMeta?.discountValue || '').trim();
  const usageLabel = String(promoMeta?.usageLabel || '').trim();
  const timeLabel = String(promoMeta?.timeRangeLabel || '').trim();

  return (
    <section
      aria-label="Promo code"
      data-storefront-promo-code-panel="true"
      style={{
        border: `1px solid ${hasCode ? '#fed7aa' : '#e2e8f0'}`,
        borderRadius: compact ? 14 : 16,
        background: hasCode ? '#fff7ed' : '#ffffff',
        padding: compact ? 12 : 14,
        display: 'grid',
        gap: compact ? 10 : 12,
        minWidth: 0,
        fontFamily: bodyFont
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Promo Code</div>
          <div style={{ marginTop: 3, fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
            {discountLabel
              ? `Enter the promo code for ${discountLabel}${timeLabel ? ` • ${timeLabel}` : ''}.`
              : 'Add a promo code if the store provides one.'}
          </div>
        </div>
        <span style={{ borderRadius: 999, background: '#ffffff', border: `1px solid ${hasCode ? '#fed7aa' : '#e2e8f0'}`, color: hasCode ? '#c2410c' : '#64748b', padding: '5px 9px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {hasCode ? 'Code entered' : 'No code entered'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
        <input
          value={code}
          onChange={(event) => onChange?.(normalizePromoCode(event.target.value))}
          placeholder="Enter promo code"
          aria-label="Enter promo code"
          maxLength={40}
          autoComplete="off"
          style={{ minHeight: 44, minWidth: 0, width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', padding: '0 12px', color: '#0f172a', fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}
        />
      </div>

      {(discountLabel || usageLabel || timeLabel) ? (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: '9px 10px', display: 'grid', gap: 5, minWidth: 0 }}>
          {discountLabel ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#334155' }}><span>Discount</span><strong style={{ color: '#0f172a' }}>{discountLabel}</strong></div> : null}
          {usageLabel ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#334155' }}><span>Usage</span><strong style={{ color: '#0f172a' }}>{usageLabel}</strong></div> : null}
          {timeLabel ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#334155' }}><span>Valid Time</span><strong style={{ color: '#0f172a' }}>{timeLabel}</strong></div> : null}
        </div>
      ) : null}

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#ffffff', padding: '9px 10px', display: 'grid', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Promo Code</span>
          {hasCode ? (
            <button type="button" onClick={onClear} style={{ border: 'none', background: 'transparent', color: '#b91c1c', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0 }}>Clear</button>
          ) : null}
        </div>
        <strong title={hasCode ? normalizedCode : 'No promo code entered'} style={{ color: hasCode ? accentColor : '#94a3b8', fontSize: compact ? 13 : 14, lineHeight: 1.35, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {hasCode ? normalizedCode : 'No code yet'}
        </strong>
      </div>

      {statusMessage ? (
        <div style={{ border: `1px solid ${tonePalette.border}`, borderRadius: 12, background: tonePalette.background, padding: '9px 10px', fontSize: 12, fontWeight: 700, color: tonePalette.text, lineHeight: 1.45 }}>
          {statusMessage}
        </div>
      ) : null}
    </section>
  );
}
