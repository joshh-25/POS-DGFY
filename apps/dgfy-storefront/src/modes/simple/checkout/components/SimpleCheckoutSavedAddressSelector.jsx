import { Plus } from 'lucide-react';

import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';
import { getCheckoutAddLocationActionStyle } from '../../../../shared/components/checkout/checkoutUiTokens.js';

const SIMPLE_BRAND = '#176B3A';
const SIMPLE_BRAND_BORDER = '#5eead4';
const SIMPLE_BRAND_SHADOW = 'rgba(23,107,58,0.16)';
const SIMPLE_BRAND_TINT = '#FFF8E7';
const SIMPLE_ADD_LOCATION_ACTION_STYLE = {
  accentColor: SIMPLE_BRAND,
  accentShadow: 'rgba(23,107,58,0.18)'
};

/**
 * MSME fulfillment saved-address selector. Mirrors FnbCheckoutSavedAddressSelector's
 * structure (list + "Add New Location" map-pin trigger) with MSME's own teal accent.
 * The parent owns address persistence, map state, and pin API calls; this view only
 * renders selection state. Kept as MSME's own component per the "two independent
 * checkout trees" decision — not shared with F&B's equivalent.
 */
export function SimpleCheckoutSavedAddressSelector({
  addresses,
  deliveryLocationAction,
  isMobileViewport,
  onOpenMobileAddressList,
  onSelectAddress,
  onStartMapPin,
  selectedAddressId
}) {
  const locations = Array.isArray(addresses) ? addresses : [];
  const isMapOrCurrent = deliveryLocationAction === 'map' || deliveryLocationAction === 'current';
  const activeAddress = locations.find((location) => String(location.id) === String(selectedAddressId))
    || locations.find((location) => location.isDefault)
    || locations[0];

  const renderAddress = (location) => (
    <SavedAddressCard
      key={`simple-delivery-location-${location.id}`}
      address={location}
      isSelected={String(selectedAddressId) === String(location.id) && !isMapOrCurrent}
      isBusy={false}
      onSelect={() => onSelectAddress(location)}
      showActions={false}
      themeColor={SIMPLE_BRAND}
      themeBg={SIMPLE_BRAND_TINT}
      themeHoverBorder={SIMPLE_BRAND_BORDER}
      themeHoverBg="#f0fdfa"
      themeShadowColor={SIMPLE_BRAND_SHADOW}
      themeShadowColorSoft="rgba(23,107,58,0.08)"
    />
  );

  if (isMobileViewport) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Delivery address
        </div>
        {activeAddress ? renderAddress(activeAddress) : (
          <button type="button" aria-label="Add New Location" onClick={onOpenMobileAddressList} style={getCheckoutAddLocationActionStyle(SIMPLE_ADD_LOCATION_ACTION_STYLE)}>
            <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: '#fff', background: 'rgba(255,255,255,.16)' }}><Plus size={18} /></span>
            Add New Location
          </button>
        )}
        {activeAddress ? (
          <button type="button" onClick={onOpenMobileAddressList} style={{ minHeight: 44, borderRadius: 14, background: SIMPLE_BRAND_TINT, border: `1.5px solid ${SIMPLE_BRAND_BORDER}`, color: SIMPLE_BRAND, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            View All Saved Addresses
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {locations.length > 0 ? (
        <div
          className="fnb-saved-locations-scroll"
          data-testid="saved-locations-list"
          style={{ maxHeight: 240, overflowY: 'auto', overscrollBehavior: 'contain', display: 'grid', gap: 8, paddingRight: 4 }}
        >
          {locations.map(renderAddress)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#64748b' }}>No saved addresses yet.</div>
      )}
      <button
        type="button"
        aria-label="Add New Location"
        title="Please pin your location in the map. Use maximize to enlarge the map."
        onClick={onStartMapPin}
        style={getCheckoutAddLocationActionStyle(SIMPLE_ADD_LOCATION_ACTION_STYLE)}
      >
        <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: '#fff', background: 'rgba(255,255,255,.16)' }}>
          <Plus size={18} />
        </span>
        Add New Location
      </button>
    </div>
  );
}
