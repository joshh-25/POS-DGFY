import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, ShoppingBag, Truck, Zap } from 'lucide-react';
import { DeliveryPinMap } from '../../../../features/locations/components/DeliveryPinMap.jsx';
import { SelectableOptionCard } from '../../../../shared/components/checkout/SelectableOptionCard.jsx';
import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';
import { RetailOrderSavedAddressesModal } from './RetailOrderSavedAddressesModal.jsx';
import { ORDER_METHOD_OPTIONS } from '../../../../shared/model/storefrontConstants.js';

const RETAIL_ACCENT = '#1a4e8d';
const RETAIL_ACCENT_DARK = '#1a4586';
const RETAIL_ACCENT_SHADOW_STRONG = 'rgba(26,69,134,.24)';
const RETAIL_ACCENT_TINT = '#eef4fb';
const RETAIL_ACCENT_SOFT_BORDER = '#b9cfe8';

const ORDER_METHOD_ICONS = {
  delivery: ({ size }) => <Truck size={size} />,
  pickup: ({ size }) => <ShoppingBag size={size} />
};

// Retail only offers Delivery/Pickup — Dine In/Takeout (from the shared
// ORDER_METHOD_OPTIONS list, used by dine-in-capable modes) don't apply here.
const RETAIL_ORDER_METHOD_OPTIONS = ORDER_METHOD_OPTIONS.filter(
  (option) => option.value === 'delivery' || option.value === 'pickup'
);

// Placeholder saved addresses — the Location & Addresses section isn't connected to the DGFY
// account addresses backend yet. See RetailOrderPage.jsx's doc comment. The map itself IS a
// real, interactive DeliveryPinMap.
const PLACEHOLDER_ADDRESSES = [
  { id: 'placeholder-home', label: 'Home', fullAddress: 'Jereos Street, San Pedro, Jaro, Iloilo City', isDefault: true },
  { id: 'placeholder-work', label: 'Work', fullAddress: 'Ledesco Village, La Paz, Iloilo City', isDefault: false }
];

/**
 * Retail order page's Fulfillment step. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx +
 * SimpleCheckoutFulfillmentChoices.jsx's layout (Order Type full row, Schedule below it, then
 * Location, then Special Instructions). Order method, schedule, and saved addresses are all
 * local placeholder state owned by RetailOrderPage — not connected to the backend yet. The map
 * is real/interactive.
 */
