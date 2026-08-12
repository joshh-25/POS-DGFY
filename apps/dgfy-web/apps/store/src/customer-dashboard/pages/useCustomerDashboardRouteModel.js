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
    accountAddressActionId: state.accountAddressActionId,
    accountPayoutActionId: state.accountPayoutActionId,
    accountCashoutActionId: state.accountCashoutActionId
  }), [
    state.accountAddressActionId,
    state.accountCashoutActionId,
    state.accountIdentityContact,
    state.accountIdentityInitials,
    state.accountIdentityName,
    state.accountOrderActionReference,
    state.accountPanel,
    state.accountPayoutActionId,
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
    onSavePayoutMethod: actions.handleSavePayoutMethod,
    onDeletePayoutMethod: actions.handleDeletePayoutMethod,
    onSetDefaultPayoutMethod: actions.handleSetDefaultPayoutMethod,
    onRequestCashout: actions.handleRequestCashout,
    onCancelCashout: actions.handleCancelCashout,
    onOpenStorefront: actions.openStorefrontFromAccountEntry,
    onSubmitCustomerReview: actions.submitAccountReviewFromDashboard,
    onOpenBusinessInventory: actions.handleOpenBusinessInventory,
    onOpenBusinessPos: actions.handleOpenBusinessPos,
    onGetBusinessDayCloseStatus: actions.getOwnBusinessDayCloseStatus,
    onConfigureBusinessDayClosePin: actions.configureOwnBusinessDayClosePin,
    onGoDiscovery: actions.onGoDiscovery
  }), [
    actions.clearSavedCustomerDetailsForDevice,
    actions.handleAcceptDgfyCompanyInvitation,
    actions.handleCancelCashout,
    actions.handleDeleteAccountAddress,
    actions.handleDeletePayoutMethod,
    actions.handleLeaveDgfyCompany,
    actions.handleLoadAccountPanel,
    actions.handleMarkAllNotificationsRead,
    actions.handleMarkNotificationRead,
    actions.handleOpenBusinessInventory,
    actions.handleOpenBusinessPos,
    actions.configureOwnBusinessDayClosePin,
    actions.getOwnBusinessDayCloseStatus,
    actions.handleRejectDgfyCompanyInvitation,
    actions.handleRequestCashout,
    actions.handleSaveAccountAddress,
    actions.handleSavePayoutMethod,
    actions.handleSetDefaultAccountAddress,
    actions.handleSetDefaultPayoutMethod,
    actions.handleStorefrontSignOut,
    actions.handleTrackCustomerReference,
    actions.openBusinessRegistrationFlow,
    actions.onGoDiscovery,
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
