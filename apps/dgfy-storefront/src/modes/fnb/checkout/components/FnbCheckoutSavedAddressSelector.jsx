import { Plus } from 'lucide-react';

import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';
import { getCheckoutAddLocationActionStyle } from '../../../../shared/components/checkout/checkoutUiTokens.js';

/**
 * F&B fulfillment saved-address selector. The parent owns address persistence,
 * defaulting, map pins, and API calls; this view only renders selection state.
 */
export function FnbCheckoutSavedAddressSelector({
  addresses,
  brandBorder,
  brandColor,
  brandTint,
  deliveryLocationAction,
  isResponsive,
  onOpenMobileAddressList,
  onSelectAddress,
  onStartMapPin,
  selectedAddressId,
}) {
  const locations = Array.isArray(addresses) ? addresses : [];
  const isMapOrCurrent = deliveryLocationAction === 'map' || deliveryLocationAction === 'current';
  const activeAddress = locations.find((location) => String(location.id) === String(selectedAddressId))
    || locations.find((location) => location.isDefault)
    || locations[0];

  const renderAddress = (location) => (
    <SavedAddressCard
      key={`step-one-delivery-location-${location.id}`}
      address={location}
      isSelected={String(selectedAddressId) === String(location.id) && !isMapOrCurrent}
      isBusy={false}
      onSelect={() => onSelectAddress(location)}
      showActions={false}
    />
  );

  if (isResponsive) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Delivery address
        </div>
        {activeAddress ? renderAddress(activeAddress) : (
          <button type="button" aria-label="Add New Location" onClick={onOpenMobileAddressList} style={getCheckoutAddLocationActionStyle()}>
            <span style={locationIconStyle('#fff', 'rgba(255,255,255,.16)')}><Plus size={18} /></span>
            Add New Location
          </button>
        )}
        {activeAddress ? (
          <button type="button" onClick={onOpenMobileAddressList} style={mobileListButtonStyle(brandBorder, brandColor, brandTint)}>
            View All Saved Addresses
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        id="delivery-saved-locations-list"
        className="fnb-saved-locations-scroll"
        data-testid="saved-locations-list"
        style={{ maxHeight: 240, overflowY: 'auto', overscrollBehavior: 'contain', display: 'grid', gap: 8, paddingRight: 4 }}
      >
        {locations.map(renderAddress)}
      </div>
      <button type="button" aria-label="Add New Location" title="Please pin your location in the map. Use maximize to enlarge the map." onClick={onStartMapPin} style={getCheckoutAddLocationActionStyle()}>
        <span style={locationIconStyle('#fff', 'rgba(255,255,255,.16)')}><Plus size={18} /></span>
        Add New Location
      </button>
    </div>
  );
}

const locationIconStyle = (color, background) => ({
  width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color, background, transition: 'all 200ms ease',
});

const mobileListButtonStyle = (brandBorder, brandColor, brandTint) => ({
  minHeight: 44, borderRadius: 14, background: brandTint, border: `1.5px solid ${brandBorder}`, color: brandColor, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
});
