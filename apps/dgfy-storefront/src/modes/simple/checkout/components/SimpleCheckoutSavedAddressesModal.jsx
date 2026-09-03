import { Plus, X } from 'lucide-react';
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
 * MSME mobile "Saved Addresses" bottom sheet, shown when tapping "View All
 * Saved Addresses" on the compact fulfillment card. Mirrors the inline modal
 * F&B renders in FnbCheckoutRouteContainer.jsx, kept as MSME's own component
 * per the "two independent checkout trees" decision.
 */
export function SimpleCheckoutSavedAddressesModal({
  addresses = [],
  deliveryLocationAction,
  isOpen,
  onAddNewLocation,
  onClose,
  onSelectAddress,
  selectedAddressId
}) {
  if (!isOpen) return null;

  const isMapOrCurrent = deliveryLocationAction === 'map' || deliveryLocationAction === 'current';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 16px max(24px, env(safe-area-inset-bottom))', display: 'grid', gap: 16, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', paddingTop: 6 }}>Saved Addresses</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
              <X size={18} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              aria-label="Add New Location"
              onClick={onAddNewLocation}
              style={getCheckoutAddLocationActionStyle({ ...SIMPLE_ADD_LOCATION_ACTION_STYLE, compact: true })}
            >
              <Plus size={16} strokeWidth={2.5} />
              Add New Location
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {addresses.map((location) => (
            <SavedAddressCard
              key={`simple-modal-delivery-location-${location.id}`}
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
          ))}
        </div>
      </div>
    </div>
  );
}
