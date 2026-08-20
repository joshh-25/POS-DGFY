import React, { useCallback } from 'react';

import { VoucherCodePanel } from '../../../../shared/components/storefront/VoucherCodePanel.jsx';

export function useFnbCheckoutPromoRenderers({
  appliedPromoDiscountText,
  appliedVoucherDiscountText,
  checkoutPromoCode,
  checkoutVoucherCode,
  handlePromoCardApply,
  handleVoucherCardApply,
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
  // #776/#695: PromoCodePanel is hidden here, deliberately NOT deleted -- matches Pat's call to
  // defer the legacy promo engine's actual removal until the voucher-based system is prod-proven.
  // It's dead weight regardless of that timeline though: the #695 migration already converted every
  // real promo this codebase had (SAVE20/FIRSTORDER/SPPROMO) into vouchers and deleted their
  // `storefront_promo(s)` settings rows, so PromoCodePanel currently has nothing left to apply
  // against on any tenant. All the promo-specific props/state below (checkoutPromoCode,
  // promoStatusMessage, promoSectionModel, handlePromoCardApply, ...) are left fully wired rather
  // than stripped from this hook's signature -- unwinding them would ripple into the same ~11 call
  // sites the original comment above was written to avoid touching, for a change that's supposed to
  // be UI-only.
  const renderPromoCodePanel = useCallback(({
    compact = false,
    accentColor = '#0f766e',
    bodyFont = servicesBodyFont,
    isMobile = false
  } = {}) => (
    <div style={{ display: 'grid', gap: 8 }}>
      <VoucherCodePanel
        code={checkoutVoucherCode}
        onChange={setCheckoutVoucherCode}
        onClear={() => setCheckoutVoucherCode('')}
        onApplyVoucher={handleVoucherCardApply}
        statusMessage={voucherStatusMessage}
        statusTone={voucherStatusTone}
        appliedDiscountText={appliedVoucherDiscountText}
        compact={compact}
        bodyFont={bodyFont}
        isMobile={isMobile}
      />
    </div>
  ), [
    appliedPromoDiscountText,
    appliedVoucherDiscountText,
    checkoutPromoCode,
    checkoutVoucherCode,
    handlePromoCardApply,
    handleVoucherCardApply,
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
