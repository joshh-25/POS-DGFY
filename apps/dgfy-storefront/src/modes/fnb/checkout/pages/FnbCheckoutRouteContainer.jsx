import React from 'react';
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  Maximize,
  Navigation,
  Plus,
  X
} from 'lucide-react';
import { DeliveryPinMap } from '../../../../features/locations/components/DeliveryPinMapLazy.jsx';
import { hasExplicitDeliveryAddressEdit } from '../../../../features/locations/utils/pinnedDeliveryAddress.js';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import SavedAddressCard from '../../../../shared/components/checkout/SavedAddressCard.jsx';
import { PaymentMethodSelectorBlock } from '../../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';
import { DownpaymentPaymentCallout } from '../../../../shared/components/checkout/DownpaymentPaymentCallout.jsx';
import { PaymentElectionSelector } from '../../../../shared/components/checkout/PaymentElectionSelector.jsx';
import { isCustomerChoiceStore, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';
import { requiresBillingEmail } from '../../../../checkout/checkoutValidation.js';
import {
  MOBILE_DROPDOWN_MENU_STYLE,
  MOBILE_DROPDOWN_OPTION_STYLE,
  MOBILE_NATIVE_SELECT_STYLE
} from '../../../../shared/theme/storefrontStyleTokens.js';
import { formatStorefrontHoursLabel } from '../../../../shared/model/storefrontHoursModel.js';
import { FnbCheckoutConfirmation } from '../components/FnbCheckoutConfirmation.jsx';
import { FnbCheckoutCustomerStep } from '../components/FnbCheckoutCustomerStep.jsx';
import { FnbCheckoutCustomerStepView } from '../components/FnbCheckoutCustomerStepView.jsx';
import { FnbCheckoutDesktopSummary } from '../components/FnbCheckoutDesktopSummary.jsx';
import { FnbCheckoutExpandedMapModal } from '../components/FnbCheckoutExpandedMapModal.jsx';
import { FnbCheckoutFulfillmentChoices } from '../components/FnbCheckoutFulfillmentChoices.jsx';
import { FnbCheckoutFulfillmentStep } from '../components/FnbCheckoutFulfillmentStep.jsx';
import { FnbCheckoutFulfillmentStepView } from '../components/FnbCheckoutFulfillmentStepView.jsx';
import { FnbCheckoutMobileSummaryPanel } from '../components/FnbCheckoutMobileSummaryPanel.jsx';
import { FnbCheckoutPaymentStep } from '../components/FnbCheckoutPaymentStep.jsx';
import { FnbCheckoutPaymentStepView } from '../components/FnbCheckoutPaymentStepView.jsx';
import { FnbQrphPaymentPanel } from '../components/FnbQrphPaymentPanel.jsx';
import { FnbCheckoutRouteBody } from '../components/FnbCheckoutRouteBody.jsx';
import { FnbCheckoutSavedAddressSelector } from '../components/FnbCheckoutSavedAddressSelector.jsx';
import { FnbCheckoutSummaryContent } from '../components/FnbCheckoutSummaryContent.jsx';
import { FnbGuestEmailVerification } from '../components/FnbGuestEmailVerification.jsx';
import {
  buildStorefrontCheckoutPaymentOptions
} from '../model/fnbCheckoutPaymentOptions.js';
import {
  getStorefrontOnlinePaymentLabel,
  isStorefrontHostedPaymentType,
  isStorefrontOnlinePaymentType
} from '../../../../shared/services/storefrontOnlinePaymentSession.js';
import { FnbCheckoutRouteMount } from './FnbCheckoutRouteMount.jsx';
import { buildCheckoutSectionNumbers, resolveFulfillmentSelectorPresentation } from '../../../../shared/model/storefrontFulfillmentPresentation.js';
import { resolveOrderTimingPolicy } from '../../../../shared/model/storefrontOrderTimingPolicy.js';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY, getCheckoutAddLocationActionStyle, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the inline F&B order/checkout
 * journey (fulfillment step, saved-address selector + delivery pin map,
 * customer step, payment step, mobile summary panel, confirmation). This is
 * the body previously rendered inline inside the shell's
 * `<StorefrontCheckoutDrawerFrame>` between the `FnbCheckoutRouteMount`
 * open/close tags. Placed in `modes/fnb/checkout/pages/` (alongside
 * `FnbCheckoutRouteMount.jsx`) since it is entirely F&B-mode-owned.
 *
 * All props are runtime values/handlers bundled by
 * `useFnbCheckoutRouteProps` in `../hooks/useFnbCheckoutRouteProps.js`; the
 * components rendered here are imported directly since they don't vary
 * per-render.
 */
export function FnbCheckoutRouteContainer({
  applySavedDeliveryLocation,
  canAddPinnedLocation,
  canUseGuestCheckoutFlow,
  guestCheckoutAllowed = true,
  cart,
  cartCount,
  cartImageErrors,
  checkoutAllowed,
  checkoutError,
  checkoutLoading,
  checkoutResult,
  checkoutTab,
  customerAddress,
  customerEmail,
  customerName,
  customerPhone,
  customerPin,
  deliveryLocationAction,
  deliveryLocationDisplayAddress,
  deliverySavedLocations,
  dgfyIceBlue,
  dgfyIceBlueBorder,
  dgfyProgressComplete,
  fnbCheckoutContentPadding,
  fnbCustomerStepComplete,
  fnbFulfillmentStepComplete,
  orderTimingPolicy,
  fulfillmentOptions,
  fnbMobileSummaryItemCountLabel,
  fnbOrderBrand,
  fnbOrderBrandBorder,
  fnbOrderBrandDark,
  fnbOrderBrandShadow,
  fnbOrderBrandShadowStrong,
  fnbOrderBrandSoft,
  fnbOrderBrandTint,
  fnbOrderMobileOptionHeight,
  fnbOrderMobileOptionIconBox,
  fnbOrderMobileOptionTextSize,
  fnbOrderMutedBlueText,
  fnbOrderStep,
  fnbOrderStepRenderKey,
  fnbOrderTextOnBrand,
  fnbPaymentType,
  fnbScheduleMode,
  fnbScheduledFor,
  fnbScheduleSummaryLabel,
  fnbSpecialInstructions,
  goStoreCatalogPage,
  goStoreTrackPage,
  guestCheckoutOtpCode,
  guestCheckoutOtpCooldownLabel,
  guestCheckoutOtpError,
  guestCheckoutOtpLoading,
  guestCheckoutOtpVerified,
  handleAddPinnedLocation,
  handleApplyGuestDetailsAndRequestOtp,
  handleCheckout,
  handleDownloadCheckoutImage,
  handleGuestCheckoutOtpCodeChange,
  onPaymentElectionChange,
  handlePaymentTypeChange,
  handlePinMyLocation,
  handleConfirmQrphTestPayment,
  handleRemoveDeliveryAddress,
  handleRequestGuestCheckoutOtp,
  handleSetDefaultDeliveryAddress,
  handleVerifyGuestCheckoutOtp,
  isDeliveryOrder,
  isDesktopCheckout,
  isDgfyCustomerSignedIn,
  isFnbMode,
  isFnbOrderResponsiveFlow,
  isFnbOrderSubpage,
  isGuestCheckoutOtpCooldownActive,
  isMobileViewport,
  money,
  orderMethod,
  paymentElection = 'full',
  pinLocationError,
  pinLocationLoading,
  promoDiscountSummaryRow,
  voucherDiscountSummaryRow,
  qrphPaymentSession,
  qrphPaymentStatusLoading,
  quoteError,
  renderAccountOwnedIdentitySummary,
  renderBillingEmailPrompt,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  renderPromoCodePanel,
  renderStorefrontClosedNotice,
  resetQrphPaymentSession,
  resolvingPinnedDeliveryAddress,
  selectedSavedLocationId,
  selectedStore,
  servicesBodyFont,
  servicesDisplayFont,
  setCartImageErrors,
  setCheckoutResult,
  setCheckoutTab,
  setCustomerAddress,
  setCustomerPin,
  setDeliveryLocationAction,
  setFnbOrderStep,
  setFnbScheduleMode,
  setFnbScheduledFor,
  setFnbSpecialInstructions,
  setIsCheckoutOpen,
  setOrderMethod,
  setPinLocationError,
  setResolvedDeliveryAddress,
  setSelectedSavedLocationId,
  setSelectedTrackingPin,
  setShowExpandedDeliveryMap,
  setShowFnbMobileOrderSummary,
  setShowMobileAddressModal,
  setTrackingPinInput,
  showExpandedDeliveryMap,
  showFnbMobileOrderSummary,
  showMobileAddressModal,
  storefrontClosedByHours,
  totalsForDisplay,
  withAssetOrigin,
}) {
  // Phase 142 (#823): quote-sourced (this container renders before a payment session exists).
  const downpaymentDisplay = resolveDownpaymentDisplay({ quoteResult: totalsForDisplay });
  // #963: see RetailOrderPaymentStep.jsx for the rationale -- same gate, same shared helper.
  const fnbBillingEmailRequired = requiresBillingEmail({ paymentType: fnbPaymentType, customerEmail });
  const resolvedFnbOrderTimingPolicy = orderTimingPolicy || resolveOrderTimingPolicy();
  const fnbSectionNumbers = buildCheckoutSectionNumbers({
    showOrderMethodSelector: resolveFulfillmentSelectorPresentation(fulfillmentOptions).showSelector,
    showTimingStep: resolvedFnbOrderTimingPolicy.showTimingStep,
    isDeliveryOrder
  });
  const checkoutTypography = getCheckoutStepTypography();
  return (
  <FnbCheckoutRouteMount
      isActive={isFnbOrderSubpage && isFnbMode && checkoutTab !== 'track'}
      brandColor={fnbOrderBrand}
      brandShadow={fnbOrderBrandShadowStrong}
      contentPadding={fnbCheckoutContentPadding}
      displayFont={servicesDisplayFont}
      isDeliveryOrder={isDeliveryOrder}
      isMobileViewport={isMobileViewport}
      isResponsiveFlow={isFnbOrderResponsiveFlow}
      onBack={goStoreCatalogPage}
      selectedStore={selectedStore}
      textOnBrand={fnbOrderTextOnBrand}
      withAssetOrigin={withAssetOrigin}
    >
  
      <FnbCheckoutRouteBody
        journeyHeaderProps={{
          activeStep: fnbOrderStep,
          accentBorder: dgfyIceBlueBorder,
          accentColor: fnbOrderBrand,
          accentSoft: dgfyIceBlue,
          cartCount,
          cartHasItems: cart.length > 0,
          completeColor: dgfyProgressComplete,
          displayFont: servicesDisplayFont,
          isCustomerStepComplete: fnbCustomerStepComplete,
          isDeliveryOrder,
          isFulfillmentStepComplete: fnbFulfillmentStepComplete,
          isMobileViewport,
          onStepChange: setFnbOrderStep,
          signedIn: isDgfyCustomerSignedIn
        }}
        stepRenderKey={fnbOrderStepRenderKey}
      >
      {fnbOrderStep === 2 && (
        <FnbCheckoutFulfillmentStepView isDesktop={isDesktopCheckout}>
          {isDgfyCustomerSignedIn || canUseGuestCheckoutFlow ? (
          <FnbCheckoutFulfillmentStep
            isMobileViewport={isMobileViewport}
            isResponsive={isFnbOrderResponsiveFlow}
          >
            <FnbCheckoutFulfillmentChoices
              fnbOrderBrand={fnbOrderBrand}
              fnbOrderBrandBorder={fnbOrderBrandBorder}
              fnbOrderBrandShadow={fnbOrderBrandShadow}
              fnbOrderBrandShadowStrong={fnbOrderBrandShadowStrong}
              fnbScheduleMode={fnbScheduleMode}
              fnbScheduledFor={fnbScheduledFor}
              fulfillmentOptions={fulfillmentOptions}
              isDeliveryOrder={isDeliveryOrder}
              isMobileViewport={isMobileViewport}
              isResponsive={isFnbOrderResponsiveFlow}
              mobileOptionHeight={fnbOrderMobileOptionHeight}
              mobileOptionIconBox={fnbOrderMobileOptionIconBox}
              mobileOptionTextSize={fnbOrderMobileOptionTextSize}
              onOrderMethodChange={setOrderMethod}
              onScheduleModeChange={(nextMode) => {
                setFnbScheduleMode(nextMode);
                if (nextMode === 'asap') setFnbScheduledFor('');
              }}
              onScheduledForChange={(nextValue) => {
                setFnbScheduleMode('schedule');
                setFnbScheduledFor(nextValue);
              }}
              orderMethod={orderMethod}
              orderTimingPolicy={orderTimingPolicy}
              scheduleHoursLabel={formatStorefrontHoursLabel(selectedStore?.storefront_hours, selectedStore?.storefront_hours_status?.display || '')}
            />                      {isDeliveryOrder && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ ...checkoutTypography.sectionTitle, color: '#1e293b' }}>{fnbSectionNumbers.address}. Where should we deliver your order?</div>
                  <div style={{ ...checkoutTypography.description, color: '#64748b', textTransform: isFnbOrderResponsiveFlow ? 'none' : 'uppercase', letterSpacing: isFnbOrderResponsiveFlow ? 'normal' : '0.04em', fontFamily: CHECKOUT_FONT_FAMILY }}>
                    {isFnbOrderResponsiveFlow ? 'Select or pin your location on the map.' : 'Saved locations'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isFnbOrderResponsiveFlow ? '1fr' : '280px minmax(0, 1fr)', gap: 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
                  <FnbCheckoutSavedAddressSelector
                    addresses={deliverySavedLocations}
                    brandBorder={fnbOrderBrandBorder}
                    brandColor={fnbOrderBrand}
                    brandShadow={fnbOrderBrandShadow}
                    brandTint={fnbOrderBrandTint}
                    deliveryLocationAction={deliveryLocationAction}
                    isResponsive={isFnbOrderResponsiveFlow}
                    onOpenMobileAddressList={() => setShowMobileAddressModal(true)}
                    onSelectAddress={(location) => {
                      applySavedDeliveryLocation(location);
                      if (typeof handleSetDefaultDeliveryAddress === 'function' && !location.isDefault) {
                        handleSetDefaultDeliveryAddress(location);
                      }
                    }}
                    onStartMapPin={() => {
                      setDeliveryLocationAction('map');
                      setSelectedSavedLocationId('');
                      setPinLocationError('');
                      setResolvedDeliveryAddress('');
                      setCustomerAddress('');
                      setCustomerPin(null);
                    }}
                    selectedAddressId={selectedSavedLocationId}
                  />
                  <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
                    <div style={{ display: 'none' }} aria-hidden="true">Delivery orders need a pinned map location.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, fontFamily: CHECKOUT_FONT_FAMILY, display: isFnbOrderResponsiveFlow ? 'none' : 'block' }}>
                        {resolvingPinnedDeliveryAddress
                          ? 'Resolving address from your pinned location...'
                          : 'Tap anywhere on the map, drag the pin, or use your current location.'}
                      </div>
                      <div id="delivery-location-map-panel" style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                        <DeliveryPinMap
                          pin={customerPin}
                          onPinChange={(nextPin) => {
                            setDeliveryLocationAction('map');
                            setSelectedSavedLocationId('');
                            setCustomerPin(nextPin);
                          }}
                          disabled={false}
                          height={isMobileViewport ? 'clamp(230px, 34svh, 280px)' : 260}
                          highlighted={deliveryLocationAction === 'map'}
                          highlightColor={fnbOrderBrand}
                          highlightGlow="rgba(26,78,141,0.16)"
                          overlayControls={(
                            <>
                              <button
                                type="button"
                                onClick={handlePinMyLocation}
                                disabled={pinLocationLoading}
                                style={{
                                  position: 'absolute',
                                  top: 12,
                                  left: 12,
                                  maxWidth: isMobileViewport ? 'calc(100% - 68px)' : 'none',
                                  minHeight: 38,
                                  borderRadius: 999,
                                  border: `1px solid ${deliveryLocationAction === 'current' ? fnbOrderBrand : '#dbe5ee'}`,
                                  background: deliveryLocationAction === 'current' ? '#dbeafe' : '#ffffff',
                                  color: deliveryLocationAction === 'current' ? fnbOrderBrandDark : '#1e293b',
                                  padding: '0 12px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: pinLocationLoading ? 'wait' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                                  zIndex: 11,
                                  fontFamily: servicesBodyFont,
                                  pointerEvents: 'auto',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                              >
                                <Navigation size={15} />
                                {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeliveryLocationAction('map');
                                  setSelectedSavedLocationId('');
                                }}
                                style={{
                                  position: 'absolute',
                                  right: 12,
                                  bottom: 12,
                                  minHeight: 34,
                                  borderRadius: 999,
                                  border: `1px solid ${deliveryLocationAction === 'map' ? fnbOrderBrandBorder : '#dbe5ee'}`,
                                  background: deliveryLocationAction === 'map' ? '#dbeafe' : 'rgba(255,255,255,0.96)',
                                  color: deliveryLocationAction === 'map' ? fnbOrderBrandDark : '#334155',
                                  padding: '0 10px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                                  zIndex: 11,
                                  fontFamily: servicesBodyFont,
                                  pointerEvents: 'auto'
                                }}
                              >
                                <MapPin size={14} />
                                Drag to adjust pin
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowExpandedDeliveryMap(true)}
                                aria-label="Open large map"
                                title="Open large map"
                                style={{
                                  position: 'absolute',
                                  top: 12,
                                  right: 12,
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  background: '#fff',
                                  border: '1px solid #cbd5e1',
                                  boxShadow: '0 4px 12px rgba(15,23,42,0.1)',
                                  display: 'grid',
                                  placeItems: 'center',
                                  cursor: 'pointer',
                                  color: '#334155',
                                  zIndex: 12,
                                  pointerEvents: 'auto'
                                }}
                              >
                                <Maximize size={18} />
                              </button>
                            </>
                          )}
                        />
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) auto',
                          gap: 10,
                          alignItems: 'center',
                          width: '100%',
                          maxWidth: '100%',
                          minWidth: 0
                        }}
                      >
                        <div style={{
                          minHeight: CHECKOUT_CONTROL_MIN_HEIGHT,
                          borderRadius: 12,
                          border: `1px solid ${(deliveryLocationAction === 'saved' || deliveryLocationAction === 'current' || deliveryLocationAction === 'map') && deliveryLocationDisplayAddress ? fnbOrderBrandSoft : '#dbe5ee'}`,
                          background: '#fff',
                          padding: '0 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          color: deliveryLocationDisplayAddress ? '#334155' : '#94a3b8',
                          ...checkoutTypography.control,
                          fontFamily: CHECKOUT_FONT_FAMILY,
                          minWidth: 0
                        }}>
                          {isFnbOrderResponsiveFlow ? (
                            <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#eff6ff', color: fnbOrderBrand, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
                              <MapPin size={13} />
                            </span>
                          ) : null}
                          <input
                            type="text"
                            value={hasExplicitDeliveryAddressEdit(customerAddress, deliveryLocationDisplayAddress) ? customerAddress : deliveryLocationDisplayAddress}
                            onChange={(event) => setCustomerAddress(event.target.value)}
                            placeholder="Pinned delivery address will appear here."
                            aria-label="Delivery address"
                            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...checkoutTypography.control, color: 'inherit', minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, fontFamily: CHECKOUT_FONT_FAMILY }}
                          />
                        </div>
                        <button type="button" aria-label={isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location'} title={isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location'} onClick={handleAddPinnedLocation} disabled={!canAddPinnedLocation} style={{ ...checkoutTypography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: `1px solid ${fnbOrderBrand}`, background: canAddPinnedLocation ? fnbOrderBrand : '#f8fafc', color: canAddPinnedLocation ? '#fff' : '#94a3b8', padding: isFnbOrderResponsiveFlow ? 0 : '0 14px', cursor: canAddPinnedLocation ? 'pointer' : 'not-allowed', minWidth: isFnbOrderResponsiveFlow ? CHECKOUT_CONTROL_MIN_HEIGHT : 132, width: isFnbOrderResponsiveFlow ? CHECKOUT_CONTROL_MIN_HEIGHT : 'auto', boxShadow: canAddPinnedLocation ? '0 8px 16px rgba(26,78,141,0.15)' : 'none', fontFamily: CHECKOUT_FONT_FAMILY, display: 'inline-grid', placeItems: 'center' }}>
                          {isFnbOrderResponsiveFlow ? <span aria-hidden="true" style={{ position: 'relative', display: 'grid', placeItems: 'center' }}><MapPin size={18} /><Plus size={10} strokeWidth={3} style={{ position: 'absolute', right: -5, bottom: -3, background: canAddPinnedLocation ? fnbOrderBrand : '#f8fafc', borderRadius: 999 }} /></span> : (isDgfyCustomerSignedIn ? 'Add Address' : 'Add Location')}
                        </button>
                      </div>
                    </div>
                    {pinLocationError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</div>}
                  </div>
                </div>
              </div>
            )}
            <FnbCheckoutExpandedMapModal
              bodyFont={servicesBodyFont}
              displayFont={servicesDisplayFont}
              isMobileViewport={isMobileViewport}
              isOpen={isDeliveryOrder && showExpandedDeliveryMap}
              onClose={() => setShowExpandedDeliveryMap(false)}
            >
                  <DeliveryPinMap
                    pin={customerPin}
                    onPinChange={(nextPin) => {
                      setDeliveryLocationAction('map');
                      setSelectedSavedLocationId('');
                      setCustomerPin(nextPin);
                    }}
                    disabled={false}
                    height={isMobileViewport ? 'clamp(340px, min(70svh, calc(100svh - 220px)), 620px)' : 520}
                    highlighted
                    highlightColor={fnbOrderBrand}
                    highlightGlow="rgba(26,78,141,0.16)"
                    overlayControls={(
                      <>
                        <button
                          type="button"
                          onClick={handlePinMyLocation}
                          disabled={pinLocationLoading}
                          style={{
                            position: 'absolute',
                            top: 12,
                            left: 12,
                            minHeight: 38,
                            borderRadius: 999,
                            border: `1px solid ${deliveryLocationAction === 'current' ? fnbOrderBrand : '#dbe5ee'}`,
                            background: deliveryLocationAction === 'current' ? '#eff6ff' : '#ffffff',
                            color: deliveryLocationAction === 'current' ? fnbOrderBrandDark : '#1e293b',
                            padding: '0 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: pinLocationLoading ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                            zIndex: 11,
                            fontFamily: servicesBodyFont,
                            pointerEvents: 'auto',
                            maxWidth: isMobileViewport ? 'calc(100% - 24px)' : 'none',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          <Navigation size={15} />
                          {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeliveryLocationAction('map');
                            setSelectedSavedLocationId('');
                          }}
                          style={{
                            position: 'absolute',
                            right: 12,
                            bottom: 12,
                            minHeight: 34,
                            borderRadius: 999,
                            border: `1px solid ${deliveryLocationAction === 'map' ? fnbOrderBrandBorder : '#dbe5ee'}`,
                            background: deliveryLocationAction === 'map' ? '#ffffff' : 'rgba(255,255,255,0.96)',
                            color: deliveryLocationAction === 'map' ? fnbOrderBrandDark : '#334155',
                            padding: '0 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                            zIndex: 11,
                            fontFamily: servicesBodyFont,
                            pointerEvents: 'auto'
                          }}
                        >
                          <MapPin size={14} />
                          Drag to Pin
                        </button>
                      </>
                    )}
                  />
            </FnbCheckoutExpandedMapModal>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ ...checkoutTypography.sectionTitle, color: '#1e293b' }}>{fnbSectionNumbers.notes}. Anything else we should know?</div>
              <label style={{ display: 'grid', gap: 6, ...checkoutTypography.fieldLabel, color: '#475569', fontFamily: CHECKOUT_FONT_FAMILY }}>
                Special Instructions (optional)
                <textarea value={fnbSpecialInstructions} onChange={(event) => setFnbSpecialInstructions(event.target.value.slice(0, 250))} placeholder="Ex. Less ice, no onions, gate color and unit number." rows={3} style={{ minHeight: 96, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }} />
                <span style={{ justifySelf: 'end', fontSize: 12, color: '#94a3b8' }}>{Math.min(String(fnbSpecialInstructions || '').length, 250)}/250</span>
              </label>
            </div>
            {!isFnbOrderResponsiveFlow && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12, marginTop: 4 }}>
                <button type="button" onClick={() => setFnbOrderStep(3)} style={{ ...checkoutTypography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 14, border: '1px solid #dbe5ee', background: '#fff', color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: CHECKOUT_FONT_FAMILY }}><ArrowLeft size={17} strokeWidth={2.5} />Back</button>
                <button type="button" onClick={() => setFnbOrderStep(4)} disabled={!fnbFulfillmentStepComplete} style={{ ...checkoutTypography.action, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 14, border: 'none', background: fnbFulfillmentStepComplete ? `linear-gradient(135deg, ${fnbOrderBrand} 0%, ${fnbOrderBrandDark} 100%)` : '#cbd5e1', color: '#fff', boxShadow: fnbFulfillmentStepComplete ? `0 14px 28px ${fnbOrderBrandShadowStrong}` : 'none', cursor: fnbFulfillmentStepComplete ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: CHECKOUT_FONT_FAMILY }}>Continue <ChevronRight size={17} strokeWidth={2.5} /></button>
              </div>
            )}
          </FnbCheckoutFulfillmentStep>
          ) : renderGuestCheckoutEntry({
            title: 'Continue to your order',
            // #622: track guestCheckoutAllowed the same way the "Continue as Guest" button does
            // -- a hardcoded description would keep inviting guest checkout in copy even after
            // the merchant disabled it (PR #1095 RF-3, caught by rendered-UI proof).
            description: guestCheckoutAllowed
              ? 'Create an account or continue as guest to continue this menu order.'
              : 'This store requires a DGFY account to check out. Create one or log in to continue.',
            resumeTarget: {
              checkoutTab: 'cart',
              fnbOrderStep: 3
            }
          })}
          <FnbCheckoutDesktopSummary isDesktop={isDesktopCheckout}>
            <FnbCheckoutSummaryContent
              accentColor={fnbOrderBrand}
              accentSoft={fnbOrderBrandSoft}
              accentTint={fnbOrderBrandTint}
              bodyFont={servicesBodyFont}
              cart={cart}
              cartImageErrors={cartImageErrors}
              cartCount={cartCount}
              checkoutAllowed={checkoutAllowed}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              money={money}
              onImageError={(itemId) => {
                const normalizedLineItemId = Number(itemId);
                if (!Number.isFinite(normalizedLineItemId)) return;
                setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
              }}
              paymentStep={false}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              voucherDiscountSummaryRow={voucherDiscountSummaryRow}
              promoPanel={renderPromoCodePanel({ compact: true, accentColor: fnbOrderBrand, bodyFont: servicesBodyFont })}
              scheduleLabel={fnbScheduleSummaryLabel}
              specialInstructions={fnbSpecialInstructions}
              showFulfillmentSummary
              totals={totalsForDisplay}
              variant="compact"
              withAssetOrigin={withAssetOrigin}
            />
          </FnbCheckoutDesktopSummary>
        </FnbCheckoutFulfillmentStepView>
      )}
  
      {fnbOrderStep === 3 && (
        <FnbCheckoutCustomerStepView isDesktop={isDesktopCheckout}>
          {isDgfyCustomerSignedIn || canUseGuestCheckoutFlow ? (
          <FnbCheckoutCustomerStep
            bodyFont={servicesBodyFont}
            brandColor={fnbOrderBrand}
            brandDark={fnbOrderBrandDark}
            canContinue={fnbCustomerStepComplete}
            guestEmailVerificationContent={!isDgfyCustomerSignedIn ? (
              <FnbGuestEmailVerification
                bodyFont={servicesBodyFont}
                code={guestCheckoutOtpCode}
                cooldownActive={isGuestCheckoutOtpCooldownActive}
                cooldownLabel={guestCheckoutOtpCooldownLabel}
                error={guestCheckoutOtpError}
                isMobileViewport={isMobileViewport}
                loading={guestCheckoutOtpLoading}
                onCodeChange={handleGuestCheckoutOtpCodeChange}
                onRequestCode={handleRequestGuestCheckoutOtp}
                onVerifyCode={handleVerifyGuestCheckoutOtp}
                verified={guestCheckoutOtpVerified}
              />
            ) : null}
            identityContent={isDgfyCustomerSignedIn ? renderAccountOwnedIdentitySummary({ title: 'Customer Account', subtitle: 'These account details will be used for this order.' }) : renderGuestIdentityFields({
              title: 'Guest Details',
              subtitle: 'These guest details will be used for this order.',
              includeAddress: false,
              requireEmail: true,
              layoutVariant: 'fnbGuest',
              savedDetailsApplyLabel: 'Send Code and Apply Details',
              onSavedDetailsApply: handleApplyGuestDetailsAndRequestOtp
            })}
            isMobileViewport={isMobileViewport}
            isResponsive={isFnbOrderResponsiveFlow}
            onBack={goStoreCatalogPage}
            onContinue={() => setFnbOrderStep(2)}
          />
          ) : renderGuestCheckoutEntry({
            title: 'Continue to your order',
            // #622: track guestCheckoutAllowed the same way the "Continue as Guest" button does
            // -- a hardcoded description would keep inviting guest checkout in copy even after
            // the merchant disabled it (PR #1095 RF-3, caught by rendered-UI proof).
            description: guestCheckoutAllowed
              ? 'Create an account or continue as guest to continue this menu order.'
              : 'This store requires a DGFY account to check out. Create one or log in to continue.',
            resumeTarget: {
              checkoutTab: 'cart',
              fnbOrderStep: 3
            }
          })}
          <FnbCheckoutDesktopSummary isDesktop={isDesktopCheckout}>
            <FnbCheckoutSummaryContent
              accentColor={fnbOrderBrand}
              accentSoft={fnbOrderBrandSoft}
              accentTint={fnbOrderBrandTint}
              bodyFont={servicesBodyFont}
              cart={cart}
              cartImageErrors={cartImageErrors}
              cartCount={cartCount}
              checkoutAllowed={checkoutAllowed}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              money={money}
              onImageError={(itemId) => {
                const normalizedLineItemId = Number(itemId);
                if (!Number.isFinite(normalizedLineItemId)) return;
                setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
              }}
              paymentStep={false}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              voucherDiscountSummaryRow={voucherDiscountSummaryRow}
              promoPanel={renderPromoCodePanel({ compact: true, accentColor: fnbOrderBrand, bodyFont: servicesBodyFont })}
              scheduleLabel={fnbScheduleSummaryLabel}
              specialInstructions={fnbSpecialInstructions}
              showFulfillmentSummary={false}
              totals={totalsForDisplay}
              variant="customer"
              withAssetOrigin={withAssetOrigin}
            />
          </FnbCheckoutDesktopSummary>
        </FnbCheckoutCustomerStepView>
      )}
  
      {fnbOrderStep === 4 && !checkoutResult && (
        <FnbCheckoutPaymentStepView
          isDesktop={isDesktopCheckout}
          stepKey={`fnb-order-payment-step-${isFnbOrderResponsiveFlow ? 'responsive' : 'desktop'}`}
        >
          <FnbCheckoutPaymentStep
            brandColor={fnbOrderBrand}
            canSubmit={checkoutAllowed && !qrphPaymentSession && !fnbBillingEmailRequired}
            cart={cart}
            cartImageErrors={cartImageErrors}
            checkoutError={checkoutError}
            closedNotice={storefrontClosedByHours ? renderStorefrontClosedNotice({ accent: fnbOrderBrand, background: '#fff7ed', border: '#fdba74' }) : null}
            isMobileViewport={isMobileViewport}
            isResponsive={isFnbOrderResponsiveFlow}
            money={money}
            onBack={() => setFnbOrderStep(2)}
            onImageError={(itemId) => {
              const normalizedLineItemId = Number(itemId);
              if (!Number.isFinite(normalizedLineItemId)) return;
              setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
            }}
            onSubmit={handleCheckout}
            paymentControl={(
              <div style={{ display: 'grid', gap: 12 }}>
                <PaymentElectionSelector
                  accentColor={fnbOrderBrand}
                  active={isCustomerChoiceStore(selectedStore)}
                  onChange={onPaymentElectionChange}
                  value={paymentElection}
                />
                <PaymentMethodSelectorBlock
                  label={downpaymentDisplay.active ? 'Pay downpayment with' : 'Payment Type'}
                  value={fnbPaymentType}
                  onChange={handlePaymentTypeChange}
                  options={buildStorefrontCheckoutPaymentOptions(selectedStore?.payment_capabilities, { hideCash: downpaymentDisplay.active || isCustomerChoiceStore(selectedStore) })}
                  DropdownComponent={StorefrontDropdown}
                  labelStyle={{ ...checkoutTypography.sectionTitle, color: '#1e293b', fontFamily: CHECKOUT_FONT_FAMILY }}
                  triggerStyle={isFnbOrderResponsiveFlow ? { ...MOBILE_NATIVE_SELECT_STYLE, ...checkoutTypography.control, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, padding: '0 42px 0 14px', boxSizing: 'border-box', fontFamily: CHECKOUT_FONT_FAMILY } : { ...checkoutTypography.control, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, fontFamily: CHECKOUT_FONT_FAMILY }}
                  menuStyle={isFnbOrderResponsiveFlow ? MOBILE_DROPDOWN_MENU_STYLE : undefined}
                  optionStyle={isFnbOrderResponsiveFlow ? MOBILE_DROPDOWN_OPTION_STYLE : undefined}
                  selectedLabelStyle={{ ...checkoutTypography.control, fontFamily: CHECKOUT_FONT_FAMILY }}
                  downpaymentCallout={(
                    <DownpaymentPaymentCallout
                      accentColor={fnbOrderBrand}
                      bodyFont={CHECKOUT_FONT_FAMILY}
                      display={downpaymentDisplay}
                      money={money}
                      orderMethod={isDeliveryOrder ? 'delivery' : 'pickup'}
                    />
                  )}
                  notice={fnbBillingEmailRequired && typeof renderBillingEmailPrompt === 'function'
                    ? renderBillingEmailPrompt({ invalid: Boolean(String(customerEmail || '').trim()) })
                    : null}
                />
                {isStorefrontOnlinePaymentType(fnbPaymentType) ? (
                  <FnbQrphPaymentPanel
                    amountDue={downpaymentDisplay.active ? money(downpaymentDisplay.downpaymentAmount) : null}
                    amountDueLabel="Downpayment due"
                    balanceNote={downpaymentDisplay.active
                      ? `Pay the remaining ${money(downpaymentDisplay.balanceDueAmount)} in cash ${isDeliveryOrder ? 'on delivery' : 'at pickup'}.`
                      : null}
                    billing={{ name: customerName, email: customerEmail, phone: customerPhone }}
                    onConfirmTestPayment={import.meta.env.DEV
                      && fnbPaymentType === 'qrph'
                      && selectedStore?.payment_capabilities?.qrph?.environment === 'test'
                      ? handleConfirmQrphTestPayment
                      : null}
                    onChooseAnotherPaymentMethod={() => {
                      resetQrphPaymentSession();
                    }}
                    paymentSession={qrphPaymentSession}
                    paymentEnvironment={selectedStore?.payment_capabilities?.[fnbPaymentType]?.environment}
                    paymentType={fnbPaymentType}
                    qrAmountNote={downpaymentDisplay.active ? 'This QR contains your downpayment amount.' : null}
                    refreshing={qrphPaymentStatusLoading}
                  />
                ) : null}
              </div>
            )}
            processing={checkoutLoading}
            quoteError={quoteError}
            submitLabel={downpaymentDisplay.active
              ? `Pay downpayment (${money(downpaymentDisplay.downpaymentAmount)})`
              : fnbPaymentType === 'qrph' ? 'Generate QR Ph' : isStorefrontHostedPaymentType(fnbPaymentType) ? `Pay with ${getStorefrontOnlinePaymentLabel(fnbPaymentType)}` : 'Place Order'}
            withAssetOrigin={withAssetOrigin}
          />
          <FnbCheckoutDesktopSummary isDesktop={isDesktopCheckout}>
            <FnbCheckoutSummaryContent
              accentColor={fnbOrderBrand}
              accentSoft={fnbOrderBrandSoft}
              accentTint={fnbOrderBrandTint}
              bodyFont={servicesBodyFont}
              cart={cart}
              cartImageErrors={cartImageErrors}
              cartCount={cartCount}
              checkoutAllowed={checkoutAllowed}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              money={money}
              onImageError={(itemId) => {
                const normalizedLineItemId = Number(itemId);
                if (!Number.isFinite(normalizedLineItemId)) return;
                setCartImageErrors((previous) => new Set([...previous, normalizedLineItemId]));
              }}
              paymentStep={true}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              voucherDiscountSummaryRow={voucherDiscountSummaryRow}
              promoPanel={null}
              scheduleLabel={fnbScheduleSummaryLabel}
              specialInstructions={fnbSpecialInstructions}
              showFulfillmentSummary
              totals={totalsForDisplay}
              variant="payment"
              withAssetOrigin={withAssetOrigin}
            />
          </FnbCheckoutDesktopSummary>
        </FnbCheckoutPaymentStepView>
      )}
  
      {isFnbOrderResponsiveFlow && !checkoutResult && (
        <FnbCheckoutMobileSummaryPanel
          brandColor={fnbOrderBrand}
          brandColorDark={fnbOrderBrandDark}
          brandShadowStrong={fnbOrderBrandShadowStrong}
          cart={cart}
          cartCount={cartCount}
          cartImageErrors={cartImageErrors}
          checkoutAllowed={checkoutAllowed}
          checkoutLoading={checkoutLoading}
          fnbCustomerStepComplete={fnbCustomerStepComplete}
          fnbFulfillmentStepComplete={fnbFulfillmentStepComplete}
          isDeliveryOrder={isDeliveryOrder}
          itemCountLabel={fnbMobileSummaryItemCountLabel}
          money={money}
          onBackToCart={() => {
            goStoreCatalogPage();
            setCheckoutTab('cart');
            setIsCheckoutOpen(true);
          }}
          onCheckout={handleCheckout}
          onDecreaseStep={() => setFnbOrderStep(fnbOrderStep === 2 ? 3 : 2)}
          onImageError={(itemId) => {
            const normalizedLineItemId = Number(itemId);
            if (!Number.isFinite(normalizedLineItemId)) return;
            setCartImageErrors((previous) => new Set(previous).add(normalizedLineItemId));
          }}
          onIncreaseStep={() => setFnbOrderStep(fnbOrderStep === 3 ? 2 : 4)}
          onToggleSummary={() => setShowFnbMobileOrderSummary((previous) => !previous)}
          orderStep={fnbOrderStep}
          promoDiscountSummaryRow={promoDiscountSummaryRow}
          voucherDiscountSummaryRow={voucherDiscountSummaryRow}
          promoPanel={fnbOrderStep === 4 ? null : renderPromoCodePanel({ compact: true, accentColor: fnbOrderBrand, bodyFont: servicesBodyFont, isMobile: true })}
          scheduleLabel={fnbScheduleSummaryLabel}
          specialInstructions={fnbSpecialInstructions}
          showFulfillmentSummary={fnbOrderStep !== 3}
          setSummaryOpen={setShowFnbMobileOrderSummary}
          showSummary={showFnbMobileOrderSummary}
          totals={totalsForDisplay}
          withAssetOrigin={withAssetOrigin}
        />
      )}
  
      {showMobileAddressModal && isFnbOrderResponsiveFlow && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setShowMobileAddressModal(false)} />
          <div style={{ position: 'relative', background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 16px max(24px, env(safe-area-inset-bottom))', display: 'grid', gap: 16, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', paddingTop: 6 }}>Saved Addresses</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                <button type="button" onClick={() => setShowMobileAddressModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
                  <X size={18} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  aria-label="Add New Location"
                  onClick={() => {
                    setShowMobileAddressModal(false);
                    setDeliveryLocationAction('map');
                    setSelectedSavedLocationId('');
                    setPinLocationError('');
                    setResolvedDeliveryAddress('');
                    setCustomerAddress('');
                    setCustomerPin(null);
                  }}
                  style={getCheckoutAddLocationActionStyle({ compact: true })}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  Add New Location
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {deliverySavedLocations.map((location) => {
                const isSelected = String(selectedSavedLocationId) === String(location.id) && deliveryLocationAction !== 'map' && deliveryLocationAction !== 'current';
                return (
                  <SavedAddressCard
                    key={`modal-delivery-location-${location.id}`}
                    address={location}
                    isSelected={isSelected}
                    isBusy={false}
                    onSelect={() => {
                      applySavedDeliveryLocation(location);
                      if (typeof handleSetDefaultDeliveryAddress === 'function' && !location.isDefault) {
                        handleSetDefaultDeliveryAddress(location);
                      }
                      setShowMobileAddressModal(false);
                    }}
                    onSetDefault={location.source === 'account' ? () => handleSetDefaultDeliveryAddress(location) : undefined}
                    onRemove={(location.source === 'account' || location.source === 'local') ? () => handleRemoveDeliveryAddress(location) : undefined}
                    showActions={false}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
  
      {fnbOrderStep === 4 && checkoutResult && (
        <FnbCheckoutConfirmation
          brandColor={fnbOrderBrand}
          brandDark={fnbOrderBrandDark}
          brandSoft={fnbOrderBrandSoft}
          brandTint={fnbOrderBrandTint}
          cartLines={Array.isArray(checkoutResult?.cart_lines) ? checkoutResult.cart_lines : []}
          checkoutResult={checkoutResult}
          isDeliveryOrder={isDeliveryOrder}
          isMobileViewport={isMobileViewport}
          money={money}
          mutedTextColor={fnbOrderMutedBlueText}
          onBackToMenu={() => { setCheckoutResult(null); setFnbOrderStep(2); goStoreCatalogPage(); }}
          onDownload={handleDownloadCheckoutImage}
          onOpenTracking={() => {
            const trackingPin = checkoutResult?.tracking_pin || '';
            setTrackingPinInput(trackingPin);
            setSelectedTrackingPin(String(trackingPin || '').trim().toUpperCase());
            goStoreTrackPage({ pin: trackingPin });
          }}
          paymentType={fnbPaymentType}
          totalAmount={checkoutResult?.totals?.total_amount ?? totalsForDisplay.total_amount}
        />
      )}
      </FnbCheckoutRouteBody>
    </FnbCheckoutRouteMount>
  );
}
