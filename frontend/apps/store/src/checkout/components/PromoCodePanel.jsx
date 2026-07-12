import React, { useState } from 'react';
import { Tag, X, CheckCircle2 } from 'lucide-react';

const normalizePromoCode = (value = '') => String(value || '').trim().toUpperCase().slice(0, 40);

export function PromoCodePanel({
  code = '',
  onChange,
  onClear,
  onApplyPromo,
  statusMessage = '',
  statusTone = 'idle',
  appliedDiscountText = '',
  compact = false,
  accentColor = '#0f766e',
  bodyFont = "'Avenir Next', 'Segoe UI', sans-serif",
  isMobile = false,
  availablePromos = []
}) {
  const normalizedCode = normalizePromoCode(code);
  const hasCode = normalizedCode.length > 0;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempCode, setTempCode] = useState(code);

  const resolvedTone = statusTone === 'error'
    ? { border: '#fecaca', background: '#fef2f2', text: '#b91c1c' }
    : statusTone === 'success'
      ? { border: '#bbf7d0', background: '#f0fdf4', text: '#166534' }
      : { border: '#e2e8f0', background: '#ffffff', text: '#64748b' };
  const hasAppliedDiscount = String(appliedDiscountText || '').trim().length > 0;
  const normalizedAvailablePromos = (Array.isArray(availablePromos) ? availablePromos : [])
    .filter((promo) => normalizePromoCode(promo?.promoCode || promo?.promo_code).length > 0);

  const handleApply = (codeToApply) => {
    const finalCode = normalizePromoCode(codeToApply);
    if (!finalCode) return;
    onChange?.(finalCode);
    onApplyPromo?.(finalCode);
    setIsModalOpen(false);
  };

  return (
    <>
      {/* COMPACT TRIGGER ROW (Used for BOTH Mobile & Desktop) */}
      <button
        type="button"
        onClick={() => {
          setTempCode(code);
          setIsModalOpen(true);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: compact ? 40 : 44,
          padding: compact ? '0 12px' : '0 14px',
          borderRadius: 12,
          border: `1px solid #16a34a`,
          background: hasCode ? '#dcfce7' : '#ffffff',
          cursor: 'pointer',
          fontFamily: bodyFont
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tag size={18} color="#16a34a" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>
            {hasCode ? normalizedCode : 'Apply a promo / discount'}
          </span>
        </div>
        {hasCode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onClear?.();
            }}
            style={{ fontSize: 12, fontWeight: 800, color: '#b91c1c', padding: '4px 8px' }}
          >
            Remove
          </div>
        )}
      </button>

      {/* MODAL OVERLAY */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: isMobile ? 'flex-end' : 'center', alignItems: isMobile ? 'stretch' : 'center', background: 'rgba(15,23,42,0.4)', fontFamily: bodyFont, padding: isMobile ? 0 : 20 }}>
          {/* Backdrop click to close */}
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setIsModalOpen(false)} />
          
          <div style={{ position: 'relative', width: '100%', maxWidth: isMobile ? 'none' : 420, background: '#ffffff', borderRadius: isMobile ? '24px 24px 0 0' : 24, padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '85vh', boxShadow: isMobile ? '0 -10px 40px rgba(0,0,0,0.1)' : '0 10px 40px rgba(0,0,0,0.2)' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Add Promo Code</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#f1f5f9', color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Promo Code</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                {hasAppliedDiscount
                  ? `Discount applied: ${appliedDiscountText}`
                  : (hasCode ? 'Refresh quote or place the order to validate this code.' : 'Add a promo code if the store provides one.')}
              </div>
            </div>

            {/* MANUAL INPUT */}
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={tempCode}
                onChange={(e) => setTempCode(e.target.value)}
                placeholder="Enter code"
                maxLength={40}
                autoComplete="off"
                style={{ flex: 1, minHeight: 46, minWidth: 0, boxSizing: 'border-box', borderRadius: 12, border: '1px solid #cbd5e1', background: '#f8fafc', padding: '0 14px', color: '#0f172a', fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}
              />
              <button
                type="button"
                onClick={() => handleApply(tempCode)}
                disabled={!tempCode.trim()}
                style={{ minHeight: 46, padding: '0 20px', borderRadius: 12, border: 'none', background: tempCode.trim() ? accentColor : '#cbd5e1', color: '#ffffff', fontWeight: 800, fontSize: 14, cursor: tempCode.trim() ? 'pointer' : 'not-allowed' }}
                >
                  Apply
                </button>
            </div>

            {statusMessage ? (
              <div
                style={{
                  border: `1px solid ${resolvedTone.border}`,
                  borderRadius: 12,
                  background: resolvedTone.background,
                  padding: '10px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: resolvedTone.text,
                  lineHeight: 1.45
                }}
              >
                {statusMessage}
              </div>
            ) : null}

            {/* AVAILABLE PROMOS LIST */}
            {normalizedAvailablePromos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingRight: 4, marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Promos</div>
                {normalizedAvailablePromos.map((promo, idx) => {
                  const promoCodeName = normalizePromoCode(promo.promoCode || promo.promo_code);
                  const promoDiscountLabel = String(promo.discountLabel || '').trim();
                  const promoEligibleItemsText = String(promo.eligibleItemsText || '').trim();
                  const promoEligibleCategoriesText = String(promo.eligibleCategoriesText || '').trim();
                  const availabilityStatus = String(promo.availabilityStatus || promo.availability_status || 'available').trim();
                  const availabilityMessage = String(promo.availabilityMessage || promo.availability_message || '').trim();
                  const isUnavailable = availabilityStatus !== 'available';
                  const isApplied = hasCode && promoCodeName && normalizedCode === promoCodeName;
                  const canApplyPromo = promoCodeName.length > 0 && !isUnavailable;
                  return (
                    <div key={idx} style={{ border: `1px solid ${isApplied && !isUnavailable ? accentColor : '#e2e8f0'}`, borderRadius: 16, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', background: isApplied && !isUnavailable ? `${accentColor}10` : '#ffffff', opacity: isUnavailable ? 0.58 : 1, filter: isUnavailable ? 'grayscale(1)' : 'none' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: isApplied && !isUnavailable ? accentColor : '#f1f5f9', color: isApplied && !isUnavailable ? '#fff' : '#64748b', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Tag size={18} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: isApplied ? accentColor : '#0f172a' }}>
                          {String(promo.title || promo.headline || promo.badge || 'Store promo').trim() || 'Store promo'}
                        </div>
                        {promoDiscountLabel ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', minHeight: 24, padding: '0 10px', borderRadius: 999, background: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', fontSize: 11, fontWeight: 800 }}>
                            {promoDiscountLabel}
                          </div>
                        ) : null}
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
                          {promo.subtitle || promo.supportingText || promo.description || 'Special offer'}
                        </div>
                        {promoCodeName ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 26, padding: '0 10px', borderRadius: 999, background: '#f8fafc', border: '1px solid #dbe5ee', color: '#0f172a', fontSize: 11, fontWeight: 800 }}>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>Promo Code:</span>
                            <span>{promoCodeName}</span>
                          </div>
                        ) : null}
                        {promo.validityText ? (
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{promo.validityText}</div>
                        ) : null}
                        {isUnavailable ? (
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>
                            {availabilityMessage || 'Unavailable outside the scheduled promo window.'}
                          </div>
                        ) : null}
                        {promoEligibleItemsText ? (
                          <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>Eligible items:</span> {promoEligibleItemsText}
                          </div>
                        ) : null}
                        {promoEligibleCategoriesText ? (
                          <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>Eligible categories:</span> {promoEligibleCategoriesText}
                          </div>
                        ) : null}
                      </div>
                      {isApplied && !isUnavailable ? (
                        <div style={{ color: accentColor, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 800 }}>
                          <CheckCircle2 size={16} /> Applied
                        </div>
                      ) : promoCodeName ? (
                        <button
                          type="button"
                          onClick={() => handleApply(promoCodeName)}
                          disabled={!canApplyPromo}
                          style={{ minHeight: 32, padding: '0 14px', borderRadius: 16, border: `1px solid ${canApplyPromo ? accentColor : '#cbd5e1'}`, background: 'transparent', color: canApplyPromo ? accentColor : '#94a3b8', fontWeight: 800, fontSize: 12, cursor: canApplyPromo ? 'pointer' : 'not-allowed' }}
                        >
                          Use
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
