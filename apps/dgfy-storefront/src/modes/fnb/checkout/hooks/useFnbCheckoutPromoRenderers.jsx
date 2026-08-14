import React, { useCallback } from 'react';

import { PromoCodePanel } from '../components/PromoCodePanel.jsx';

export function useFnbCheckoutPromoRenderers({
  appliedPromoDiscountText,
  checkoutPromoCode,
  handlePromoCardApply,
  promoSectionModel,
  promoStatusMessage,
  promoStatusTone,
  servicesBodyFont,
  setCheckoutPromoCode
}) {
  const renderPromoCodePanel = useCallback(({
    compact = false,
    accentColor = '#0f766e',
    bodyFont = servicesBodyFont,
    isMobile = false
  } = {}) => (
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
  ), [
    appliedPromoDiscountText,
    checkoutPromoCode,
    handlePromoCardApply,
    promoSectionModel,
    promoStatusMessage,
    promoStatusTone,
    servicesBodyFont,
    setCheckoutPromoCode
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
