import { useMemo } from 'react';

export function useCustomerDashboardStorefrontBridge({
  accountIdentityInitials,
  accountIdentityName,
  accountIdentityContact,
  accountPanel,
  hasSavedCustomerDetails,
  maskedSavedCustomerPreview,
  activeCustomerOrders,
  activeCustomerOrderCount,
  trackedCustomerActivity,
  customerTrackLoadingReference,
  customerTrackError,
  accountOrderActionReference,
  accountAddressActionId,
  handleLoadAccountPanel,
  handleTrackCustomerReference,
  handleMarkNotificationRead,
  handleMarkAllNotificationsRead,
  handleStorefrontSignOut,
  openBusinessRegistrationFlow,
  requestDgfyBusinessSecurityCode,
  handleAcceptDgfyCompanyInvitation,
  handleRejectDgfyCompanyInvitation,
  handleLeaveDgfyCompany,
  switchDgfyCompanyFromStorefront,
  clearSavedCustomerDetailsForDevice,
  useAccountAddressForCheckout,
  handleSaveAccountAddress,
  handleDeleteAccountAddress,
  handleSetDefaultAccountAddress,
  renderAddressPinEditor,
  openStorefrontFromAccountEntry,
  submitAccountReviewFromDashboard,
  handleOpenBusinessInventory,
  handleOpenBusinessPos,
  resolveStorefrontMetaForAccountEntry,
  withAssetOrigin,
  savedCustomerDetails,
  applySavedCustomerDetails,
  closeAccountDrawer,
  openCanonicalDgfyAuth
}) {
  const sources = useMemo(() => ({
    accountIdentityInitials,
    accountIdentityName,
    accountIdentityContact,
    accountPanel,
    hasSavedCustomerDetails,
    maskedSavedCustomerPreview,
    activeCustomerOrders,
    activeCustomerOrderCount,
    trackedCustomerActivity,
    customerTrackLoadingReference,
    customerTrackError,
    accountOrderActionReference,
    accountAddressActionId,
    handleLoadAccountPanel,
    handleTrackCustomerReference,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleStorefrontSignOut,
    openBusinessRegistrationFlow,
    requestDgfyBusinessSecurityCode,
    handleAcceptDgfyCompanyInvitation,
    handleRejectDgfyCompanyInvitation,
    handleLeaveDgfyCompany,
    switchDgfyCompanyFromStorefront,
    clearSavedCustomerDetailsForDevice,
    useAccountAddressForCheckout,
    handleSaveAccountAddress,
    handleDeleteAccountAddress,
    handleSetDefaultAccountAddress,
    renderAddressPinEditor,
    openStorefrontFromAccountEntry,
    submitAccountReviewFromDashboard,
    handleOpenBusinessInventory,
    handleOpenBusinessPos,
    resolveStorefrontMetaForAccountEntry,
    withAssetOrigin
  }), [
    accountAddressActionId,
    accountIdentityContact,
    accountIdentityInitials,
    accountIdentityName,
    accountOrderActionReference,
    accountPanel,
    activeCustomerOrderCount,
    activeCustomerOrders,
    clearSavedCustomerDetailsForDevice,
    customerTrackError,
    customerTrackLoadingReference,
    handleAcceptDgfyCompanyInvitation,
    handleDeleteAccountAddress,
    handleLeaveDgfyCompany,
    handleLoadAccountPanel,
    handleMarkAllNotificationsRead,
    handleMarkNotificationRead,
    handleOpenBusinessInventory,
    handleOpenBusinessPos,
    handleRejectDgfyCompanyInvitation,
    handleSaveAccountAddress,
    handleSetDefaultAccountAddress,
    handleStorefrontSignOut,
    handleTrackCustomerReference,
    hasSavedCustomerDetails,
    maskedSavedCustomerPreview,
    openBusinessRegistrationFlow,
    openStorefrontFromAccountEntry,
    renderAddressPinEditor,
    requestDgfyBusinessSecurityCode,
    resolveStorefrontMetaForAccountEntry,
    submitAccountReviewFromDashboard,
    switchDgfyCompanyFromStorefront,
    trackedCustomerActivity,
    useAccountAddressForCheckout,
    withAssetOrigin
  ]);

  const guestAuth = useMemo(() => ({
    savedCustomerDetails,
    hasSavedCustomerDetails,
    onContinueAsGuest: () => {
      if (hasSavedCustomerDetails) {
        applySavedCustomerDetails();
      }
      closeAccountDrawer();
    },
    onClearSavedDetails: clearSavedCustomerDetailsForDevice,
    onOpenAuth: () => {
      closeAccountDrawer();
      openCanonicalDgfyAuth('customer');
    },
    onOpenRegisterBusiness: () => {
      closeAccountDrawer();
      openBusinessRegistrationFlow();
    }
  }), [
    applySavedCustomerDetails,
    clearSavedCustomerDetailsForDevice,
    closeAccountDrawer,
    hasSavedCustomerDetails,
    openBusinessRegistrationFlow,
    openCanonicalDgfyAuth,
    savedCustomerDetails
  ]);

  return useMemo(
    () => ({
      sources,
      guestAuth
    }),
    [guestAuth, sources]
  );
}

export default useCustomerDashboardStorefrontBridge;
