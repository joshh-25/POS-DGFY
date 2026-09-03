import React from 'react';
import { CustomerIdentityCard } from '../../../shared/components/checkout/CustomerIdentityCard.jsx';
import { GuestIdentityForm } from '../components/GuestIdentityForm.jsx';
import { SavedCustomerDetailsPanel } from '../../../shared/components/checkout/SavedCustomerDetailsPanel.jsx';
import { CheckoutBillingEmailPrompt } from '../../../shared/components/checkout/CheckoutBillingEmailPrompt.jsx';
import { GUEST_CHECKOUT_SAVED_DETAILS_TITLE } from '../../../shared/components/checkout/guestCheckoutTypography.js';

export function createCustomerIdentityRenderers({
  hasSavedCustomerDetails,
  savedCustomerDetails,
  rememberCustomerDetails,
  maskedSavedCustomerPreview,
  guestDetailsFeedback,
  guestDetailsEditMode,
  isMobileViewport,
  servicesBodyFont,
  servicesDisplayFont,
  checkoutAccent = '#1a4e8d',
  checkoutAccentDark = '#1a4e8d',
  checkoutAccentShadow = 'rgba(26,78,141,.18)',
  customerName,
  customerFirstName,
  customerLastName,
  customerPhone,
  customerEmail,
  customerAddress,
  accountIdentityRawName,
  accountIdentityRawPhone,
  accountIdentityRawEmail,
  handleGuestCustomerNameChange,
  setCustomerFirstName,
  setCustomerLastName,
  setCustomerPhone,
  setCustomerEmail,
  setCustomerAddress,
  setRememberCustomerDetails,
  isGuestDetailsFreshEntry,
  guestDetailsFocusKey,
  handleOpenGuestDetailsEditor,
  handleCancelGuestDetailsEditor,
  handleApplyGuestDetails,
  openCheckoutAuthFlow,
  setGuestCheckoutUnlocked,
  guestCheckoutAllowed = true
}) {
  const renderGuestIdentityFields = ({
    title = 'Guest Details',
    subtitle = 'Use guest checkout now, or create a DGFY account later with these same details.',
    requireEmail = false,
    includeAddress = false,
    addressLabel = 'Delivery Address',
    addressPlaceholder = 'House no., street, barangay, landmark',
    addressRequired = false,
    showSavedDetailsCard = true,
    layoutVariant = 'default',
    savedDetailsTitle = GUEST_CHECKOUT_SAVED_DETAILS_TITLE,
    savedDetailsApplyLabel = 'Apply Details',
    onSavedDetailsApply = handleApplyGuestDetails,
    showSingleNameField = true
  } = {}) => {
    const rememberDetailsControl = (
      <label style={{ display: layoutVariant === 'fnbGuest' ? 'grid' : 'flex', gridTemplateColumns: layoutVariant === 'fnbGuest' ? 'auto minmax(0, 1fr)' : undefined, alignItems: layoutVariant === 'fnbGuest' ? 'start' : 'center', gap: layoutVariant === 'fnbGuest' ? '3px 9px' : 8, fontSize: 12, color: '#334155' }}>
        <input
          type="checkbox"
          checked={rememberCustomerDetails}
          onChange={(event) => setRememberCustomerDetails(event.target.checked)}
          style={{ width: 16, height: 16, marginTop: layoutVariant === 'fnbGuest' ? 1 : 0 }}
        />
        <span style={{ fontWeight: layoutVariant === 'fnbGuest' ? 700 : undefined }}>Remember these details for my next order</span>
        {layoutVariant === 'fnbGuest' ? <span style={{ gridColumn: '2', color: '#64748b' }}>Save time on your next order.</span> : null}
      </label>
    );

    const guestDetailsFields = (
      <GuestIdentityForm
        title={hasSavedCustomerDetails && showSavedDetailsCard ? '' : title}
        subtitle={hasSavedCustomerDetails && showSavedDetailsCard ? '' : subtitle}
        requireEmail={requireEmail}
        includeAddress={includeAddress}
        showSingleNameField={showSingleNameField}
        addressLabel={addressLabel}
        addressPlaceholder={addressPlaceholder}
        addressRequired={addressRequired}
        customerName={customerName}
        firstName={customerFirstName}
        lastName={customerLastName}
        phone={customerPhone}
        email={customerEmail}
        address={customerAddress}
        onCustomerNameChange={handleGuestCustomerNameChange}
        onFirstNameChange={setCustomerFirstName}
        onLastNameChange={setCustomerLastName}
        onPhoneChange={setCustomerPhone}
        onEmailChange={setCustomerEmail}
        onAddressChange={setCustomerAddress}
        isMobileViewport={isMobileViewport}
        autoFocusFirstField={isGuestDetailsFreshEntry}
        firstFieldFocusKey={guestDetailsFocusKey}
        embedded={hasSavedCustomerDetails && showSavedDetailsCard}
        layoutVariant={layoutVariant}
        footer={!hasSavedCustomerDetails || !showSavedDetailsCard || guestDetailsEditMode ? rememberDetailsControl : null}
      />
    );

    const hasAppliedGuestIdentity = Boolean(
      String(customerName || '').trim()
      || String(customerPhone || '').trim()
      || String(customerEmail || '').trim()
    );

    if (layoutVariant === 'fnbGuest') {
      const isEditingGuestIdentity = guestDetailsEditMode || !hasAppliedGuestIdentity;
      return (
        <SavedCustomerDetailsPanel
          title={savedDetailsTitle}
          customerName={String(customerName || savedCustomerDetails?.name || '').trim()}
          customerEmail={String(customerEmail || savedCustomerDetails?.email || '').trim()}
          customerPhone={String(customerPhone || savedCustomerDetails?.phone || '').trim()}
          hasSavedCustomerDetails={hasSavedCustomerDetails || hasAppliedGuestIdentity}
          isEditing={isEditingGuestIdentity}
          isMobileViewport={isMobileViewport}
          feedback={guestDetailsFeedback}
          onUseDifferentDetails={handleOpenGuestDetailsEditor}
          onCancelEdit={handleCancelGuestDetailsEditor}
          onApplyEdit={onSavedDetailsApply}
          applyLabel={savedDetailsApplyLabel}
        >
          {guestDetailsFields}
        </SavedCustomerDetailsPanel>
      );
    }

    if (!showSavedDetailsCard || !hasSavedCustomerDetails) {
      return (
        <>
          {guestDetailsFields}
        </>
      );
    }

    return (
      <SavedCustomerDetailsPanel
        title={savedDetailsTitle}
        subtitle="We'll use these details for your order or booking."
        customerName={String(customerName || savedCustomerDetails?.name || '').trim()}
        customerEmail={String(customerEmail || savedCustomerDetails?.email || '').trim()}
        customerPhone={String(customerPhone || savedCustomerDetails?.phone || '').trim()}
        hasSavedCustomerDetails={hasSavedCustomerDetails}
        rememberCustomerDetails={rememberCustomerDetails}
        maskedSavedCustomerPreview={isGuestDetailsFreshEntry ? '' : maskedSavedCustomerPreview}
        isEditing={guestDetailsEditMode}
        isMobileViewport={isMobileViewport}
        feedback={guestDetailsFeedback}
        onUseDifferentDetails={handleOpenGuestDetailsEditor}
        onCancelEdit={handleCancelGuestDetailsEditor}
        onApplyEdit={onSavedDetailsApply}
        applyLabel={savedDetailsApplyLabel}
        onRememberChange={setRememberCustomerDetails}
      >
        {guestDetailsFields}
      </SavedCustomerDetailsPanel>
    );
  };

  const renderGuestCheckoutEntry = ({
    title = 'Continue to your order',
    description = guestCheckoutAllowed
      ? 'Create an account or continue as guest to continue your order.'
      : 'This store requires a DGFY account to check out. Create one or log in to continue.',
    resumeTarget = {},
    layoutVariant = 'default'
  } = {}) => {
    const isServicesReference = layoutVariant === 'services-reference';
    return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: isServicesReference ? 18 : 16, background: '#fff', padding: isServicesReference ? (isMobileViewport ? 22 : 32) : (isMobileViewport ? 16 : 20), display: 'grid', gap: isServicesReference ? 16 : 14 }}>
      <div style={{ textAlign: isServicesReference ? 'left' : 'center', display: 'grid', gap: isServicesReference ? 4 : 6 }}>
        <div style={{ fontSize: isServicesReference ? 20 : (isMobileViewport ? 28 : 34), fontWeight: isServicesReference ? 700 : 900, color: '#101010', lineHeight: isServicesReference ? 1.25 : 1.05, fontFamily: isServicesReference ? servicesDisplayFont : undefined }}>{title}</div>
        <div style={{ fontSize: isServicesReference ? 14.4 : 14, lineHeight: isServicesReference ? 1.6 : undefined, color: '#58717a' }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={() => openCheckoutAuthFlow('create-account', resumeTarget)}
        style={{ minHeight: isServicesReference ? 51 : 48, borderRadius: 12, border: isServicesReference ? `1px solid ${checkoutAccent}` : 'none', background: isServicesReference ? checkoutAccent : `linear-gradient(135deg, ${checkoutAccent}, ${checkoutAccentDark})`, color: '#fff', fontWeight: isServicesReference ? 800 : 700, fontSize: isServicesReference ? 16 : undefined, cursor: 'pointer', boxShadow: isServicesReference ? 'none' : `0 10px 24px ${checkoutAccentShadow}`, fontFamily: servicesBodyFont }}
      >
        Create DGFY Account
      </button>
      {/* #622: guest checkout entirely hidden -- not just OTP-gated -- when the merchant has
          disabled it for this store. The server (assertGuestCheckoutAllowed) is the authority;
          this only keeps a disabled merchant from being offered a path the backend will reject. */}
      {guestCheckoutAllowed ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#58717a' }}>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#58717a' }}>{isServicesReference ? 'OR' : 'or'}</span>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          </div>
          <button
            type="button"
            onClick={() => setGuestCheckoutUnlocked(true)}
            style={{ minHeight: isServicesReference ? 51 : 46, borderRadius: 12, border: `1px solid ${checkoutAccent}`, background: '#fff', color: checkoutAccent, fontWeight: isServicesReference ? 800 : 700, fontSize: isServicesReference ? 16 : undefined, cursor: 'pointer', fontFamily: servicesBodyFont }}
          >
            Continue as Guest
          </button>
        </>
      ) : null}
      {!isServicesReference ? <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>
        Already have an account?{' '}
        <button
          type="button"
          onClick={() => openCheckoutAuthFlow('sign-in', resumeTarget)}
          style={{ border: 'none', background: 'transparent', color: checkoutAccent, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: servicesBodyFont }}
        >
          Log in
        </button>
      </div> : null}
    </section>
    );
  };

  const renderAccountOwnedIdentitySummary = ({
    title = 'Account Details',
    subtitle = 'Your DGFY account details will be used for this order.',
    showVerifiedBadge = true,
    layoutVariant = 'default'
  } = {}) => (
      <CustomerIdentityCard
      title={title}
      subtitle={subtitle}
      showVerifiedBadge={showVerifiedBadge}
      name={String(accountIdentityRawName || customerName || '').trim()}
      phone={String(accountIdentityRawPhone || customerPhone || '').trim()}
      email={String(accountIdentityRawEmail || customerEmail || '').trim()}
      isMobileViewport={isMobileViewport}
        bodyFont={servicesBodyFont}
        displayFont={servicesDisplayFont}
        layoutVariant={layoutVariant}
      />
  );

  // #963: the card billing-email input, rendered into whichever payment step needs it. Lives here
  // with the other identity renderers because it edits the same customerEmail state -- notably the
  // signed-in path, whose identity summary above is read-only and so offers no other way in.
  const renderBillingEmailPrompt = ({ invalid = false } = {}) => (
    <CheckoutBillingEmailPrompt
      value={customerEmail}
      onChange={setCustomerEmail}
      invalid={invalid}
      accentColor={checkoutAccent}
      bodyFont={servicesBodyFont}
    />
  );

  return {
    renderGuestIdentityFields,
    renderGuestCheckoutEntry,
    renderAccountOwnedIdentitySummary,
    renderBillingEmailPrompt
  };
}
