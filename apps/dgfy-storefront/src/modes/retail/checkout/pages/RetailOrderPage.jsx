import { useEffect, useState } from 'react';
import { hasCustomerName, hasPrimaryContact } from '../../../../checkout/checkoutValidation.js';
import { RetailOrderAccountStep } from '../components/RetailOrderAccountStep.jsx';
import { RetailOrderFulfillmentStep } from '../components/RetailOrderFulfillmentStep.jsx';
import { RetailOrderJourneyHeader } from '../components/RetailOrderJourneyHeader.jsx';
import { RetailOrderMobileSummaryPanel } from '../components/RetailOrderMobileSummaryPanel.jsx';
import { RetailOrderPaymentStep } from '../components/RetailOrderPaymentStep.jsx';
import { RetailOrderStoreHeader } from '../components/RetailOrderStoreHeader.jsx';
import { RetailOrderSummaryContent } from '../components/RetailOrderSummaryContent.jsx';
import { StorefrontOnlinePaymentPanel } from '../../../../shared/components/checkout/StorefrontOnlinePaymentPanel.jsx';
import { buildStorefrontCheckoutPaymentOptions } from '../../../../shared/model/storefrontCheckoutPaymentOptions.js';
import { isCustomerChoiceStore, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';
import { isStorefrontOnlinePaymentType } from '../../../../shared/services/storefrontOnlinePaymentSession.js';

const RETAIL_ACCENT = '#1a4e8d';
const RETAIL_ACCENT_SHADOW = 'rgba(26,78,141,.28)';

/**
 * Retail order page (`/order`), reached from the retail cart drawer's "Order & Purchase"
 * button. Mirrors modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx's overall structure
 * (full-width store header, centered 1240px journey header + step cards, desktop sidebar
 * summary, mobile bottom-sheet summary panel) but is this mode's own page, per the
 * "independent trees" pattern already used for F&B/MSME checkout.
 *
 * Retail-only: other default-like workflow modes (hospitality, healthcare, manufacturing,
 * food_manufacturing, ticketing_transport, logistics_distribution, education_institutions)
 * continue to use shared/components/storefront/DefaultOrderPage.jsx, unmodified, since this
 * refined layout was built specifically for retail and hasn't been requested for the others.
 *
 * Account (Step 1) and the Fulfillment step's location/address section (Step 2, §3) are both
 * real: signed-in/guest identity, guest email OTP verification, saved addresses, the pin-drop +
 * reverse-geocode flow, and "Add Address"/"Add Location" all consume the same shared,
 * mode-agnostic infrastructure F&B/MSME already use (`useGuestCustomerIdentity`,
 * `useGuestCheckoutOtp`, `useSignedInCheckoutAddresses`, `useDeliveryPinResolution` — all
 * instantiated once in StorefrontApp.jsx and threaded down via useRetailOrderPageProps.js).
 * Order method, schedule, and the map pin/address-selection state are therefore *shared* global
 * state (not local to this page) since the address hooks operate on that shared state — the
 * same state F&B/MSME already read and write. Schedule mode/time and special instructions
 * remain local placeholder state, not wired to the backend yet. The cart/product list is real:
 * it's the same frontend cart state the rest of the app already uses. Order totals
 * (subtotal/total) are computed for real from the cart via the shared buildCartTotals model;
 * Delivery Fee and Fees & Taxes show as 0 for a full_payment store, since there's still no
 * general fee/quote backend for Retail. A downpayment-required store is the one exception
 * (Phase 142, #823): StorefrontApp.jsx's mode-agnostic auto-quote arm forces a real server quote
 * for Retail in that one case, so `totals` carries the real downpayment/balance split then.
 *
 * Payment type (Phase 142, #823) is likewise *shared* state now, not local -- `paymentType`/
 * `onPaymentTypeChange` are StorefrontApp.jsx's `fnbPaymentType`/`handlePaymentTypeChange`
 * (same coordination point F&B/MSME already use), threaded through
 * useRetailOrderPageProps.js. Retail's online-payment session creation flows through the same
 * shared useCheckoutSubmission.js branch Simple uses.
 */
export function RetailOrderPage({
  canAddPinnedLocation = false,
  canUseGuestCheckoutFlow = false,
  cart = [],
  cartCount = 0,
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  customerEmail = '',
  customerName = '',
  customerPhone = '',
  customerPin = null,
  deliveryLocationAction = 'saved',
  deliveryLocationDisplayAddress = '',
  deliverySavedLocations = [],
  guestCheckoutOtpCode = '',
  guestCheckoutOtpCooldownLabel = '',
  guestCheckoutOtpError = '',
  guestCheckoutOtpLoading = false,
  guestCheckoutOtpVerified = false,
  handleAddPinnedLocation,
  handleApplyGuestDetailsAndRequestOtp,
  handleGuestCheckoutOtpCodeChange,
  handlePinMyLocation,
  handleRequestGuestCheckoutOtp,
  handleVerifyGuestCheckoutOtp,
  isDesktopCheckout = false,
  isDgfyCustomerSignedIn = false,
  isGuestCheckoutOtpCooldownActive = false,
  isMobileViewport = false,
  money,
  onBackToCatalog,
  onCheckout,
  onImageError,
  onSelectAddress,
  onConfirmQrphTestPayment,
  onPaymentElectionChange,
  onPaymentTypeChange,
  orderMethod = 'delivery',
  paymentElection = 'full',
  paymentType = 'cash',
  qrphPaymentSession = null,
  qrphPaymentStatusLoading = false,
  resetQrphPaymentSession,
  promoDiscountSummaryRow = null,
  voucherDiscountSummaryRow = null,
  pinLocationError = '',
  pinLocationLoading = false,
  renderAccountOwnedIdentitySummary,
  renderBillingEmailPrompt,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  renderPromoCodePanel,
  renderStorefrontClosedNotice,
  servicesBodyFont,
  servicesDisplayFont,
  selectedStore,
  selectedSavedLocationId = '',
  setCustomerPin,
  storefrontClosedByHours = false,
  totalsForDisplay = {},
  setDeliveryLocationAction,
  setOrderMethod,
  setPinLocationError,
  setResolvedDeliveryAddress,
  setSelectedSavedLocationId,
  setShowExpandedDeliveryMap,
  showExpandedDeliveryMap = false,
  withAssetOrigin
}) {
  const [step, setStep] = useState(1);
  const [scheduleMode, setScheduleMode] = useState('asap');
  const [scheduledFor, setScheduledFor] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const [showMobileAddressModal, setShowMobileAddressModal] = useState(false);

  // Phase 142 (#823): unlike Simple (simpleOrderStep is hoisted into StorefrontApp.jsx so its
  // own PayMongo-return handler can jump it directly), Retail's `step` is local to this
  // component -- so the resume-after-redirect signal is qrphPaymentSession itself (set by
  // StorefrontApp.jsx's return-URL effect) rather than a step number pushed down from above. A
  // customer already on step 3 who creates a session mid-flow is a no-op here (step is already
  // 3); this only actually moves the step on the PayMongo-return rehydration path.
  useEffect(() => {
    if (qrphPaymentSession?.payment_session_id && step !== 3) setStep(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrphPaymentSession?.payment_session_id]);

  const isDeliveryOrder = orderMethod === 'delivery';
  const storefrontClosedNotice = storefrontClosedByHours
    ? renderStorefrontClosedNotice({ accent: '#9a3412', background: '#fff7ed', border: '#fdba74' })
    : null;
  const retailCustomerStepComplete = hasCustomerName(customerName)
    && hasPrimaryContact({ phone: customerPhone, email: customerEmail })
    && guestCheckoutOtpVerified;
  useEffect(() => {
    // guestCheckoutOtpVerified (folded into retailCustomerStepComplete) is in-memory React state
    // (useGuestCheckoutOtp.js), not persisted -- a customer returning from a full-page PayMongo
    // redirect remounts with it reset to false, which would otherwise bounce them straight back to
    // step 1 immediately after the qrphPaymentSession effect above just moved them to step 3. Guard
    // against undoing that rehydration: a live payment session pins the step regardless.
    if (step > 1 && !retailCustomerStepComplete && !qrphPaymentSession?.payment_session_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Return to the required identity step when guest verification becomes invalid.
      setStep(1);
    }
  }, [retailCustomerStepComplete, step, qrphPaymentSession?.payment_session_id]);
  const totals = totalsForDisplay;
  // Phase 142 (#823): quote-sourced (this page renders before a payment session exists).
  const downpaymentDisplay = resolveDownpaymentDisplay({ quoteResult: totals });
  // Phase 150 (#866) RF-3: a customer_choice store never offers plain COD-in-full -- the ADR
  // amendment states "pay the full order total online", and customer_choice "does not add a
  // third customer-facing option". Cash stays hidden regardless of election at this store, not
  // only once a downpayment is actually active.
  const retailPaymentOptions = buildStorefrontCheckoutPaymentOptions(
    selectedStore?.payment_capabilities,
    { hideCash: downpaymentDisplay.active || isCustomerChoiceStore(selectedStore) }
  );
  const scheduleLabel = scheduleMode === 'schedule' && scheduledFor
    ? new Date(scheduledFor).toLocaleString()
    : 'NOW';
  // useSignedInCheckoutAddresses (shared with F&B) always folds in its own branch-location
  // fallback when the customer has no real saved addresses yet, regardless of mode. That
  // fallback is F&B-specific and meaningless for a retail tenant, so it's filtered out here
  // rather than in the shared hook, to avoid touching F&B's own behavior.
  const retailSavedLocations = deliverySavedLocations.filter((location) => location.source !== 'recommended');
  const stepGridStyle = {
    display: 'grid',
    gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.45fr) minmax(300px, 380px)' : '1fr',
    gap: 14,
    alignItems: 'start'
  };
  const handleStartMapPin = () => {
    setDeliveryLocationAction('map');
    setSelectedSavedLocationId('');
    setPinLocationError('');
    setResolvedDeliveryAddress('');
    setCustomerPin(null);
  };

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: '100%', width: '100%', padding: isMobileViewport ? '0px 0px 18px' : '0px 0px 28px', fontFamily: servicesBodyFont || "'Avenir Next', 'Segoe UI', sans-serif", color: '#0f172a' }}>
      <RetailOrderStoreHeader
        brandColor={RETAIL_ACCENT}
        brandShadow={RETAIL_ACCENT_SHADOW}
        displayFont={servicesDisplayFont}
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        isResponsiveFlow={!isDesktopCheckout}
        onBack={onBackToCatalog}
        selectedStore={selectedStore}
        textOnBrand="#fff"
        withAssetOrigin={withAssetOrigin}
      />

      <div style={{ display: 'grid', gap: 18, maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? '0 16px calc(env(safe-area-inset-bottom, 0px) + 196px)' : '0 40px', boxSizing: 'border-box' }}>
        <RetailOrderJourneyHeader
          activeStep={step}
          cartCount={cartCount}
          cartHasItems={cart.length > 0}
          isDeliveryOrder={isDeliveryOrder}
          isMobileViewport={isMobileViewport}
          displayFont={servicesDisplayFont}
          onStepChange={(nextStep) => {
            if (nextStep > 1 && !retailCustomerStepComplete) {
              setStep(1);
              return;
            }
            setStep(nextStep);
          }}
        />

        {step === 1 && (
          <div style={stepGridStyle}>
            <RetailOrderAccountStep
              canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
              guestCheckoutOtpCode={guestCheckoutOtpCode}
              guestCheckoutOtpCooldownLabel={guestCheckoutOtpCooldownLabel}
              guestCheckoutOtpError={guestCheckoutOtpError}
              guestCheckoutOtpLoading={guestCheckoutOtpLoading}
              guestCheckoutOtpVerified={guestCheckoutOtpVerified}
              isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
              isGuestCheckoutOtpCooldownActive={isGuestCheckoutOtpCooldownActive}
              isMobileViewport={isMobileViewport}
              retailCustomerStepComplete={retailCustomerStepComplete}
              servicesBodyFont={servicesBodyFont}
              renderAccountOwnedIdentitySummary={renderAccountOwnedIdentitySummary}
              renderGuestCheckoutEntry={renderGuestCheckoutEntry}
              renderGuestIdentityFields={renderGuestIdentityFields}
              onBackToCatalog={onBackToCatalog}
              onContinue={() => setStep(2)}
              onApplyGuestDetailsAndRequestOtp={handleApplyGuestDetailsAndRequestOtp}
              onGuestCheckoutOtpCodeChange={handleGuestCheckoutOtpCodeChange}
              onRequestGuestCheckoutOtp={handleRequestGuestCheckoutOtp}
              onVerifyGuestCheckoutOtp={handleVerifyGuestCheckoutOtp}
            />
            {!isMobileViewport && (
              <RetailOrderSummaryContent
                bodyFont={servicesBodyFont}
                cart={cart}
                cartCount={cartCount}
                cartImageErrors={cartImageErrors}
                displayFont={servicesDisplayFont}
                isDeliveryOrder={isDeliveryOrder}
                isSticky
                money={money}
                onImageError={onImageError}
                promoDiscountSummaryRow={promoDiscountSummaryRow}
                voucherDiscountSummaryRow={voucherDiscountSummaryRow}
                promoPanel={renderPromoCodePanel?.({ compact: true, accentColor: RETAIL_ACCENT, bodyFont: servicesBodyFont })}
                scheduleLabel={scheduleLabel}
                totals={totals}
                withAssetOrigin={withAssetOrigin}
              />
            )}
          </div>
        )}

        {step === 2 && (
          <div style={stepGridStyle}>
            <RetailOrderFulfillmentStep
              canAddPinnedLocation={canAddPinnedLocation}
              customerPin={customerPin}
              deliveryLocationAction={deliveryLocationAction}
              deliveryLocationDisplayAddress={deliveryLocationDisplayAddress}
              deliverySavedLocations={retailSavedLocations}
              isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
              isMobileViewport={isMobileViewport}
              onAddPinnedLocation={handleAddPinnedLocation}
              onBack={() => setStep(1)}
              onCloseExpandedMap={() => setShowExpandedDeliveryMap(false)}
              onCloseMobileAddressModal={() => setShowMobileAddressModal(false)}
              onContinue={() => setStep(3)}
              onOpenExpandedMap={() => setShowExpandedDeliveryMap(true)}
              onOpenMobileAddressList={() => setShowMobileAddressModal(true)}
              onOrderMethodChange={setOrderMethod}
              onPinChange={(nextPin) => {
                setDeliveryLocationAction('map');
                setSelectedSavedLocationId('');
                setCustomerPin(nextPin);
              }}
              onPinMyLocation={handlePinMyLocation}
              onScheduleModeChange={(nextMode) => {
                setScheduleMode(nextMode);
                if (nextMode === 'asap') setScheduledFor('');
              }}
              onScheduledForChange={setScheduledFor}
              onSelectAddress={onSelectAddress}
              onSpecialInstructionsChange={setSpecialInstructions}
              onStartMapPin={handleStartMapPin}
              orderMethod={orderMethod}
              pinLocationError={pinLocationError}
              pinLocationLoading={pinLocationLoading}
              scheduleMode={scheduleMode}
              scheduledFor={scheduledFor}
              selectedSavedLocationId={selectedSavedLocationId}
              servicesBodyFont={servicesBodyFont}
              servicesDisplayFont={servicesDisplayFont}
              showExpandedDeliveryMap={showExpandedDeliveryMap}
              showMobileAddressModal={showMobileAddressModal}
              specialInstructions={specialInstructions}
            />
            {!isMobileViewport && (
              <RetailOrderSummaryContent
                bodyFont={servicesBodyFont}
                cart={cart}
                cartCount={cartCount}
                cartImageErrors={cartImageErrors}
                displayFont={servicesDisplayFont}
                isDeliveryOrder={isDeliveryOrder}
                isSticky
                money={money}
                onImageError={onImageError}
                promoDiscountSummaryRow={promoDiscountSummaryRow}
                voucherDiscountSummaryRow={voucherDiscountSummaryRow}
                promoPanel={renderPromoCodePanel?.({ compact: true, accentColor: RETAIL_ACCENT, bodyFont: servicesBodyFont })}
                scheduleLabel={scheduleLabel}
                totals={totals}
                withAssetOrigin={withAssetOrigin}
              />
            )}
          </div>
        )}

        {step === 3 && (
          <div style={stepGridStyle}>
            <RetailOrderPaymentStep
              cart={cart}
              cartImageErrors={cartImageErrors}
              checkoutError={checkoutError}
              checkoutLoading={checkoutLoading}
              customerEmail={customerEmail}
              downpaymentDisplay={downpaymentDisplay}
              guestCheckoutOtpVerified={guestCheckoutOtpVerified}
              isCustomerChoiceStore={isCustomerChoiceStore(selectedStore)}
              isDeliveryOrder={isDeliveryOrder}
              isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
              isMobileViewport={isMobileViewport}
              money={money}
              onBack={() => setStep(2)}
              onBackToAccount={() => setStep(1)}
              onCheckout={onCheckout}
              onImageError={onImageError}
              onPaymentElectionChange={onPaymentElectionChange}
              paymentElection={paymentElection}
              onPaymentTypeChange={onPaymentTypeChange}
              paymentOptions={retailPaymentOptions}
              paymentType={paymentType}
              renderBillingEmailPrompt={renderBillingEmailPrompt}
              onlinePaymentPanel={isStorefrontOnlinePaymentType(paymentType) ? (
                <StorefrontOnlinePaymentPanel
                  amountDue={downpaymentDisplay.active ? money(downpaymentDisplay.downpaymentAmount) : null}
                  amountDueLabel="Downpayment due"
                  balanceNote={downpaymentDisplay.active
                    ? `Pay the remaining ${money(downpaymentDisplay.balanceDueAmount)} in cash ${isDeliveryOrder ? 'on delivery' : 'at pickup'}.`
                    : null}
                  billing={{ name: customerName, email: customerEmail, phone: customerPhone }}
                  onConfirmTestPayment={import.meta.env.DEV
                    && paymentType === 'qrph'
                    && selectedStore?.payment_capabilities?.qrph?.environment === 'test'
                    ? onConfirmQrphTestPayment
                    : null}
                  onChooseAnotherPaymentMethod={() => {
                    resetQrphPaymentSession?.();
                  }}
                  paymentSession={qrphPaymentSession}
                  paymentEnvironment={selectedStore?.payment_capabilities?.[paymentType]?.environment}
                  paymentType={paymentType}
                  qrAmountNote={downpaymentDisplay.active ? 'This QR contains your downpayment amount.' : null}
                  refreshing={qrphPaymentStatusLoading}
                />
              ) : null}
              servicesBodyFont={servicesBodyFont}
              storefrontClosedNotice={storefrontClosedNotice}
              withAssetOrigin={withAssetOrigin}
            />
            {!isMobileViewport && (
              <RetailOrderSummaryContent
                bodyFont={servicesBodyFont}
                cart={cart}
                cartCount={cartCount}
                cartImageErrors={cartImageErrors}
                displayFont={servicesDisplayFont}
                isDeliveryOrder={isDeliveryOrder}
                isSticky
                money={money}
                onImageError={onImageError}
                promoDiscountSummaryRow={promoDiscountSummaryRow}
                voucherDiscountSummaryRow={voucherDiscountSummaryRow}
                promoPanel={renderPromoCodePanel?.({ compact: true, accentColor: RETAIL_ACCENT, bodyFont: servicesBodyFont })}
                scheduleLabel={scheduleLabel}
                totals={totals}
                withAssetOrigin={withAssetOrigin}
              />
            )}
          </div>
        )}

        {isMobileViewport && (
          <RetailOrderMobileSummaryPanel
            cart={cart}
            cartCount={cartCount}
            cartImageErrors={cartImageErrors}
            checkoutLoading={checkoutLoading}
            guestCheckoutOtpVerified={guestCheckoutOtpVerified}
            isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
            isDeliveryOrder={isDeliveryOrder}
            money={money}
            onBackToCatalog={onBackToCatalog}
            onCheckout={onCheckout}
            onImageError={onImageError}
            promoDiscountSummaryRow={promoDiscountSummaryRow}
            voucherDiscountSummaryRow={voucherDiscountSummaryRow}
            promoPanel={renderPromoCodePanel?.({ compact: true, accentColor: RETAIL_ACCENT, bodyFont: servicesBodyFont, isMobile: true })}
            onStepChange={setStep}
            orderStep={step}
            scheduleLabel={scheduleLabel}
            setSummaryOpen={setShowMobileSummary}
            showSummary={showMobileSummary}
            totals={totals}
            withAssetOrigin={withAssetOrigin}
          />
        )}
      </div>
    </div>
  );
}
