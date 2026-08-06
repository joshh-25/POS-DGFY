import React from 'react';
import { CalendarDays, CheckCircle2, ShoppingCart } from 'lucide-react';

/**
 * StorefrontCartFab — the floating "view cart / booking / checkout" button.
 * Pure view extracted verbatim from StorefrontApp.jsx; its own visibility
 * (`display`) and mode branching are preserved. The onClick only opens the cart
 * drawer / navigates — no checkout-submission logic lives here.
 */
export function StorefrontCartFab({
  serviceCartFabRef,
  isFnbMode,
  isServicesMode,
  isMobileViewport,
  isDesktopViewport,
  hasServiceCart,
  isAccountDrawerOpen,
  isServicesCartDrawerMode,
  isFnbOrderSubpage,
  isFnbDetailsSubpage,
  isCheckoutOpen,
  isSimpleMode,
  isResolvedOrderSubpage,
  isSimpleCartSurfaceMode,
  goStoreBookingPage,
  setIsCheckoutOpen,
  setCheckoutTab,
  servicesPrimary,
  serviceBookingSummaryTitle,
  cartCount,
  serviceBookingSummarySchedule,
  servicePaymentOptions,
  servicePaymentTiming,
  money,
  cartTotal
}) {
  return (
    <button
      type="button"
      ref={isFnbMode ? serviceCartFabRef : undefined}
      onClick={() => {
        if (isServicesMode) {
          goStoreBookingPage();
          return;
        }
        setIsCheckoutOpen((prev) => {
          const next = !prev;
          if (next) setCheckoutTab(isServicesMode && hasServiceCart ? 'review' : (isFnbMode ? 'cart' : 'checkout'));
          return next;
        });
      }}
      style={{
        position: 'fixed',
        zIndex: 2100,
        border: (isServicesMode && hasServiceCart)
          ? '1px solid #dbe5ee'
          : (isFnbMode ? 'none' : 'none'),
        borderRadius: isFnbMode ? 999 : (isMobileViewport ? 16 : 22),
        background: (isServicesMode && hasServiceCart)
          ? '#ffffff'
          : (isFnbMode ? '#f97316' : 'linear-gradient(135deg,#1a4586,#1a4e8d)'),
        color: (isServicesMode && hasServiceCart)
          ? '#0f172a'
          : '#fff',
        boxShadow: (isServicesMode && hasServiceCart)
          ? '0 22px 48px rgba(15,23,42,.16)'
          : (isFnbMode ? '0 14px 34px rgba(249,115,22,.38)' : '0 14px 34px rgba(26,69,134,.38)'),
        padding: (isServicesMode && hasServiceCart) ? (isMobileViewport ? '12px 14px' : '16px 18px') : (isFnbMode ? 0 : '12px 18px'),
        width: isFnbMode ? (isMobileViewport ? 62 : 68) : undefined,
        height: isFnbMode ? (isMobileViewport ? 62 : 68) : undefined,
        minWidth: (isServicesMode && hasServiceCart) ? (isMobileViewport ? 0 : 320) : (isFnbMode ? undefined : (isMobileViewport ? 0 : 255)),
        textAlign: 'left',
        cursor: 'pointer',
        right: isMobileViewport ? 20 : 36,
        left: isFnbMode ? 'auto' : (isMobileViewport ? 10 : 'auto'),
        bottom: isMobileViewport ? 10 : 18,
        display: isAccountDrawerOpen
          ? 'none'
          : isServicesCartDrawerMode
          ? 'none'
          : (
            isServicesMode && isDesktopViewport
              ? 'none'
              : (((isFnbOrderSubpage || isFnbDetailsSubpage || (isFnbMode && isCheckoutOpen)) || (isSimpleMode && isResolvedOrderSubpage) || isSimpleCartSurfaceMode) ? 'none' : 'block')
          )
      }}
    >
      {isServicesMode && hasServiceCart ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Booking Summary</div>
              <div style={{ marginTop: 3, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{serviceBookingSummaryTitle}</div>
            </div>
            {!isMobileViewport && (
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: 999, padding: '4px 8px' }}>
                {cartCount} service
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#475569' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CalendarDays size={14} color={servicesPrimary} />
              {serviceBookingSummarySchedule}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color={servicesPrimary} />
              {servicePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Payment pending'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{money(cartTotal)}</div>
            <div style={{ fontSize: 13, color: '#0f766e', fontWeight: 800 }}>
              {isCheckoutOpen ? 'Close booking' : (isMobileViewport ? 'View booking' : 'View cart and checkout')}
            </div>
          </div>
        </div>
      ) : isFnbMode ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShoppingCart size={24} strokeWidth={2.2} />
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              minWidth: 22,
              height: 22,
              padding: '0 6px',
              borderRadius: 999,
              background: '#15803d',
              color: '#fff',
              border: '2px solid #fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 900,
              lineHeight: 1
            }}
          >
            {cartCount}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, opacity: .95 }}>{cartCount} item(s) in cart</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{money(cartTotal)}</div>
          <div style={{ marginTop: 2, fontSize: 12, textDecoration: 'underline' }}>{isCheckoutOpen ? 'Close checkout' : 'View Cart'}</div>
        </>
      )}
    </button>
  );
}
