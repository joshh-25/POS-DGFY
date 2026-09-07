import React, { useCallback } from 'react';

import { VoucherCodePanel } from '../../../../shared/components/storefront/VoucherCodePanel.jsx';

export function useFnbCheckoutPromoRenderers({
  appliedPromoDiscountText,
  appliedVoucherDiscountText,
  checkoutPromoCode,
  checkoutVoucherCode,
  handlePromoCardApply,
  handleVoucherCardApply,
  handleVoucherCardRemove,
  promoSectionModel,
  promoStatusMessage,
  promoStatusTone,
  voucherStatusMessage,
  voucherStatusTone,
  servicesBodyFont,
  setCheckoutPromoCode,
  setCheckoutVoucherCode
}) {
  // #672 originally rendered both the promo panel and the (separate, independent) voucher panel
  // stacked as one node -- every call site across retail/simple/fnb checkout pages just embeds a
  // single returned node, so wiring both here reached everywhere with zero call-site edits.
  //
  // #776/#695: merged into a single VoucherCodePanel rather than stacking two fields. PromoCodePanel
  // (unused here now, still present at ../components/PromoCodePanel.jsx) is not deleted -- matches
  // Pat's call to defer the legacy promo engine's actual removal until the voucher-based system is
  // prod-proven -- but its "Available Promos" listing has been ported into VoucherCodePanel
  // (availableOffers, fed from promoSectionModel below) so nothing customer-visible is lost. Every
  // "Use" click on a listed offer now applies through handleVoucherCardApply -- see
  // VoucherCodePanel.jsx's own file header for why that's safe: every real promo this codebase had
  // was already converted into a voucher by the #695 migration, and the merchant-facing "Add Promo"
  // authoring field is frozen in the same change. promoStatusMessage/promoStatusTone/
  // appliedPromoDiscountText/handlePromoCardApply/checkoutPromoCode/setCheckoutPromoCode are left
  // fully wired in this hook's signature even though nothing renders them anymore -- unwinding them
  // would ripple into the same ~11 call sites the original comment above was written to avoid
  // touching, for a change that's supposed to be UI-only.
  const renderPromoCodePanel = useCallback(({
    compact = false,
    variant = 'default',
    accentColor = '#0f766e',
    bodyFont = servicesBodyFont,
    isMobile = false
  } = {}) => (
    <div style={{ display: 'grid', gap: 8 }}>
      <VoucherCodePanel
        code={checkoutVoucherCode}
        onChange={setCheckoutVoucherCode}
        onClear={handleVoucherCardRemove}
        onApplyVoucher={handleVoucherCardApply}
        statusMessage={voucherStatusMessage}
        statusTone={voucherStatusTone}
        appliedDiscountText={appliedVoucherDiscountText}
        compact={compact}
        variant={variant}
        bodyFont={bodyFont}
        isMobile={isMobile}
        availableOffers={Array.isArray(promoSectionModel) ? promoSectionModel : []}
      />
    </div>
  ), [
    appliedPromoDiscountText,
    appliedVoucherDiscountText,
    checkoutPromoCode,
    checkoutVoucherCode,
    handlePromoCardApply,
    handleVoucherCardApply,
    handleVoucherCardRemove,
    promoSectionModel,
    promoStatusMessage,
    promoStatusTone,
    voucherStatusMessage,
    voucherStatusTone,
    servicesBodyFont,
    setCheckoutPromoCode,
    setCheckoutVoucherCode
  ]);

  const renderCheckoutPromoStack = useCallback((summaryNode, options = {}) => (
    <div style={{ display: 'grid', gap: 10 }}>
      {renderPromoCodePanel({
        compact: options.compact !== false,
        accentColor: options.accentColor || '#0f766e',
        bodyFont: options.bodyFont || servicesBodyFont
      })}
      {summaryNode}
    </div>
  ), [renderPromoCodePanel, servicesBodyFont]);

  return {
    renderCheckoutPromoStack,
    renderPromoCodePanel
  };
}
