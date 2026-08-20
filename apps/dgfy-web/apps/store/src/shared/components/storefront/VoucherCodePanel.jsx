import React, { useState } from 'react';
import { Ticket, X } from 'lucide-react';

export const normalizeVoucherCode = (value = '') => String(value || '').trim().toUpperCase().slice(0, 64);

/**
 * Voucher-code entry (#672), adapted from PromoCodePanel.jsx's trigger+modal shape -- same visual
 * language, deliberately simplified: no "available vouchers" list, since (unlike promos) there is
 * no catalog-level endpoint that enumerates a store's active vouchers for display here. A voucher
 * is entered by code only, same as the storefront checkout API already accepts (voucher_code,
 * symmetric to promo_code but independent -- see buildFnbCheckoutPayload.js).
 *
 * Hoisted from modes/fnb/checkout/components/ to shared/ (#694) -- it now has two render sites
 * (the checkout promo-panel stack, and the catalog toolbar's voucher-entry button), and the `fnb/`
 * path was already vestigial: `useFnbCheckoutPromoRenderers.jsx` renders this for every mode, not
 * just fnb.
 */
export function VoucherCodePanel({
  code = '',
  onChange,
  onClear,
  onApplyVoucher,
  statusMessage = '',
  statusTone = 'idle',
  appliedDiscountText = '',
  compact = false,
  accentColor = '#7c3aed',
  bodyFont = "'Avenir Next', 'Segoe UI', sans-serif",
  isMobile = false,
  // #694: the checkout-flavored copy ("refresh quote or place the order...") is wrong on a catalog
  // page, where applying a code updates prices in place with no checkout visit needed. Defaulting
  // to `null` keeps the checkout render's copy byte-identical to before this change.
  helperText = null,
  triggerLabel = 'Have a voucher code?'
}) {
  const normalizedCode = normalizeVoucherCode(code);
  const hasCode = normalizedCode.length > 0;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempCode, setTempCode] = useState(code);

  const resolvedTone = statusTone === 'error'
    ? { border: '#fecaca', background: '#fef2f2', text: '#b91c1c' }
    : statusTone === 'success'
      ? { border: '#ddd6fe', background: '#f5f3ff', text: '#5b21b6' }
      : { border: '#e2e8f0', background: '#ffffff', text: '#64748b' };
  const hasAppliedDiscount = String(appliedDiscountText || '').trim().length > 0;
  const resolvedHelperText = hasAppliedDiscount
    ? `Discount applied: ${appliedDiscountText}`
    : (helperText ?? (hasCode ? 'Refresh quote or place the order to validate this code.' : 'Enter a voucher code if you have one.'));

  const handleApply = (codeToApply) => {
    const finalCode = normalizeVoucherCode(codeToApply);
    if (!finalCode) return;
    onChange?.(finalCode);
    onApplyVoucher?.(finalCode);
    setIsModalOpen(false);
  };

  return (
    <>
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
          minWidth: 0,
          minHeight: compact ? 40 : 44,
          padding: compact ? '0 12px' : '0 14px',
          borderRadius: 12,
          border: `1px solid ${accentColor}`,
          background: hasCode ? '#f5f3ff' : '#ffffff',
          cursor: 'pointer',
          fontFamily: bodyFont
        }}
      >
        {/* #750: minWidth: 0 on this row + the label span lets the label shrink and ellipsize
            instead of wrapping the whole trigger into two lines when the container is a fixed
            width narrower than the label (both catalog toolbars pin this to 260px). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Ticket size={18} color={accentColor} />
          <span style={{ fontSize: 14, fontWeight: 700, color: accentColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {hasCode ? normalizedCode : triggerLabel}
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

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: isMobile ? 'flex-end' : 'center', alignItems: isMobile ? 'stretch' : 'center', background: 'rgba(15,23,42,0.4)', fontFamily: bodyFont, padding: isMobile ? 0 : 20 }}>
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setIsModalOpen(false)} />

          <div style={{ position: 'relative', width: '100%', maxWidth: isMobile ? 'none' : 420, background: '#ffffff', borderRadius: isMobile ? '24px 24px 0 0' : 24, padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '85vh', boxShadow: isMobile ? '0 -10px 40px rgba(0,0,0,0.1)' : '0 10px 40px rgba(0,0,0,0.2)' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Add Voucher Code</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#f1f5f9', color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Voucher Code</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                {resolvedHelperText}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={tempCode}
                onChange={(e) => setTempCode(e.target.value)}
                placeholder="Enter code"
                maxLength={64}
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
          </div>
        </div>
      )}
    </>
  );
}
