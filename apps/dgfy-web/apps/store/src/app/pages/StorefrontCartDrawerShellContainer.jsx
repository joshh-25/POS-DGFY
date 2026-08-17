import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { StorefrontCartFab } from '../../shared/components/storefront/StorefrontCartFab.jsx';
import { DefaultProductCartFab } from '../../shared/components/storefront/DefaultProductCartFab.jsx';
import { DefaultProductCartDrawer } from '../../shared/components/storefront/DefaultProductCartDrawer.jsx';
import { StorefrontCartFlyAnimations } from '../../shared/components/StorefrontCartFlyAnimations.jsx';
import { StorefrontCheckoutDrawerFrame } from '../../shared/components/StorefrontCheckoutDrawerFrame.jsx';
import { StorefrontOrderSuccessOverlay } from '../../shared/components/storefront/StorefrontOrderSuccessOverlay.jsx';
import { DGFY_BRAND_NAME } from '../../shared/model/storefrontConstants.js';
import { ServiceCartDrawer } from '../../modes/services/booking/components/ServiceCartDrawer.jsx';
import { ServiceBookingReviewContainer } from '../../modes/services/booking/pages/ServiceBookingReviewContainer.jsx';
import { SimpleCartFloatingButton } from '../../modes/simple/checkout/components/SimpleCartFloatingButton.jsx';
import { SimpleCartDrawerSurface } from '../../modes/simple/checkout/components/SimpleCartDrawerSurface.jsx';
import { FnbCartDrawerHeader } from '../../modes/fnb/checkout/components/FnbCartDrawerHeader.jsx';
import { FnbCartDrawerSurface } from '../../modes/fnb/checkout/pages/FnbCartDrawerSurface.jsx';
import { FnbCheckoutRouteContainer } from '../../modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx';
import { FnbTrackingRouteContainer } from '../../modes/fnb/tracking/pages/FnbTrackingRouteContainer.jsx';
import { RetailTrackingRouteContainer } from '../../modes/retail/tracking/pages/RetailTrackingRouteContainer.jsx';
import { TrackingDrawerMount } from '../../tracking/components/TrackingDrawerMount.jsx';

