import { ChevronDown, ChevronLeft, ChevronRight, Lock, Plus, ShoppingBag, X } from 'lucide-react';

import { FnbCheckoutMobileSummary } from './FnbCheckoutMobileSummary.jsx';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { buildDownpaymentTotalsRows, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';
import { buildFeeAndVatSummaryRows } from '../../../../shared/model/storefrontFeesAndTaxesPresentation.js';
import { VatDisclosureNote } from '../../../../shared/components/checkout/VatDisclosureNote.jsx';
import { StorefrontMobileCheckoutFooter } from '../../../../shared/components/StorefrontMobileCheckoutFooter.jsx';
import { CHECKOUT_FONT_FAMILY } from '../../../../shared/components/checkout/checkoutUiTokens.js';

/**
 * F&B mobile checkout summary sheet and persistent action footer.
 * State and checkout transitions stay in the route container until the
 * fulfillment/location interaction can be extracted as a focused slice.
 */
export function FnbCheckoutMobileSummaryPanel({
  brandColor,
  brandColorDark,
  brandShadowStrong,
  cart,
  cartCount,
  cartImageErrors,
  checkoutAllowed,
  checkoutLoading,
  checkoutPrimaryLabel = 'Place Order',
  checkoutPrimaryLocked = false,
  fnbCustomerStepComplete,
  fnbFulfillmentStepComplete,
  isDeliveryOrder,
  itemCountLabel,
  money,
  onBackToCart,
  onCheckout,
  onDecreaseStep,
  onImageError,
  onIncreaseStep,
  onToggleSummary,
  orderStep,
  promoDiscountSummaryRow,
  voucherDiscountSummaryRow,
  promoPanel,
  scheduleLabel,
  setSummaryOpen,
  showSummary,
  totals,
}) {
  // Phase 142 (#823): independent copy of FnbCheckoutSummaryContent's own downpayment rows -- this
  // panel is a separate mobile bottom-sheet presentation, not a shared render path.
  const downpaymentRows = buildDownpaymentTotalsRows({
    display: resolveDownpaymentDisplay({ quoteResult: totals }),
    money,
    orderMethod: isDeliveryOrder ? 'delivery' : 'pickup'
  });
  const feeAndVatRows = buildFeeAndVatSummaryRows({ totals, money });
  const isPrimaryDisabled = orderStep === 3
    ? !fnbCustomerStepComplete
    : orderStep === 4
      ? !checkoutAllowed || checkoutPrimaryLocked
      : !fnbFulfillmentStepComplete;

  const handleBack = () => {
    if (orderStep === 3) {
      onBackToCart();
      return;
    }
    onDecreaseStep();
  };

  const handlePrimary = () => {
    if (orderStep === 3 || orderStep === 2) {
      onIncreaseStep();
      return;
    }
    onCheckout();
  };

  return (
    <FnbCheckoutMobileSummary isResponsive>
      {showSummary && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(15,23,42,0.38)', display: 'grid', alignItems: 'end' }}
          onClick={() => setSummaryOpen(false)}
        >
          <div
            style={{ background: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '78vh', overflow: 'hidden', boxShadow: '0 -18px 40px rgba(15,23,42,0.18)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '10px 16px 14px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
              <div style={{ width: 56, height: 5, borderRadius: 999, background: '#cbd5e1', margin: '0 auto' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Order Summary</div>
                <button type="button" onClick={() => setSummaryOpen(false)} style={{ width: 28, height: 28, borderRadius: 12, border: '1px solid #dbe5ee', background: '#fff', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 16px 20px', display: 'grid', gap: 16 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{money(totals.total_amount)}</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
                <SummaryRow label="Fulfillment" value={isDeliveryOrder ? 'Delivery' : 'Pickup'} />
                <SummaryRow label="Schedule" value={scheduleLabel} />
                <SummaryRow label="Items" value={`${cartCount} item${cartCount === 1 ? '' : 's'}`} />
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {cart.map((line) => (
                  <div key={`fnb-mobile-order-summary-${line.cart_line_id || line.item_id}`} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'start', border: '1px solid #e2e8f0', borderRadius: 18, padding: 12 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
                      {(line.thumbnail_url || line.image_url) && !cartImageErrors.has(Number(line.item_id)) ? (
                        <StorefrontResponsiveImage imageSources={resolveStorefrontImageSources(line, { preferred: 'thumbnail' })} alt={line.name} sizes="64px" width={64} height={64} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => onImageError(line.item_id)} />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{String(line.name || '').slice(0, 1) || 'I'}</span>
                      )}
                    </div>
                    <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{line.name}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>x {Math.max(1, Number(line.quantity || 1))}</div>
                      {Array.isArray(line.line_modifiers) && line.line_modifiers.length > 0 && (
                        <div style={{ display: 'grid', gap: 6, marginTop: 2 }}>
                          {line.line_modifiers.map((modifier, index) => (
                            <div key={`mobile-summary-modifier-${line.cart_line_id || line.item_id}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 8, alignItems: 'center', borderRadius: 10, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '6px 8px' }}>
                              <Plus size={14} color="#16a34a" />
                              <span style={{ fontSize: 13, color: '#166534', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{modifier.option_name || modifier.name || 'Add-on'}{Number(modifier.quantity || 1) > 1 ? ` ×${Number(modifier.quantity)}` : ''}</span>
                              <span style={{ fontSize: 13, fontWeight: 800, color: '#16a34a' }}>{money(Number(modifier.price_delta || 0) * Number(modifier.quantity || 1))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}</div>
                  </div>
                ))}
              </div>
              {promoPanel}
              <div style={{ display: 'grid', gap: 10, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <SummaryRow label="Subtotal" value={money(totals.subtotal_amount)} />
                {promoDiscountSummaryRow ? <SummaryRow label={promoDiscountSummaryRow.label} value={promoDiscountSummaryRow.value} /> : null}
                {voucherDiscountSummaryRow ? <SummaryRow label={voucherDiscountSummaryRow.label} value={voucherDiscountSummaryRow.value} /> : null}
                <SummaryRow label="Delivery Fee" value={money(totals.delivery_fee)} />
                {feeAndVatRows.map((row) => (
                  <SummaryRow key={row.label} label={row.label} value={row.value} />
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 18, color: '#0f172a' }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <strong style={{ fontWeight: 800 }}>{money(totals.total_amount)}</strong>
                </div>
                {downpaymentRows.map((row) => (
                  <SummaryRow key={row.label} label={row.label} value={row.value} />
                ))}
                <VatDisclosureNote />
              </div>
            </div>
          </div>
        </div>
      )}

      <StorefrontMobileCheckoutFooter key={`fnb-responsive-footer-step-${orderStep}`}>
          <button type="button" onClick={onToggleSummary} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, alignItems: 'center', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, border: '1px solid #dbe5ee', background: '#f8fbff', display: 'grid', placeItems: 'center', color: brandColor }}><ShoppingBag size={20} /></div>
            <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{itemCountLabel} - {money(totals.total_amount)}</div>
              <div style={{ fontSize: 14, color: brandColor, fontWeight: 700 }}>View Order Summary</div>
            </div>
            <ChevronDown size={20} color={brandColor} style={{ transform: showSummary ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }} />
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: orderStep === 1 ? '1fr' : '1fr 1fr', gap: 12 }}>
            {orderStep !== 1 && (
              <button type="button" onClick={handleBack} style={secondaryButtonStyle}>
                <ChevronLeft size={18} />
                Back
              </button>
            )}
            <button type="button" onClick={handlePrimary} disabled={isPrimaryDisabled} style={{ ...primaryButtonStyle, background: `linear-gradient(180deg, ${brandColor} 0%, ${brandColorDark} 100%)`, boxShadow: `0 12px 24px ${brandShadowStrong}`, opacity: isPrimaryDisabled ? 0.6 : 1 }}>
              {orderStep === 4 ? <><Lock size={18} />{checkoutLoading ? 'Processing...' : checkoutPrimaryLabel}</> : <>Continue<ChevronRight size={20} /></>}
            </button>
          </div>
      </StorefrontMobileCheckoutFooter>
    </FnbCheckoutMobileSummary>
  );
}

function SummaryRow({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#334155' }}><span>{label}</span><strong>{value}</strong></div>;
}

const secondaryButtonStyle = {
  minHeight: 44,
  borderRadius: 16,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#1e293b',
  fontWeight: 700,
  fontSize: 13,
  fontFamily: CHECKOUT_FONT_FAMILY,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const primaryButtonStyle = {
  minHeight: 44,
  border: 'none',
  borderRadius: 16,
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  fontFamily: CHECKOUT_FONT_FAMILY,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};
