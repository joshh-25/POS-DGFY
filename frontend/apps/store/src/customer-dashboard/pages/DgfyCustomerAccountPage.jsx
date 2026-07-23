import React, { useMemo, useState } from 'react';
import { AccountSettingsSection } from '../components/AccountSettingsSection.jsx';
import { AddressesSection } from '../components/AddressesSection.jsx';
import { BookingsSection } from '../components/BookingsSection.jsx';
import { BusinessSection } from '../components/BusinessSection.jsx';
import { CustomerDashboardShell } from '../components/CustomerDashboardShell.jsx';
import { DashboardOverviewSection } from '../components/DashboardOverviewSection.jsx';
import { LoyaltySection } from '../components/LoyaltySection.jsx';
import { OrdersSection } from '../components/OrdersSection.jsx';
import { ReviewComposerModal } from '../components/ReviewComposerModal.jsx';
import {
  ACTIVE_CUSTOMER_ORDER_STATUSES,
  COMPLETED_CUSTOMER_ORDER_STATUSES
} from '../model/customerOrderStatus.js';
import {
  getCustomerBusinessCoverUrl,
  getCustomerBusinessProfileUrl,
  getCustomerBusinessRoleLabel,
  getCustomerBusinessStatusLabel
} from '../model/customerBusinessAssets.js';
import {
  CUSTOMER_DASHBOARD_THEME,
  CustomerDashboardEmptyState,
  CustomerDashboardStatusBadge,
  formatCustomerDate,
  formatCustomerMoney,
  getCustomerStoreLogoUrl,
  prettyCustomerStatus
} from '../model/customerDashboardPresentation.jsx';

const normalizeStatusCode = (value) => String(value || '').trim().toLowerCase();

