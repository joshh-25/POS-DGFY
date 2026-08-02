import { Plus, X } from 'lucide-react';
import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';

const RETAIL_ACCENT = '#1a4e8d';
const RETAIL_ACCENT_SOFT_BORDER = '#b9cfe8';
const RETAIL_ACCENT_SHADOW = 'rgba(26,78,141,.16)';
const RETAIL_ACCENT_TINT = '#eef4fb';

/**
 * Retail mobile "Saved Addresses" bottom sheet, shown when tapping "View All Saved Addresses"
 * on the compact fulfillment card. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutSavedAddressesModal.jsx, kept as its own file
 * per the "independent trees" pattern. Addresses are placeholder data — not connected to the
 * DGFY account addresses backend yet, per RetailOrderPage.jsx's doc comment.
 */
export function RetailOrderSavedAddressesModal({
  addresses = [],
  isOpen,
  onAddNewLocation,
  onClose,
  onSelectAddress,
  selectedAddressId
}) {
  if (!isOpen) return null;

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
              style={{ height: 32, borderRadius: 999, border: 'none', background: RETAIL_ACCENT_TINT, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: RETAIL_ACCENT, cursor: 'pointer', fontSize: 13 }}
            >
              <Plus size={16} strokeWidth={2.5} />
              Add New Location
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {addresses.map((address) => (
            <SavedAddressCard
              key={`retail-modal-delivery-location-${address.id}`}
              address={address}
              isSelected={String(selectedAddressId) === String(address.id)}
              isBusy={false}
              onSelect={() => onSelectAddress(address.id)}
              showActions={false}
              themeColor={RETAIL_ACCENT}
              themeBg={RETAIL_ACCENT_TINT}
              themeHoverBorder={RETAIL_ACCENT_SOFT_BORDER}
              themeHoverBg="#f5f9fd"
              themeShadowColor={RETAIL_ACCENT_SHADOW}
              themeShadowColorSoft="rgba(26,78,141,.08)"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
