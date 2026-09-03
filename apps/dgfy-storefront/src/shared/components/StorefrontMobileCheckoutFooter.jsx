import React from 'react';

import { useStorefrontMobileCheckoutFooter } from '../hooks/useStorefrontMobileCheckoutFooter.js';
import { CHECKOUT_FONT_FAMILY } from './checkout/checkoutUiTokens.js';

const FOOTER_PANEL_STYLE = {
  borderRadius: 24,
  border: '1px solid #dbe5ee',
  background: '#fff',
  boxShadow: '0 -16px 36px rgba(15,23,42,0.14)',
  padding: '14px 14px 16px',
  display: 'grid',
  gap: 14,
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  margin: '0 auto',
  boxSizing: 'border-box',
};

/** Shared fixed mobile checkout footer shell used by every storefront mode. */
export function StorefrontMobileCheckoutFooter({ children, fontFamily = CHECKOUT_FONT_FAMILY, ...props }) {
  const footerRef = useStorefrontMobileCheckoutFooter();

  return (
    <div
      ref={footerRef}
      {...props}
      data-storefront-mobile-checkout-footer="true"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 0,
        zIndex: 30,
        marginTop: 16,
        padding: '0 0 calc(env(safe-area-inset-bottom, 0px) + 14px)',
        background: 'transparent',
        pointerEvents: 'none',
        fontFamily,
      }}
    >
      <div style={{ ...FOOTER_PANEL_STYLE, pointerEvents: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
