import React from 'react';
import { CustomerDashboardRouteContainer } from './CustomerDashboardRouteContainer.jsx';
import { useCustomerDashboardRouteBindings } from './useCustomerDashboardRouteBindings.js';
import { useCustomerDashboardRouteModel } from './useCustomerDashboardRouteModel.js';

export function CustomerDashboardRouteRuntime({
  presentation = 'page',
  isSignedIn = false,
  isOpen = false,
  isMobileViewport = false,
  onClose,
  sources,
  state,
  actions,
  resolvers
}) {
  const routeBindings = useCustomerDashboardRouteBindings(
    sources ?? buildRuntimeSourcesFallback({ state, actions, resolvers })
  );
  const routeModel = useCustomerDashboardRouteModel({
    isMobileViewport,
    state: routeBindings.state,
    actions: routeBindings.actions,
    resolvers: routeBindings.resolvers
  });

  return (
    <CustomerDashboardRouteContainer
      presentation={presentation}
      isOpen={isOpen}
      isSignedIn={isSignedIn}
      isMobileViewport={routeModel.isMobileViewport}
      onClose={onClose}
      state={routeModel.state}
      actions={routeModel.actions}
      resolvers={routeModel.resolvers}
    />
  );
}

function buildRuntimeSourcesFallback({ state, actions, resolvers }) {
  return {
    accountIdentityInitials: state?.accountIdentityInitials,
    accountIdentityName: state?.accountIdentityName,
    accountIdentityContact: state?.accountIdentityContact,
    accountPanel: state?.accountPanel,
    hasSavedCustomerDetails: state?.hasSavedCustomerDetails,
    maskedSavedCustomerPreview: state?.maskedSavedCustomerPreview,
    activeCustomerOrders: state?.activeOrders,
    activeCustomerOrderCount: state?.activeOrderCount,
    trackedCustomerActivity: state?.trackedCustomerActivity,
    customerTrackLoadingReference: state?.customerTrackLoadingReference,
    customerTrackError: state?.customerTrackError,
    accountOrderActionReference: state?.accountOrderActionReference,
    accountAddressActionId: state?.accountAddressActionId,
    accountPayoutActionId: state?.accountPayoutActionId,
    accountCashoutActionId: state?.accountCashoutActionId,
    handleLoadAccountPanel: actions?.onRefresh,
    handleTrackCustomerReference: actions?.onTrackReference,
    handleMarkNotificationRead: actions?.onMarkNotificationRead,
    handleMarkAllNotificationsRead: actions?.onMarkAllNotificationsRead,
    handleStorefrontSignOut: actions?.onSignOut,
    openBusinessRegistrationFlow: actions?.onRegisterBusiness,
    requestDgfyBusinessSecurityCode: actions?.onRequestBusinessStepUp,
    handleAcceptDgfyCompanyInvitation: actions?.onAcceptCompanyInvitation,
    handleRejectDgfyCompanyInvitation: actions?.onRejectCompanyInvitation,
    handleLeaveDgfyCompany: actions?.onLeaveCompany,
    switchDgfyCompanyFromStorefront: actions?.onSwitchCompany,
    clearSavedCustomerDetailsForDevice: actions?.onClearSavedDetails,
    useAccountAddressForCheckout: actions?.onUseAddressForCheckout,
    handleSaveAccountAddress: actions?.onSaveAddress,
    handleDeleteAccountAddress: actions?.onDeleteAddress,
    handleSetDefaultAccountAddress: actions?.onSetDefaultAddress,
    renderAddressPinEditor: actions?.renderAddressPinEditor,
    handleSavePayoutMethod: actions?.onSavePayoutMethod,
    handleDeletePayoutMethod: actions?.onDeletePayoutMethod,
    handleSetDefaultPayoutMethod: actions?.onSetDefaultPayoutMethod,
    handleRequestCashout: actions?.onRequestCashout,
    handleCancelCashout: actions?.onCancelCashout,
    openStorefrontFromAccountEntry: actions?.onOpenStorefront,
    submitAccountReviewFromDashboard: actions?.onSubmitCustomerReview,
    handleOpenBusinessInventory: actions?.onOpenBusinessInventory,
    handleOpenBusinessPos: actions?.onOpenBusinessPos,
    getOwnBusinessDayCloseStatus: actions?.onGetBusinessDayCloseStatus,
    configureOwnBusinessDayClosePin: actions?.onConfigureBusinessDayClosePin,
    resolveStorefrontMetaForAccountEntry: resolvers?.resolveStorefrontMeta,
    withAssetOrigin: resolvers?.resolveBusinessAssetUrl
  };
}

export default CustomerDashboardRouteRuntime;
