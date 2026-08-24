import { FnbCheckoutStoreHeader } from '../components/FnbCheckoutStoreHeader.jsx';

/**
 * F&B checkout route frame. It owns only route-level presentation; checkout
 * state, API contracts, and step actions remain in feature hooks/view models.
 */
export function FnbCheckoutRoutePage({
  brandColor,
  brandShadow,
  children,
  contentPadding,
  displayFont,
  isDeliveryOrder,
  isMobileViewport,
  isResponsiveFlow,
  onBack,
  selectedStore,
  textOnBrand,
  withAssetOrigin,
}) {
  return (
    <div style={{ display: 'grid', gap: 0, maxWidth: '100%', margin: '0 auto', width: '100%' }}>
      <FnbCheckoutStoreHeader
        displayFont={displayFont}
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        isResponsiveFlow={isResponsiveFlow}
        onBack={onBack}
        selectedStore={selectedStore}
        textOnBrand={textOnBrand}
        brandColor={brandColor}
        brandShadow={brandShadow}
        withAssetOrigin={withAssetOrigin}
      />
      <div style={{ display: 'grid', gap: isResponsiveFlow ? 16 : 18, maxWidth: 1240, margin: '0 auto', width: '100%', padding: contentPadding, boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  );
}