// Cart/checkout drawer shell — cross-mode composition (fnb/services/simple/shared) that mounts
// the follow floating action, cart FABs/drawers per mode, the shared checkout-drawer frame
// (header/tab-bar render props + Wave 9's checkout body containers as children), the F&B
// tracking mount, and the order-success overlay. Moved verbatim out of StorefrontApp.jsx's
// `{isStorePage && (checkoutPermitted || bookingPermitted || productCartPermitted) && (<>...
// </>)}` fragment. The shell keeps that guard and renders this container for the body only.
// See app/hooks/useStorefrontCartDrawerShellProps.js for the props bundle.
export function StorefrontCartDrawerShellContainer(props) {
  const {
    selectedStore,
    isFnbMode,
    isServicesMode,
    isMobileViewport,
    isAccountDrawerOpen,
    isServicesCartDrawerMode,
    serviceCartDrawerProps,
    serviceCartFlyAnimations,
    isSimpleCartSurfaceMode,
    simpleCartDrawerProps,
    defaultProductCartDrawerProps,
    serviceCartFabRef,
    isDesktopViewport,
    hasServiceCart,
    isFnbOrderSubpage,
    isFnbDetailsSubpage,
    isBookingSubpage,
    isCheckoutOpen,
    isRetailMode,
    isSimpleMode,
    isResolvedOrderSubpage,
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
    cartTotal,
    fnbCartDrawerRouteProps,
    isDesktopCheckout,
    isFnbCartDrawerSurfaceOpen,
    servicesDisplayFont,
    routeSlug,
    activeOrderMethodLabel,
    fnbCartStatusLabel,
    goStoreCatalogPage,
    checkoutTab,
    fnbCheckoutRouteProps,
    serviceBookingReviewProps,
    fnbTrackingRouteProps,
    retailTrackingRouteProps,
    simpleTrackingDrawerProps,
    showOrderSuccessAnimation
  } = props;

  // Any industry that isn't F&B/Services/Simple (retail, hospitality, healthcare, etc.) — the
  // mode DefaultProductCartFab/DefaultProductCartDrawer serve, replacing StorefrontCartFab's
  // default branch for this mode only.
  const isDefaultCartSurfaceMode = !isFnbMode && !isServicesMode && !isSimpleMode;
  // Retail's own /order page already shows cart contents/totals in its own summary panels
  // (RetailOrderSummaryContent/RetailOrderMobileSummaryPanel), so the floating cart
  // button+drawer are redundant there — hidden the same way isSimpleCartSurfaceMode already
  // hides MSME's equivalent on its own order subpage. Scoped to retail only: the other
  // default-like modes' DefaultOrderPage has no such summary of its own yet.
  const shouldRenderDefaultCartSurface = isDefaultCartSurfaceMode
    && !(isRetailMode && (isResolvedOrderSubpage || isFnbDetailsSubpage));
  // Each mode's own cart-fly-animation color/icon — F&B's orange is reproduced explicitly
  // (previously hardcoded inside StorefrontCartFlyAnimations itself); Retail gets its own blue
  // (matching DefaultProductCartFab.jsx); Simple uses its green/cream presentation palette.
  const cartFlyAnimationProps = isFnbMode
    ? { accentColor: '#ea580c', accentSoft: 'rgba(249,115,22,0.16)', accentStrong: 'rgba(251,146,60,0.32)', borderColor: 'rgba(249,115,22,0.24)', icon: ShoppingCart }
    : isRetailMode
      ? { accentColor: '#1a4e8d', accentSoft: 'rgba(26,78,141,0.16)', accentStrong: 'rgba(26,78,141,0.32)', borderColor: 'rgba(26,78,141,0.24)', icon: ShoppingCart }
      : isSimpleMode
        ? { accentColor: '#176B3A', accentSoft: 'rgba(23,107,58,0.14)', accentStrong: 'rgba(23,107,58,0.24)', borderColor: 'rgba(23,107,58,0.22)', icon: ShoppingCart }
        : {};

  return (
    <>
      {!isAccountDrawerOpen && isServicesCartDrawerMode && (
        <ServiceCartDrawer {...serviceCartDrawerProps} />
      )}
      {(isServicesMode || isFnbMode || isRetailMode || isSimpleMode) && (
        <StorefrontCartFlyAnimations animations={serviceCartFlyAnimations} {...cartFlyAnimationProps} />
      )}
      {!isAccountDrawerOpen && isSimpleCartSurfaceMode && !isFnbDetailsSubpage && (
        <>
          <SimpleCartFloatingButton {...simpleCartDrawerProps.floatingButtonProps} />

          <SimpleCartDrawerSurface {...simpleCartDrawerProps.drawerSurfaceProps} />
        </>
      )}
      {!isAccountDrawerOpen && shouldRenderDefaultCartSurface && (
        <>
          <DefaultProductCartFab {...defaultProductCartDrawerProps.floatingButtonProps} />

          <DefaultProductCartDrawer {...defaultProductCartDrawerProps.drawerSurfaceProps} />
        </>
      )}
      {!isDefaultCartSurfaceMode && (
      <StorefrontCartFab
        serviceCartFabRef={serviceCartFabRef}
        isFnbMode={isFnbMode}
        isServicesMode={isServicesMode}
        isMobileViewport={isMobileViewport}
        isDesktopViewport={isDesktopViewport}
        hasServiceCart={hasServiceCart}
        isAccountDrawerOpen={isAccountDrawerOpen}
        isServicesCartDrawerMode={isServicesCartDrawerMode}
        isFnbOrderSubpage={isFnbOrderSubpage}
        isFnbDetailsSubpage={isFnbDetailsSubpage}
        isBookingSubpage={isBookingSubpage}
        isCheckoutOpen={isCheckoutOpen}
        isSimpleMode={isSimpleMode}
        isResolvedOrderSubpage={isResolvedOrderSubpage}
        isSimpleCartSurfaceMode={isSimpleCartSurfaceMode}
        goStoreBookingPage={goStoreBookingPage}
        setIsCheckoutOpen={setIsCheckoutOpen}
        setCheckoutTab={setCheckoutTab}
        servicesPrimary={servicesPrimary}
        serviceBookingSummaryTitle={serviceBookingSummaryTitle}
        cartCount={cartCount}
        serviceBookingSummarySchedule={serviceBookingSummarySchedule}
        servicePaymentOptions={servicePaymentOptions}
        servicePaymentTiming={servicePaymentTiming}
        money={money}
        cartTotal={cartTotal}
      />
      )}

        {isFnbMode ? (
          <FnbCartDrawerSurface
            cartCount={cartCount}
            cartDrawerProps={fnbCartDrawerRouteProps}
            isDesktop={isDesktopCheckout}
            isMobileViewport={isMobileViewport}
            isOpen={isFnbCartDrawerSurfaceOpen}
            onClose={() => setIsCheckoutOpen(false)}
          />
        ) : null}

        <StorefrontCheckoutDrawerFrame
          compactMode={isFnbMode || isSimpleMode}
          desktop={isDesktopCheckout}
          disabled={isFnbCartDrawerSurfaceOpen || isServicesCartDrawerMode || isSimpleCartSurfaceMode || isDefaultCartSurfaceMode || isBookingSubpage || (isSimpleMode && isResolvedOrderSubpage)}
          fullPage={isFnbOrderSubpage}
          headerContent={(
            <div>
                {isFnbMode ? (
                  <FnbCartDrawerHeader cartCount={cartCount} isMobileViewport={isMobileViewport} />
                ) : isSimpleMode ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product Cart</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#1e293b', fontFamily: servicesDisplayFont }}>Added products</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Review products, adjust quantities, then continue to checkout.</div>
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>
                    {isServicesMode && hasServiceCart ? 'Booking Journey' : `${DGFY_BRAND_NAME} Checkout`}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedStore?.tenant_name || routeSlug || 'Tenant'}</div>
                </>
              )}
              {!(isFnbMode && !isFnbOrderSubpage) && (
                <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', background: '#e6fffb', border: '1px solid #99f6e4', borderRadius: 999, padding: '3px 8px' }}>
                    {cartCount} {isServicesMode && hasServiceCart ? 'service' : 'item'}{cartCount === 1 ? '' : 's'}
                  </span>
                  {(!isServicesMode || !hasServiceCart) && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {activeOrderMethodLabel}
                    </span>
                  )}
                  {isFnbMode && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7c2d12', background: '#ffedd5', border: '1px solid #fdba74', borderRadius: 999, padding: '3px 8px' }}>
                      {fnbCartStatusLabel}
                    </span>
                  )}
                  {isServicesMode && hasServiceCart && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {serviceBookingSummarySchedule}
                    </span>
                    )}
                  </div>
                )}
              </div>
          )}
          hideBackdrop={isFnbOrderSubpage || (isSimpleMode && isResolvedOrderSubpage)}
          hideHeader={isFnbMode && isFnbOrderSubpage}
          isFnbMode={isFnbMode}
          onBack={goStoreCatalogPage}
          onClose={() => setIsCheckoutOpen(false)}
          open={isCheckoutOpen || isFnbOrderSubpage}
          tabBarContent={!isFnbMode ? (
              <div style={{ display: 'flex', gap: 8, padding: isDesktopCheckout ? '14px 18px 8px 18px' : '12px 14px 6px 14px', background: 'rgba(255,255,255,.72)' }}>
                {[
                  ...(isServicesMode && hasServiceCart ? [{ id: 'review', label: 'Booking Summary' }] : []),
                { id: 'checkout', label: isServicesMode && hasServiceCart ? 'Customer Details' : 'Checkout' },
                ...(!isFnbMode ? [
                  { id: 'track', label: 'Track' }
                ] : [])
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCheckoutTab(tab.id);
                  }}
                  style={{ borderRadius: 999, border: `1px solid ${checkoutTab === tab.id ? '#0f766e' : '#cbd5e1'}`, background: checkoutTab === tab.id ? '#e6fffb' : '#fff', color: checkoutTab === tab.id ? '#0f766e' : '#334155', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
        >
            <FnbCheckoutRouteContainer {...fnbCheckoutRouteProps} />

            {checkoutTab === 'review' && hasServiceCart && isServicesMode && (
              <ServiceBookingReviewContainer {...serviceBookingReviewProps} />
            )}

            {!isSimpleMode && !isRetailMode && <FnbTrackingRouteContainer {...fnbTrackingRouteProps} renderDrawer={false} />}
            {isRetailMode && <RetailTrackingRouteContainer {...retailTrackingRouteProps} renderDrawer={false} />}

      </StorefrontCheckoutDrawerFrame>
      {!isSimpleMode && !isRetailMode && <FnbTrackingRouteContainer {...fnbTrackingRouteProps} visible={false} />}
      {isRetailMode && <RetailTrackingRouteContainer {...retailTrackingRouteProps} visible={false} />}
      {isSimpleMode && <TrackingDrawerMount {...simpleTrackingDrawerProps} />}
      <StorefrontOrderSuccessOverlay visible={showOrderSuccessAnimation} />
    </>
  );
}
