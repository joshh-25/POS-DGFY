import { CalendarDays, ChevronLeft, ChevronRight, Maximize, MapPin, Navigation, Plus, ShoppingBag, Truck, Zap } from 'lucide-react';
import { useState } from 'react';
import { DeliveryPinMap } from '../../../../features/locations/components/DeliveryPinMapLazy.jsx';
import { resolveDeliveryAddressInputValue } from '../../../../features/locations/utils/pinnedDeliveryAddress.js';
import { SelectableOptionCard } from '../../../../shared/components/checkout/SelectableOptionCard.jsx';
import { DeliveryAddressSearchField } from '../../../../shared/components/checkout/DeliveryAddressSearchField.jsx';
import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';
import { RetailOrderExpandedMapModal } from './RetailOrderExpandedMapModal.jsx';
import { RetailOrderSavedAddressesModal } from './RetailOrderSavedAddressesModal.jsx';
import { ORDER_METHOD_OPTIONS } from '../../../../shared/model/storefrontConstants.js';
import { getUnavailableFulfillmentMessage } from '../../../../shared/model/storefrontFulfillmentOptions.js';
import { buildCheckoutSectionNumbers, resolveFulfillmentSelectorPresentation } from '../../../../shared/model/storefrontFulfillmentPresentation.js';
import { FulfillmentMethodNotice } from '../../../../shared/components/checkout/FulfillmentMethodNotice.jsx';
import { StorefrontScheduledDateTimePicker } from '../../../../shared/components/checkout/StorefrontScheduledDateTimePicker.jsx';
import { buildLeadTimeExpectationMessage, resolveOrderTimingPolicy } from '../../../../shared/model/storefrontOrderTimingPolicy.js';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY, getCheckoutAddLocationActionStyle, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';

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
// ORDER_METHOD_OPTIONS list, used by dine-in-capable modes) don't apply here. This is the
// mode's *candidate* set; #1093's `orderMethodOptions` prop further narrows it to what the
// resolved fulfillment location actually supports (falls back to this full set if the prop
// is omitted, so no caller regresses to an empty chooser).
export const RETAIL_ORDER_METHOD_OPTIONS = ORDER_METHOD_OPTIONS.filter(
  (option) => option.value === 'delivery' || option.value === 'pickup'
);

/**
 * Retail order page's Fulfillment step. Order Type/Schedule sections are unchanged local UI.
 * The "Where should we deliver your order?" section (§3) is now real and backend-connected,
 * mirroring modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx exactly: saved
 * addresses (`deliverySavedLocations`), the pin-drop + reverse-geocode flow, "Use Current
 * Location", the expanded map modal, and "Add Address"/"Add Location" all come from the same
 * shared, mode-agnostic hooks F&B/MSME already use (`useSignedInCheckoutAddresses`,
 * `useDeliveryPinResolution`, both instantiated once in StorefrontApp.jsx). Signed-in users'
 * addresses persist to their real DGFY account; guests get session-local pinned locations,
 * matching F&B's own guest behavior.
 */
