import { useCallback, useState } from 'react';

import { hasCustomerName, hasDeliveryAddress, hasPrimaryContact } from '../../../../checkout/checkoutValidation.js';
import { resolveCheckoutScheduleLabel } from '../../../../shared/model/storefrontOrderTimingPolicy.js';

const FNB_ORDER_STEP_META = {
  3: { number: 1, title: 'Customer Details', subtitle: 'Add contact details so the store can complete your order.' },
  2: { number: 2, title: 'Fulfillment', subtitle: 'Choose how and when we should prepare your order.' },
  4: { number: 3, title: 'Payment', subtitle: 'Confirm how you want to pay before placing the order.' },
};

const FNB_CHECKOUT_THEME = {
  fnbOrderBrand: '#1A4E8D',
  fnbOrderBrandDark: '#1A4586',
  fnbOrderBrandSoft: '#AEE8F4',
  fnbOrderBrandTint: '#EEF6FD',
  fnbOrderBrandBorder: '#8CB4D9',
  fnbOrderBrandShadow: 'rgba(26,78,141,0.18)',
  fnbOrderBrandShadowStrong: 'rgba(26,78,141,0.26)',
  fnbOrderTextOnBrand: '#FFFFFF',
  fnbOrderMutedBlueText: '#163D70',
  dgfyIceBlue: '#d9eefb',
  dgfyIceBlueBorder: '#a8d4f4',
  dgfyProgressComplete: '#68b7ea',
};

/** Shapes F&B checkout UI state without changing root checkout actions or contracts. */
export function useFnbCheckoutPresentation({
  activePinnedDeliveryAddress,
  cartCount,
  checkoutResult,
  customerEmail,
  customerName,
  customerPhone,
  fnbOrderStep,
  fnbScheduleMode,
  fnbScheduledFor,
  hasPinnedDeliveryLocation,
  isDeliveryOrder,
  isDesktopCheckout,
  isFnbMode,
  isFnbOrderSubpage,
  viewportWidth,
}) {
  const [mobileSummaryState, setMobileSummaryState] = useState({ key: '', visible: false });
  const fnbCustomerStepComplete = hasCustomerName(customerName)
    && hasPrimaryContact({ phone: customerPhone, email: customerEmail });
  const fnbFulfillmentStepComplete = hasDeliveryAddress({
    isDeliveryOrder,
    hasPinnedDeliveryLocation,
    activePinnedDeliveryAddress,
    usePinnedAddress: true,
  });
  const isFnbOrderResponsiveFlow = isFnbOrderSubpage && isFnbMode && !isDesktopCheckout;
  const fnbMobileCheckoutFooterReserve = 'var(--storefront-mobile-checkout-footer-reserve, 196px)';
  const fnbOrderStepRenderKey = `${isFnbOrderResponsiveFlow ? 'responsive' : 'desktop'}-${checkoutResult ? 'complete' : 'open'}-${fnbOrderStep}`;

  const mobileSummaryKey = `${isFnbOrderResponsiveFlow ? 'responsive' : 'desktop'}-${checkoutResult ? 'complete' : 'open'}-${fnbOrderStep}`;
  const showFnbMobileOrderSummary = mobileSummaryState.key === mobileSummaryKey && mobileSummaryState.visible;
  const setShowFnbMobileOrderSummary = useCallback((nextVisible) => {
    setMobileSummaryState((previous) => ({
      key: mobileSummaryKey,
      visible: typeof nextVisible === 'function' ? Boolean(nextVisible(previous.visible)) : Boolean(nextVisible),
    }));
  }, [mobileSummaryKey]);

  return {
    ...FNB_CHECKOUT_THEME,
    activeFnbOrderStepMeta: FNB_ORDER_STEP_META[fnbOrderStep] || FNB_ORDER_STEP_META[2],
    fnbCheckoutContentPadding: isDesktopCheckout ? '20px 40px 40px' : `24px 16px ${fnbMobileCheckoutFooterReserve}`,
    fnbCustomerStepComplete,
    fnbFulfillmentStepComplete,
    fnbMobileSummaryItemCountLabel: `${cartCount} Item${cartCount === 1 ? '' : 's'}`,
    fnbOrderMobileActionButtonHeight: isFnbOrderResponsiveFlow ? 44 : 38,
    fnbOrderMobileOptionHeight: isFnbOrderResponsiveFlow ? 52 : 64,
    fnbOrderMobileOptionIconBox: isFnbOrderResponsiveFlow ? 34 : 40,
    fnbOrderMobileOptionTextSize: isFnbOrderResponsiveFlow ? 14 : 15,
    fnbOrderStepRenderKey,
    fnbScheduleSummaryLabel: resolveCheckoutScheduleLabel(fnbScheduleMode, fnbScheduledFor),
    isFnbOrderHandset: viewportWidth < 768,
    isFnbOrderResponsiveFlow,
    setShowFnbMobileOrderSummary,
    showFnbMobileOrderSummary,
  };
}
