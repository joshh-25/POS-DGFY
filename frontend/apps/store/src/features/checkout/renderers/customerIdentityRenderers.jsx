import React from 'react';
import { CustomerIdentityCard } from '../../../checkout/components/CustomerIdentityCard.jsx';
import { GuestIdentityForm } from '../../../checkout/components/GuestIdentityForm.jsx';
import { SavedCustomerDetailsPanel } from '../../../checkout/components/SavedCustomerDetailsPanel.jsx';

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
  setGuestCheckoutUnlocked
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
    savedDetailsTitle = 'Saved Details',
    savedDetailsApplyLabel = 'Apply Details',
    onSavedDetailsApply = handleApplyGuestDetails
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
        showSingleNameField
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
    description = 'Create an account or continue as guest to continue your order.',
    resumeTarget = {}
  } = {}) => (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 14 }}>
      <div style={{ textAlign: 'center', display: 'grid', gap: 6 }}>
        <div style={{ fontSize: isMobileViewport ? 28 : 34, fontWeight: 900, color: '#0f172a', lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 14, color: '#64748b' }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={() => openCheckoutAuthFlow('create-account', resumeTarget)}
        style={{ minHeight: 48, borderRadius: 12, border: 'none', background: '#1a4e8d', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 24px rgba(26,78,141,.18)', fontFamily: servicesBodyFont }}
      >
        Create DGFY Account
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>or</span>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
      </div>
      <button
        type="button"
        onClick={() => setGuestCheckoutUnlocked(true)}
        style={{ minHeight: 46, borderRadius: 12, border: '1px solid #1a4e8d', background: '#fff', color: '#1a4e8d', fontWeight: 700, cursor: 'pointer', fontFamily: servicesBodyFont }}
      >
        Continue as Guest
      </button>
      <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>
        Already have an account?{' '}
        <button
          type="button"
          onClick={() => openCheckoutAuthFlow('sign-in', resumeTarget)}
          style={{ border: 'none', background: 'transparent', color: '#1a4e8d', fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: servicesBodyFont }}
        >
          Log in
        </button>
      </div>
    </section>
  );

  const renderAccountOwnedIdentitySummary = ({
    title = 'Account Details',
    subtitle = 'Your DGFY account details will be used for this order.',
    showVerifiedBadge = true
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
    />
  );

  return {
    renderGuestIdentityFields,
    renderGuestCheckoutEntry,
    renderAccountOwnedIdentitySummary
  };
}
