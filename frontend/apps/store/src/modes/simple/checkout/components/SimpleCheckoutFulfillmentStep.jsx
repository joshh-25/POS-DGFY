import { SimpleCheckoutScheduleFields } from './SimpleCheckoutScheduleFields.jsx';
import { SimpleDeliveryAddressField } from './SimpleDeliveryAddressField.jsx';
import { SimpleDeliveryPinPanel } from './SimpleDeliveryPinPanel.jsx';
import { SimpleOrderMethodSelector } from './SimpleOrderMethodSelector.jsx';

export function SimpleCheckoutFulfillmentStep({
  canUseGuestCheckoutFlow = false,
  customerAddress = '',
  customerPin = null,
  isDeliveryOrder = false,
  isDgfyCustomerSignedIn = false,
  isMobileViewport = false,
  orderMethod = 'delivery',
  pinLocationError = '',
  pinLocationLoading = false,
  renderGuestCheckoutEntry,
  scheduledFor = '',
  selectedLocation = null,
  selectedLocationId = null,
  simpleOrderMethodOptions = [],
  simpleStepOneReady = false,
  specialInstructions = '',
  storeLocations = [],
  onBack,
  onContinue,
  onCustomerAddressChange,
  onOrderMethodChange,
  onPinChange,
  onPinClear,
  onPinMyLocation,
  onScheduledForChange,
  onSelectedLocationChange,
  onSpecialInstructionsChange
}) {
  if (!isDgfyCustomerSignedIn && !canUseGuestCheckoutFlow) {
    return renderGuestCheckoutEntry({
      title: 'Continue to your order',
      description: 'Create an account or continue as guest to continue this order.',
      resumeTarget: {
        checkoutTab: 'checkout',
        simpleOrderStep: 2
      }
    });
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Step 2: Fulfillment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Choose how the customer will receive the order, then add optional timing or notes once.</div>
      {storeLocations.length > 0 && (
        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
          Fulfillment Location
          <select
            value={selectedLocationId ?? ''}
            onChange={(event) => onSelectedLocationChange(event.target.value ? Number(event.target.value) : null)}
            style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
          >
            {storeLocations.map((location) => (
              <option key={location.location_id} value={location.location_id} disabled={location.is_open === false || location.is_active === false}>
                {location.name} {location.is_primary_storefront ? '(Primary)' : ''} {location.is_open === false ? '(Closed)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <SimpleOrderMethodSelector
        isMobileViewport={isMobileViewport}
        options={simpleOrderMethodOptions}
        orderMethod={orderMethod}
        onOrderMethodChange={onOrderMethodChange}
      />
      <SimpleCheckoutScheduleFields
        isMobileViewport={isMobileViewport}
        scheduledFor={scheduledFor}
        specialInstructions={specialInstructions}
        onScheduledForChange={onScheduledForChange}
        onSpecialInstructionsChange={onSpecialInstructionsChange}
      />
      {isDgfyCustomerSignedIn && isDeliveryOrder && (
        <SimpleDeliveryAddressField
          customerAddress={customerAddress}
          onCustomerAddressChange={onCustomerAddressChange}
        />
      )}

      {isDeliveryOrder && (
        <SimpleDeliveryPinPanel
          customerPin={customerPin}
          pinLocationError={pinLocationError}
          pinLocationLoading={pinLocationLoading}
          onClearPin={onPinClear}
          onPinChange={onPinChange}
          onPinMyLocation={onPinMyLocation}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={{ minHeight: isMobileViewport ? 38 : 42, minWidth: isMobileViewport ? 120 : 136, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 18px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: isMobileViewport ? 14 : 15 }}>Back</button>
        <button type="button" onClick={onContinue} disabled={!simpleStepOneReady} style={{ minHeight: isMobileViewport ? 38 : 42, minWidth: isMobileViewport ? 140 : 156, borderRadius: 12, border: 'none', background: simpleStepOneReady ? '#ea580c' : '#cbd5e1', color: '#fff', padding: '0 18px', fontWeight: 800, cursor: simpleStepOneReady ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: isMobileViewport ? 14 : 15 }}>Continue</button>
      </div>
      {selectedLocation?.is_open === false && (
        <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
          Selected location is closed and cannot accept orders right now.
        </div>
      )}
    </section>
  );
}
