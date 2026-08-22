import { SimpleCheckoutCustomerStep } from '../components/SimpleCheckoutCustomerStep.jsx';
import { SimpleCheckoutFulfillmentStep } from '../components/SimpleCheckoutFulfillmentStep.jsx';
import { SimpleCheckoutJourneyHeader } from '../components/SimpleCheckoutJourneyHeader.jsx';
import { SimpleCheckoutMobileSummaryPanel } from '../components/SimpleCheckoutMobileSummaryPanel.jsx';
import { SimpleCheckoutPaymentStep } from '../components/SimpleCheckoutPaymentStep.jsx';
import { SimpleCheckoutStoreHeader } from '../components/SimpleCheckoutStoreHeader.jsx';
import { SimpleCheckoutSuccessStep } from '../components/SimpleCheckoutSuccessStep.jsx';
import { SimpleCheckoutSummaryContent } from '../components/SimpleCheckoutSummaryContent.jsx';
import { StorefrontOnlinePaymentPanel } from '../../../../shared/components/checkout/StorefrontOnlinePaymentPanel.jsx';
import { DownpaymentPaymentCallout } from '../../../../shared/components/checkout/DownpaymentPaymentCallout.jsx';
import { buildStorefrontCheckoutPaymentOptions } from '../../../../shared/model/storefrontCheckoutPaymentOptions.js';
import { isCustomerChoiceStore, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';
import {
  getStorefrontOnlinePaymentLabel,
  isStorefrontOnlinePaymentType
} from '../../../../shared/services/storefrontOnlinePaymentSession.js';

export function SimpleCheckoutRoutePage({
  canAddPinnedLocation = false,
  canUseGuestCheckoutFlow = false,
  cart = [],
  cartCount = 0,
  cartImageErrors,
  checkoutError = '',
  checkoutLoading = false,
  checkoutResult = null,
  customerEmail = '',
  customerName = '',
  customerPhone = '',
  customerPin = null,
  deliveryLocationAction = 'saved',
  deliveryLocationDisplayAddress = '',
  deliverySavedLocations = [],
  DropdownComponent,
  fnbPaymentType = 'cash',
  paymentElection = 'full',
  fnbScheduleMode = 'asap',
  fnbScheduledFor = '',
  fnbSpecialInstructions = '',
  guestCheckoutOtpCode = '',
  guestCheckoutOtpCooldownLabel = '',
  guestCheckoutOtpError = '',
  guestCheckoutOtpLoading = false,
  guestCheckoutOtpVerified = false,
  isDeliveryOrder = false,
  isDesktopCheckout = false,
  isDgfyCustomerSignedIn = false,
  isGuestCheckoutOtpCooldownActive = false,
  isMobileViewport = false,
  money,
  orderMethod = 'delivery',
  pinLocationError = '',
  pinLocationLoading = false,
  promoDiscountSummaryRow = null,
  voucherDiscountSummaryRow = null,
  qrphPaymentSession = null,
  qrphPaymentStatusLoading = false,
  renderAccountOwnedIdentitySummary,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  renderPromoCodePanel,
  renderStorefrontClosedNotice,
  selectedLocation = null,
  selectedSavedLocationId = '',
  selectedStore = null,
  servicesBodyFont,
  servicesDisplayFont,
  showExpandedDeliveryMap = false,
  showSimpleMobileAddressModal = false,
  showSimpleMobileOrderSummary = false,
  simpleCheckoutAllowed = false,
  simpleCustomerStepComplete = false,
  simpleOrderMethodOptions = [],
  simpleOrderStep = 1,
  simpleStepOneReady = false,
  storefrontClosedByHours = false,
  totalsForDisplay,
  withAssetOrigin,
  onAddPinnedLocation,
  onApplyGuestDetailsAndRequestOtp,
  onBackToCatalog,
  onCheckout,
  onCloseExpandedMap,
  onDownloadCheckoutImage,
  onGuestCheckoutOtpCodeChange,
  onImageError,
  onOpenExpandedMap,
  onOrderMethodChange,
  onPaymentElectionChange,
  onPaymentTypeChange,
  onConfirmQrphTestPayment,
  onPinChange,
  onPinMyLocation,
  onRequestGuestCheckoutOtp,
  onScheduleModeChange,
  onScheduledForChange,
  onSelectAddress,
  onSetCheckoutResult,
  onSetSimpleOrderStep,
  onSignInToCheckout,
  onSpecialInstructionsChange,
  onStartMapPin,
  onVerifyGuestCheckoutOtp,
  resetQrphPaymentSession,
  setShowSimpleMobileAddressModal,
  setShowSimpleMobileOrderSummary
}) {
  const totals = totalsForDisplay || {};
  const stepGridStyle = {
    display: 'grid',
    gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.45fr) minmax(300px, 380px)' : '1fr',
    gap: 14,
    alignItems: 'start'
  };
  const scheduleLabel = fnbScheduleMode === 'schedule' && fnbScheduledFor
    ? new Date(fnbScheduledFor).toLocaleString()
    : 'NOW';
  const isOnlinePayment = isStorefrontOnlinePaymentType(fnbPaymentType);
  const onlinePaymentPending = Boolean(qrphPaymentSession?.payment_session_id);
  // Phase 142 (#823): quote-sourced (this page renders before a payment session exists).
  const downpaymentDisplay = resolveDownpaymentDisplay({ quoteResult: totals });
  const paymentSubmitLabel = downpaymentDisplay.active
    ? `Pay downpayment (${money(downpaymentDisplay.downpaymentAmount)})`
    : fnbPaymentType === 'qrph'
      ? 'Generate QR Ph'
      : isOnlinePayment
        ? `Pay with ${getStorefrontOnlinePaymentLabel(fnbPaymentType)}`
        : 'Place Order';

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: '100%', width: '100%', padding: isMobileViewport ? '0px 0px 18px' : '0px 0px 28px' }}>
      <SimpleCheckoutStoreHeader
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        onBackToCatalog={onBackToCatalog}
        selectedStore={selectedStore}
        servicesBodyFont={servicesBodyFont}
        servicesDisplayFont={servicesDisplayFont}
        withAssetOrigin={withAssetOrigin}
      />

      <div style={{ display: 'grid', gap: 18, maxWidth: 1240, margin: '0 auto', width: '100%', padding: isMobileViewport ? (checkoutResult ? '0 16px' : '0 16px calc(env(safe-area-inset-bottom, 0px) + 196px)') : '0 40px', boxSizing: 'border-box' }}>
      <SimpleCheckoutJourneyHeader
        activeStep={simpleOrderStep}
        cartCount={cartCount}
        cartHasItems={cart.length > 0}
        isCustomerStepComplete={simpleCustomerStepComplete}
        isDeliveryOrder={isDeliveryOrder}
        isMobileViewport={isMobileViewport}
        displayFont={servicesDisplayFont}
        onStepChange={onSetSimpleOrderStep}
        signedIn={isDgfyCustomerSignedIn}
      />

      {simpleOrderStep === 1 && (
        <div style={stepGridStyle}>
          <SimpleCheckoutCustomerStep
            canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
            guestCheckoutOtpCode={guestCheckoutOtpCode}
            guestCheckoutOtpCooldownLabel={guestCheckoutOtpCooldownLabel}
            guestCheckoutOtpError={guestCheckoutOtpError}
            guestCheckoutOtpLoading={guestCheckoutOtpLoading}
            guestCheckoutOtpVerified={guestCheckoutOtpVerified}
            isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
            isGuestCheckoutOtpCooldownActive={isGuestCheckoutOtpCooldownActive}
            isMobileViewport={isMobileViewport}
            renderAccountOwnedIdentitySummary={renderAccountOwnedIdentitySummary}
            renderGuestCheckoutEntry={renderGuestCheckoutEntry}
            renderGuestIdentityFields={renderGuestIdentityFields}
            servicesBodyFont={servicesBodyFont}
            simpleCustomerStepComplete={simpleCustomerStepComplete}
            onApplyGuestDetailsAndRequestOtp={onApplyGuestDetailsAndRequestOtp}
            onBackToCatalog={onBackToCatalog}
            onContinue={() => onSetSimpleOrderStep(2)}
            onGuestCheckoutOtpCodeChange={onGuestCheckoutOtpCodeChange}
            onRequestGuestCheckoutOtp={onRequestGuestCheckoutOtp}
            onVerifyGuestCheckoutOtp={onVerifyGuestCheckoutOtp}
          />
          {!isMobileViewport && (
            <SimpleCheckoutSummaryContent
              bodyFont={servicesBodyFont}
              cart={cart}
              cartCount={cartCount}
              cartImageErrors={cartImageErrors}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              isSticky={isDesktopCheckout}
              money={money}
              onImageError={onImageError}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              voucherDiscountSummaryRow={voucherDiscountSummaryRow}
              promoPanel={renderPromoCodePanel({ compact: true, accentColor: '#176B3A', bodyFont: servicesBodyFont })}
              scheduleLabel={scheduleLabel}
              totals={totals}
              withAssetOrigin={withAssetOrigin}
            />
          )}
        </div>
      )}

      {simpleOrderStep === 2 && (
        <div style={stepGridStyle}>
          <SimpleCheckoutFulfillmentStep
            canAddPinnedLocation={canAddPinnedLocation}
            canUseGuestCheckoutFlow={canUseGuestCheckoutFlow}
            customerPin={customerPin}
            deliveryLocationAction={deliveryLocationAction}
            deliveryLocationDisplayAddress={deliveryLocationDisplayAddress}
            deliverySavedLocations={deliverySavedLocations}
            fnbScheduleMode={fnbScheduleMode}
            isDeliveryOrder={isDeliveryOrder}
            isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
            isMobileViewport={isMobileViewport}
            orderMethod={orderMethod}
            pinLocationError={pinLocationError}
            pinLocationLoading={pinLocationLoading}
            renderGuestCheckoutEntry={renderGuestCheckoutEntry}
            scheduledFor={fnbScheduledFor}
            selectedLocation={selectedLocation}
            selectedSavedLocationId={selectedSavedLocationId}
            servicesBodyFont={servicesBodyFont}
            servicesDisplayFont={servicesDisplayFont}
            showExpandedDeliveryMap={showExpandedDeliveryMap}
            showSimpleMobileAddressModal={showSimpleMobileAddressModal}
            simpleOrderMethodOptions={simpleOrderMethodOptions}
            simpleStepOneReady={simpleStepOneReady}
            specialInstructions={fnbSpecialInstructions}
            onAddPinnedLocation={onAddPinnedLocation}
            onBack={() => onSetSimpleOrderStep(1)}
            onCloseExpandedMap={onCloseExpandedMap}
            onCloseMobileAddressModal={() => setShowSimpleMobileAddressModal(false)}
            onContinue={() => onSetSimpleOrderStep(3)}
            onOpenExpandedMap={onOpenExpandedMap}
            onOpenMobileAddressList={() => setShowSimpleMobileAddressModal(true)}
            onOrderMethodChange={onOrderMethodChange}
            onPinChange={onPinChange}
            onPinMyLocation={onPinMyLocation}
            onScheduleModeChange={onScheduleModeChange}
            onScheduledForChange={onScheduledForChange}
            onSelectAddress={onSelectAddress}
            onSpecialInstructionsChange={onSpecialInstructionsChange}
            onStartMapPin={onStartMapPin}
          />
          {!isMobileViewport && (
            <SimpleCheckoutSummaryContent
              bodyFont={servicesBodyFont}
              cart={cart}
              cartCount={cartCount}
              cartImageErrors={cartImageErrors}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              isSticky={isDesktopCheckout}
              money={money}
              onImageError={onImageError}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              voucherDiscountSummaryRow={voucherDiscountSummaryRow}
              promoPanel={renderPromoCodePanel({ compact: true, accentColor: '#176B3A', bodyFont: servicesBodyFont })}
              scheduleLabel={scheduleLabel}
              totals={totals}
              withAssetOrigin={withAssetOrigin}
            />
          )}
        </div>
      )}

      {simpleOrderStep === 3 && !checkoutResult && (
        <div style={stepGridStyle}>
          <SimpleCheckoutPaymentStep
            bodyFont={servicesBodyFont}
            cart={cart}
            cartImageErrors={cartImageErrors}
            checkoutError={checkoutError}
            checkoutLoading={checkoutLoading}
            guestCheckoutOtpVerified={guestCheckoutOtpVerified}
            DropdownComponent={DropdownComponent}
            isCustomerChoiceStore={isCustomerChoiceStore(selectedStore)}
            isMobileViewport={isMobileViewport}
            isDgfyCustomerSignedIn={isDgfyCustomerSignedIn}
            money={money}
            onImageError={onImageError}
            onPaymentElectionChange={onPaymentElectionChange}
            paymentElection={paymentElection}
            paymentType={fnbPaymentType}
            paymentOptions={buildStorefrontCheckoutPaymentOptions(selectedStore?.payment_capabilities, { hideCash: downpaymentDisplay.active })}
            isDownpaymentActive={downpaymentDisplay.active}
            downpaymentCallout={(
              <DownpaymentPaymentCallout
                accentColor="#176B3A"
                bodyFont={servicesBodyFont}
                display={downpaymentDisplay}
                money={money}
                orderMethod={isDeliveryOrder ? 'delivery' : 'pickup'}
              />
            )}
            onlinePaymentPanel={isOnlinePayment ? (
              <StorefrontOnlinePaymentPanel
                amountDue={downpaymentDisplay.active ? money(downpaymentDisplay.downpaymentAmount) : null}
                amountDueLabel="Downpayment due"
                balanceNote={downpaymentDisplay.active
                  ? `Pay the remaining ${money(downpaymentDisplay.balanceDueAmount)} in cash ${isDeliveryOrder ? 'on delivery' : 'at pickup'}.`
                  : null}
                billing={{ name: customerName, email: customerEmail, phone: customerPhone }}
                onConfirmTestPayment={import.meta.env.DEV
                  && fnbPaymentType === 'qrph'
                  && selectedStore?.payment_capabilities?.qrph?.environment === 'test'
                  ? onConfirmQrphTestPayment
                  : null}
                onChooseAnotherPaymentMethod={() => {
                  resetQrphPaymentSession?.();
                }}
                paymentSession={qrphPaymentSession}
                paymentEnvironment={selectedStore?.payment_capabilities?.[fnbPaymentType]?.environment}
                paymentType={fnbPaymentType}
                qrAmountNote={downpaymentDisplay.active ? 'This QR contains your downpayment amount.' : null}
                refreshing={qrphPaymentStatusLoading}
              />
            ) : null}
            simpleCheckoutAllowed={simpleCheckoutAllowed && !onlinePaymentPending}
            submitLabel={paymentSubmitLabel}
            storefrontClosedNotice={storefrontClosedByHours ? renderStorefrontClosedNotice({ accent: '#9a3412', background: '#fff7ed', border: '#fdba74' }) : null}
            withAssetOrigin={withAssetOrigin}
            onBack={() => onSetSimpleOrderStep(2)}
            onCheckout={onCheckout}
            onSignInToCheckout={onSignInToCheckout}
            onPaymentTypeChange={onPaymentTypeChange}
          />
          {!isMobileViewport && (
            <SimpleCheckoutSummaryContent
              bodyFont={servicesBodyFont}
              cart={cart}
              cartCount={cartCount}
              cartImageErrors={cartImageErrors}
              displayFont={servicesDisplayFont}
              isDeliveryOrder={isDeliveryOrder}
              isSticky={isDesktopCheckout}
              money={money}
              onImageError={onImageError}
              promoDiscountSummaryRow={promoDiscountSummaryRow}
              voucherDiscountSummaryRow={voucherDiscountSummaryRow}
              promoPanel={renderPromoCodePanel({ compact: true, accentColor: '#176B3A', bodyFont: servicesBodyFont })}
              scheduleLabel={scheduleLabel}
              totals={totals}
              withAssetOrigin={withAssetOrigin}
            />
          )}
        </div>
      )}

      {simpleOrderStep === 4 && checkoutResult && (
        <SimpleCheckoutSuccessStep
          checkoutResult={checkoutResult}
          displayFont={servicesDisplayFont}
          fulfillmentLabel={isDeliveryOrder ? 'Delivery' : 'Pickup'}
          isDesktopCheckout={isDesktopCheckout}
          isMobileViewport={isMobileViewport}
          money={money}
          paymentType={fnbPaymentType}
          totalAmount={totals.total_amount}
          onBackToCatalog={() => {
            onSetCheckoutResult(null);
            onSetSimpleOrderStep(1);
            onBackToCatalog();
          }}
          onDownload={onDownloadCheckoutImage}
        />
      )}

      {isMobileViewport && !checkoutResult && (
        <SimpleCheckoutMobileSummaryPanel
          cart={cart}
          cartCount={cartCount}
          cartImageErrors={cartImageErrors}
          checkoutAllowed={simpleCheckoutAllowed && !onlinePaymentPending}
          checkoutLoading={checkoutLoading}
          customerStepComplete={simpleCustomerStepComplete}
          fulfillmentStepComplete={simpleStepOneReady}
          isDeliveryOrder={isDeliveryOrder}
          money={money}
          onBackToCatalog={onBackToCatalog}
          onCheckout={onCheckout}
          onImageError={onImageError}
          onStepChange={onSetSimpleOrderStep}
          orderStep={simpleOrderStep}
          promoDiscountSummaryRow={promoDiscountSummaryRow}
          voucherDiscountSummaryRow={voucherDiscountSummaryRow}
          promoPanel={renderPromoCodePanel({ compact: true, accentColor: '#176B3A', bodyFont: servicesBodyFont, isMobile: true })}
          scheduleLabel={scheduleLabel}
          setSummaryOpen={setShowSimpleMobileOrderSummary}
          showSummary={showSimpleMobileOrderSummary}
          submitLabel={paymentSubmitLabel}
          totals={totals}
          withAssetOrigin={withAssetOrigin}
        />
      )}
      </div>
    </div>
  );
}