export function DgfyCustomerAccountPage({
  presentation = 'page',
  isMobileViewport,
  onClose,
  onTrackReference,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onSignOut,
  onHelp,
  onRegisterBusiness,
  onRequestBusinessStepUp,
  onAcceptCompanyInvitation,
  onRejectCompanyInvitation,
  onLeaveCompany,
  onSwitchCompany,
  onUseAddressForCheckout,
  onSaveAddress,
  onDeleteAddress,
  onSetDefaultAddress,
  renderAddressPinEditor,
  accountIdentityInitials,
  accountIdentityName,
  accountIdentityContact,
  accountPanel,
  activeOrders,
  customerTrackLoadingReference,
  onOpenStorefront,
  onSubmitCustomerReview,
  resolveStorefrontMeta,
  resolveBusinessAssetUrl,
  onOpenBusinessPos,
  accountAddressActionId = ''
}) {
  const theme = CUSTOMER_DASHBOARD_THEME;
  const allOrders = Array.isArray(accountPanel?.orders) ? accountPanel.orders : [];
  const allBookings = Array.isArray(accountPanel?.bookings) ? accountPanel.bookings : [];
  const allAddresses = Array.isArray(accountPanel?.addresses) ? accountPanel.addresses : [];
  const notifications = Array.isArray(accountPanel?.notifications) ? accountPanel.notifications : [];
  const unreadNotificationCount = Math.max(0, Number(accountPanel?.unreadNotificationCount || 0));
  const defaultAddress = allAddresses.find((address) => address.is_default) || allAddresses[0];
  const contactParts = String(accountIdentityContact || '').split(' | ').map((value) => String(value || '').trim());
  const overviewPhone = String(accountPanel?.me?.phone || contactParts[0] || '').trim();
  const overviewEmail = String(accountPanel?.me?.email || contactParts[1] || '').trim();
  const loyalty = accountPanel?.loyalty || { balance: 0, transactions: [] };
  const loyaltyTransactions = Array.isArray(loyalty?.transactions) ? loyalty.transactions.slice(0, 3) : [];
  const businessMemberships = Array.isArray(accountPanel?.memberships) ? accountPanel.memberships.filter((membership) => membership?.company) : [];
  const businessCompanies = Array.isArray(accountPanel?.businessCompanies) ? accountPanel.businessCompanies : [];
  const businessStepUp = accountPanel?.businessStepUp || accountPanel?.business_step_up || {};

  const [activeNav, setActiveNav] = useState('overview');
  const [activeActivityTab, setActiveActivityTab] = useState('active_orders');
  const [activeOrdersTab, setActiveOrdersTab] = useState('active');
  const [businessStepUpAction, setBusinessStepUpAction] = useState(null);
  const [businessEmailOtpCode, setBusinessEmailOtpCode] = useState('');
  const [businessActionLoading, setBusinessActionLoading] = useState(false);
  const [businessActionError, setBusinessActionError] = useState('');
  const [reviewComposer, setReviewComposer] = useState({ activity: null, target: null, rating: 0, comment: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const enrichStoreEntry = (entry = {}) => {
    const resolved = typeof resolveStorefrontMeta === 'function' ? (resolveStorefrontMeta(entry) || {}) : {};
    return {
      ...entry,
      store_slug: resolved.slug || entry.store_slug || entry.store?.slug || '',
      store_name: resolved.name || entry.store_name || entry.store?.name || '',
      store_logo: resolved.logoUrl || getCustomerStoreLogoUrl(entry)
    };
  };
  const enrichedActiveOrders = Array.isArray(activeOrders) ? activeOrders.map(enrichStoreEntry) : [];
  const enrichedAllOrders = allOrders.map(enrichStoreEntry);
  const completedOrders = enrichedAllOrders.filter((order) => COMPLETED_CUSTOMER_ORDER_STATUSES.has(normalizeStatusCode(order?.status)));
  const inProgressOrders = enrichedAllOrders.filter((order) => ACTIVE_CUSTOMER_ORDER_STATUSES.has(normalizeStatusCode(order?.status)));
  const accountReviewHistory = Array.isArray(accountPanel?.reviews) ? accountPanel.reviews : [];
  const reviewEligibleOrders = enrichedAllOrders.filter((order) => order?.allowed_actions?.review === true && Array.isArray(order?.review_targets) && order.review_targets.length > 0);

  const handleOpenStorefront = (entry) => onOpenStorefront?.(entry);
  const openReviewComposer = (activity) => {
    const target = Array.isArray(activity?.review_targets) ? activity.review_targets.filter(Boolean)[0] : null;
    if (!activity?.activity_id || !target) return;
    setReviewError('');
    setReviewComposer({ activity, target, rating: 0, comment: '' });
  };
  const closeReviewComposer = () => {
    if (reviewSubmitting) return;
    setReviewError('');
    setReviewComposer({ activity: null, target: null, rating: 0, comment: '' });
  };
  const submitReviewComposer = async () => {
    if (reviewSubmitting || !reviewComposer?.activity?.activity_id || !reviewComposer?.target?.target_type) return;
    if (!Number(reviewComposer.rating)) {
      setReviewError('Choose a rating before sending your review.');
      return;
    }
    if (typeof onSubmitCustomerReview !== 'function') {
      setReviewError('Review submission is not available right now.');
      return;
    }
    setReviewSubmitting(true);
    setReviewError('');
    try {
      await onSubmitCustomerReview({
        activityId: reviewComposer.activity.activity_id,
        targetType: reviewComposer.target.target_type,
        targetId: reviewComposer.target.target_id,
        rating: reviewComposer.rating,
        comment: reviewComposer.comment
      });
      setReviewComposer({ activity: null, target: null, rating: 0, comment: '' });
    } catch (error) {
      setReviewError(String(error?.message || 'Unable to submit your review right now.'));
    } finally {
      setReviewSubmitting(false);
    }
  };

  const performBusinessAction = async (action, emailOtpCode = '') => {
    if (action.type === 'accept') return onAcceptCompanyInvitation?.({ membershipId: action.company.membership_id, emailOtpCode });
    if (action.type === 'reject') return onRejectCompanyInvitation?.({ membershipId: action.company.membership_id });
    if (action.type === 'leave') return onLeaveCompany?.({ tenantId: action.company.tenant_id });
    if (action.type === 'switch') return onSwitchCompany?.({ tenantId: action.company.tenant_id, emailOtpCode });
    return undefined;
  };
  const startBusinessAction = async (type, company) => {
    const action = { type, company };
    setBusinessActionError('');
    // A signed-in DGFY account can accept its own pending invitation directly.
    if (type === 'accept' || type === 'reject' || type === 'leave' || businessStepUp?.verified === true) {
      setBusinessActionLoading(true);
      try { await performBusinessAction(action); } catch (error) { setBusinessActionError(error?.message || 'Unable to complete this business action.'); } finally { setBusinessActionLoading(false); }
      return;
    }
    setBusinessStepUpAction(action);
    setBusinessEmailOtpCode('');
    setBusinessActionLoading(true);
    try { await onRequestBusinessStepUp?.(); } catch (error) { setBusinessStepUpAction(null); setBusinessActionError(error?.message || 'Unable to send the security code.'); } finally { setBusinessActionLoading(false); }
  };
  const submitBusinessStepUpAction = async () => {
    if (!/^\d{6}$/.test(businessEmailOtpCode) || !businessStepUpAction) {
      setBusinessActionError('Enter the 6-digit security code sent to your DGFY email.');
      return;
    }
    setBusinessActionLoading(true);
    setBusinessActionError('');
    try {
      await performBusinessAction(businessStepUpAction, businessEmailOtpCode);
      setBusinessStepUpAction(null);
      setBusinessEmailOtpCode('');
    } catch (error) {
      setBusinessActionError(error?.message || 'Unable to complete this business action.');
    } finally {
      setBusinessActionLoading(false);
    }
  };

  const EmptyState = useMemo(() => {
    const StableCustomerDashboardEmptyState = (props) => (
      <CustomerDashboardEmptyState {...props} isMobileViewport={isMobileViewport} />
    );
    StableCustomerDashboardEmptyState.displayName = 'CustomerDashboardEmptyState';
    return StableCustomerDashboardEmptyState;
  }, [isMobileViewport]);
  const StatusBadge = CustomerDashboardStatusBadge;
  const businessStatusLabel = (company) => getCustomerBusinessStatusLabel(company, prettyCustomerStatus);

  const views = {
    overview: <DashboardOverviewSection isMobileViewport={isMobileViewport} theme={theme} accountIdentityInitials={accountIdentityInitials} accountIdentityName={accountIdentityName} accountPanel={accountPanel} isAccountPanelLoading={Boolean(accountPanel?.loading)} overviewPhone={overviewPhone} overviewEmail={overviewEmail} inProgressOrders={inProgressOrders} completedOrders={completedOrders} allBookings={allBookings} allAddresses={allAddresses} loyalty={loyalty} activeActivityTab={activeActivityTab} setActiveActivityTab={setActiveActivityTab} enrichedActiveOrders={enrichedActiveOrders} reviewEligibleOrders={reviewEligibleOrders} defaultAddress={defaultAddress} EmptyState={EmptyState} StatusBadge={StatusBadge} getStoreLogoUrl={getCustomerStoreLogoUrl} formatDate={formatCustomerDate} handleOpenStorefront={handleOpenStorefront} onTrackReference={onTrackReference} openReviewComposer={openReviewComposer} setActiveNav={setActiveNav} onRegisterBusiness={onRegisterBusiness} onHelp={onHelp} />,
    orders: <OrdersSection activeTab={activeOrdersTab} setActiveTab={setActiveOrdersTab} inProgressOrders={inProgressOrders} completedOrders={completedOrders} reviews={accountReviewHistory} isMobileViewport={isMobileViewport} customerTrackLoadingReference={customerTrackLoadingReference} onTrackReference={onTrackReference} onOpenStorefront={handleOpenStorefront} onOpenReview={openReviewComposer} EmptyState={EmptyState} StatusBadge={StatusBadge} getStoreLogoUrl={getCustomerStoreLogoUrl} formatDate={formatCustomerDate} money={formatCustomerMoney} prettyStatus={prettyCustomerStatus} theme={theme} />,
    bookings: <BookingsSection bookings={allBookings} EmptyState={EmptyState} StatusBadge={StatusBadge} formatDate={formatCustomerDate} theme={theme} />,
    addresses: <AddressesSection addresses={allAddresses} isMobileViewport={isMobileViewport} onSaveAddress={onSaveAddress} onDeleteAddress={onDeleteAddress} onSetDefaultAddress={onSetDefaultAddress} onUseAddressForCheckout={onUseAddressForCheckout} renderAddressPinEditor={renderAddressPinEditor} accountAddressActionId={accountAddressActionId} theme={theme} />,
    loyalty: <LoyaltySection loyalty={loyalty} transactions={loyaltyTransactions} EmptyState={EmptyState} formatDate={formatCustomerDate} prettyStatus={prettyCustomerStatus} theme={theme} />,
    account: <AccountSettingsSection isMobileViewport={isMobileViewport} theme={theme} accountIdentityInitials={accountIdentityInitials} accountIdentityName={accountIdentityName} accountPanel={accountPanel} overviewPhone={overviewPhone} overviewEmail={overviewEmail} />,
    business: <BusinessSection isMobileViewport={isMobileViewport} theme={theme} businessCompanies={businessCompanies} businessMemberships={businessMemberships} businessActionError={businessActionError} businessActionLoading={businessActionLoading} businessStepUpAction={businessStepUpAction} businessEmailOtpCode={businessEmailOtpCode} setBusinessEmailOtpCode={setBusinessEmailOtpCode} setBusinessStepUpAction={setBusinessStepUpAction} startBusinessAction={startBusinessAction} submitBusinessStepUpAction={submitBusinessStepUpAction} onRegisterBusiness={onRegisterBusiness} onOpenBusinessPos={onOpenBusinessPos} resolveBusinessAssetUrl={resolveBusinessAssetUrl} getBusinessCoverUrl={getCustomerBusinessCoverUrl} getBusinessProfileUrl={getCustomerBusinessProfileUrl} getBusinessRoleLabel={(company) => getCustomerBusinessRoleLabel(company, prettyCustomerStatus)} getBusinessStatusLabel={businessStatusLabel} />
  };

  return (
    <>
      <CustomerDashboardShell presentation={presentation} isMobileViewport={isMobileViewport} activeNav={activeNav} setActiveNav={setActiveNav} notifications={notifications} unreadNotificationCount={unreadNotificationCount} accountIdentityInitials={accountIdentityInitials} accountIdentityName={accountIdentityName} onClose={onClose} onSignOut={onSignOut} onHelp={onHelp} onMarkNotificationRead={onMarkNotificationRead} onMarkAllNotificationsRead={onMarkAllNotificationsRead} onTrackReference={onTrackReference}>
        {views[activeNav] || views.overview}
      </CustomerDashboardShell>
      <ReviewComposerModal composer={reviewComposer} setComposer={setReviewComposer} submitting={reviewSubmitting} error={reviewError} onClose={closeReviewComposer} onSubmit={submitReviewComposer} theme={theme} />
    </>
  );
}

export default DgfyCustomerAccountPage;
