import React, { useState } from 'react';
import { Ticket, X, CheckCircle2 } from 'lucide-react';

export const normalizeVoucherCode = (value = '') => String(value || '').trim().toUpperCase().slice(0, 64);

const formatDiscountPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, '');
};

const resolveOfferDiscountLabel = (offer) => {
  const percent = formatDiscountPercent(offer?.discountPercent ?? offer?.discount_percent);
  if (percent) return `${percent}% OFF`;
  return String(offer?.discountLabel || offer?.discount_label || offer?.title || '').trim();
};

const resolveOfferDiscountParts = (offer) => {
  const percent = formatDiscountPercent(offer?.discountPercent ?? offer?.discount_percent);
  if (percent) return { top: `${percent}%`, bottom: 'OFF' };
  const label = resolveOfferDiscountLabel(offer);
  const match = label.match(/^(\d+(?:\.\d+)?%)\s*(OFF)?$/i);
  if (match) return { top: match[1], bottom: match[2] ? 'OFF' : '' };
  return { top: 'OFFER', bottom: '' };
};

/**
 * Voucher-code entry (#672), adapted from PromoCodePanel.jsx's trigger+modal shape -- same visual
 * language.
 *
 * #776/#695: merged with PromoCodePanel's "Available Promos" listing rather than leaving that panel
 * hidden. The doc comment this replaced said there was "no catalog-level endpoint that enumerates a
 * store's active vouchers" to power a listing here -- that stopped being true once #713 shipped
 * `storefront_vouchers` in the discovery snapshot, and `fnbPromoModel.js`'s `getPromoCandidates`
 * already merges real promos and vouchers (adapted to the same shape) into one `promoSectionModel`
 * array. `availableOffers` accepts that array directly -- optional, defaults to `[]`, so the two
 * existing non-checkout render sites (StorefrontCatalogToolbar, SimpleCatalogToolbar, #694) that
 * don't pass it keep their current byte-identical, listing-free behavior.
 *
 * Every "Use" click here applies through `onApplyVoucher`, not a separate promo path. That's safe
 * today because #695's migration converted every real promo this codebase had into a voucher and
 * deleted the settings rows backing the legacy engine (confirmed against a full tenant inventory,
 * 2026-08-20) -- so nothing in `availableOffers` is promo-only anymore. It stays safe going forward
 * because the merchant-facing "Add Promo" button (TerminalOperationsWorkspace.jsx) is frozen in the
 * same change, closing off new non-voucher promo creation. If that freeze is ever lifted without a
 * matching dual-dispatch path being added back here, a listed promo-only offer would 404 on apply.
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
  triggerLabel = 'Apply a promo / voucher',
  // #776/#695: optional. promoSectionModel from useStorefrontCatalog.js -- already deduped, already
  // includes both real promos and voucher-adapted entries. See file header for the safety reasoning.
  availableOffers = []
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
    : (helperText ?? (hasCode ? 'Refresh quote or place the order to validate this code.' : 'Enter a promo or voucher code if you have one.'));
  const normalizedAvailableOffers = (Array.isArray(availableOffers) ? availableOffers : [])
    .filter((offer) => normalizeVoucherCode(offer?.promoCode || offer?.promo_code).length > 0);

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
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Apply a Promo / Voucher</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#f1f5f9', color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Promo / Voucher Code</div>
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

            {/* #776/#695: ported from PromoCodePanel.jsx's "Available Promos" list, unchanged in
                behavior -- see file header for why this is safe to dispatch through onApplyVoucher. */}
            {normalizedAvailableOffers.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingRight: 4, marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Offers</div>
                {normalizedAvailableOffers.map((offer, idx) => {
                  const offerCodeName = normalizeVoucherCode(offer.promoCode || offer.promo_code);
                  const offerDiscountLabel = resolveOfferDiscountLabel(offer);
                  const offerDiscountParts = resolveOfferDiscountParts(offer);
                  const offerTitle = String(offer.title || offer.headline || offerDiscountLabel || 'Store offer').trim();
                  const offerSubtitle = String(offer.subtitle || offer.supportingText || offer.description || 'Special offer').trim();
                  const offerEligibleItemsText = String(offer.eligibleItemsText || '').trim();
                  const offerEligibleCategoriesText = String(offer.eligibleCategoriesText || '').trim();
                  const availabilityStatus = String(offer.availabilityStatus || offer.availability_status || 'available').trim();
                  const availabilityMessage = String(offer.availabilityMessage || offer.availability_message || '').trim();
                  const isUnavailable = availabilityStatus !== 'available';
                  const isApplied = hasCode && offerCodeName && normalizedCode === offerCodeName;
                  const canApplyOffer = offerCodeName.length > 0 && !isUnavailable;
                  const compactBorder = isApplied && !isUnavailable ? accentColor : '#fb923c';
                  return (
                    <div key={idx} style={{ border: `1px solid ${compactBorder}`, borderRadius: 16, padding: isMobile ? 10 : 12, display: 'grid', gridTemplateColumns: isMobile ? '64px 1fr' : '78px 1fr', gap: isMobile ? 10 : 14, alignItems: 'center', background: isApplied && !isUnavailable ? `${accentColor}10` : '#ffffff', opacity: isUnavailable ? 0.58 : 1, filter: isUnavailable ? 'grayscale(1)' : 'none' }}>
                      <div style={{ width: isMobile ? 58 : 64, height: isMobile ? 58 : 64, display: 'grid', placeItems: 'center', borderRadius: 12, border: '1px solid #fb923c', background: '#fed7aa', color: '#0f172a', textAlign: 'center', fontSize: isMobile ? 20 : 24, fontWeight: 900, lineHeight: 1 }}>
                        {offerDiscountParts.top}
                      </div>
                      <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
                          <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isApplied ? accentColor : '#0f172a', fontSize: 14, fontWeight: 900 }}>
                            {offerTitle}
                          </div>
                          {isApplied && !isUnavailable ? (
                            <span style={{ flexShrink: 0, color: accentColor, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900 }}>
                              <CheckCircle2 size={14} /> Applied
                            </span>
                          ) : offerCodeName ? (
                            <button
                              type="button"
                              onClick={() => handleApply(offerCodeName)}
                              disabled={!canApplyOffer}
                              style={{ minHeight: 30, padding: '0 16px', borderRadius: 14, border: `1px solid ${canApplyOffer ? accentColor : '#cbd5e1'}`, background: '#ffffff', color: canApplyOffer ? accentColor : '#94a3b8', fontWeight: 800, fontSize: 12, cursor: canApplyOffer ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                            >
                              Use
                            </button>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.25, fontWeight: 600 }}>
                          {offerSubtitle}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                          {offerCodeName ? (
                            <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                              CODE: <span style={{ color: accentColor }}>{offerCodeName}</span>
                            </span>
                          ) : null}
                          {offer.validityText ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 20, padding: '0 10px', borderRadius: 999, background: '#bbf7d0', color: '#166534', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {offer.validityText}
                            </span>
                          ) : null}
                        </div>
                        {isUnavailable ? (
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>
                            {availabilityMessage || 'Unavailable outside the scheduled offer window.'}
                          </div>
                        ) : null}
                        {offerEligibleItemsText ? (
                          <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>Eligible items:</span> {offerEligibleItemsText}
                          </div>
                        ) : null}
                        {offerEligibleCategoriesText ? (
                          <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>Eligible categories:</span> {offerEligibleCategoriesText}
                          </div>
                        ) : null}
                      </div>
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
