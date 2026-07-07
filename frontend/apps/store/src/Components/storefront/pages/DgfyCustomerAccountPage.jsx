import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Edit,
  Edit2,
  MoreVertical,
  Trash2,
  Check,
  CheckCircle2,
  Crown,
  Lock,
  Mail,
  Phone,
  HeadphonesIcon,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  Menu,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Ticket,
  User,
  X,
  Zap,
  Package,
  Award,
  Calculator
} from 'lucide-react';
import dgfyCustomerLogo from '../../../../../../public/dgfy-logo.png';
import { SavedAddressCard, SavedAddressCardEmpty } from '../../../checkout/components/SavedAddressCard.jsx';


// Theme Constants aligned with the DGFY design system
const THEME = {
  bg: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#EAECF0',
  primary: '#1A4E8D', // Ocean Blue
  text: '#101828',
  muted: '#667085',
  success: '#16A34A', // Semantic Success
  successBg: '#ECFDF3',
  warning: '#F59E0B', // Semantic Warning
  warningBg: '#FFFAEB',
  info: '#1A4586', // Deep Blue
  infoBg: '#AEE8F4', // Ice Blue
  purple: '#7A5AF8',
  purpleBg: '#F4F3FF',
  orange: '#DC2626', // Semantic Error instead of arbitrary orange
  orangeBg: '#FEF3F2'
};

const money = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'PHP 0.00';
  return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return 'Recent activity';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recent activity';
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const prettyStatus = (value) => (
  String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase()) || 'Pending'
);

const normalizeStatusCode = (value) => String(value || '').trim().toLowerCase();
const ACTIVE_ORDER_STATUSES = new Set(['placed', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'in_progress', 'scheduled']);
const COMPLETED_ORDER_STATUSES = new Set(['completed', 'delivered', 'picked_up']);

const isGeneratedPinnedAddress = (value = '') => /^Pinned map location\s*\(/i.test(String(value || '').trim());

const getAddressLine = (address = {}) => {
  const candidates = [
    address.address_line,
    address.fullAddress,
    address.full_address,
    address.formatted_address,
    address.address
  ];
  return candidates.map((value) => String(value || '').trim()).find((value) => value && !isGeneratedPinnedAddress(value)) || '';
};

  const getAddressTitle = (address = {}) => {
  const addressLine = getAddressLine(address);
  if (addressLine) {
    const segments = addressLine.split(',').map((segment) => segment.trim()).filter(Boolean);
    return segments.slice(0, 2).join(', ') || addressLine;
  }
  const label = String(address.label || '').trim();
  return label && !isGeneratedPinnedAddress(label) ? label : 'Saved address';
};

  const getAddressNote = (address = {}) => {
  const label = String(address.label || '').trim();
  if (!label || /^home$/i.test(label) || /^address$/i.test(label) || isGeneratedPinnedAddress(label)) return '';
  return label;
};

  const getStoreLogoUrl = (entry = {}) => (
  [
    entry.store_logo,
    entry.storeLogo,
    entry.storefront_profile_image_url,
    entry.profile_image_url,
    entry.logo_url,
    entry.logoUrl
  ]
    .map((value) => String(value || '').trim())
    .find(Boolean) || ''
);

const getBusinessImageSources = (company = {}) => (
  [
    company,
    company?.company,
    company?.business,
    company?.storefront,
    company?.storefront_profile,
    company?.storefront_assets,
    company?.assets,
    company?.tenant,
    company?.tenant_profile,
    company?.tenantProfile,
    company?.membership?.company,
    company?.membership?.storefront,
    company?.membership?.tenant
  ].filter(Boolean)
);

const resolveBusinessImageUrl = (company = {}, resolveAssetUrl = null, candidates = []) => {
  const raw = getBusinessImageSources(company)
    .flatMap((source) => candidates.map((key) => String(source?.[key] || '').trim()))
    .find(Boolean);
  if (!raw) return '';
  return typeof resolveAssetUrl === 'function'
    ? String(resolveAssetUrl(raw) || '').trim()
    : raw;
};

const getBusinessCoverUrl = (company = {}, resolveAssetUrl = null) => (
  resolveBusinessImageUrl(company, resolveAssetUrl, [
    'storefront_cover_image_url',
    'storefront_cover_image',
    'cover_photo',
    'cover_image_url',
    'cover_photo_url',
    'cover_url'
  ])
);

const getBusinessProfileUrl = (company = {}, resolveAssetUrl = null) => (
  resolveBusinessImageUrl(company, resolveAssetUrl, [
    'storefront_profile_image_url',
    'storefront_profile_image',
    'profile_image_url',
    'profile_url',
    'profile_photo',
    'profile_photo_url',
    'logo_url',
    'storefront_logo_url'
  ])
);

const getBusinessCategoryLabel = (company = {}) => (
  String(
    company?.category_label
    || company?.business_category
    || company?.category
    || company?.workflow_mode
    || ''
  ).trim()
);

const getBusinessAddressLine = (company = {}) => (
  String(
    company?.address_line
    || company?.address
    || company?.full_address
    || ''
  ).trim()
);

const getBusinessStatusLabel = (company = {}) => {
  const membershipStatus = String(company?.membership_status || company?.status || '').trim();
  const tenantStatus = String(company?.tenant_status || '').trim();
  if (membershipStatus && tenantStatus && tenantStatus.toLowerCase() !== membershipStatus.toLowerCase()) {
    return `${prettyStatus(membershipStatus)} • ${prettyStatus(tenantStatus)}`;
  }
  return prettyStatus(membershipStatus || tenantStatus || 'active');
};

const getAccountAddressActionMeta = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return { type: '', id: '' };
  const separatorIndex = normalized.indexOf(':');
  if (separatorIndex === -1) return { type: normalized === 'new' ? 'new' : '', id: normalized === 'new' ? 'new' : normalized };
  return {
    type: normalized.slice(0, separatorIndex),
    id: normalized.slice(separatorIndex + 1)
  };
};

