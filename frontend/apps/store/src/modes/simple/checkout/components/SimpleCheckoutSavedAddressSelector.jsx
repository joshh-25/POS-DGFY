import { Plus } from 'lucide-react';

import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';

const SIMPLE_BRAND = '#0f766e';
const SIMPLE_BRAND_BORDER = '#5eead4';
const SIMPLE_BRAND_SHADOW = 'rgba(15,118,110,0.16)';
const SIMPLE_BRAND_TINT = '#ecfeff';

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
  onSelectAddress,
  onStartMapPin,
  selectedAddressId
}) {
  const locations = Array.isArray(addresses) ? addresses : [];
  const isMapOrCurrent = deliveryLocationAction === 'map' || deliveryLocationAction === 'current';

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
      themeShadowColorSoft="rgba(15,118,110,0.08)"
    />
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {locations.length > 0 ? (
        <div
          className={locations.length > 3 ? 'fnb-saved-locations-scroll' : undefined}
          style={{ maxHeight: locations.length > 3 ? 240 : 'none', overflowY: locations.length > 3 ? 'auto' : 'visible', display: 'grid', gap: 8, paddingRight: locations.length > 3 ? 4 : 0 }}
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
        style={{
          minHeight: 44,
          borderRadius: 12,
          border: `1.5px solid ${deliveryLocationAction === 'map' ? SIMPLE_BRAND_BORDER : '#dbe5ee'}`,
          background: deliveryLocationAction === 'map' ? SIMPLE_BRAND_TINT : '#fff',
          padding: isMobileViewport ? '0 12px' : '0 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontWeight: 700,
          color: '#1e293b',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: deliveryLocationAction === 'map' ? `0 10px 20px ${SIMPLE_BRAND_SHADOW}` : 'none',
          transition: 'all 200ms ease',
          fontSize: 13
        }}
      >
        <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: deliveryLocationAction === 'map' ? SIMPLE_BRAND : '#94a3b8', background: deliveryLocationAction === 'map' ? '#ccfbf1' : 'transparent', transition: 'all 200ms ease' }}>
          <Plus size={18} />
        </span>
        Add New Location
      </button>
    </div>
  );
}
