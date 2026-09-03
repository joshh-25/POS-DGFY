import { CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';

/**
 * F&B fulfillment step shell. Interaction-heavy map and address controls are
 * supplied as children until their ViewModel extraction is complete.
 */
export function FnbCheckoutFulfillmentStep({
  children,
  isMobileViewport,
  isResponsive
}) {
  const typography = getCheckoutStepTypography();

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: isResponsive ? 20 : 18, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: isResponsive ? 16 : 20, boxShadow: '0 10px 24px rgba(15,23,42,.04)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', fontFamily: CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.title, color: '#1e293b' }}>Step 2: Fulfillment</div>
      {children}
    </section>
  );
}