export function RetailOrderFulfillmentStep({
  customerPin = null,
  isMobileViewport = false,
  onAddNewLocation,
  onBack,
  onCloseMobileAddressModal,
  onContinue,
  onOpenMobileAddressList,
  onOrderMethodChange,
  onPinChange,
  onScheduleModeChange,
  onScheduledForChange,
  onSelectAddress,
  onSpecialInstructionsChange,
  orderMethod = 'delivery',
  scheduleMode = 'asap',
  scheduledFor = '',
  selectedAddressId = '',
  showMobileAddressModal = false,
  specialInstructions = ''
}) {
  const isDeliveryOrder = orderMethod === 'delivery';
  const activeAddress = PLACEHOLDER_ADDRESSES.find((address) => String(address.id) === String(selectedAddressId))
    || PLACEHOLDER_ADDRESSES.find((address) => address.isDefault)
    || PLACEHOLDER_ADDRESSES[0];

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 2: Fulfillment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Choose how and when the customer will receive the order, then add optional notes.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>1. How would you like to receive your order?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            {RETAIL_ORDER_METHOD_OPTIONS.map((option) => (
              <SelectableOptionCard
                key={`retail-order-method-${option.value}`}
                onClick={() => onOrderMethodChange(option.value)}
                label={option.label}
                icon={ORDER_METHOD_ICONS[option.value] || null}
                active={orderMethod === option.value}
                activeBorderColor={RETAIL_ACCENT}
                activeBackground={RETAIL_ACCENT_TINT}
                activeTextColor={RETAIL_ACCENT}
                activeIconBackground="#dbe8f7"
                activeIconColor={RETAIL_ACCENT}
                inactiveBorderColor="#dbe5ee"
                inactiveTextColor="#334155"
                minHeight={isMobileViewport ? 52 : 64}
                padding={isMobileViewport ? '10px 12px' : '12px 14px'}
                gap={isMobileViewport ? 10 : 12}
                borderRadius={14}
                fontSize={14}
                fontWeight={700}
                iconBoxSize={isMobileViewport ? 34 : 40}
                iconSize={isMobileViewport ? 18 : 20}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>2. When would you like your order?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <SelectableOptionCard
              onClick={() => onScheduleModeChange('asap')}
              label="NOW"
              icon={({ size }) => <Zap size={size} />}
              active={scheduleMode === 'asap'}
              activeBorderColor={RETAIL_ACCENT}
              activeBackground={RETAIL_ACCENT_TINT}
              activeTextColor={RETAIL_ACCENT}
              activeIconBackground="#dbe8f7"
              activeIconColor={RETAIL_ACCENT}
              inactiveBorderColor="#dbe5ee"
              inactiveTextColor="#334155"
              minHeight={isMobileViewport ? 52 : 64}
              padding={isMobileViewport ? '10px 12px' : '12px 14px'}
              gap={isMobileViewport ? 10 : 12}
              borderRadius={14}
              fontSize={14}
              fontWeight={700}
              iconBoxSize={isMobileViewport ? 34 : 40}
              iconSize={isMobileViewport ? 18 : 20}
            />
            <SelectableOptionCard
              onClick={() => onScheduleModeChange('schedule')}
              label="Schedule"
              icon={({ size }) => <CalendarDays size={size} />}
              active={scheduleMode === 'schedule'}
              activeBorderColor={RETAIL_ACCENT}
              activeBackground={RETAIL_ACCENT_TINT}
              activeTextColor={RETAIL_ACCENT}
              activeIconBackground="#dbe8f7"
              activeIconColor={RETAIL_ACCENT}
              inactiveBorderColor="#dbe5ee"
              inactiveTextColor="#334155"
              minHeight={isMobileViewport ? 52 : 64}
              padding={isMobileViewport ? '10px 12px' : '12px 14px'}
              gap={isMobileViewport ? 10 : 12}
              borderRadius={14}
              fontSize={14}
              fontWeight={700}
              iconBoxSize={isMobileViewport ? 34 : 40}
              iconSize={isMobileViewport ? 18 : 20}
            />
          </div>
          {scheduleMode === 'asap' ? (
            <div style={{ borderRadius: 6, border: '1px solid #d1fae5', background: '#f0fdf4', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock3 size={11} color="#16a34a" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#166534', lineHeight: 1.3 }}>{isDeliveryOrder ? 'Your order will be delivered NOW. You\'ll see the estimated time at checkout.' : 'Your order will be prepared NOW. You\'ll see the estimated time at checkout.'}</span>
            </div>
          ) : (
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
              Scheduled date and time
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <style>{`.retail-modern-datetime-input::-webkit-calendar-picker-indicator { display: none !important; -webkit-appearance: none !important; }`}</style>
                <div style={{ position: 'absolute', left: 14, color: RETAIL_ACCENT, pointerEvents: 'none' }}><CalendarDays size={18} /></div>
                <input
                  type="datetime-local"
                  className="retail-modern-datetime-input"
                  value={scheduledFor}
                  onChange={(event) => onScheduledForChange(event.target.value)}
                  onClick={(event) => {
                    try {
                      event.target.showPicker();
                    } catch (error) {
                      // The native picker is optional and not supported by every browser.
                    }
                  }}
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 14px 12px 42px', background: '#f8fafc', color: '#1e293b', fontSize: 14, fontWeight: 600, outline: 'none', boxShadow: 'inset 0 2px 4px rgba(15,23,42,0.02)', transition: 'all 200ms ease', cursor: 'pointer', boxSizing: 'border-box' }}
                  onMouseEnter={(event) => { event.target.style.borderColor = RETAIL_ACCENT; event.target.style.background = '#ffffff'; }}
                  onMouseLeave={(event) => { if (document.activeElement !== event.target) { event.target.style.borderColor = '#cbd5e1'; event.target.style.background = '#f8fafc'; } }}
                  onFocus={(event) => { event.target.style.borderColor = RETAIL_ACCENT; event.target.style.background = '#ffffff'; event.target.style.boxShadow = `0 0 0 3px ${RETAIL_ACCENT_SHADOW_STRONG}, inset 0 2px 4px rgba(15,23,42,0.02)`; }}
                  onBlur={(event) => { event.target.style.borderColor = '#cbd5e1'; event.target.style.background = '#f8fafc'; event.target.style.boxShadow = 'inset 0 2px 4px rgba(15,23,42,0.02)'; }}
                />
              </div>
            </label>
          )}
        </div>
      </div>

      {isDeliveryOrder && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>3. Where should we deliver your order?</div>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: isMobileViewport ? 'none' : 'uppercase', letterSpacing: isMobileViewport ? 'normal' : '0.04em' }}>
              {isMobileViewport ? 'Select or pin your location on the map.' : 'Saved locations'}
            </div>
          </div>
          {isMobileViewport ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Delivery address
              </div>
              {activeAddress ? (
                <SavedAddressCard
                  address={activeAddress}
                  isSelected={String(selectedAddressId) === String(activeAddress.id)}
                  isBusy={false}
                  onSelect={() => onSelectAddress(activeAddress.id)}
                  showActions={false}
                  themeColor={RETAIL_ACCENT}
                  themeBg={RETAIL_ACCENT_TINT}
                  themeHoverBorder={RETAIL_ACCENT_SOFT_BORDER}
                  themeHoverBg="#f5f9fd"
                  themeShadowColor={RETAIL_ACCENT_SHADOW_STRONG}
                  themeShadowColorSoft="rgba(26,69,134,.12)"
                />
              ) : null}
              <button type="button" onClick={onOpenMobileAddressList} style={{ minHeight: 44, borderRadius: 14, background: RETAIL_ACCENT_TINT, border: `1.5px solid ${RETAIL_ACCENT_SOFT_BORDER}`, color: RETAIL_ACCENT, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                View All Saved Addresses
              </button>
              <DeliveryPinMap
                pin={customerPin}
                onPinChange={onPinChange}
                disabled={false}
                height="clamp(230px, 34svh, 280px)"
                highlighted
                highlightColor={RETAIL_ACCENT}
                highlightGlow="rgba(26,69,134,.16)"
              />
              {customerPin ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155', fontWeight: 600 }}>
                  <MapPin size={14} color={RETAIL_ACCENT} />
                  Pinned at {Number(customerPin.latitude).toFixed(5)}, {Number(customerPin.longitude).toFixed(5)}
                </div>
              ) : null}
              <RetailOrderSavedAddressesModal
                addresses={PLACEHOLDER_ADDRESSES}
                isOpen={showMobileAddressModal}
                onAddNewLocation={onAddNewLocation}
                onClose={onCloseMobileAddressModal}
                onSelectAddress={(addressId) => {
                  onSelectAddress(addressId);
                  onCloseMobileAddressModal();
                }}
                selectedAddressId={selectedAddressId}
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {PLACEHOLDER_ADDRESSES.map((address) => (
                    <SavedAddressCard
                      key={`retail-placeholder-address-${address.id}`}
                      address={address}
                      isSelected={String(selectedAddressId) === String(address.id)}
                      isBusy={false}
                      onSelect={() => onSelectAddress(address.id)}
                      showActions={false}
                      themeColor={RETAIL_ACCENT}
                      themeBg={RETAIL_ACCENT_TINT}
                      themeHoverBorder={RETAIL_ACCENT_SOFT_BORDER}
                      themeHoverBg="#f5f9fd"
                      themeShadowColor={RETAIL_ACCENT_SHADOW_STRONG}
                      themeShadowColorSoft="rgba(26,69,134,.12)"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Add New Location"
                  title="Please pin your location in the map. Use maximize to enlarge the map."
                  onClick={onAddNewLocation}
                  style={{ minHeight: 44, borderRadius: 12, border: `1.5px solid ${RETAIL_ACCENT_SOFT_BORDER}`, background: '#fff', padding: '0 14px', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, color: '#1e293b', cursor: 'pointer', flexShrink: 0, fontSize: 13 }}
                >
                  <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: '#94a3b8' }}>
                    <Plus size={18} />
                  </span>
                  Add New Location
                </button>
              </div>
              <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                  Tap anywhere on the map or drag the pin to set the delivery location.
                </div>
                <DeliveryPinMap
                  pin={customerPin}
                  onPinChange={onPinChange}
                  disabled={false}
                  height={260}
                  highlighted
                  highlightColor={RETAIL_ACCENT}
                  highlightGlow="rgba(26,69,134,.16)"
                />
                {customerPin ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155', fontWeight: 600 }}>
                    <MapPin size={14} color={RETAIL_ACCENT} />
                    Pinned at {Number(customerPin.latitude).toFixed(5)}, {Number(customerPin.longitude).toFixed(5)}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{isDeliveryOrder ? '4.' : '3.'} Anything else we should know?</div>
        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
          Special instructions (optional)
          <textarea
            value={specialInstructions}
            onChange={(event) => onSpecialInstructionsChange?.(event.target.value)}
            placeholder="Packing notes, landmark hints, or pickup reminders."
            rows={3}
            style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </label>
      </div>

      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
          <button type="button" onClick={onContinue} style={{ minHeight: 46, borderRadius: 12, border: 'none', background: `linear-gradient(180deg, ${RETAIL_ACCENT} 0%, ${RETAIL_ACCENT_DARK} 100%)`, color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      )}
    </section>
  );
}
