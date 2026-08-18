import React, { useCallback } from 'react';

import { PromoCodePanel } from '../components/PromoCodePanel.jsx';
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
  // #672: renders both the promo panel and the (separate, independent) voucher panel stacked as
  // one node. Every one of this renderer's existing call sites across retail/simple/fnb checkout
  // pages just embeds a single returned node (either directly or via a `promoPanel` prop) -- adding
  // the voucher panel here, rather than touching each of those ~11 call sites individually, gets it
  // wired everywhere `renderPromoCodePanel` already renders, with the same regression surface as
  // editing zero of those files.
  const renderPromoCodePanel = useCallback(({
    compact = false,
    accentColor = '#0f766e',
    bodyFont = servicesBodyFont,
    isMobile = false
  } = {}) => (
    <div style={{ display: 'grid', gap: 8 }}>
      <PromoCodePanel
        code={checkoutPromoCode}
        onChange={setCheckoutPromoCode}
        onClear={() => setCheckoutPromoCode('')}
        onApplyPromo={handlePromoCardApply}
        statusMessage={promoStatusMessage}
        statusTone={promoStatusTone}
        appliedDiscountText={appliedPromoDiscountText}
        compact={compact}
        accentColor={accentColor}
        bodyFont={bodyFont}
        isMobile={isMobile}
        availablePromos={Array.isArray(promoSectionModel) ? promoSectionModel : []}
      />
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