export function DgfyCustomerAccountPage({
  isMobileViewport,
  onClose,
  onRefresh,
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
  onClearSavedDetails,
  onUseAddressForCheckout,
  onSaveAddress,
  onDeleteAddress,
  onSetDefaultAddress,
  renderAddressPinEditor,
  accountIdentityInitials,
  accountIdentityName,
  accountIdentityContact,
  accountPanel,
  hasSavedCustomerDetails,
  maskedSavedCustomerPreview,
  activeOrders,
  activeOrderCount,
  trackedCustomerActivity,
  customerTrackLoadingReference,
  customerTrackError,

  onOpenStorefront,
  onSubmitCustomerReview,
  resolveStorefrontMeta,
  resolveBusinessAssetUrl,
  onOpenBusinessPos,
  accountAddressActionId = ''
}) {
  const allOrders = Array.isArray(accountPanel?.orders) ? accountPanel.orders : [];
  const allBookings = Array.isArray(accountPanel?.bookings) ? accountPanel.bookings : [];
  const allAddresses = Array.isArray(accountPanel?.addresses) ? accountPanel.addresses : [];
  const notifications = Array.isArray(accountPanel?.notifications) ? accountPanel.notifications : [];
  const unreadNotificationCount = Math.max(0, Number(accountPanel?.unreadNotificationCount || 0));
  const defaultAddress = allAddresses.find(a => a.is_default) || allAddresses[0];
  const accountContactParts = String(accountIdentityContact || '').split(' | ').map((value) => String(value || '').trim());
  const overviewPhone = String(accountPanel?.me?.phone || accountContactParts[0] || '').trim();
  const overviewEmail = String(accountPanel?.me?.email || accountContactParts[1] || '').trim();
  
  const loyalty = accountPanel?.loyalty || { balance: 0, transactions: [] };
  const loyaltyTransactions = Array.isArray(loyalty?.transactions) ? loyalty.transactions.slice(0, 3) : [];
  const businessMemberships = Array.isArray(accountPanel?.memberships)
    ? accountPanel.memberships.filter((membership) => membership?.company)
    : [];
  const businessCompanies = Array.isArray(accountPanel?.businessCompanies) ? accountPanel.businessCompanies : [];
  const businessStepUp = accountPanel?.businessStepUp || accountPanel?.business_step_up || {};
  
  const [activeNav, setActiveNav] = useState('overview');
  const [activeActivityTab, setActiveActivityTab] = useState('active_orders');
  const [activeOrdersTab, setActiveOrdersTab] = useState('active');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [businessStepUpAction, setBusinessStepUpAction] = useState(null);
  const [businessEmailOtpCode, setBusinessEmailOtpCode] = useState('');
  const [businessActionLoading, setBusinessActionLoading] = useState(false);
  const [businessActionError, setBusinessActionError] = useState('');
  const openNotification = (notification) => {
    if (notification?.notification_id && typeof onMarkNotificationRead === 'function') {
      onMarkNotificationRead(notification);
    }
    if (notification?.reference && typeof onTrackReference === 'function') {
      onTrackReference({ reference: notification.reference, status: notification.status });
      setIsNotificationPanelOpen(false);
    }
  };
  const [addressDraft, setAddressDraft] = useState({ label: '', address_line: '', latitude: null, longitude: null, is_default: true });
  const [pendingAddressSave, setPendingAddressSave] = useState(null);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [editingAddressDraft, setEditingAddressDraft] = useState({ label: '', address_line: '', latitude: null, longitude: null, is_default: false });
  const [reviewComposer, setReviewComposer] = useState({ activity: null, target: null, rating: 0, comment: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  
  // Modal Address State
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState('create');
  const [deletingAddressId, setDeletingAddressId] = useState(null);

  const buildAddressDraftFromExisting = (address = {}, { keepDefaultFlag = false } = {}) => ({
    label: getAddressNote(address),
    address_line: getAddressLine(address),
    latitude: address?.latitude ?? null,
    longitude: address?.longitude ?? null,
    is_default: keepDefaultFlag ? Boolean(address?.is_default) : false
  });

  const enrichStoreEntry = (entry = {}) => {
    const resolved = typeof resolveStorefrontMeta === 'function' ? (resolveStorefrontMeta(entry) || {}) : {};
    return {
      ...entry,
      store_slug: resolved.slug || entry.store_slug || entry.store?.slug || '',
      store_name: resolved.name || entry.store_name || entry.store?.name || '',
      store_logo: resolved.logoUrl || getStoreLogoUrl(entry)
    };
  };

  const enrichedActiveOrders = Array.isArray(activeOrders) ? activeOrders.map(enrichStoreEntry) : [];
  const enrichedAllOrders = Array.isArray(allOrders) ? allOrders.map(enrichStoreEntry) : [];
  const completedOrders = enrichedAllOrders.filter((order) => COMPLETED_ORDER_STATUSES.has(normalizeStatusCode(order?.status)));
  const inProgressOrders = enrichedAllOrders.filter((order) => ACTIVE_ORDER_STATUSES.has(normalizeStatusCode(order?.status)));
  const accountReviewHistory = Array.isArray(accountPanel?.reviews) ? accountPanel.reviews : [];
  const reviewEligibleOrders = enrichedAllOrders.filter((order) => (
    order?.allowed_actions?.review === true
    && Array.isArray(order?.review_targets)
    && order.review_targets.length > 0
  ));

  const handleOpenStorefront = (entry) => {
    if (typeof onOpenStorefront === 'function') {
      onOpenStorefront(entry);
    }
  };

  const openReviewComposer = (activity) => {
    const targets = Array.isArray(activity?.review_targets) ? activity.review_targets.filter(Boolean) : [];
    const primaryTarget = targets[0] || null;
    if (!activity?.activity_id || !primaryTarget) return;
    setReviewError('');
    setReviewComposer({
      activity,
      target: primaryTarget,
      rating: 0,
      comment: ''
    });
  };

  const closeReviewComposer = () => {
    if (reviewSubmitting) return;
    setReviewError('');
    setReviewComposer({ activity: null, target: null, rating: 0, comment: '' });
  };

  const submitReviewComposer = async () => {
    if (reviewSubmitting) return;
    if (!reviewComposer?.activity?.activity_id || !reviewComposer?.target?.target_type) return;
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
      closeReviewComposer();
    } catch (error) {
      setReviewError(String(error?.message || 'Unable to submit your review right now.'));
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    if (isMobileViewport) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  }, [activeNav, isMobileViewport]);

  useEffect(() => {
    if (editingAddressId) return;
    if (getAddressLine(addressDraft)) return;
    if (!defaultAddress) return;
    setAddressDraft((previous) => {
      if (getAddressLine(previous)) return previous;
      return buildAddressDraftFromExisting(defaultAddress);
    });
  }, [addressDraft, defaultAddress, editingAddressId]);

  const buildAddressSavePayload = (draft = {}) => {
    const addressLine = getAddressLine(draft);
    const note = String(draft.label || '').trim();
    return {
      ...draft,
      label: note || getAddressTitle({ address_line: addressLine }),
      address_line: addressLine
    };
  };

  const hasSelectedAddressDraft = getAddressLine(addressDraft).length > 0;

  const resetAddressDraft = () => {
    setAddressDraft(defaultAddress ? buildAddressDraftFromExisting(defaultAddress) : { label: '', address_line: '', latitude: null, longitude: null, is_default: false });
  };

  const requestAddressSave = (event) => {
    event.preventDefault();
    if (!hasSelectedAddressDraft || accountAddressActionId === 'new') return;
    setPendingAddressSave(buildAddressSavePayload(addressDraft));
  };

  const confirmAddressSave = async () => {
    if (!pendingAddressSave || typeof onSaveAddress !== 'function') return;
    if (await onSaveAddress(pendingAddressSave)) {
      resetAddressDraft();
      setPendingAddressSave(null);
    }
  };

  const NAV_ITEMS = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'addresses', label: 'Addresses', icon: MapPin },
    { id: 'loyalty', label: 'Loyalty', icon: Award },
    { id: 'account', label: 'Account', icon: User },
    { id: 'business', label: 'Business', icon: Store, premium: true }
  ];

  // --- REUSABLE COMPONENTS ---

  const EmptyState = ({ title, desc }) => (
    <div style={{ border: `1px dashed ${THEME.border}`, borderRadius: 14, padding: isMobileViewport ? 22 : 30, textAlign: 'center', background: THEME.bg }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>{title}</div>
      {desc ? <div style={{ marginTop: 6, fontSize: 14, color: THEME.muted }}>{desc}</div> : null}
    </div>
  );

  const StatusBadge = ({ status }) => {
    const s = String(status).toLowerCase();
    let color = THEME.muted;
    let bg = THEME.border;
    
    if (s.includes('active') || s.includes('progress') || s.includes('preparing') || s.includes('confirmed')) {
      color = THEME.info;
      bg = THEME.infoBg;
    } else if (s.includes('deliver') || s.includes('transit')) {
      color = THEME.success;
      bg = THEME.successBg;
    } else if (s.includes('cancel') || s.includes('fail')) {
      color = THEME.orange;
      bg = THEME.orangeBg;
    } else if (s.includes('complete') || s.includes('done')) {
      color = THEME.success;
      bg = THEME.successBg;
    }

    return (
      <span style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        padding: '2px 8px', 
        borderRadius: 999, 
        fontSize: 12, 
        fontWeight: 600, 
        color: color, 
        background: bg 
      }}>
        {prettyStatus(status)}
      </span>
    );
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
    if (type === 'reject' || type === 'leave' || businessStepUp?.verified === true) {
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
    try { await performBusinessAction(businessStepUpAction, businessEmailOtpCode); setBusinessStepUpAction(null); setBusinessEmailOtpCode(''); } catch (error) { setBusinessActionError(error?.message || 'Unable to complete this business action.'); } finally { setBusinessActionLoading(false); }
  };

  const renderBusiness = () => {
    const normalizedCompanies = businessCompanies.length > 0
      ? businessCompanies
      : businessMemberships.map((membership) => ({ ...membership.company, ...membership, company_name: membership.company?.name }));
    const pending = normalizedCompanies.filter((company) => company.requires_action === 'accept_invitation' || company.status === 'pending');
    const accepted = normalizedCompanies.filter((company) => !pending.includes(company));
    return (
      <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 14, background: 'linear-gradient(135deg,#FFF4CC 0%,#FCD34D 100%)', color: '#7C5600', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(245,158,11,0.18)' }}>
              <Crown size={18} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: isMobileViewport ? 20 : 24 }}>Your businesses</h2>
              <p style={{ margin: '6px 0 0', color: THEME.muted }}>Premium access to the companies and tools connected to this DGFY account.</p>
            </div>
          </div>
          <button type="button" onClick={onRegisterBusiness} style={{ border: 0, borderRadius: 10, background: THEME.primary, color: '#fff', minHeight: 42, padding: '0 16px', fontWeight: 700, cursor: 'pointer' }}>Register New Company</button>
        </div>
        {businessActionError ? <div role="alert" style={{ borderRadius: 10, background: '#FEF2F2', color: '#991B1B', padding: 12 }}>{businessActionError}</div> : null}
        {pending.length > 0 ? <section style={{ display: 'grid', gap: 10 }}><strong>Pending invitations</strong>{pending.map((company) => <div key={`invite-${company.membership_id}`} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, background: THEME.infoBg, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{company.company_name || company.name || 'Company invitation'}</strong><div style={{ marginTop: 4, color: THEME.muted, fontSize: 13 }}>Invitation from IMS</div></div><div style={{ display: 'flex', gap: 8 }}><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('reject', company)}>Reject</button><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('accept', company)}>Accept</button></div></div>)}</section> : null}
        {businessStepUpAction ? <section style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}><strong>Email security check</strong><span style={{ color: THEME.muted, fontSize: 13 }}>Enter the 6-digit code sent to your DGFY email.</span><input inputMode="numeric" value={businessEmailOtpCode} onChange={(event) => setBusinessEmailOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} aria-label="Business security code" /><div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setBusinessStepUpAction(null)}>Cancel</button><button type="button" disabled={businessActionLoading} onClick={submitBusinessStepUpAction}>Verify and continue</button></div></section> : null}
        {accepted.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
            {accepted.map((company) => {
              const name = company.company_name || company.name || 'Business';
              const owned = company.is_owner === true || company.membership_type === 'owner' || company.role === 'owner';
              const coverUrl = getBusinessCoverUrl(company, resolveBusinessAssetUrl);
              const profileUrl = getBusinessProfileUrl(company, resolveBusinessAssetUrl);
              const categoryLabel = getBusinessCategoryLabel(company) || 'Business account';
              const statusLabel = getBusinessStatusLabel(company);
              
              return (
                <article key={`company-${company.membership_id || company.tenant_id}`} style={{ border: `1px solid ${THEME.border}`, borderRadius: 20, overflow: 'hidden', background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* Cover Image */}
                  <div style={{ position: 'relative', height: 160, background: coverUrl ? '#E5EEF8' : 'linear-gradient(135deg,#103E73 0%,#2563EB 50%,#AEE8F4 100%)' }}>
                    {coverUrl ? <img src={coverUrl} alt={`${name} cover`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.0) 0%, rgba(15,23,42,0.2) 100%)' }} />
                    
                    {/* Active Status Badge */}
                    <div style={{ position: 'absolute', top: 14, right: 14 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#fff', color: THEME.text, padding: '4px 10px', fontSize: 12, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: THEME.success }}></span>
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ position: 'relative', padding: '0 20px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    
                    {/* Profile & Menu */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ width: 72, height: 72, borderRadius: '50%', border: '4px solid #fff', background: '#fff', display: 'grid', placeItems: 'center', marginTop: -36, position: 'relative', zIndex: 2, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                        {profileUrl ? <img src={profileUrl} alt={`${name} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: THEME.infoBg, display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 900, color: THEME.primary }}>{name.charAt(0).toUpperCase()}</div>}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button type="button" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: THEME.muted, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Business options">
                          <MoreVertical size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Titles */}
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h3>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: THEME.muted }}>{owned ? 'Company you own' : 'Company membership'}</p>
                    </div>

                    {/* Category Badge */}
                    <div style={{ marginTop: 16 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: THEME.infoBg, color: THEME.primary, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        <Store size={14} />
                        {categoryLabel}
                      </span>
                    </div>

                    {/* Spacer */}
                    <div style={{ flex: 1, minHeight: 24 }} />

                    {/* Actions */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 'auto' }}>
                      <button type="button" disabled={businessActionLoading} onClick={() => onOpenBusinessPos?.(company)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 10, border: 'none', background: THEME.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: businessActionLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(26,78,141,0.2)', padding: '0 8px' }}>
                        <Calculator size={16} />
                        Go to POS
                      </button>
                    </div>

                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', background: '#fff', borderRadius: 24, border: `1px solid ${THEME.border}`, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', marginBottom: 24, boxShadow: '0 12px 32px rgba(37,99,235,0.12)' }}>
              <Store size={36} strokeWidth={2.5} />
            </div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: THEME.text }}>Manage all your businesses in one place</h3>
            <p style={{ margin: '12px 0 24px', color: THEME.muted, fontSize: 15, maxWidth: 400, lineHeight: 1.5 }}>Access your tools and grow your business with DGFY.</p>
            <button type="button" onClick={onRegisterBusiness} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 0, borderRadius: 12, background: THEME.primary, color: '#fff', minHeight: 48, padding: '0 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(26,78,141,0.24)' }}>
              <Store size={18} />
              Register New Company
            </button>
          </div>
        )}
      </div>
    );
  };
  // --- SECTIONS ---

  const renderOverview = () => (
    <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 24 }}>
      
      {/* 1. Profile Header Section */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1.5fr 1fr', gap: isMobileViewport ? 14 : 24 }}>
        
        {/* Profile Card */}
        <div style={{ background: THEME.surface, borderRadius: isMobileViewport ? 20 : 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', alignItems: isMobileViewport ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobileViewport ? 12 : 20, flexDirection: isMobileViewport ? 'row' : 'row' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 14 : 20, minWidth: 0, flex: 1 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: isMobileViewport ? 64 : 80, height: isMobileViewport ? 64 : 80, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? 24 : 28, fontWeight: 800 }}>
                {accountIdentityInitials}
              </div>
              {Boolean(accountPanel?.me?.is_email_verified) && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: isMobileViewport ? 20 : 24, height: isMobileViewport ? 20 : 24, borderRadius: '50%', background: THEME.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '2px solid #FFF' }}>
                  <ShieldCheck size={14} strokeWidth={3} />
                </div>
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: isMobileViewport ? 16 : 24, fontWeight: 700, color: THEME.text, lineHeight: 1.2 }}>{accountIdentityName}</div>
                {Boolean(accountPanel?.me?.is_email_verified) && (
                  <span style={{ background: THEME.primary, color: '#FFF', fontSize: isMobileViewport ? 9 : 10, fontWeight: 700, padding: isMobileViewport ? '2px 5px' : '2px 6px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={10} /> Verified
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gap: isMobileViewport ? 6 : 8, color: THEME.muted, fontSize: isMobileViewport ? 13 : 14 }}>
                {overviewPhone ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Phone size={16} /> {overviewPhone}
                  </span>
                ) : null}
                {overviewEmail ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Mail size={16} /> {overviewEmail}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button onClick={() => setActiveNav('account')} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 12, padding: isMobileViewport ? 0 : '8px 16px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, width: isMobileViewport ? 48 : 'auto', height: isMobileViewport ? 48 : 'auto' }}>
            <Edit size={14} /> {!isMobileViewport ? 'Edit Profile' : null}
          </button>
        </div>

        {/* Register Business Card */}
        <div style={{ background: THEME.surface, borderRadius: isMobileViewport ? 20 : 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', alignItems: isMobileViewport ? 'center' : 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow 200ms', flexDirection: 'row', gap: isMobileViewport ? 14 : 20 }} onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'} onMouseOut={e => e.currentTarget.style.boxShadow = 'none'} onClick={onRegisterBusiness}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 14 : 20 }}>
            <div style={{ width: isMobileViewport ? 48 : 64, height: isMobileViewport ? 48 : 64, borderRadius: isMobileViewport ? 14 : 16, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Store size={isMobileViewport ? 24 : 32} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>Grow your business</div>
              <div style={{ fontSize: isMobileViewport ? 13 : 14, color: THEME.muted, lineHeight: 1.4 }}>Complete your store profile to attract more customers.</div>
            </div>
          </div>
          <ChevronRight size={isMobileViewport ? 20 : 24} color={THEME.text} style={{ flexShrink: 0, alignSelf: 'center' }} />
        </div>

      </div>

      {/* 2. Summary Statistics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, 1fr)', gap: isMobileViewport ? 12 : 16 }}>
        {[
          { label: 'Active Orders', value: inProgressOrders.length, icon: ShoppingBag, color: THEME.success, bg: THEME.successBg, link: 'View all', action: () => setActiveNav('orders') },
          { label: 'Past Orders', value: completedOrders.length, icon: Package, color: THEME.info, bg: THEME.infoBg, link: 'View all', action: () => setActiveNav('orders') },
          { label: 'Bookings', value: allBookings.length, icon: CalendarDays, color: THEME.purple, bg: THEME.purpleBg, link: 'View all', action: () => setActiveNav('bookings') },
          { label: 'Addresses', value: allAddresses.length, icon: MapPin, color: THEME.orange, bg: THEME.orangeBg, link: 'Manage', action: () => setActiveNav('addresses') },
          { label: 'Loyalty Points', value: loyalty.balance, icon: Award, color: THEME.success, bg: THEME.successBg, link: 'View details', action: () => setActiveNav('loyalty') }
          ].map((stat, i) => {
            const Icon = stat.icon;
            const isLastMobileOddCard = isMobileViewport && i === 4;
            return (
              <div
                key={i}
                style={{
                  background: THEME.surface,
                  borderRadius: isMobileViewport ? 18 : 12,
                  border: `1px solid ${THEME.border}`,
                  padding: isMobileViewport ? '14px 16px' : '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isMobileViewport ? 10 : 12,
                  minWidth: 0,
                  minHeight: isMobileViewport ? 82 : 'auto',
                  gridColumn: isLastMobileOddCard ? '1 / -1' : 'auto'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: isMobileViewport ? 12 : 10, minWidth: 0 }}>
                  <div style={{ width: isMobileViewport ? 42 : 40, height: isMobileViewport ? 42 : 40, borderRadius: 12, background: stat.bg, color: stat.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon size={isMobileViewport ? 20 : 20} />
                  </div>
                  <div style={{ minWidth: 0, display: 'grid', gap: isMobileViewport ? 4 : 6 }}>
                    <div style={{ fontSize: isMobileViewport ? 18 : 22, fontWeight: 700, color: THEME.text, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: isMobileViewport ? 12 : 12, color: THEME.muted, lineHeight: 1.25, wordBreak: 'break-word' }}>{stat.label}</div>
                  </div>
                </div>
              {!isMobileViewport ? (
                <div style={{ fontSize: isMobileViewport ? 11 : 12, fontWeight: 600, color: THEME.primary, cursor: 'pointer', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={stat.action}>
                  {stat.link} <ChevronRight size={14} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 3. Main Dashboard & Utility Panel Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '2fr 1fr', gap: isMobileViewport ? 16 : 24 }}>
        
        {/* Activity Tabs Section */}
        <div style={{ background: THEME.surface, borderRadius: isMobileViewport ? 20 : 16, border: `1px solid ${THEME.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: isMobileViewport ? 'none' : `1px solid ${THEME.border}`, padding: isMobileViewport ? '12px 12px 0' : '0 24px', gap: isMobileViewport ? 8 : 0 }}>
            {[
              { id: 'active_orders', label: isMobileViewport ? 'Orders' : 'Active Orders', icon: ShoppingBag },
              { id: 'upcoming_bookings', label: isMobileViewport ? 'Bookings' : 'Upcoming Bookings', icon: CalendarDays },
              { id: 'need_reviews', label: isMobileViewport ? 'Reviews' : 'Need Reviews', icon: Star }
            ].map(tab => {
              const isActive = activeActivityTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveActivityTab(tab.id)}
                  style={{
                    background: isMobileViewport ? (isActive ? THEME.infoBg : 'transparent') : 'transparent',
                    border: 'none',
                    borderBottom: isMobileViewport ? 'none' : (isActive ? `2px solid ${THEME.primary}` : '2px solid transparent'),
                    color: isActive ? THEME.primary : THEME.muted,
                    fontSize: isMobileViewport ? 12 : 14,
                    fontWeight: isActive ? 600 : 500,
                    padding: isMobileViewport ? '9px 10px' : '20px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    transition: 'all 200ms',
                    borderRadius: isMobileViewport ? 999 : 0,
                    flex: 1,
                    justifyContent: 'center'
                  }}
                >
                  <Icon size={isMobileViewport ? 14 : 16} /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ padding: isMobileViewport ? 16 : 24, flex: 1 }}>
              {activeActivityTab === 'active_orders' && (
                <div style={{ display: 'grid', gap: isMobileViewport ? 14 : 16, width: '100%' }}>
                  {enrichedActiveOrders.length === 0 ? (
                    <EmptyState title="No active orders" desc="You don't have any orders in progress right now." />
                  ) : (
                    <>
                      {isMobileViewport ? (
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: THEME.text, lineHeight: 1.15 }}>Active Orders</div>
                          <div style={{ fontSize: 14, color: THEME.muted, marginTop: 4 }}>
                            You have {enrichedActiveOrders.length} active order{enrichedActiveOrders.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      ) : null}
                    {enrichedActiveOrders.slice(0, 3).map((order) => (
                      <div key={order.reference} style={{ display: 'block', gap: isMobileViewport ? 12 : 0, alignItems: isMobileViewport ? 'stretch' : 'stretch', justifyContent: 'space-between', paddingBottom: isMobileViewport ? 0 : 16, borderBottom: isMobileViewport ? 'none' : `1px solid ${THEME.border}`, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                        {isMobileViewport ? (
                          <div style={{ display: 'grid', gap: 12, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                            <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 18, padding: 14, display: 'grid', gap: 14, background: THEME.surface, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'flex-start', gap: 12, width: '100%', minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStorefront(order)}
                                  style={{ width: 56, height: 56, borderRadius: '50%', background: THEME.text, color: '#FFF', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, textAlign: 'center', lineHeight: 1.1, flexShrink: 0, overflow: 'hidden', padding: 0, border: 'none', cursor: order.store_slug ? 'pointer' : 'default' }}
                                >
                                  {getStoreLogoUrl(order) ? (
                                    <img
                                      src={getStoreLogoUrl(order)}
                                      alt={`${order.store_name || 'Store'} logo`}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    order.store_name ? order.store_name.substring(0,4).toUpperCase() : 'STORE'
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenStorefront(order)}
                                  style={{ minWidth: 0, flex: 1, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: order.store_slug ? 'pointer' : 'default' }}
                                >
                                  <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text, lineHeight: 1.25 }}>{order.store_name || 'DGFY Store'}</div>
                                  <div style={{ fontSize: 12, color: THEME.primary, marginTop: 5 }}>#{order.reference}</div>
                                </button>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, display: 'grid', gap: 6, justifyItems: 'end' }}>
                                <StatusBadge status={order.status_label || order.status} />
                                <div style={{ fontSize: 12, color: THEME.muted }}>{formatDate(order.occurred_at)}</div>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 82px', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
                              <button 
                                onClick={() => onTrackReference(order)}
                                style={{ background: THEME.primary, border: `1px solid ${THEME.primary}`, borderRadius: 11, padding: '8px 10px', minHeight: 38, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.1 }}
                              >
                                Track Order
                              </button>
                              <button
                                onClick={() => setActiveNav('orders')}
                                style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 11, padding: '8px 10px', minHeight: 38, fontSize: 13, fontWeight: 600, color: THEME.primary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', width: 82, lineHeight: 1.1, textAlign: 'center' }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}>
                                  <span>View</span>
                                  <ChevronRight size={14} />
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: '1 1 auto' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenStorefront(order)}
                          style={{ width: 48, height: 48, borderRadius: '50%', background: THEME.text, color: '#FFF', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.1, flexShrink: 0, overflow: 'hidden', border: 'none', padding: 0, cursor: order.store_slug ? 'pointer' : 'default' }}
                        >
                          {getStoreLogoUrl(order) ? (
                            <img
                              src={getStoreLogoUrl(order)}
                              alt={`${order.store_name || 'Store'} logo`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            order.store_name ? order.store_name.substring(0,4).toUpperCase() : 'STORE'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenStorefront(order)}
                          style={{ minWidth: 0, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: order.store_slug ? 'pointer' : 'default' }}
                        >
                          <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text }}>{order.store_name || 'DGFY Store'}</div>
                          <div style={{ fontSize: 13, color: THEME.primary, marginTop: 4 }}>#{order.reference}</div>
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 28, minWidth: 0, flexShrink: 0, marginLeft: 24 }}>
                        <div style={{ textAlign: 'right', minWidth: 132, flexShrink: 0 }}>
                          <StatusBadge status={order.status_label || order.status} />
                          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>{formatDate(order.occurred_at)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minWidth: 0, flexShrink: 0 }}>
                          <button 
                            onClick={() => onTrackReference(order)}
                            style={{ background: THEME.primary, border: `1px solid ${THEME.primary}`, borderRadius: 12, padding: '8px 20px', fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Track Order
                          </button>
                          <button
                            onClick={() => setActiveNav('orders')}
                            style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: THEME.primary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}
                          >
                            View <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                      </div>
                        )}
                      </div>
                    ))}
                    </>
                  )}
                  <div style={{ textAlign: 'center', marginTop: isMobileViewport ? 4 : 8, paddingTop: isMobileViewport ? 2 : 0 }}>
                    <button onClick={() => setActiveNav('orders')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      View all active orders
                  </button>
                </div>
              </div>
            )}
            {activeActivityTab === 'upcoming_bookings' && (
              <div style={{ display: 'grid', gap: 16 }}>
                {allBookings.length === 0 ? (
                  <EmptyState title="No upcoming bookings" desc="You don't have any appointments scheduled." />
                ) : (
                  allBookings.slice(0, 3).map((booking) => (
                    <div key={booking.reference} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: `1px solid ${THEME.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                         <div style={{ width: 48, height: 48, borderRadius: '50%', background: THEME.purpleBg, color: THEME.purple, display: 'grid', placeItems: 'center' }}>
                          <CalendarDays size={20} />
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text }}>{booking.store_name || 'DGFY Service'}</div>
                          <div style={{ fontSize: 13, color: THEME.muted }}>{booking.reference}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <StatusBadge status={booking.status_label || booking.status} />
                        <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>{formatDate(booking.occurred_at)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => alert('Booking details will be available soon.')} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: THEME.primary, cursor: 'pointer' }}>
                          View Details
                        </button>
                        <ChevronRight size={16} color={THEME.muted} />
                      </div>
                    </div>
                  ))
                )}
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button onClick={() => setActiveNav('bookings')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    View all upcoming bookings
                  </button>
                </div>
              </div>
            )}
            {activeActivityTab === 'need_reviews' && (
              <div style={{ display: 'grid', gap: 16 }}>
                {reviewEligibleOrders.length === 0 ? (
                  <EmptyState title="No pending reviews" desc="You have reviewed all your eligible orders." />
                ) : (
                  reviewEligibleOrders.map((order) => (
                    <div key={`review-${order.activity_id || order.reference}`} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 16, padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenStorefront(order)}
                            style={{ width: 44, height: 44, borderRadius: '50%', background: THEME.text, color: '#FFF', display: 'grid', placeItems: 'center', overflow: 'hidden', border: 'none', padding: 0, flexShrink: 0, cursor: order.store_slug ? 'pointer' : 'default' }}
                          >
                            {getStoreLogoUrl(order) ? (
                              <img src={getStoreLogoUrl(order)} alt={`${order.store_name || 'Store'} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700 }}>{order.store_name ? order.store_name.substring(0, 4).toUpperCase() : 'SHOP'}</span>
                            )}
                          </button>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text }}>{order.store_name || 'DGFY Store'}</div>
                            <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>
                              Completed order #{order.reference}
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={order.status_label || order.status || 'Completed'} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, color: THEME.muted }}>
                          {Array.isArray(order.review_targets) ? order.review_targets.length : 0} item review{Array.isArray(order.review_targets) && order.review_targets.length === 1 ? '' : 's'} available
                        </div>
                        <button
                          type="button"
                          onClick={() => openReviewComposer(order)}
                          style={{ background: THEME.primary, border: 'none', color: '#FFF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Write Review
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Utility Panel */}
        {!isMobileViewport ? (
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 24, borderBottom: `1px solid ${THEME.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Default Address</div>
              <button onClick={() => setActiveNav('addresses')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Manage addresses
              </button>
            </div>
            {defaultAddress ? (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Home size={20} />
                </div>
                <div>
                  <span style={{ background: THEME.successBg, color: THEME.success, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginBottom: 4, display: 'inline-block' }}>Default</span>
                  <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.5 }}>
                    {defaultAddress.address_line || 'Address line unavailable.'}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="No addresses" desc="Add an address for faster checkout." />
            )}
          </div>
          <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setActiveNav('addresses')}>
            <span style={{ fontSize: 14, color: THEME.muted, fontWeight: 500 }}>{allAddresses.length} saved addresses</span>
            <ChevronRight size={16} color={THEME.muted} />
          </div>
        </div>
        ) : null}

      </div>

      {/* 4. Quick Actions */}
      {!isMobileViewport ? (
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 16 }}>Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 16 }}>
          {[
            { label: 'Reorder Items', icon: ShoppingBag, color: THEME.success },
            { label: 'Add Address', icon: MapPin, color: THEME.orange },
            { label: 'Update Profile', icon: User, color: THEME.primary },
            { label: 'Help Center', icon: HelpCircle, color: THEME.purple },
            { label: 'Contact Support', icon: HeadphonesIcon, color: THEME.info }
          ].map((action, i) => {
            const Icon = action.icon;
            return (
              <button 
                key={i} 
                onClick={
                  action.label === 'Reorder Items' ? () => setActiveNav('orders') :
                  action.label === 'Add Address' ? () => setActiveNav('addresses') :
                  action.label === 'Update Profile' ? () => setActiveNav('account') :
                  onHelp
                }
                style={{ background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}`, padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', transition: 'background 200ms' }} 
                onMouseOver={e => e.currentTarget.style.background = THEME.bg} 
                onMouseOut={e => e.currentTarget.style.background = THEME.surface}
              >
                <Icon size={18} color={action.color} />
                <span style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      ) : null}

    </div>
  );

  const renderOrders = () => {
    const orderTabs = [
      { id: 'active', label: 'Active Orders', count: inProgressOrders.length },
      { id: 'past', label: 'Past Orders', count: completedOrders.length },
      { id: 'reviews', label: 'Reviews', count: accountReviewHistory.length }
    ];
    const visibleOrders = activeOrdersTab === 'active'
      ? inProgressOrders
      : activeOrdersTab === 'past'
        ? completedOrders
        : [];

    const renderOrderCard = (order, { allowReview = false } = {}) => (
      <div
        key={`all-order-${order.reference}`}
        style={{
          background: THEME.surface,
          borderRadius: 16,
          border: `1px solid ${THEME.border}`,
          padding: isMobileViewport ? 16 : 24,
          display: isMobileViewport ? 'flex' : 'grid',
          gridTemplateColumns: isMobileViewport ? undefined : 'minmax(0, 1fr) 180px 360px',
          justifyContent: 'space-between',
          alignItems: isMobileViewport ? 'stretch' : 'center',
          flexWrap: isMobileViewport ? 'wrap' : 'nowrap',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: '1 1 280px' }}>
          <button
            type="button"
            onClick={() => handleOpenStorefront(order)}
            style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.info, display: 'grid', placeItems: 'center', overflow: 'hidden', border: 'none', padding: 0, cursor: order.store_slug ? 'pointer' : 'default', flexShrink: 0 }}
          >
            {getStoreLogoUrl(order) ? (
              <img src={getStoreLogoUrl(order)} alt={`${order.store_name || 'Store'} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Package size={24} />
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <button
              type="button"
              onClick={() => handleOpenStorefront(order)}
              style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 4, background: 'transparent', border: 'none', padding: 0, cursor: order.store_slug ? 'pointer' : 'default', textAlign: 'left' }}
            >
              {order.store_name || 'DGFY Store'}
            </button>
            <div style={{ fontSize: 13, color: THEME.muted }}>#{order.reference}</div>
          </div>
        </div>
        <div style={{ textAlign: isMobileViewport ? 'left' : 'right', minWidth: isMobileViewport ? '100%' : 160, justifySelf: isMobileViewport ? undefined : 'end' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>{money(order.total_amount)}</div>
          <StatusBadge status={order.status_label || order.status} />
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 8 }}>{formatDate(order.occurred_at)}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: isMobileViewport ? 'wrap' : 'nowrap', width: isMobileViewport ? '100%' : 360, justifySelf: isMobileViewport ? undefined : 'end', alignItems: 'center', justifyContent: isMobileViewport ? 'flex-start' : 'flex-end' }}>
          <button onClick={() => onTrackReference(order)} disabled={customerTrackLoadingReference === order.reference} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: customerTrackLoadingReference === order.reference ? 'wait' : 'pointer' }}>
            {customerTrackLoadingReference === order.reference ? 'Loading...' : 'Track Order'}
          </button>
          <button onClick={() => onTrackReference(order)} style={{ background: THEME.primary, border: 'none', color: '#FFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            View Order
          </button>
          {allowReview && order?.allowed_actions?.review === true && Array.isArray(order?.review_targets) && order.review_targets.length > 0 ? (
            <button onClick={() => openReviewComposer(order)} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Review Order
            </button>
          ) : !isMobileViewport && allowReview ? (
            <div style={{ width: 109, height: 37, flexShrink: 0 }} />
          ) : null}
        </div>
      </div>
    );

    return (
      <div style={{ display: 'grid', gap: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text, margin: 0 }}>Orders</h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: THEME.muted }}>Track your in-progress orders, review completed purchases, and revisit your feedback.</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobileViewport ? 8 : 10, padding: isMobileViewport ? '0 0 4px' : '0', borderBottom: `1px solid ${THEME.border}` }}>
          {orderTabs.map((tab) => {
            const isActive = activeOrdersTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveOrdersTab(tab.id)}
                style={{
                  background: isMobileViewport ? (isActive ? THEME.infoBg : 'transparent') : 'transparent',
                  border: 'none',
                  borderBottom: isMobileViewport ? 'none' : (isActive ? `2px solid ${THEME.primary}` : '2px solid transparent'),
                  color: isActive ? THEME.primary : THEME.muted,
                  fontSize: isMobileViewport ? 12 : 14,
                  fontWeight: isActive ? 600 : 500,
                  padding: isMobileViewport ? '9px 12px' : '16px 18px',
                  borderRadius: isMobileViewport ? 999 : 0,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  flex: isMobileViewport ? '1 1 auto' : '0 0 auto',
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>{tab.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, background: isActive ? '#fff' : THEME.bg, color: isActive ? THEME.primary : THEME.muted, padding: '2px 6px', borderRadius: 999 }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {activeOrdersTab === 'reviews' ? (
            accountReviewHistory.length === 0 ? (
              <EmptyState title="No submitted reviews yet" desc="Completed orders you review will appear here once review history is available in your account feed." />
            ) : (
              accountReviewHistory.map((review, index) => (
                <div key={`review-history-${review.review_id || index}`} style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text }}>{review.store_name || review.title || 'Reviewed order'}</div>
                      <div style={{ fontSize: 13, color: THEME.muted, marginTop: 4 }}>{prettyStatus(review.target_type || 'Review')}</div>
                    </div>
                    <StatusBadge status={review.status_label || review.status || 'Reviewed'} />
                  </div>
                  {review.comment ? <div style={{ fontSize: 14, color: THEME.text, lineHeight: 1.5 }}>{review.comment}</div> : null}
                </div>
              ))
            )
          ) : visibleOrders.length === 0 ? (
            <EmptyState
              title={activeOrdersTab === 'active' ? 'No active orders' : 'No past orders'}
              desc={activeOrdersTab === 'active' ? "You don't have any orders in progress right now." : "Completed orders will appear here after they are finished."}
            />
          ) : (
            visibleOrders.map((order) => renderOrderCard(order, { allowReview: activeOrdersTab === 'past' }))
          )}
        </div>
      </div>
    );
  };

  const renderBookings = () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Bookings</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {allBookings.length === 0 ? (
          <EmptyState title="No bookings found" desc="You don't have any appointments scheduled." />
        ) : allBookings.map((booking) => (
          <div key={`all-booking-${booking.reference}`} style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.purpleBg, color: THEME.purple, display: 'grid', placeItems: 'center' }}>
                <CalendarDays size={24} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>{booking.store_name || 'DGFY Service'}</div>
                <div style={{ fontSize: 13, color: THEME.muted }}>{booking.reference} {'\u2022'} {formatDate(booking.occurred_at)}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <StatusBadge status={booking.status_label || booking.status} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => alert('Booking details will be available soon.')} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAddresses = () => {
    const fieldStyle = {
      width: '100%',
      minHeight: 44,
      border: `1px solid ${THEME.border}`,
      borderRadius: 10,
      padding: '0 14px',
      fontSize: 14,
      color: THEME.text,
      outline: 'none',
      boxSizing: 'border-box',
      background: THEME.surface,
      transition: 'border-color 0.2s'
    };

    // Sort addresses to pin default to top
    const sortedAddresses = [...allAddresses].sort((a, b) => {
      if (a.is_default) return -1;
      if (b.is_default) return 1;
      return 0;
    });

    const handleOpenAddAddressModal = () => {
      setAddressModalMode('create');
      setAddressDraft({ label: '', address_line: '', latitude: null, longitude: null, is_default: true });
      setIsAddressModalOpen(true);
    };

    const handleOpenEditAddressModal = (address) => {
      setAddressModalMode(`edit-${address.address_id}`);
      setAddressDraft({ 
        label: getAddressNote(address), 
        address_line: getAddressLine(address), 
        latitude: address.latitude, 
        longitude: address.longitude, 
        is_default: address.is_default === true,
        address_id: address.address_id
      });
      setIsAddressModalOpen(true);
    };

    const handleSaveAddressModal = async (e) => {
      e.preventDefault();
      // Auto-set as default if it's a new address
      const draftPayload = { ...addressDraft };
      if (addressModalMode === 'create') draftPayload.is_default = true;

      const payload = {
        label: String(draftPayload.label || '').trim(),
        address_line: String(draftPayload.address_line || '').trim(),
        latitude: draftPayload.latitude,
        longitude: draftPayload.longitude,
        is_default: Boolean(draftPayload.is_default)
      };

      const isEdit = String(addressModalMode).startsWith('edit-');
      const targetAddress = isEdit ? allAddresses.find(a => a.address_id === addressDraft.address_id) : null;
      
      const success = await onSaveAddress?.(payload, targetAddress);
      if (success !== false) { // Assuming returning nothing or true means success
        setIsAddressModalOpen(false);
      }
    };

    const confirmDelete = async (address) => {
      await onDeleteAddress?.(address);
      setDeletingAddressId(null);
    };

    return (
      <div style={{ display: 'grid', gap: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 22 : 26, fontWeight: 800, color: THEME.text }}>Saved Locations</h2>
            <p style={{ margin: '6px 0 0', color: THEME.muted, fontSize: 14 }}>Locations saved here are available during checkout.</p>
          </div>
          {typeof onSaveAddress === 'function' && (
            <button
              type="button"
              onClick={handleOpenAddAddressModal}
              style={{ background: THEME.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.2s ease', flexShrink: 0 }}
              onMouseOver={e => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <MapPin size={16} /> Add New Address
            </button>
          )}
        </div>

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            {sortedAddresses.length === 0 ? (
              <SavedAddressCardEmpty message="No addresses saved. Add one below for faster checkout." />
            ) : sortedAddresses.map((address) => {
              const isDefault = Boolean(address.is_default);
              const isDeleting = deletingAddressId === address.address_id;
              const actionMeta = getAccountAddressActionMeta(accountAddressActionId);
              const isAddressActionTarget = actionMeta.id === String(address.address_id);
              const busy = isDeleting || isAddressActionTarget;

              return (
                <div key={`dashboard-addr-wrapper-${address.address_id}`} style={{ display: 'grid', gap: 10 }}>
                  <SavedAddressCard
                    address={{
                      id: `dashboard-address-${address.address_id}`,
                      addressId: address.address_id,
                      label: getAddressTitle(address),
                      fullAddress: getAddressLine(address),
                      isDefault,
                      source: 'account'
                    }}
                    isSelected={isDefault}
                    isBusy={busy}
                    onSelect={isAddressActionTarget ? undefined : (() => onUseAddressForCheckout?.(address))}
                    onSetDefault={!isDefault ? () => onSetDefaultAddress?.(address) : undefined}
                    onEdit={() => handleOpenEditAddressModal(address)}
                    onRemove={() => setDeletingAddressId(address.address_id)}
                    showActions={!isDeleting}
                    themeColor={THEME.primary}
                    themeBg="#eff6ff"
                    themeHoverBorder="#93c5fd"
                    themeHoverBg="#f8fbff"
                    themeShadowColor="rgba(59,130,246,0.16)"
                    themeShadowColorSoft="rgba(59,130,246,0.12)"
                  />
                  {isDeleting ? (
                    <div style={{ marginTop: -2, padding: '0 8px 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: THEME.orange }}>Delete this address?</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setDeletingAddressId(null)} style={{ border: `1px solid ${THEME.border}`, background: 'transparent', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => confirmDelete(address)} style={{ border: 'none', background: THEME.orange, color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: THEME.muted, fontSize: 12, marginTop: 8 }}>
            <Lock size={14} /> Your addresses are private and secure.
          </div>
        </section>

        {/* Modal Overlay */}
        {isAddressModalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center' }}>
            <div 
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }}
              onClick={() => setIsAddressModalOpen(false)}
            />
            <div 
              style={{ 
                position: 'relative', 
                background: THEME.surface, 
                width: '100%', 
                maxWidth: isMobileViewport ? '100%' : 480, 
                borderRadius: isMobileViewport ? '24px 24px 0 0' : 24, 
                padding: '24px', 
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                animation: isMobileViewport ? 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'grid',
                gap: 20
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: THEME.text }}>
                  {addressModalMode === 'create' ? 'Add New Address' : 'Edit Address'}
                </h3>
                <button onClick={() => setIsAddressModalOpen(false)} style={{ background: THEME.bg, border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer', color: THEME.muted }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveAddressModal} style={{ display: 'grid', gap: 16 }}>
                {renderAddressPinEditor?.({
                  draft: addressDraft,
                  onChange: setAddressDraft,
                  mode: addressModalMode,
                  renderFormRow: ({ isExpanded } = {}) => (
                    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isExpanded ? '1fr 1fr' : '1fr' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
                        <div>Full Delivery Address</div>
                        <input
                          id="dgfy-modal-address-line"
                          autoFocus
                          value={String(addressDraft.address_line || '')}
                          onChange={(e) => setAddressDraft(p => ({ ...p, address_line: e.target.value }))}
                          placeholder="e.g. 123 Main St, City, Province"
                          style={fieldStyle}
                          required
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: THEME.text }}>
                        <div>Label / Landmark / Unit <span style={{ color: THEME.muted, fontWeight: 500 }}>(optional)</span></div>
                        <input
                          value={addressDraft.label}
                          onChange={(e) => setAddressDraft(p => ({ ...p, label: e.target.value }))}
                          placeholder="e.g. Home, Office, Near Plaza"
                          style={fieldStyle}
                        />
                      </label>
                    </div>
                  )
                })}

                {addressModalMode !== 'create' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 16px', background: THEME.bg, borderRadius: 12, marginTop: 4 }}>
                    <input 
                      type="checkbox" 
                      checked={addressDraft.is_default} 
                      onChange={(e) => setAddressDraft(p => ({ ...p, is_default: e.target.checked }))} 
                      style={{ width: 18, height: 18, accentColor: THEME.primary }}
                    />
                    <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>Set as default address</div>
                  </label>
                )}

                {addressModalMode === 'create' && (
                  <div style={{ fontSize: 13, background: THEME.infoBg, color: THEME.info, padding: '10px 14px', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                    This will be set as your default address automatically.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                  <button type="button" onClick={() => setIsAddressModalOpen(false)} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: THEME.text, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={accountAddressActionId === 'new' || !addressDraft.address_line} 
                    style={{ background: THEME.primary, border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: (accountAddressActionId === 'new' || !addressDraft.address_line) ? 'not-allowed' : 'pointer', opacity: (accountAddressActionId === 'new' || !addressDraft.address_line) ? 0.6 : 1 }}
                  >
                    {accountAddressActionId === 'new' ? 'Saving...' : 'Save Address'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* CSS for animations */}
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          @keyframes zoomIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}} />
      </div>
    );
  };
  const renderLoyalty = () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Loyalty Rewards</h2>
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: THEME.successBg, color: THEME.success, display: 'grid', placeItems: 'center' }}>
            <Award size={40} />
          </div>
          <div>
            <div style={{ fontSize: 14, color: THEME.muted, fontWeight: 500, marginBottom: 4 }}>Current Balance</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: THEME.text, lineHeight: 1 }}>{Number(loyalty.balance || 0)} <span style={{ fontSize: 16, color: THEME.muted, fontWeight: 500 }}>Points</span></div>
          </div>
        </div>
        <button onClick={() => alert('Loyalty redemption is available at the physical store.')} style={{ background: THEME.primary, border: 'none', color: '#FFF', borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Redeem Rewards
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: THEME.text, marginBottom: 16 }}>Recent Transactions</h3>
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
          {loyaltyTransactions.length === 0 ? (
            <EmptyState title="No transactions yet" desc="Make a purchase to start earning points." />
          ) : loyaltyTransactions.map((entry, index) => (
            <div key={`loy-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: index < loyaltyTransactions.length - 1 ? `1px solid ${THEME.border}` : 'none' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: THEME.text, marginBottom: 4 }}>{prettyStatus(entry.reason || 'Activity')}</div>
                <div style={{ fontSize: 13, color: THEME.muted }}>{formatDate(entry.created_at)}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: Number(entry.points_delta || 0) >= 0 ? THEME.success : THEME.text }}>
                {Number(entry.points_delta || 0) >= 0 ? '+' : ''}{Number(entry.points_delta || 0)} pts
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAccount = () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: isMobileViewport ? 20 : 28, fontWeight: 800, color: THEME.text, marginBottom: 8, lineHeight: 1.15 }}>Account Settings</h2>
      
      {/* Container 1: Profile Overview */}
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? '20px 16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 18 : 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Profile Overview</h3>
        <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: isMobileViewport ? 16 : 24, flexDirection: isMobileViewport ? 'column' : 'row' }}>
          <div style={{ display: 'flex', alignItems: isMobileViewport ? 'flex-start' : 'center', gap: isMobileViewport ? 16 : 24, flexDirection: isMobileViewport ? 'column' : 'row' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: isMobileViewport ? 84 : 100, height: isMobileViewport ? 84 : 100, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? 30 : 36, fontWeight: 800 }}>
                {accountIdentityInitials}
              </div>
              <div style={{ position: 'absolute', bottom: 4, right: 4, width: isMobileViewport ? 24 : 28, height: isMobileViewport ? 24 : 28, borderRadius: '50%', background: THEME.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '3px solid #FFF' }}>
                <Check size={isMobileViewport ? 14 : 16} strokeWidth={4} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: isMobileViewport ? 16 : 24, fontWeight: 700, color: THEME.text, lineHeight: 1.2 }}>{accountIdentityName}</div>
                {Boolean(accountPanel?.me?.is_email_verified) && (
                  <div style={{ background: '#E6F4EA', color: '#137333', fontSize: isMobileViewport ? 11 : 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                    <ShieldCheck size={14} /> Verified Customer
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobileViewport ? 10 : 24, marginTop: 4, flexWrap: 'wrap', flexDirection: isMobileViewport ? 'column' : 'row' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.muted, fontSize: isMobileViewport ? 13 : 14, wordBreak: 'break-word' }}>
                  <Phone size={16} /> {overviewPhone || '+63 *** *** ****'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.muted, fontSize: isMobileViewport ? 13 : 14, wordBreak: 'break-word' }}>
                  <Mail size={16} /> {overviewEmail || 'customer@email.com'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => alert('Editing profile is coming soon.')} style={{ background: 'transparent', border: `1px solid ${THEME.primary}`, color: THEME.primary, borderRadius: 8, padding: isMobileViewport ? '10px 14px' : '10px 20px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', width: isMobileViewport ? '100%' : 'auto' }}>
            <Edit2 size={16} /> Edit Profile
          </button>
        </div>
      </div>

      {/* Container 2: Contact Information */}
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? '20px 16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 18 : 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Contact Information</h3>
        <div style={{ display: 'grid', gap: 16 }}>
          
          {/* Email Row */}
          <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', padding: isMobileViewport ? '14px 16px' : '16px 20px', background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}`, flexDirection: isMobileViewport ? 'column' : 'row', gap: isMobileViewport ? 14 : 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center' }}>
                <Mail size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: THEME.text, fontWeight: 700, marginBottom: 4 }}>Email Address</div>
                <div style={{ fontSize: isMobileViewport ? 14 : 15, fontWeight: 600, color: THEME.text, overflowWrap: 'anywhere' }}>{overviewEmail || 'customer@email.com'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', gap: isMobileViewport ? 10 : 24, flexDirection: isMobileViewport ? 'column' : 'row', width: isMobileViewport ? '100%' : 'auto' }}>
              {accountPanel?.me?.is_email_verified ? (
                <span style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Verified <CheckCircle2 size={14} />
                </span>
              ) : (
                <span style={{ background: '#FFF3E0', color: '#E65100', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Unverified
                </span>
              )}
              <button onClick={() => alert('Change email flow initiated.')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, justifyContent: isMobileViewport ? 'space-between' : 'flex-start' }}>
                Change <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Phone Row */}
          <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', padding: isMobileViewport ? '14px 16px' : '16px 20px', background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}`, flexDirection: isMobileViewport ? 'column' : 'row', gap: isMobileViewport ? 14 : 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center' }}>
                <Phone size={24} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: THEME.text, fontWeight: 700, marginBottom: 4 }}>Phone Number</div>
                <div style={{ fontSize: isMobileViewport ? 14 : 15, fontWeight: 600, color: THEME.text, overflowWrap: 'anywhere' }}>{overviewPhone || '+63 *** *** ****'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', gap: isMobileViewport ? 10 : 24, flexDirection: isMobileViewport ? 'column' : 'row', width: isMobileViewport ? '100%' : 'auto' }}>
              <span style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                Verified <CheckCircle2 size={14} />
              </span>
              <button onClick={() => alert('Change phone flow initiated.')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, justifyContent: isMobileViewport ? 'space-between' : 'flex-start' }}>
                Change <ChevronRight size={16} />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Container 3: Security */}
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? '20px 16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 18 : 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Security</h3>
        <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', padding: '0px 0px 8px 0px', flexDirection: isMobileViewport ? 'column' : 'row', gap: isMobileViewport ? 14 : 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center' }}>
              <Lock size={24} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: THEME.text, fontWeight: 700 }}>Password</div>
              <div style={{ fontSize: isMobileViewport ? 22 : 24, fontWeight: 700, color: THEME.text, marginTop: 4, letterSpacing: 2, lineHeight: 1 }}>{'\u2022'.repeat(8)}</div>
            </div>
          </div>
          <button onClick={() => alert('Change password flow initiated.')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, justifyContent: isMobileViewport ? 'space-between' : 'flex-start' }}>
            Change Password <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', background: THEME.bg, display: 'flex', fontFamily: "'Inter', sans-serif" }}>
      
      {/* --- LEFT NAVIGATION SIDEBAR --- */}
      <aside style={{ 
        width: 260, 
        background: THEME.surface, 
        borderRight: `1px solid ${THEME.border}`, 
        display: isMobileViewport && !isMobileMenuOpen ? 'none' : 'flex', 
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        inset: isMobileViewport ? 0 : '0 auto 0 0',
        height: '100vh',
        overflow: 'hidden',
        zIndex: 50
      }}>
        {/* Logo Area */}
        <div style={{ height: 72, padding: '0 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', borderBottom: `1px solid ${THEME.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={dgfyCustomerLogo} alt="DGFY Logo" style={{ height: 28 }} />
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: THEME.primary, letterSpacing: '0.02em', marginTop: 2 }}>
            Discover Goods For You
          </div>
          
          {isMobileViewport && (
            <button onClick={() => setIsMobileMenuOpen(false)} style={{ position: 'absolute', top: 24, right: 24, background: 'none', border: 'none' }}>
              <X size={24} color={THEME.muted} />
            </button>
          )}
        </div>

        {/* Primary Nav */}
        <nav style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                style={{
                  background: isActive ? THEME.infoBg : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? `4px solid ${THEME.primary}` : '4px solid transparent',
                  borderRadius: '0 8px 8px 0',
                  color: isActive ? THEME.primary : THEME.muted,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  fontSize: 15,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'background 150ms'
                }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = THEME.bg; }}
                onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon size={20} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span>{item.label}</span>
                  {item.premium ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '4px 8px', background: isActive ? 'rgba(255,255,255,0.88)' : '#FFF8E1', color: '#8A5A00', fontSize: 11, fontWeight: 800 }}>
                      <Crown size={12} />
                      Premium
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}

          <div style={{ height: 1, background: THEME.border, margin: '16px 0' }} />

          <button style={{ background: 'transparent', border: 'none', color: THEME.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
            <HelpCircle size={20} /> Help Center
          </button>
          <button style={{ background: 'transparent', border: 'none', color: THEME.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
            <HeadphonesIcon size={20} /> Contact Support
          </button>
        </nav>

        {/* Bottom Section */}
        <div style={{ padding: 24, marginTop: 'auto' }}>

          <button onClick={onSignOut} style={{ background: 'transparent', border: 'none', color: THEME.orange, display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            <LogOut size={20} /> Sign out
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: isMobileViewport ? 0 : 260 }}>
        
        {/* Header Shell */}
        <header style={{ height: 72, background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', position: 'fixed', top: 0, left: isMobileViewport ? 0 : 260, right: 0, zIndex: 30, flexShrink: 0, overflow: 'visible' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {isMobileViewport && (
              <button onClick={() => setIsMobileMenuOpen(true)} style={{ background: 'transparent', border: 'none', color: THEME.text }}>
                <Menu size={24} />
              </button>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: THEME.text, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <ArrowLeft size={18} /> Back to Discovery
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setIsNotificationPanelOpen((current) => !current)}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <Bell size={20} color={THEME.text} />
              {unreadNotificationCount > 0 && (
                <div style={{ position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14, padding: '0 3px', background: THEME.orange, color: '#FFF', borderRadius: 999, fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid #FFF', boxSizing: 'border-box' }}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </div>
              )}
            </button>
            {isNotificationPanelOpen && (
              <div style={{ position: 'fixed', top: 84, right: isMobileViewport ? 12 : 24, width: isMobileViewport ? 'min(320px, calc(100vw - 24px))' : 360, maxHeight: 'min(420px, calc(100vh - 108px))', overflow: 'hidden', border: `1px solid ${THEME.border}`, borderRadius: 12, background: THEME.surface, boxShadow: '0 18px 40px rgba(15,23,42,.16)', zIndex: 80 }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>Notifications</div>
                  {unreadNotificationCount > 0 && (
                    <button
                      type="button"
                      onClick={() => typeof onMarkAllNotificationsRead === 'function' && onMarkAllNotificationsRead()}
                      style={{ border: 'none', background: 'transparent', color: THEME.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 352, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: THEME.muted, fontSize: 14, fontWeight: 600 }}>
                      No notifications
                    </div>
                  ) : notifications.map((notification) => {
                    const isUnread = !notification.read_at;
                    return (
                      <button
                        key={notification.notification_id || `${notification.reference}-${notification.created_at}`}
                        type="button"
                        onClick={() => openNotification(notification)}
                        style={{ width: '100%', border: 'none', borderBottom: `1px solid ${THEME.border}`, background: isUnread ? '#F8FBFF' : THEME.surface, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4 }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>{notification.title || 'Order updated'}</span>
                          {isUnread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: THEME.primary, flex: '0 0 auto' }} />}
                        </span>
                        <span style={{ fontSize: 13, color: THEME.muted, lineHeight: 1.35 }}>{notification.body || prettyStatus(notification.status)}</span>
                        {notification.reference && (
                          <span style={{ fontSize: 12, color: THEME.primary, fontWeight: 700 }}>{notification.reference} - Track Order</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>
              {accountIdentityInitials}
            </div>
            {!isMobileViewport && <span style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>{accountIdentityName?.split(' ')[0] || 'User'}</span>}
            <ChevronDown size={16} color={THEME.muted} />
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main style={{ padding: isMobileViewport ? '88px 16px 16px' : '104px 28px 32px', maxWidth: isMobileViewport ? 1200 : 1360, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {activeNav === 'overview' && renderOverview()}
          {activeNav === 'orders' && renderOrders()}
          {activeNav === 'bookings' && renderBookings()}
          {activeNav === 'addresses' && renderAddresses()}
          {activeNav === 'loyalty' && renderLoyalty()}
          {activeNav === 'account' && renderAccount()}
          {activeNav === 'business' && renderBusiness()}
        </main>

      </div>
      {reviewComposer.activity ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2590, background: 'rgba(15, 23, 42, 0.5)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="dgfy-review-composer-title" style={{ width: 'min(520px, 100%)', background: THEME.surface, borderRadius: 18, border: `1px solid ${THEME.border}`, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)', padding: 22, display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h3 id="dgfy-review-composer-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: THEME.text }}>Write a review</h3>
                <p style={{ margin: '6px 0 0', fontSize: 14, color: THEME.muted, lineHeight: 1.55 }}>
                  Share your experience for {reviewComposer.activity.store_name || 'this store'}.
                </p>
              </div>
              <button type="button" onClick={closeReviewComposer} style={{ border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.muted, borderRadius: 10, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: reviewSubmitting ? 'not-allowed' : 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((star) => {
                const isSelected = reviewComposer.rating >= star;
                return (
                  <button
                    key={`review-star-${star}`}
                    type="button"
                    onClick={() => setReviewComposer((previous) => ({ ...previous, rating: star }))}
                    style={{ border: 'none', background: 'transparent', color: isSelected ? '#F59E0B' : '#CBD5E1', cursor: 'pointer', padding: 0 }}
                  >
                    <Star size={24} fill="currentColor" />
                  </button>
                );
              })}
            </div>
            <textarea
              value={reviewComposer.comment}
              onChange={(event) => setReviewComposer((previous) => ({ ...previous, comment: event.target.value.slice(0, 500) }))}
              placeholder="Tell other customers what stood out about your order."
              rows={5}
              style={{ width: '100%', borderRadius: 12, border: `1px solid ${THEME.border}`, padding: 14, fontSize: 14, color: THEME.text, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
            {reviewError ? (
              <div style={{ fontSize: 13, color: '#DC2626' }}>{reviewError}</div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={closeReviewComposer} style={{ border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: reviewSubmitting ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={submitReviewComposer} disabled={reviewSubmitting} style={{ border: 'none', background: THEME.primary, color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: reviewSubmitting ? 'not-allowed' : 'pointer', opacity: reviewSubmitting ? 0.7 : 1 }}>
                {reviewSubmitting ? 'Sending...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingAddressSave ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2600, background: 'rgba(15, 23, 42, 0.45)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="save-address-title" style={{ width: 'min(440px, 100%)', background: THEME.surface, borderRadius: 18, border: `1px solid ${THEME.border}`, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)', padding: 22, display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 42, height: 42, borderRadius: '50%', background: '#EFF6FF', color: THEME.primary, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                <MapPin size={20} />
              </span>
              <div>
                <h3 id="save-address-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: THEME.text }}>Save this address?</h3>
                <p style={{ margin: '6px 0 0', color: THEME.muted, fontSize: 14, lineHeight: 1.55 }}>This address will be saved to your DGFY account and will be available during checkout and booking.</p>
              </div>
            </div>
            <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, background: THEME.bg }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text }}>{getAddressTitle(pendingAddressSave)}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: THEME.muted }}>{getAddressLine(pendingAddressSave)}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setPendingAddressSave(null)} style={{ border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={confirmAddressSave} disabled={accountAddressActionId === 'new'} style={{ border: 'none', background: THEME.primary, color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: accountAddressActionId === 'new' ? 'not-allowed' : 'pointer', opacity: accountAddressActionId === 'new' ? 0.6 : 1 }}>{accountAddressActionId === 'new' ? 'Saving...' : 'Save it'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DgfyCustomerAccountPage;

