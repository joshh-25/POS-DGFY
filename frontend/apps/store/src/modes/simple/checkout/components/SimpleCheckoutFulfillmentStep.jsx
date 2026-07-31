import { ChevronLeft, ChevronRight, Info, Maximize, MapPin, Navigation } from 'lucide-react';
import { DeliveryPinMap } from '../../../../features/locations/components/DeliveryPinMap.jsx';
import { SimpleCheckoutExpandedMapModal } from './SimpleCheckoutExpandedMapModal.jsx';
import { SimpleCheckoutFulfillmentChoices } from './SimpleCheckoutFulfillmentChoices.jsx';
import { SimpleCheckoutSavedAddressesModal } from './SimpleCheckoutSavedAddressesModal.jsx';
import { SimpleCheckoutSavedAddressSelector } from './SimpleCheckoutSavedAddressSelector.jsx';
import { SimpleSpecialInstructionsField } from './SimpleSpecialInstructionsField.jsx';

const SIMPLE_BRAND = '#0f766e';
const SIMPLE_BRAND_DARK = '#134e4a';
const SIMPLE_BRAND_SOFT = '#99f6e4';

export function SimpleCheckoutFulfillmentStep({
  canAddPinnedLocation = false,
  canUseGuestCheckoutFlow = false,
  customerPin = null,
  deliveryLocationAction = 'saved',
  deliveryLocationDisplayAddress = '',
  deliverySavedLocations = [],
  fnbScheduleMode = 'asap',
  isDeliveryOrder = false,
  isDgfyCustomerSignedIn = false,
  isMobileViewport = false,
  orderMethod = 'delivery',
  pinLocationError = '',
  pinLocationLoading = false,
  renderGuestCheckoutEntry,
  scheduledFor = '',
  selectedLocation = null,
  selectedSavedLocationId = '',
  servicesBodyFont,
  servicesDisplayFont,
  showExpandedDeliveryMap = false,
  showSimpleMobileAddressModal = false,
  simpleOrderMethodOptions = [],
  simpleStepOneReady = false,
  specialInstructions = '',
  onAddPinnedLocation,
  onBack,
  onCloseExpandedMap,
  onCloseMobileAddressModal,
  onContinue,
  onOpenExpandedMap,
  onOpenMobileAddressList,
  onOrderMethodChange,
  onPinChange,
  onPinMyLocation,
  onScheduleModeChange,
  onScheduledForChange,
  onSelectAddress,
  onSpecialInstructionsChange,
  onStartMapPin
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

  const stopMapOverlayInteraction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 2: Fulfillment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Choose how and when the customer will receive the order, then add optional notes.</div>

      <SimpleCheckoutFulfillmentChoices
        fnbScheduleMode={fnbScheduleMode}
        fnbScheduledFor={scheduledFor}
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        onOrderMethodChange={onOrderMethodChange}
        onScheduleModeChange={onScheduleModeChange}
        onScheduledForChange={onScheduledForChange}
        orderMethod={orderMethod}
        simpleOrderMethodOptions={simpleOrderMethodOptions}
      />

      {isDeliveryOrder && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>3. Where should we deliver your order?</div>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: isMobileViewport ? 'none' : 'uppercase', letterSpacing: isMobileViewport ? 'normal' : '0.04em' }}>
              {isMobileViewport ? 'Select or pin your location on the map.' : 'Saved locations'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '280px minmax(0, 1fr)', gap: 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
            <SimpleCheckoutSavedAddressSelector
              addresses={deliverySavedLocations}
              deliveryLocationAction={deliveryLocationAction}
              isMobileViewport={isMobileViewport}
              onOpenMobileAddressList={onOpenMobileAddressList}
              onSelectAddress={onSelectAddress}
              onStartMapPin={onStartMapPin}
              selectedAddressId={selectedSavedLocationId}
            />
            <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, display: isMobileViewport ? 'none' : 'block' }}>
                Tap anywhere on the map, drag the pin, or use your current location.
              </div>
              <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                <DeliveryPinMap
                  pin={customerPin}
                  onPinChange={onPinChange}
                  disabled={false}
                  height={isMobileViewport ? 'clamp(230px, 34svh, 280px)' : 260}
                  highlighted={deliveryLocationAction === 'map'}
                  highlightColor={SIMPLE_BRAND}
                  highlightGlow="rgba(15,118,110,0.16)"
                  overlayControls={(
                    <>
                      <button
                        type="button"
                        onClick={onPinMyLocation}
                        disabled={pinLocationLoading}
                        style={{ position: 'absolute', top: 12, left: 12, maxWidth: isMobileViewport ? 'calc(100% - 68px)' : 'none', minHeight: 38, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'current' ? SIMPLE_BRAND : '#dbe5ee'}`, background: deliveryLocationAction === 'current' ? '#ecfeff' : '#ffffff', color: deliveryLocationAction === 'current' ? SIMPLE_BRAND_DARK : '#1e293b', padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: pinLocationLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', zIndex: 11, pointerEvents: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        <Navigation size={15} />
                        {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                      </button>
                      <button
                        type="button"
                        onClick={onStartMapPin}
                        style={{ position: 'absolute', right: 12, bottom: 12, minHeight: 34, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'map' ? SIMPLE_BRAND_SOFT : '#dbe5ee'}`, background: deliveryLocationAction === 'map' ? '#ecfeff' : 'rgba(255,255,255,0.96)', color: deliveryLocationAction === 'map' ? SIMPLE_BRAND_DARK : '#334155', padding: '0 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', zIndex: 11, pointerEvents: 'auto' }}
                      >
                        <MapPin size={14} />
                        Drag to adjust pin
                      </button>
                      <button
                        type="button"
                        onClick={onOpenExpandedMap}
                        aria-label="Open large map"
                        title="Open large map"
                        style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 10, background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(15,23,42,0.1)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#334155', zIndex: 12, pointerEvents: 'auto' }}
                      >
                        <Maximize size={18} />
                      </button>
                    </>
                  )}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', width: '100%', maxWidth: '100%', minWidth: 0 }}>
                <div style={{ minHeight: 38, borderRadius: 12, border: `1px solid ${(deliveryLocationAction === 'saved' || deliveryLocationAction === 'current' || deliveryLocationAction === 'map') && deliveryLocationDisplayAddress ? SIMPLE_BRAND_SOFT : '#dbe5ee'}`, background: '#fff', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10, color: deliveryLocationDisplayAddress ? '#334155' : '#94a3b8', fontSize: 13, lineHeight: 1.4, minWidth: 0 }}>
                  {isMobileViewport ? (
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#ecfeff', color: SIMPLE_BRAND, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
                      <MapPin size={13} />
                    </span>
                  ) : null}
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', fontWeight: 600 }}>
                    {deliveryLocationDisplayAddress || 'Pinned delivery address will appear here.'}
                  </span>
                </div>
                <button type="button" onClick={onAddPinnedLocation} disabled={!canAddPinnedLocation} style={{ minHeight: 38, borderRadius: 12, border: `1px solid ${SIMPLE_BRAND}`, background: canAddPinnedLocation ? SIMPLE_BRAND : '#f8fafc', color: canAddPinnedLocation ? '#fff' : '#94a3b8', padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: canAddPinnedLocation ? 'pointer' : 'not-allowed', minWidth: isMobileViewport ? 116 : 132, width: 'auto', boxShadow: canAddPinnedLocation ? '0 8px 16px rgba(15,118,110,0.15)' : 'none' }}>
                  {isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location'}
                </button>
              </div>
              {isMobileViewport ? (
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Info size={15} color="#64748b" />
                  <span>This is the address where your order will be delivered.</span>
                </div>
              ) : null}
              {pinLocationError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</div>}
            </div>
          </div>
          <SimpleCheckoutExpandedMapModal
            bodyFont={servicesBodyFont}
            displayFont={servicesDisplayFont}
            isMobileViewport={isMobileViewport}
            isOpen={showExpandedDeliveryMap}
            onClose={onCloseExpandedMap}
          >
            <DeliveryPinMap
              pin={customerPin}
              onPinChange={onPinChange}
              disabled={false}
              height={isMobileViewport ? 'clamp(340px, min(70svh, calc(100svh - 220px)), 620px)' : 520}
              highlighted
              highlightColor={SIMPLE_BRAND}
              highlightGlow="rgba(15,118,110,0.16)"
              overlayControls={(
                <>
                  <button
                    type="button"
                    onMouseDown={stopMapOverlayInteraction}
                    onPointerDown={stopMapOverlayInteraction}
                    onTouchStart={stopMapOverlayInteraction}
                    onClick={(event) => {
                      stopMapOverlayInteraction(event);
                      onPinMyLocation();
                    }}
                    disabled={pinLocationLoading}
                    style={{ position: 'absolute', top: 12, left: 12, minHeight: 38, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'current' ? SIMPLE_BRAND : '#dbe5ee'}`, background: deliveryLocationAction === 'current' ? '#ecfeff' : '#ffffff', color: deliveryLocationAction === 'current' ? SIMPLE_BRAND_DARK : '#1e293b', padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: pinLocationLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', pointerEvents: 'auto', zIndex: 11 }}
                  >
                    <Navigation size={15} />
                    {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                  </button>
                  <button
                    type="button"
                    onMouseDown={stopMapOverlayInteraction}
                    onPointerDown={stopMapOverlayInteraction}
                    onTouchStart={stopMapOverlayInteraction}
                    onClick={(event) => {
                      stopMapOverlayInteraction(event);
                      onStartMapPin();
                    }}
                    style={{ position: 'absolute', right: 12, bottom: 12, minHeight: 34, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'map' ? SIMPLE_BRAND_SOFT : '#dbe5ee'}`, background: deliveryLocationAction === 'map' ? '#ecfeff' : 'rgba(255,255,255,0.96)', color: deliveryLocationAction === 'map' ? SIMPLE_BRAND_DARK : '#334155', padding: '0 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', pointerEvents: 'auto', zIndex: 11 }}
                  >
                    <MapPin size={14} />
                    Drag to Pin
                  </button>
                </>
              )}
            />
          </SimpleCheckoutExpandedMapModal>
          <SimpleCheckoutSavedAddressesModal
            addresses={deliverySavedLocations}
            deliveryLocationAction={deliveryLocationAction}
            isOpen={showSimpleMobileAddressModal}
            onAddNewLocation={() => {
              onStartMapPin();
              onCloseMobileAddressModal();
            }}
            onClose={onCloseMobileAddressModal}
            onSelectAddress={(location) => {
              onSelectAddress(location);
              onCloseMobileAddressModal();
            }}
            selectedAddressId={selectedSavedLocationId}
          />
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{isDeliveryOrder ? '4.' : '3.'} Anything else we should know?</div>
        <SimpleSpecialInstructionsField
          specialInstructions={specialInstructions}
          onSpecialInstructionsChange={onSpecialInstructionsChange}
        />
      </div>

      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
          <button type="button" onClick={onContinue} disabled={!simpleStepOneReady} style={{ minHeight: 46, borderRadius: 12, border: 'none', background: simpleStepOneReady ? `linear-gradient(180deg, ${SIMPLE_BRAND} 0%, ${SIMPLE_BRAND_DARK} 100%)` : '#cbd5e1', color: '#fff', fontWeight: 700, cursor: simpleStepOneReady ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      )}
      {selectedLocation?.is_open === false && (
        <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
          Selected location is closed and cannot accept orders right now.
        </div>
      )}
    </section>
  );
}
