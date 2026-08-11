import React, { useMemo } from 'react';
import { CustomerDashboardDrawer } from './CustomerDashboardDrawer.jsx';
import { CustomerDashboardPage } from './CustomerDashboardPage.jsx';

function buildCustomerDashboardViewProps({
  isMobileViewport,
  state,
  actions,
  resolvers
}) {
  return {
    isMobileViewport,
    onRefresh: actions.onRefresh,
    onTrackReference: actions.onTrackReference,
    onMarkNotificationRead: actions.onMarkNotificationRead,
    onMarkAllNotificationsRead: actions.onMarkAllNotificationsRead,
    onSignOut: actions.onSignOut,
    onHelp: actions.onHelp,
    onRegisterBusiness: actions.onRegisterBusiness,
    onRequestBusinessStepUp: actions.onRequestBusinessStepUp,
    onAcceptCompanyInvitation: actions.onAcceptCompanyInvitation,
    onRejectCompanyInvitation: actions.onRejectCompanyInvitation,
    onLeaveCompany: actions.onLeaveCompany,
    onSwitchCompany: actions.onSwitchCompany,
    onClearSavedDetails: actions.onClearSavedDetails,
    onUseAddressForCheckout: actions.onUseAddressForCheckout,
    onSaveAddress: actions.onSaveAddress,
    onDeleteAddress: actions.onDeleteAddress,
    onSetDefaultAddress: actions.onSetDefaultAddress,
    renderAddressPinEditor: actions.renderAddressPinEditor,
    onSavePayoutMethod: actions.onSavePayoutMethod,
    onDeletePayoutMethod: actions.onDeletePayoutMethod,
    onSetDefaultPayoutMethod: actions.onSetDefaultPayoutMethod,
    onRequestCashout: actions.onRequestCashout,
    onCancelCashout: actions.onCancelCashout,
    accountIdentityInitials: state.accountIdentityInitials,
    accountIdentityName: state.accountIdentityName,
    accountIdentityContact: state.accountIdentityContact,
    accountPanel: state.accountPanel,
    hasSavedCustomerDetails: state.hasSavedCustomerDetails,
    maskedSavedCustomerPreview: state.maskedSavedCustomerPreview,
    activeOrders: state.activeOrders,
    activeOrderCount: state.activeOrderCount,
    trackedCustomerActivity: state.trackedCustomerActivity,
    customerTrackLoadingReference: state.customerTrackLoadingReference,
    customerTrackError: state.customerTrackError,
    onOpenStorefront: actions.onOpenStorefront,
    onSubmitCustomerReview: actions.onSubmitCustomerReview,
    resolveStorefrontMeta: resolvers.resolveStorefrontMeta,
    onOpenBusinessInventory: actions.onOpenBusinessInventory,
    resolveBusinessAssetUrl: resolvers.resolveBusinessAssetUrl,
    onOpenBusinessPos: actions.onOpenBusinessPos,
    onGetBusinessDayCloseStatus: actions.onGetBusinessDayCloseStatus,
    onConfigureBusinessDayClosePin: actions.onConfigureBusinessDayClosePin,
    accountOrderActionReference: state.accountOrderActionReference,
    accountAddressActionId: state.accountAddressActionId,
    accountPayoutActionId: state.accountPayoutActionId,
    accountCashoutActionId: state.accountCashoutActionId
  };
}

export function CustomerDashboardRouteContainer({
  presentation = 'page',
  isSignedIn = false,
  isOpen = false,
  isMobileViewport = false,
  onClose,
  state,
  actions,
  resolvers
}) {
  const viewProps = useMemo(
    () => buildCustomerDashboardViewProps({
      isMobileViewport,
      state,
      actions,
      resolvers
    }),
    [actions, isMobileViewport, resolvers, state]
  );

  if (presentation === 'page') {
    if (!isSignedIn) return null;
    return <CustomerDashboardPage {...viewProps} onClose={onClose} />;
  }

  if (!isOpen) return null;
  return <CustomerDashboardDrawer {...viewProps} onClose={onClose} />;
}

export default CustomerDashboardRouteContainer;
