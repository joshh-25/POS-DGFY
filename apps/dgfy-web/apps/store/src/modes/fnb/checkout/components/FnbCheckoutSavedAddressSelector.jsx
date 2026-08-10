import { Plus } from 'lucide-react';

import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';

/**
 * F&B fulfillment saved-address selector. The parent owns address persistence,
 * defaulting, map pins, and API calls; this view only renders selection state.
 */
export function FnbCheckoutSavedAddressSelector({
  addresses,
  brandBorder,
  brandColor,
  brandShadow,
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
          <button type="button" aria-label="Add New Location" onClick={onOpenMobileAddressList} style={primaryLocationButtonStyle(brandBorder, brandColor, brandShadow, brandTint)}>
            <span style={locationIconStyle(brandColor, '#dbeafe')}><Plus size={18} /></span>
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
        className={locations.length > 3 ? 'fnb-saved-locations-scroll' : undefined}
        style={{ maxHeight: locations.length > 3 ? 240 : 'none', overflowY: locations.length > 3 ? 'auto' : 'visible', display: 'grid', gap: 8, paddingRight: locations.length > 3 ? 4 : 0 }}
      >
        {locations.map(renderAddress)}
      </div>
      <button type="button" aria-label="Add New Location" title="Please pin your location in the map. Use maximize to enlarge the map." onClick={onStartMapPin} style={mapPinButtonStyle(brandBorder, brandColor, brandShadow, brandTint, deliveryLocationAction)}>
        <span style={locationIconStyle(deliveryLocationAction === 'map' ? brandColor : '#94a3b8', deliveryLocationAction === 'map' ? '#dbeafe' : 'transparent')}><Plus size={18} /></span>
        Add New Location
      </button>
    </div>
  );
}

const primaryLocationButtonStyle = (brandBorder, brandColor, brandShadow, brandTint) => ({
  minHeight: 44, borderRadius: 14, border: `1.5px solid ${brandBorder}`, background: brandTint, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, color: brandColor, cursor: 'pointer', flexShrink: 0, boxShadow: `0 10px 20px ${brandShadow}`, transition: 'all 200ms ease', fontSize: 13,
});

const locationIconStyle = (color, background) => ({
  width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color, background, transition: 'all 200ms ease',
});

const mobileListButtonStyle = (brandBorder, brandColor, brandTint) => ({
  minHeight: 44, borderRadius: 14, background: brandTint, border: `1.5px solid ${brandBorder}`, color: brandColor, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
});

const mapPinButtonStyle = (brandBorder, brandColor, brandShadow, brandTint, action) => ({
  minHeight: 44, borderRadius: 12, border: `1.5px solid ${action === 'map' ? brandBorder : '#dbe5ee'}`, background: action === 'map' ? brandTint : '#fff', padding: '0 14px', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, color: '#1e293b', cursor: 'pointer', flexShrink: 0, boxShadow: action === 'map' ? `0 10px 20px ${brandShadow}` : 'none', transition: 'all 200ms ease', fontSize: 13, marginTop: 4,
});
