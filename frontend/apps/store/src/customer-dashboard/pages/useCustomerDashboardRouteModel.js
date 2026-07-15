import { useMemo } from 'react';
import { toast } from 'sonner';

export function useCustomerDashboardRouteModel({
  isMobileViewport,
  state,
  actions,
  resolvers
}) {
  const customerDashboardState = useMemo(() => ({
    accountIdentityInitials: state.accountIdentityInitials,
    accountIdentityName: state.accountIdentityName,
    accountIdentityContact: state.accountIdentityContact,
    accountPanel: state.accountPanel,
    hasSavedCustomerDetails: state.hasSavedCustomerDetails,
    maskedSavedCustomerPreview: state.maskedSavedCustomerPreview,
    activeOrders: state.activeCustomerOrders,
    activeOrderCount: state.activeCustomerOrderCount,
    trackedCustomerActivity: state.trackedCustomerActivity,
    customerTrackLoadingReference: state.customerTrackLoadingReference,
    customerTrackError: state.customerTrackError,
    accountOrderActionReference: state.accountOrderActionReference,
    accountAddressActionId: state.accountAddressActionId
  }), [
    state.accountAddressActionId,
    state.accountIdentityContact,
    state.accountIdentityInitials,
    state.accountIdentityName,
    state.accountOrderActionReference,
    state.accountPanel,
    state.activeCustomerOrderCount,
    state.activeCustomerOrders,
    state.customerTrackError,
    state.customerTrackLoadingReference,
    state.hasSavedCustomerDetails,
    state.maskedSavedCustomerPreview,
    state.trackedCustomerActivity
  ]);

  const customerDashboardActions = useMemo(() => ({
    onRefresh: actions.handleLoadAccountPanel,
    onTrackReference: actions.handleTrackCustomerReference,
    onMarkNotificationRead: actions.handleMarkNotificationRead,
    onMarkAllNotificationsRead: actions.handleMarkAllNotificationsRead,
    onSignOut: actions.handleStorefrontSignOut,
    onHelp: () => toast.info('Help center is not connected yet.'),
    onRegisterBusiness: actions.openBusinessRegistrationFlow,
    onRequestBusinessStepUp: actions.requestDgfyBusinessSecurityCode,
    onAcceptCompanyInvitation: actions.handleAcceptDgfyCompanyInvitation,
    onRejectCompanyInvitation: actions.handleRejectDgfyCompanyInvitation,
    onLeaveCompany: actions.handleLeaveDgfyCompany,
    onSwitchCompany: actions.switchDgfyCompanyFromStorefront,
    onClearSavedDetails: actions.clearSavedCustomerDetailsForDevice,
    onUseAddressForCheckout: actions.useAccountAddressForCheckout,
    onSaveAddress: actions.handleSaveAccountAddress,
    onDeleteAddress: actions.handleDeleteAccountAddress,
    onSetDefaultAddress: actions.handleSetDefaultAccountAddress,
    renderAddressPinEditor: actions.renderAddressPinEditor,
    onOpenStorefront: actions.openStorefrontFromAccountEntry,
    onSubmitCustomerReview: actions.submitAccountReviewFromDashboard,
    onOpenBusinessInventory: actions.handleOpenBusinessInventory,
    onOpenBusinessPos: actions.handleOpenBusinessPos
  }), [
    actions.clearSavedCustomerDetailsForDevice,
    actions.handleAcceptDgfyCompanyInvitation,
    actions.handleDeleteAccountAddress,
    actions.handleLeaveDgfyCompany,
    actions.handleLoadAccountPanel,
    actions.handleMarkAllNotificationsRead,
    actions.handleMarkNotificationRead,
    actions.handleOpenBusinessInventory,
    actions.handleOpenBusinessPos,
    actions.handleRejectDgfyCompanyInvitation,
    actions.handleSaveAccountAddress,
    actions.handleSetDefaultAccountAddress,
    actions.handleStorefrontSignOut,
    actions.handleTrackCustomerReference,
    actions.openBusinessRegistrationFlow,
    actions.openStorefrontFromAccountEntry,
    actions.renderAddressPinEditor,
    actions.requestDgfyBusinessSecurityCode,
    actions.submitAccountReviewFromDashboard,
    actions.switchDgfyCompanyFromStorefront,
    actions.useAccountAddressForCheckout
  ]);

  const customerDashboardResolvers = useMemo(() => ({
    resolveStorefrontMeta: resolvers.resolveStorefrontMetaForAccountEntry,
    resolveBusinessAssetUrl: resolvers.withAssetOrigin
  }), [
    resolvers.resolveStorefrontMetaForAccountEntry,
    resolvers.withAssetOrigin
  ]);

  return useMemo(() => ({
    isMobileViewport,
    state: customerDashboardState,
    actions: customerDashboardActions,
    resolvers: customerDashboardResolvers
  }), [
    customerDashboardActions,
    customerDashboardResolvers,
    customerDashboardState,
    isMobileViewport
  ]);
}

export default useCustomerDashboardRouteModel;