export function RetailOrderFulfillmentStep({
  canAddPinnedLocation = false,
  customerAddress = '',
  customerPin = null,
  deliveryLocationAction = 'saved',
  deliveryLocationDisplayAddress = '',
  deliverySavedLocations = [],
  isDgfyCustomerSignedIn = false,
  isMobileViewport = false,
  onAddPinnedLocation,
  onBack,
  onCloseExpandedMap,
  onCloseMobileAddressModal,
  onContinue,
  onCustomerAddressChange = () => {},
  onOpenExpandedMap,
  onOpenMobileAddressList,
  onOrderMethodChange,
  onPinChange,
  onPinMyLocation,
  onScheduleModeChange,
  onScheduledForChange,
  onSelectAddress,
  onSelectSearchResult = () => {},
  onSpecialInstructionsChange,
  onStartMapPin,
  orderMethod = 'delivery',
  orderMethodOptions = null,
  pinLocationError = '',
  pinLocationLoading = false,
  resolvingPinnedDeliveryAddress = false,
  searchBias = null,
  scheduleMode = 'asap',
  scheduledFor = '',
  selectedSavedLocationId = '',
  servicesBodyFont,
  servicesDisplayFont,
  showExpandedDeliveryMap = false,
  showMobileAddressModal = false,
  specialInstructions = '',
  orderTimingPolicy = resolveOrderTimingPolicy(),
  storefrontHours
}) {
  const [unavailableMessage, setUnavailableMessage] = useState('');
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const isDeliveryOrder = orderMethod === 'delivery';
  const resolvedOrderMethodOptions = orderMethodOptions || RETAIL_ORDER_METHOD_OPTIONS;
  // #1217: nothing to choose when the location supports exactly one method -- the chooser and
  // its question are replaced by a statement, and the sections below renumber accordingly.
  const { showSelector: showOrderMethodSelector, notice: orderMethodNotice, soleOption: soleOrderMethod } =
    resolveFulfillmentSelectorPresentation(resolvedOrderMethodOptions);
  const activeAddress = deliverySavedLocations.find((location) => String(location.id) === String(selectedSavedLocationId)) || null;
  const { showSchedule, showImmediate, showTimingChooser, showTimingStep } = orderTimingPolicy;
  const showTimingSection = showTimingStep && (showTimingChooser || showSchedule);
  const showScheduledDateTimePicker = (showSchedule && !showImmediate)
    || (showTimingChooser && scheduleMode === 'schedule');
  const sectionNumbers = buildCheckoutSectionNumbers({ showOrderMethodSelector, showTimingStep: showTimingSection, isDeliveryOrder });
  const typography = getCheckoutStepTypography();

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 16, fontFamily: CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.title, color: '#1e293b' }}>Step 2: Fulfillment</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
        {showOrderMethodSelector ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>1. How would you like to receive your order?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            {resolvedOrderMethodOptions.map((option) => {
              const isAvailable = option.available !== false;
              return (
              <SelectableOptionCard
                key={`retail-order-method-${option.value}`}
                onClick={() => {
                  if (!isAvailable) {
                    setUnavailableMessage(getUnavailableFulfillmentMessage(option));
                    return;
                  }
                  setUnavailableMessage('');
                  onOrderMethodChange(option.value);
                }}
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
                unavailable={!isAvailable}
                fontFamily={CHECKOUT_FONT_FAMILY}
              />
              );
            })}
          </div>
          {unavailableMessage ? <div role="alert" style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{unavailableMessage}</div> : null}
        </div>
        ) : (
          <FulfillmentMethodNotice
            accentColor={RETAIL_ACCENT}
            message={orderMethodNotice}
            variant={soleOrderMethod?.value === 'delivery' ? 'delivery-only' : soleOrderMethod?.value === 'pickup' ? 'pickup-only' : soleOrderMethod ? 'info' : 'warning'}
          />
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {showTimingSection ? <>
          <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>{sectionNumbers.timing}. When would you like your order?</div>
          {showTimingChooser ? <div data-testid="order-timing-choice-grid" style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <SelectableOptionCard
              onClick={() => {
                setDateTimePickerOpen(false);
                onScheduleModeChange('asap');
              }}
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
              fontFamily={CHECKOUT_FONT_FAMILY}
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
              fontFamily={CHECKOUT_FONT_FAMILY}
            />
          </div> : null}
          {showSchedule && !showImmediate ? (
            <FulfillmentMethodNotice accentColor={RETAIL_ACCENT} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" />
          ) : null}
          {showScheduledDateTimePicker ? (
            <StorefrontScheduledDateTimePicker
              brandColor={RETAIL_ACCENT}
              brandShadow={RETAIL_ACCENT_SHADOW_STRONG}
              isResponsive={isMobileViewport}
              onApply={onScheduledForChange}
              onOpenChange={setDateTimePickerOpen}
              open={dateTimePickerOpen}
              storefrontHours={storefrontHours}
              leadTimeMinDays={orderTimingPolicy.hasLeadTime ? orderTimingPolicy.leadTimeMinDays : null}
              leadTimeMaxDays={orderTimingPolicy.hasLeadTime ? orderTimingPolicy.leadTimeMaxDays : null}
              value={scheduledFor}
            />
          ) : null}</> : <FulfillmentMethodNotice accentColor={RETAIL_ACCENT} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" data-testid="order-timing-expectation" />}
        </div>
      </div>

      {isDeliveryOrder && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>{sectionNumbers.address}. Where should we deliver your order?</div>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: isMobileViewport ? 'none' : 'uppercase', letterSpacing: isMobileViewport ? 'normal' : '0.04em' }}>
              {isMobileViewport ? 'Search for an address, or pin your location on the map.' : 'Saved locations'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '280px minmax(0, 1fr)', gap: 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
            {isMobileViewport ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Delivery address
                </div>
                {activeAddress ? (
                  <SavedAddressCard
                    address={activeAddress}
                    isSelected
                    isBusy={false}
                    onSelect={() => onSelectAddress(activeAddress)}
                    showActions={false}
                    themeColor={RETAIL_ACCENT}
                    themeBg={RETAIL_ACCENT_TINT}
                    themeHoverBorder={RETAIL_ACCENT_SOFT_BORDER}
                    themeHoverBg="#f5f9fd"
                    themeShadowColor={RETAIL_ACCENT_SHADOW_STRONG}
                    themeShadowColorSoft="rgba(26,69,134,.12)"
                  />
                ) : deliverySavedLocations.length > 0 ? (
                  // #759: with address search and map pinning below, this only needs to lead to
                  // saved addresses; with none saved it used to open an empty list.
                  <button type="button" onClick={onOpenMobileAddressList} style={{ minHeight: 44, borderRadius: 14, background: RETAIL_ACCENT_TINT, border: `1.5px solid ${RETAIL_ACCENT_SOFT_BORDER}`, color: RETAIL_ACCENT, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    Choose a Saved Address
                  </button>
                ) : null}
                {activeAddress ? (
                  <button type="button" onClick={onOpenMobileAddressList} style={{ minHeight: 44, borderRadius: 14, background: RETAIL_ACCENT_TINT, border: `1.5px solid ${RETAIL_ACCENT_SOFT_BORDER}`, color: RETAIL_ACCENT, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    View All Saved Addresses
                  </button>
                ) : null}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {deliverySavedLocations.length > 0 ? (
                  <div data-testid="saved-locations-list" style={{ maxHeight: 240, overflowY: 'auto', overscrollBehavior: 'contain', display: 'grid', gap: 8, paddingRight: 4 }}>
                    {deliverySavedLocations.map((location) => (
                      <SavedAddressCard
                        key={`retail-saved-address-${location.id}`}
                        address={location}
                        isSelected={deliveryLocationAction === 'saved' && String(selectedSavedLocationId) === String(location.id)}
                        isBusy={false}
                        onSelect={() => onSelectAddress(location)}
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
                ) : (
                  <div style={{ fontSize: 12, color: '#64748b' }}>No saved addresses yet.</div>
                )}
                <button
                  type="button"
                  aria-label="Add New Location"
                  title="Please pin your location in the map. Use maximize to enlarge the map."
                  onClick={onStartMapPin}
                  style={getCheckoutAddLocationActionStyle()}
                >
                  <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: '#fff', background: 'rgba(255,255,255,.16)' }}>
                    <Plus size={18} />
                  </span>
                  Add New Location
                </button>
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, display: isMobileViewport ? 'none' : 'block' }}>
                Search for an address, tap anywhere on the map, drag the pin, or use your current location.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
                <DeliveryAddressSearchField
                  value={resolveDeliveryAddressInputValue(customerAddress, deliveryLocationDisplayAddress)}
                  onValueChange={onCustomerAddressChange}
                  onSelectResult={onSelectSearchResult}
                  bias={searchBias}
                  resolving={resolvingPinnedDeliveryAddress}
                  highlighted={Boolean(deliveryLocationDisplayAddress) && (deliveryLocationAction === 'saved' || deliveryLocationAction === 'current' || deliveryLocationAction === 'map')}
                  isMobileViewport={isMobileViewport}
                  accentColor={RETAIL_ACCENT}
                  accentTint={RETAIL_ACCENT_TINT}
                  accentBorder={RETAIL_ACCENT_SOFT_BORDER}
                />
                <button type="button" aria-label={isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location'} title={isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location'} onClick={onAddPinnedLocation} disabled={!canAddPinnedLocation} style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: `1px solid ${RETAIL_ACCENT}`, background: canAddPinnedLocation ? RETAIL_ACCENT : '#f8fafc', color: canAddPinnedLocation ? '#fff' : '#94a3b8', padding: isMobileViewport ? 0 : '0 14px', cursor: canAddPinnedLocation ? 'pointer' : 'not-allowed', minWidth: isMobileViewport ? CHECKOUT_CONTROL_MIN_HEIGHT : 132, width: isMobileViewport ? CHECKOUT_CONTROL_MIN_HEIGHT : 'auto', boxShadow: canAddPinnedLocation ? '0 8px 16px rgba(26,69,134,.15)' : 'none', fontFamily: CHECKOUT_FONT_FAMILY, display: 'inline-grid', placeItems: 'center' }}>
                  {isMobileViewport ? <span aria-hidden="true" style={{ position: 'relative', display: 'grid', placeItems: 'center' }}><MapPin size={18} /><Plus size={10} strokeWidth={3} style={{ position: 'absolute', right: -5, bottom: -3, background: canAddPinnedLocation ? RETAIL_ACCENT : '#f8fafc', borderRadius: 999 }} /></span> : (isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location')}
                </button>
              </div>
              {pinLocationError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</div>}
              <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                <DeliveryPinMap
                  pin={customerPin}
                  onPinChange={onPinChange}
                  disabled={false}
                  height={isMobileViewport ? 'clamp(230px, 34svh, 280px)' : 260}
                  highlighted={deliveryLocationAction === 'map'}
                  highlightColor={RETAIL_ACCENT}
                  highlightGlow="rgba(26,69,134,.16)"
                  overlayControls={(
                    <>
                      <button
                        type="button"
                        onClick={onPinMyLocation}
                        disabled={pinLocationLoading}
                        style={{ position: 'absolute', top: 12, left: 12, maxWidth: isMobileViewport ? 'calc(100% - 68px)' : 'none', minHeight: 38, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'current' ? RETAIL_ACCENT : '#dbe5ee'}`, background: deliveryLocationAction === 'current' ? RETAIL_ACCENT_TINT : '#ffffff', color: deliveryLocationAction === 'current' ? RETAIL_ACCENT_DARK : '#1e293b', padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: pinLocationLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', zIndex: 11, pointerEvents: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        <Navigation size={15} />
                        {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                      </button>
                      <button
                        type="button"
                        onClick={onStartMapPin}
                        style={{ position: 'absolute', right: 12, bottom: 12, minHeight: 34, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'map' ? RETAIL_ACCENT_SOFT_BORDER : '#dbe5ee'}`, background: deliveryLocationAction === 'map' ? RETAIL_ACCENT_TINT : 'rgba(255,255,255,0.96)', color: deliveryLocationAction === 'map' ? RETAIL_ACCENT_DARK : '#334155', padding: '0 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', zIndex: 11, pointerEvents: 'auto' }}
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
            </div>
          </div>
          <RetailOrderExpandedMapModal
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
              scrollZoom={false}
              height={isMobileViewport ? 'clamp(340px, min(70svh, calc(100svh - 220px)), 620px)' : 520}
              highlighted
              highlightColor={RETAIL_ACCENT}
              highlightGlow="rgba(26,69,134,.16)"
              overlayControls={(
                <>
                  <button
                    type="button"
                    onClick={onPinMyLocation}
                    disabled={pinLocationLoading}
                    style={{ position: 'absolute', top: 12, left: 12, minHeight: 38, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'current' ? RETAIL_ACCENT : '#dbe5ee'}`, background: deliveryLocationAction === 'current' ? RETAIL_ACCENT_TINT : '#ffffff', color: deliveryLocationAction === 'current' ? RETAIL_ACCENT_DARK : '#1e293b', padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: pinLocationLoading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', pointerEvents: 'auto', zIndex: 11 }}
                  >
                    <Navigation size={15} />
                    {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                  </button>
                  <button
                    type="button"
                    onClick={onStartMapPin}
                    style={{ position: 'absolute', right: 12, bottom: 12, minHeight: 34, borderRadius: 999, border: `1px solid ${deliveryLocationAction === 'map' ? RETAIL_ACCENT_SOFT_BORDER : '#dbe5ee'}`, background: deliveryLocationAction === 'map' ? RETAIL_ACCENT_TINT : 'rgba(255,255,255,0.96)', color: deliveryLocationAction === 'map' ? RETAIL_ACCENT_DARK : '#334155', padding: '0 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', pointerEvents: 'auto', zIndex: 11 }}
                  >
                    <MapPin size={14} />
                    Drag to Pin
                  </button>
                </>
              )}
            />
          </RetailOrderExpandedMapModal>
          <RetailOrderSavedAddressesModal
            addresses={deliverySavedLocations}
            isOpen={showMobileAddressModal}
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
        <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>{sectionNumbers.notes}. Anything else we should know?</div>
        <label style={{ display: 'grid', gap: 6, ...typography.fieldLabel, color: '#475569' }}>
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
          <button type="button" onClick={onBack} style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: CHECKOUT_FONT_FAMILY }}><ChevronLeft size={18} /> Back</button>
          <button type="button" onClick={onContinue} style={{ ...typography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: 'none', background: `linear-gradient(180deg, ${RETAIL_ACCENT} 0%, ${RETAIL_ACCENT_DARK} 100%)`, color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: CHECKOUT_FONT_FAMILY }}>Continue <ChevronRight size={18} /></button>
        </div>
      )}
    </section>
  );
}
