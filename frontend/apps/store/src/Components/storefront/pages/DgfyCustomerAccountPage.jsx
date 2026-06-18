import React from 'react';
import { useState } from 'react';
import {
  Award,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Edit,
  HeadphonesIcon,
  Home,
  HelpCircle,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Package,
  Phone,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Ticket,
  Trash2,
  User,
  X,
  Zap
} from 'lucide-react';

const SURFACE = '#FFFFFF';
const SOFT_SURFACE = '#F8FAFC';
const ACCENT_SURFACE = '#F5F8FF';
const BORDER = '#E5EAF2';
const PRIMARY = '#0F6FFF';
const TEXT = '#101828';
const MUTED = '#667085';

/* DGFY business account contract anchors
Registered Businesses
Go to Inventory
businessMemberships
onOpenBusinessInventory
*/

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

const buildTrackSummaryLines = (activity = {}) => {
  const display = activity?.display || {};
  const lines = Array.isArray(display?.lines) ? display.lines : [];
  return lines
    .map((line) => ({
      name: String(line?.name || '').trim() || 'Item',
      quantity: Math.max(1, Number(line?.quantity || 1)),
      price: Number(line?.price || 0)
    }))
    .slice(0, 4);
};

export function DgfyCustomerAccountPage({
  isMobileViewport,
  presentation = 'dialog',
  onClose,
  onRefresh,
  onTrackReference,
  onCancelOrder,
  onReorderOrder,
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
  accountOrderActionReference = '',
  accountAddressActionId = ''
}) {
  const isPage = presentation === 'page';
  const allOrders = Array.isArray(accountPanel?.orders) ? accountPanel.orders : [];
  const allBookings = Array.isArray(accountPanel?.bookings) ? accountPanel.bookings : [];
  const allAddresses = Array.isArray(accountPanel?.addresses) ? accountPanel.addresses : [];
  const loyalty = accountPanel?.loyalty || { balance: 0, transactions: [] };
  const loyaltyTransactions = Array.isArray(loyalty?.transactions) ? loyalty.transactions.slice(0, 3) : [];
  const emptyAddressDraft = (isDefault = false) => ({
    label: 'Home',
    address_line: '',
    latitude: null,
    longitude: null,
    is_default: isDefault
  });
  const [addressDraft, setAddressDraft] = useState(() => emptyAddressDraft(false));
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [editingAddressDraft, setEditingAddressDraft] = useState({ label: '', address_line: '', latitude: null, longitude: null, is_default: false });
  const [pendingCancelOrder, setPendingCancelOrder] = useState(null);
  const [activeNav, setActiveNav] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [businessStepUpAction, setBusinessStepUpAction] = useState(null);
  const [businessEmailOtpCode, setBusinessEmailOtpCode] = useState('');
  const [businessActionLoading, setBusinessActionLoading] = useState(false);
  const [businessOtpSent, setBusinessOtpSent] = useState(false);
  const [businessActionError, setBusinessActionError] = useState('');
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'addresses', label: 'Locations', icon: MapPin },
    { id: 'loyalty', label: 'Loyalty', icon: Award },
    { id: 'account', label: 'Account', icon: User },
    { id: 'business', label: 'Business', icon: Store }
  ];
  const showOverview = activeNav === 'overview';
  const showOrders = showOverview || activeNav === 'orders';
  const showBookings = showOverview || activeNav === 'bookings';
  const showAddresses = showOverview || activeNav === 'addresses';
  const showLoyalty = showOverview || activeNav === 'loyalty';
  const businessCompanies = Array.isArray(accountPanel?.businessCompanies) ? accountPanel.businessCompanies : [];
  const businessStepUp = accountPanel?.businessStepUp || accountPanel?.business_step_up || {};
  const acceptedCompanies = businessCompanies.filter((company) => company.can_switch === true);
  const ownedCompanies = acceptedCompanies.filter((company) => company.is_owner === true || company.group === 'owned');
  const invitedCompanies = acceptedCompanies.filter((company) => !(company.is_owner === true || company.group === 'owned'));
  const pendingInvitations = businessCompanies.filter((company) => company.requires_action === 'accept_invitation');

  const performBusinessAction = async (action, code = '') => {
    const company = action?.company || {};
    if (action?.type === 'accept') {
      if (!company?.membership_id || typeof onAcceptCompanyInvitation !== 'function') return;
      await onAcceptCompanyInvitation({
        membershipId: company.membership_id,
        emailOtpCode: code
      });
      return;
    }
    if (action?.type === 'reject') {
      if (!company?.membership_id || typeof onRejectCompanyInvitation !== 'function') return;
      await onRejectCompanyInvitation({
        membershipId: company.membership_id
      });
      return;
    }
    if (action?.type === 'leave') {
      if (!company?.tenant_id || typeof onLeaveCompany !== 'function') return;
      await onLeaveCompany({
        tenantId: company.tenant_id
      });
      return;
    }
    if (action?.type === 'switch') {
      if (!company?.tenant_id || typeof onSwitchCompany !== 'function') return;
      await onSwitchCompany({
        tenantId: company.tenant_id,
        emailOtpCode: code
      });
    }
  };

  const startBusinessAction = async (type, company) => {
    const action = { type, company };
    if (type === 'reject' || type === 'leave') {
      setBusinessActionError('');
      setBusinessActionLoading(true);
      try {
        await performBusinessAction(action);
      } catch (error) {
        setBusinessActionError(error?.message || 'Unable to complete this business action.');
      } finally {
        setBusinessActionLoading(false);
      }
      return;
    }

    if (businessStepUp?.verified === true) {
      setBusinessActionError('');
      setBusinessActionLoading(true);
      try {
        await performBusinessAction(action);
      } catch (error) {
        setBusinessActionError(error?.message || 'Unable to complete this business action.');
      } finally {
        setBusinessActionLoading(false);
      }
      return;
    }

    if (typeof onRequestBusinessStepUp !== 'function') return;
    setBusinessStepUpAction(action);
    setBusinessEmailOtpCode('');
    setBusinessOtpSent(false);
    setBusinessActionError('');
    setBusinessActionLoading(true);
    try {
      await onRequestBusinessStepUp();
      setBusinessOtpSent(true);
    } catch (error) {
      setBusinessActionError(error?.message || 'Unable to send the security code.');
      setBusinessStepUpAction(null);
    } finally {
      setBusinessActionLoading(false);
    }
  };
  const submitBusinessStepUpAction = async () => {
    if (!businessStepUpAction) return;
    const normalizedCode = String(businessEmailOtpCode || '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setBusinessActionError('Enter the 6-digit security code sent to your DGFY email.');
      return;
    }
    setBusinessActionError('');
    setBusinessActionLoading(true);
    try {
      await performBusinessAction(businessStepUpAction, normalizedCode);
      setBusinessStepUpAction(null);
      setBusinessEmailOtpCode('');
      setBusinessOtpSent(false);
    } catch (error) {
      setBusinessActionError(error?.message || 'Unable to complete this business action.');
    } finally {
      setBusinessActionLoading(false);
    }
  };
  const resetAddressDraft = () => setAddressDraft(emptyAddressDraft(allAddresses.length === 0));
  const startEditAddress = (address = {}) => {
    setEditingAddressId(address.address_id);
    setEditingAddressDraft({
      label: String(address.label || 'Address').trim() || 'Address',
      address_line: String(address.address_line || '').trim(),
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      is_default: address.is_default === true
    });
  };
  const cancelEditAddress = () => {
    setEditingAddressId(null);
    setEditingAddressDraft({ label: '', address_line: '', latitude: null, longitude: null, is_default: false });
  };
  const renderPinEditor = (draft, setDraft, mode) => (
    typeof renderAddressPinEditor === 'function'
      ? renderAddressPinEditor({ draft, onChange: setDraft, mode })
      : null
  );

  if (isPage && !isMobileViewport) {
    const defaultAddress = allAddresses.find((address) => address?.is_default === true) || allAddresses[0];
    const accountContactParts = String(accountIdentityContact || '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const overviewPhone = accountPanel?.me?.phone || accountContactParts.find((part) => /^\+|^\d/.test(part)) || '';
    const overviewEmail = accountPanel?.me?.email || accountContactParts.find((part) => part.includes('@')) || '';
    const activeOrderPreview = activeOrders.slice(0, 2);
    const navButtonStyle = (selected) => ({
      minHeight: 54,
      border: 'none',
      borderLeft: `4px solid ${selected ? '#1A4E8D' : 'transparent'}`,
      borderRadius: '0 8px 8px 0',
      background: selected ? '#AEE8F4' : 'transparent',
      color: selected ? '#1A4E8D' : MUTED,
      padding: '0 22px',
      fontSize: 18,
      fontWeight: selected ? 800 : 600,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      textAlign: 'left',
      cursor: 'pointer'
    });
    const desktopStatusBadge = (status) => {
      const normalized = String(status || '').toLowerCase();
      const isComplete = normalized.includes('complete') || normalized.includes('done');
      const isConfirmed = normalized.includes('confirm') || normalized.includes('progress') || normalized.includes('prepar');
      const color = isComplete ? '#16A34A' : isConfirmed ? '#1A4E8D' : '#667085';
      const bg = isComplete ? '#ECFDF3' : isConfirmed ? '#AEE8F4' : '#F2F4F7';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: bg, color, padding: '5px 11px', fontSize: 14, fontWeight: 800 }}>
          {prettyStatus(status)}
        </span>
      );
    };
    const orderRow = (order, compact = false) => (
      <div
        key={`desktop-order-${order.activity_id || order.reference}`}
        style={{
          borderRadius: compact ? 0 : 16,
          border: compact ? 'none' : `1px solid ${BORDER}`,
          borderBottom: compact ? `1px solid ${BORDER}` : undefined,
          background: '#FFFFFF',
          padding: compact ? '22px 28px' : '34px 28px',
          display: 'grid',
          gridTemplateColumns: compact ? 'minmax(0, 1fr) 190px 170px' : 'minmax(0, 1.2fr) 220px 220px',
          alignItems: 'center',
          gap: 24,
          minHeight: compact ? 94 : 124
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
          <div style={{ width: compact ? 56 : 54, height: compact ? 56 : 54, borderRadius: compact ? '50%' : 12, background: compact ? '#101828' : '#AEE8F4', color: compact ? '#FFFFFF' : '#1A4E8D', display: 'grid', placeItems: 'center', fontSize: compact ? 12 : 0, fontWeight: 900, flexShrink: 0, lineHeight: 1.05, textAlign: 'center' }}>
            {compact ? String(order.store_name || 'STORE').slice(0, 4).toUpperCase() : <Package size={26} strokeWidth={2.2} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: compact ? 18 : 16, fontWeight: 800, color: TEXT, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.store_name || 'DGFY Store'}
            </div>
            <div style={{ marginTop: 5, fontSize: compact ? 14 : 13, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {order.reference}{compact ? '' : ` - ${formatDate(order.occurred_at)}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 9, justifyItems: compact ? 'start' : 'center' }}>
          {!compact ? <div style={{ fontSize: 22, fontWeight: 900, color: TEXT }}>{money(order.total_amount)}</div> : <div style={{ fontSize: 13, color: MUTED }}>Placed on {formatDate(order.occurred_at)}</div>}
          {desktopStatusBadge(order.status_label || order.status)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => onTrackReference(order.reference)}
            disabled={customerTrackLoadingReference === order.reference}
            style={{ minHeight: 42, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#1A4E8D', padding: '0 20px', fontSize: 14, fontWeight: 800, cursor: customerTrackLoadingReference === order.reference ? 'wait' : 'pointer' }}
          >
            {customerTrackLoadingReference === order.reference ? 'Loading...' : (compact ? 'Track Order' : 'Track')}
          </button>
          {!compact ? (
            <button
              type="button"
              onClick={() => onTrackReference(order.reference)}
              style={{ minHeight: 42, borderRadius: 8, border: 'none', background: '#1A4E8D', color: '#FFFFFF', padding: '0 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
            >
              View Receipt
            </button>
          ) : (
            <ChevronRight size={18} color={MUTED} />
          )}
        </div>
      </div>
    );
    const quickActions = [
      { label: 'Reorder Items', icon: ShoppingBag, color: '#16A34A', action: () => setActiveNav('orders') },
      { label: 'Add Address', icon: MapPin, color: '#E11D48', action: () => setActiveNav('addresses') },
      { label: 'Update Profile', icon: User, color: '#1A4E8D', action: () => setActiveNav('account') },
      { label: 'Help Center', icon: HelpCircle, color: '#7A5AF8', action: onHelp },
      { label: 'Contact Support', icon: HeadphonesIcon, color: '#1A4E8D', action: onHelp }
    ];
    const ActiveSectionIcon = navItems.find((item) => item.id === activeNav)?.icon || User;

    return (
      <section aria-label="My Account" style={{ minHeight: '100vh', background: '#F9FAFB', display: 'grid', gridTemplateColumns: '296px minmax(0, 1fr)', color: TEXT }}>
        <aside style={{ background: '#FFFFFF', borderRight: `1px solid ${BORDER}`, minHeight: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr auto', position: 'sticky', top: 0 }}>
          <div style={{ padding: '18px 28px 16px', borderBottom: `1px solid ${BORDER}` }}>
            <img src="/dgfy-logo.png" alt="DGFY" style={{ width: 92, height: 'auto', display: 'block' }} />
            <div style={{ marginTop: 4, color: '#1A4E8D', fontSize: 12, fontWeight: 700 }}>Discover Goods For You</div>
          </div>
          <nav style={{ padding: '28px 18px 18px', display: 'grid', alignContent: 'start', gap: 6 }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const selected = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id)}
                  aria-current={selected ? 'page' : undefined}
                  style={navButtonStyle(selected)}
                >
                  <Icon size={22} strokeWidth={2.1} />
                  {item.label}
                </button>
              );
            })}
            <div style={{ height: 1, background: BORDER, margin: '26px 0 20px' }} />
            <button type="button" onClick={onHelp} style={navButtonStyle(false)}>
              <HelpCircle size={22} strokeWidth={2.1} />
              Help Center
            </button>
            <button type="button" onClick={onHelp} style={navButtonStyle(false)}>
              <HeadphonesIcon size={22} strokeWidth={2.1} />
              Contact Support
            </button>
          </nav>
          <div style={{ padding: '20px 28px 28px' }}>
            <button type="button" onClick={onSignOut} style={{ border: 'none', background: 'transparent', color: '#DC2626', fontSize: 16, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <LogOut size={20} strokeWidth={2.2} />
              Sign out
            </button>
          </div>
        </aside>

        <main style={{ minWidth: 0 }}>
          <header style={{ height: 82, borderBottom: `1px solid ${BORDER}`, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px', position: 'sticky', top: 0, zIndex: 3 }}>
            <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: TEXT, fontSize: 16, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <ChevronRight size={20} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} />
              Back to Discovery
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <button type="button" aria-label="Notifications" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#FFFFFF', color: TEXT, display: 'grid', placeItems: 'center', cursor: 'pointer', position: 'relative' }}>
                <Bell size={22} strokeWidth={2.1} />
                <span style={{ position: 'absolute', top: 6, right: 5, minWidth: 15, height: 15, borderRadius: 999, background: '#DC2626', color: '#FFFFFF', fontSize: 9, fontWeight: 900, display: 'grid', placeItems: 'center' }}>3</span>
              </button>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#AEE8F4', color: '#1A4E8D', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 900 }}>
                {accountIdentityInitials}
              </div>
              <button type="button" onClick={() => setActiveNav('account')} style={{ border: 'none', background: 'transparent', color: TEXT, fontSize: 16, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                {accountIdentityName || 'Account'}
                <ChevronRight size={16} strokeWidth={2.2} style={{ transform: 'rotate(90deg)' }} />
              </button>
            </div>
          </header>

          <div style={{ width: 'min(100%, 1280px)', margin: '0 auto', padding: activeNav === 'orders' ? '50px 40px' : '48px 40px', display: 'grid', gap: 28 }}>
            {accountPanel?.error ? (
              <div style={{ borderRadius: 12, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B42318', padding: '12px 16px', fontSize: 14, fontWeight: 700 }}>
                {accountPanel.error}
              </div>
            ) : null}
            {accountPanel?.loading ? (
              <div style={{ borderRadius: 12, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: MUTED, padding: '14px 16px', fontSize: 14 }}>
                Loading your customer account data...
              </div>
            ) : null}

            {activeNav === 'overview' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(360px, 0.95fr)', gap: 28 }}>
                  <section style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, minWidth: 0 }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 90, height: 90, borderRadius: '50%', background: '#AEE8F4', color: '#1A4E8D', display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 900 }}>
                          {accountIdentityInitials}
                        </div>
                        {Boolean(accountPanel?.me?.is_email_verified) ? (
                          <div style={{ position: 'absolute', right: 4, bottom: 4, width: 22, height: 22, borderRadius: '50%', background: '#16A34A', border: '2px solid #FFFFFF', color: '#FFFFFF', display: 'grid', placeItems: 'center' }}>
                            <ShieldCheck size={14} strokeWidth={2.8} />
                          </div>
                        ) : null}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: TEXT }}>{accountIdentityName}</h1>
                          {Boolean(accountPanel?.me?.is_email_verified) ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#1A4E8D', color: '#FFFFFF', borderRadius: 4, padding: '4px 7px', fontSize: 11, fontWeight: 900 }}>
                              <ShieldCheck size={12} strokeWidth={2.4} />
                              Verified
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 18, color: MUTED, fontSize: 14, flexWrap: 'wrap' }}>
                          {overviewPhone ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Phone size={17} /> {overviewPhone}</span> : null}
                          {overviewEmail ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Mail size={17} /> {overviewEmail}</span> : null}
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setActiveNav('account')} style={{ minHeight: 40, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#1A4E8D', padding: '0 18px', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <Edit size={16} />
                      Edit Profile
                    </button>
                  </section>

                  <button type="button" onClick={onRegisterBusiness} style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, textAlign: 'left', cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                      <span style={{ width: 72, height: 72, borderRadius: 16, background: '#AEE8F4', color: '#1A4E8D', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <Store size={34} strokeWidth={2.1} />
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: 22, fontWeight: 900, color: TEXT }}>Grow your business</span>
                        <span style={{ display: 'block', marginTop: 7, fontSize: 16, lineHeight: 1.45, color: MUTED }}>Register your business on DGFY and unlock more opportunities.</span>
                      </span>
                    </span>
                    <ChevronRight size={28} color={TEXT} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 18 }}>
                  {[
                    { label: 'Active Orders', value: activeOrderCount, icon: ShoppingBag, color: '#16A34A', bg: '#ECFDF3', link: 'View all', action: () => setActiveNav('orders') },
                    { label: 'Past Orders', value: allOrders.length, icon: Package, color: '#1A4E8D', bg: '#AEE8F4', link: 'View all', action: () => setActiveNav('orders') },
                    { label: 'Bookings', value: allBookings.length, icon: CalendarDays, color: '#7A5AF8', bg: '#F4F3FF', link: 'View all', action: () => setActiveNav('bookings') },
                    { label: 'Addresses', value: allAddresses.length, icon: MapPin, color: '#E11D48', bg: '#FFF1F2', link: 'Manage', action: () => setActiveNav('addresses') },
                    { label: 'Loyalty Points', value: Number(loyalty.balance || 0), icon: Award, color: '#16A34A', bg: '#ECFDF3', link: 'View details', action: () => setActiveNav('loyalty') }
                  ].map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <button key={stat.label} type="button" onClick={stat.action} style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, display: 'grid', gap: 12, textAlign: 'left', cursor: 'pointer', minHeight: 120 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                          <span>
                            <span style={{ display: 'block', fontSize: 28, lineHeight: 1, fontWeight: 900, color: TEXT }}>{stat.value}</span>
                            <span style={{ display: 'block', marginTop: 6, fontSize: 14, color: MUTED }}>{stat.label}</span>
                          </span>
                          <span style={{ width: 40, height: 40, borderRadius: 10, background: stat.bg, color: stat.color, display: 'grid', placeItems: 'center' }}>
                            <Icon size={21} strokeWidth={2.1} />
                          </span>
                        </span>
                        <span style={{ marginTop: 'auto', color: '#1A4E8D', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {stat.link} <ChevronRight size={15} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(340px, 1fr)', gap: 28 }}>
                  <section style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${BORDER}`, padding: '0 28px' }}>
                      {[
                        ['active_orders', 'Active Orders', ShoppingBag],
                        ['upcoming_bookings', 'Upcoming Bookings', CalendarDays],
                        ['need_reviews', 'Need Reviews', Star]
                      ].map(([tabId, label, Icon]) => {
                        const selected = activeNav === 'overview' && (tabId === 'active_orders');
                        return (
                          <button key={tabId} type="button" style={{ minHeight: 70, border: 'none', borderBottom: selected ? '2px solid #1A4E8D' : '2px solid transparent', background: 'transparent', color: selected ? '#1A4E8D' : MUTED, fontSize: 16, fontWeight: selected ? 900 : 700, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '0 18px', cursor: 'pointer' }}>
                            <Icon size={18} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'grid' }}>
                      {activeOrderPreview.length > 0 ? activeOrderPreview.map((order) => orderRow(order, true)) : (
                        <div style={{ padding: 28, color: MUTED, fontSize: 15 }}>No active orders.</div>
                      )}
                      {activeOrderPreview.length > 0 ? (
                        <button type="button" onClick={() => setActiveNav('orders')} style={{ minHeight: 64, border: 'none', background: '#FFFFFF', color: '#1A4E8D', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>
                          View all active orders
                        </button>
                      ) : null}
                    </div>
                  </section>

                  <section style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ padding: 28, borderBottom: `1px solid ${BORDER}`, display: 'grid', gap: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: TEXT }}>Default Address</div>
                        <button type="button" onClick={() => setActiveNav('addresses')} style={{ border: 'none', background: 'transparent', color: '#1A4E8D', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                          Manage addresses
                        </button>
                      </div>
                      {defaultAddress ? (
                        <div style={{ display: 'flex', gap: 18, alignItems: 'start' }}>
                          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#AEE8F4', color: '#1A4E8D', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <Home size={22} />
                          </div>
                          <div>
                            <span style={{ display: 'inline-flex', background: '#ECFDF3', color: '#16A34A', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>Default</span>
                            <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.55, color: MUTED }}>{defaultAddress.address_line || 'Address line unavailable.'}</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: MUTED, fontSize: 15 }}>No default address saved.</div>
                      )}
                    </div>
                    <button type="button" onClick={() => setActiveNav('addresses')} style={{ minHeight: 64, border: 'none', background: '#FFFFFF', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: MUTED, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                      {allAddresses.length} saved addresses
                      <ChevronRight size={18} />
                    </button>
                  </section>
                </div>

                <section style={{ display: 'grid', gap: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: TEXT }}>Quick Actions</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 18 }}>
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button key={action.label} type="button" onClick={action.action} style={{ minHeight: 60, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                          <Icon size={19} color={action.color} />
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : null}

            {activeNav === 'orders' ? (
              <section style={{ display: 'grid', gap: 36 }}>
                <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: TEXT }}>Orders</h1>
                <div style={{ display: 'grid', gap: 20 }}>
                  {allOrders.length > 0 ? allOrders.map((order) => orderRow(order, false)) : (
                    <div style={{ borderRadius: 16, border: `1px dashed ${BORDER}`, background: '#FFFFFF', padding: 32, color: MUTED, fontSize: 16 }}>No account-linked orders yet.</div>
                  )}
                </div>
              </section>
            ) : null}

            {activeNav !== 'overview' && activeNav !== 'orders' ? (
              <section style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, display: 'grid', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 54, height: 54, borderRadius: 16, background: '#EAF2FF', color: '#1A4E8D', display: 'grid', placeItems: 'center' }}>
                    <ActiveSectionIcon size={24} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: TEXT }}>{navItems.find((item) => item.id === activeNav)?.label || 'Account'}</h1>
                    <div style={{ marginTop: 6, fontSize: 15, color: MUTED }}>This section keeps the hardened DGFY account behavior from the current master branch.</div>
                  </div>
                </div>
                {activeNav === 'bookings' ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {allBookings.length ? allBookings.map((booking) => (
                      <div key={`desktop-booking-${booking.activity_id || booking.reference}`} style={{ borderRadius: 12, border: `1px solid ${BORDER}`, padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                        <strong>{booking.store_name || 'DGFY Store'}</strong>
                        <span>{booking.reference}</span>
                        <span>{formatDate(booking.occurred_at)}</span>
                      </div>
                    )) : <div style={{ color: MUTED }}>No account-linked bookings yet.</div>}
                  </div>
                ) : null}
                {activeNav === 'addresses' ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {allAddresses.length ? allAddresses.map((address) => (
                      <div key={`desktop-address-${address.address_id}`} style={{ borderRadius: 12, border: `1px solid ${BORDER}`, padding: 16 }}>
                        <strong>{address.label || 'Address'}{address.is_default ? ' - Default' : ''}</strong>
                        <div style={{ marginTop: 6, color: MUTED }}>{address.address_line || 'Address details unavailable.'}</div>
                      </div>
                    )) : <div style={{ color: MUTED }}>No saved locations yet.</div>}
                  </div>
                ) : null}
                {activeNav === 'loyalty' ? (
                  <div style={{ borderRadius: 12, border: `1px solid ${BORDER}`, padding: 18 }}>
                    <div style={{ fontSize: 14, color: MUTED }}>Current balance</div>
                    <div style={{ marginTop: 6, fontSize: 32, fontWeight: 900 }}>{Number(loyalty.balance || 0)}</div>
                  </div>
                ) : null}
                {activeNav === 'account' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                    {[
                      ['Name', accountIdentityName],
                      ['Contact', accountIdentityContact],
                      ['Email status', accountPanel?.me?.is_email_verified ? 'Verified' : 'Unverified'],
                      ['Account scope', 'Global DGFY customer']
                    ].map(([label, value]) => (
                      <div key={label} style={{ borderRadius: 12, border: `1px solid ${BORDER}`, background: '#F8FAFC', padding: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: MUTED, textTransform: 'uppercase' }}>{label}</div>
                        <div style={{ marginTop: 5, fontSize: 16, fontWeight: 800 }}>{value || 'Not available'}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {activeNav === 'business' ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <button type="button" onClick={onRegisterBusiness} style={{ justifySelf: 'start', minHeight: 44, border: 'none', borderRadius: 10, background: '#1A4E8D', color: '#FFFFFF', padding: '0 18px', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
                      Register Your Business
                    </button>
                    {[...ownedCompanies, ...invitedCompanies, ...pendingInvitations].length ? [...ownedCompanies, ...invitedCompanies, ...pendingInvitations].map((company) => (
                      <div key={`desktop-company-${company.membership_id || company.tenant_id}`} style={{ borderRadius: 12, border: `1px solid ${BORDER}`, background: '#F8FAFC', padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                        <div>
                          <strong>{company.company_name || 'Company'}</strong>
                          <div style={{ marginTop: 4, color: MUTED }}>{prettyStatus(company.role)} - {prettyStatus(company.status || company.requires_action || 'active')}</div>
                        </div>
                        {company.can_switch ? (
                          <button type="button" onClick={() => startBusinessAction('switch', company)} style={{ minHeight: 40, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>Open in SKUpervisor</button>
                        ) : null}
                      </div>
                    )) : <div style={{ color: MUTED }}>No companies connected to this DGFY account yet.</div>}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </main>
      </section>
    );
  }

  return (
    <>
      {!isPage && (
        <button
          type="button"
          aria-label="Close customer account page"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2498,
            border: 'none',
            background: 'rgba(15,23,42,0.42)',
            backdropFilter: 'blur(12px)',
            cursor: 'pointer'
          }}
        />
      )}
      <section
        role={isPage ? undefined : 'dialog'}
        aria-modal={isPage ? undefined : true}
        aria-label="My Account"
        style={{
          position: isPage ? 'relative' : 'fixed',
          inset: isPage ? 'auto' : (isMobileViewport ? 0 : 16),
          zIndex: isPage ? 1 : 2499,
          background: SURFACE,
          borderRadius: isPage ? 0 : (isMobileViewport ? 0 : 28),
          border: isPage || isMobileViewport ? 'none' : `1px solid ${BORDER}`,
          boxShadow: isPage ? 'none' : '0 32px 72px rgba(15,23,42,0.16)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          overflow: isPage ? (isMobileViewport ? 'hidden' : 'visible') : 'hidden',
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          minHeight: isPage ? '100vh' : undefined
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            padding: isMobileViewport ? '24px 18px 18px' : '28px 32px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            flexDirection: isMobileViewport ? 'column' : 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 18,
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(18px)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, minWidth: 0 }}>
            <div
              style={{
                width: isMobileViewport ? 56 : 64,
                height: isMobileViewport ? 56 : 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0F6FFF 0%, #0A5BD8 100%)',
                color: '#FFFFFF',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                boxShadow: '0 12px 28px rgba(15,111,255,0.20)'
              }}
            >
              <User size={isMobileViewport ? 24 : 28} strokeWidth={2.2} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: isMobileViewport ? 30 : 32, fontWeight: 700, lineHeight: 1.04, color: TEXT, letterSpacing: '-0.03em' }}>
                My Account
              </h1>
              <div style={{ marginTop: 10, fontSize: isMobileViewport ? 15 : 16, lineHeight: 1.6, color: MUTED, maxWidth: isMobileViewport ? '100%' : 720, overflowWrap: 'anywhere' }}>
                View your orders, bookings, tracking references, saved locations, and loyalty activity across DGFY stores.
              </div>
            </div>
          </div>
          {isPage ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to Discovery"
              style={{
                minHeight: isMobileViewport ? 44 : 48,
                borderRadius: 16,
                border: `1px solid ${BORDER}`,
                background: '#F8FAFC',
                color: TEXT,
                padding: isMobileViewport ? '0 14px' : '0 18px',
                fontSize: isMobileViewport ? 14 : 15,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: isMobileViewport ? '100%' : 'auto',
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap'
              }}
            >
              <ChevronRight size={18} strokeWidth={2.3} style={{ transform: 'rotate(180deg)' }} />
              Back to Discovery
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close customer account page"
              style={{
                width: isMobileViewport ? 48 : 54,
                height: isMobileViewport ? 48 : 54,
                borderRadius: '50%',
                border: `1px solid ${BORDER}`,
                background: '#F8FAFC',
                color: TEXT,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <X size={isMobileViewport ? 22 : 24} strokeWidth={2.3} />
            </button>
          )}
        </header>

        <div
          style={{
            overflowY: 'auto',
            overflowX: 'hidden',
            background: SURFACE,
            padding: isMobileViewport ? '18px 16px 20px' : '24px 32px 28px',
            display: 'grid',
            gap: 24,
            alignContent: 'start',
            width: '100%',
            maxWidth: '100vw',
            boxSizing: 'border-box'
          }}
        >
          <section
            style={{
              borderRadius: 24,
              background: ACCENT_SURFACE,
              border: `1px solid ${BORDER}`,
              padding: isMobileViewport ? 18 : 24,
              display: 'grid',
              gap: 18
            }}
          >
            <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <div style={{ width: isMobileViewport ? 72 : 80, height: isMobileViewport ? 72 : 80, borderRadius: '50%', background: 'linear-gradient(135deg, #EAF2FF 0%, #D9E8FF 100%)', color: PRIMARY, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? 28 : 32, fontWeight: 800, flexShrink: 0 }}>
                  {accountIdentityInitials}
                </div>
                <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setActiveNav('overview')}
                      style={{ border: 'none', background: 'transparent', padding: 0, margin: 0, fontSize: isMobileViewport ? 24 : 28, fontWeight: 700, color: TEXT, lineHeight: 1.08, letterSpacing: '-0.02em', textAlign: 'left', cursor: 'pointer' }}
                    >
                      {accountIdentityName}
                    </button>
                    {Boolean(accountPanel?.me?.is_email_verified) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#EFF6FF', color: PRIMARY, padding: '6px 12px', fontSize: 13, fontWeight: 700 }}>
                        <ShieldCheck size={15} strokeWidth={2.2} />
                        Verified
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: isMobileViewport ? 15 : 16, color: MUTED, lineHeight: 1.5 }}>
                    {accountIdentityContact}
                  </div>
                  <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.65 }}>
                    Use this account to manage your customer activity across participating DGFY storefronts.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 10, alignItems: 'stretch', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onRefresh}
                  style={{ minHeight: 48, borderRadius: 16, border: `1px solid ${PRIMARY}`, background: PRIMARY, color: '#FFFFFF', padding: '0 18px', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <RotateCcw size={16} strokeWidth={2.2} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={onRegisterBusiness}
                  style={{ minHeight: 48, borderRadius: 16, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 18px', fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <Store size={16} strokeWidth={2.1} />
                  Register Your Business
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              {[
                { label: 'Active Orders', value: activeOrderCount, icon: ShoppingBag },
                { label: 'Order History', value: allOrders.length, icon: Ticket },
                { label: 'Bookings', value: allBookings.length, icon: CalendarDays },
                { label: 'Saved Locations', value: allAddresses.length, icon: MapPin }
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} style={{ borderRadius: 20, background: '#FFFFFF', border: `1px solid ${BORDER}`, padding: '16px 18px', display: 'grid', gap: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 14, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                      <Icon size={18} strokeWidth={2.1} />
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: TEXT, lineHeight: 1 }}>{card.value}</div>
                    <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45 }}>{card.label}</div>
                  </div>
                );
              })}
            </div>

            {hasSavedCustomerDetails && (
              <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', justifyContent: 'space-between', gap: 12, alignItems: isMobileViewport ? 'stretch' : 'center', borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.55 }}>
                  Saved details: {maskedSavedCustomerPreview}
                </div>
                <button
                  type="button"
                  onClick={onClearSavedDetails}
                  style={{ minHeight: 44, borderRadius: 16, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 16px', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <Trash2 size={16} strokeWidth={2.2} />
                  Clear saved details
                </button>
              </div>
            )}
          </section>

          <section
            aria-label="DGFY account dashboard navigation"
            style={{
              display: 'grid',
              gridTemplateColumns: isMobileViewport ? '1fr' : '260px minmax(0, 1fr)',
              gap: isMobileViewport ? 14 : 24,
              alignItems: 'start'
            }}
          >
            <aside
              style={{
                borderRadius: 24,
                border: `1px solid ${BORDER}`,
                background: '#FFFFFF',
                boxShadow: '0 18px 42px rgba(15,23,42,0.06)',
                overflow: 'hidden',
                position: isMobileViewport ? 'static' : 'sticky',
                top: isMobileViewport ? 'auto' : 108
              }}
            >
              <div
                style={{
                  padding: '18px 18px 14px',
                  borderBottom: `1px solid ${BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: PRIMARY, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    DGFY Account
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: MUTED, lineHeight: 1.45 }}>
                    Dashboard sections
                  </div>
                </div>
                {isMobileViewport ? (
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen((open) => !open)}
                    aria-expanded={isMobileMenuOpen}
                    aria-label="Toggle account sections"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      border: `1px solid ${BORDER}`,
                      background: SOFT_SURFACE,
                      color: TEXT,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <Menu size={18} strokeWidth={2.2} />
                  </button>
                ) : null}
              </div>
              <nav
                style={{
                  display: isMobileViewport && !isMobileMenuOpen ? 'none' : 'grid',
                  gap: 4,
                  padding: 10
                }}
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const selected = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveNav(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      aria-current={selected ? 'page' : undefined}
                      style={{
                        minHeight: 46,
                        border: 'none',
                        borderLeft: `4px solid ${selected ? PRIMARY : 'transparent'}`,
                        borderRadius: '0 14px 14px 0',
                        background: selected ? '#EAF2FF' : 'transparent',
                        color: selected ? PRIMARY : MUTED,
                        padding: '0 14px',
                        fontSize: 14,
                        fontWeight: selected ? 800 : 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      <Icon size={18} strokeWidth={2.2} />
                      {item.label}
                    </button>
                  );
                })}
                <div style={{ height: 1, background: BORDER, margin: '8px 6px' }} />
                <button
                  type="button"
                  onClick={onHelp}
                  style={{ minHeight: 44, border: 'none', background: 'transparent', color: MUTED, padding: '0 18px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                >
                  <HeadphonesIcon size={18} strokeWidth={2.1} />
                  Contact Support
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  style={{ minHeight: 44, border: 'none', background: 'transparent', color: '#EF4444', padding: '0 18px', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                >
                  <LogOut size={18} strokeWidth={2.2} />
                  Sign out
                </button>
              </nav>
            </aside>

            <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
              <header
                style={{
                  borderRadius: 24,
                  border: `1px solid ${BORDER}`,
                  background: '#FFFFFF',
                  padding: isMobileViewport ? 18 : 22,
                  display: 'flex',
                  alignItems: isMobileViewport ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  boxShadow: '0 18px 42px rgba(15,23,42,0.05)'
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: PRIMARY, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {activeNav === 'overview' ? 'Dashboard' : (navItems.find((item) => item.id === activeNav)?.label || 'Dashboard')}
                  </div>
                  <h2 style={{ margin: '6px 0 0', fontSize: isMobileViewport ? 24 : 28, lineHeight: 1.1, fontWeight: 800, color: TEXT }}>
                    Customer dashboard
                  </h2>
                  <div style={{ marginTop: 8, fontSize: 14, color: MUTED, lineHeight: 1.55 }}>
                    Manage orders, bookings, addresses, loyalty, account details, and business registration from one DGFY account.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    aria-label="Notifications"
                    style={{ width: 42, height: 42, borderRadius: 14, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, color: TEXT, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                  >
                    <Bell size={18} strokeWidth={2.1} />
                  </button>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#EAF2FF', color: PRIMARY, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800 }}>
                    {accountIdentityInitials}
                  </div>
                </div>
              </header>

          {accountPanel?.error ? (
            <div style={{ borderRadius: 18, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B42318', padding: '14px 16px', fontSize: 14, lineHeight: 1.6 }}>
              {accountPanel.error}
            </div>
          ) : null}

          {accountPanel?.loading ? (
            <div style={{ borderRadius: 20, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: '18px 20px', fontSize: 14, color: MUTED }}>
              Loading your customer account data...
            </div>
          ) : null}

          {showOrders && activeOrders.length > 0 && (
            <section style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                  <ShoppingBag size={18} strokeWidth={2.1} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Active Orders</div>
                  <div style={{ fontSize: 14, color: MUTED }}>Your in-progress orders across DGFY stores.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {activeOrders.map((order) => (
                  <div key={`active-order-${order.activity_id || order.reference}`} style={{ borderRadius: 20, background: '#FFFFFF', border: `1px solid ${BORDER}`, padding: '18px 20px', display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{order.store_name || 'DGFY Store'}</div>
                        <div style={{ fontSize: 14, color: MUTED }}>{order.reference} | {prettyStatus(order.status_label || order.status)}</div>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: '#EFF6FF', color: PRIMARY, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>
                        <Clock3 size={14} strokeWidth={2.1} />
                        In progress
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, color: MUTED }}>Placed on {formatDate(order.occurred_at)}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(() => {
                          const allowedActions = order.allowed_actions || {};
                          const actionBusy = accountOrderActionReference === order.reference;
                          return (
                            <>
                        <button
                          type="button"
                          onClick={() => onTrackReference(order.reference)}
                          disabled={customerTrackLoadingReference === order.reference}
                          style={{ minHeight: 42, borderRadius: 14, border: `1px solid ${PRIMARY}`, background: '#FFFFFF', color: PRIMARY, padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: customerTrackLoadingReference === order.reference ? 'wait' : 'pointer' }}
                        >
                          {customerTrackLoadingReference === order.reference ? 'Tracking...' : 'Track'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingCancelOrder(order)}
                          disabled={!allowedActions.cancel || actionBusy}
                          style={{ minHeight: 42, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: !allowedActions.cancel || actionBusy ? 'not-allowed' : 'pointer', opacity: !allowedActions.cancel || actionBusy ? 0.55 : 1 }}
                        >
                          {actionBusy ? 'Working...' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorderOrder?.(order)}
                          disabled={!allowedActions.reorder || actionBusy}
                          style={{ minHeight: 42, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: !allowedActions.reorder || actionBusy ? 'not-allowed' : 'pointer', opacity: !allowedActions.reorder || actionBusy ? 0.55 : 1 }}
                        >
                          {actionBusy ? 'Working...' : 'Reorder'}
                        </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showOrders && (trackedCustomerActivity || customerTrackError) ? (
            <section style={{ borderRadius: 22, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: isMobileViewport ? 18 : 20, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: '#FFFFFF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                  <Clock3 size={18} strokeWidth={2.1} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>Tracked Activity</div>
                  <div style={{ fontSize: 14, color: MUTED }}>Latest tracked reference details from your account.</div>
                </div>
              </div>
              {customerTrackError ? (
                <div style={{ borderRadius: 16, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B42318', padding: '12px 14px', fontSize: 13, lineHeight: 1.5 }}>
                  {customerTrackError}
                </div>
              ) : null}
              {trackedCustomerActivity ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{trackedCustomerActivity.store_name || 'DGFY Store'}</div>
                      <div style={{ fontSize: 14, color: MUTED }}>{trackedCustomerActivity.reference}</div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: '#FFFFFF', border: `1px solid ${BORDER}`, color: TEXT, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>
                      {prettyStatus(trackedCustomerActivity.status_label || trackedCustomerActivity.status)}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {buildTrackSummaryLines(trackedCustomerActivity).map((line, index) => (
                      <div key={`${trackedCustomerActivity.reference}-line-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: TEXT }}>
                        <span>{line.quantity}x {line.name}</span>
                        <span>{money(line.price * line.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          <div style={{ display: ['overview', 'orders', 'bookings', 'addresses', 'loyalty'].includes(activeNav) ? 'grid' : 'none', gridTemplateColumns: isMobileViewport || !showOverview ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 0.85fr)', gap: 24 }}>
            <section style={{ display: showOrders ? 'grid' : 'none', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                  <Ticket size={18} strokeWidth={2.1} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Order History</div>
                  <div style={{ fontSize: 14, color: MUTED }}>Cross-store customer orders linked to your DGFY account.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {allOrders.length === 0 ? (
                  <div style={{ borderRadius: 20, border: `1px dashed ${BORDER}`, background: SOFT_SURFACE, padding: '18px 20px', fontSize: 14, color: MUTED }}>
                    No account-linked orders yet.
                  </div>
                ) : allOrders.map((order) => (
                  <div key={`order-${order.activity_id || order.reference}`} style={{ borderRadius: 20, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: '16px 18px', display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{order.store_name || 'DGFY Store'}</div>
                        <div style={{ fontSize: 13, color: MUTED }}>{order.reference}</div>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: SOFT_SURFACE, color: TEXT, padding: '7px 10px', fontSize: 12, fontWeight: 700 }}>
                        {prettyStatus(order.status_label || order.status)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, color: MUTED }}>{formatDate(order.occurred_at)}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{money(order.total_amount)}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, color: MUTED }}>
                        {String(order.payment_status || '').trim() ? `Payment: ${prettyStatus(order.payment_status)}` : 'Payment details available after checkout.'}
                      </div>
                      <button
                        type="button"
                        onClick={() => onTrackReference(order.reference)}
                        disabled={customerTrackLoadingReference === order.reference}
                        style={{ minHeight: 40, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: customerTrackLoadingReference === order.reference ? 'wait' : 'pointer' }}
                      >
                        {customerTrackLoadingReference === order.reference ? 'Loading...' : 'View status'}
                        <ChevronRight size={14} strokeWidth={2.3} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ display: showBookings || showAddresses || showLoyalty ? 'grid' : 'none', gap: 24 }}>
              <div style={{ display: showBookings ? 'grid' : 'none', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                    <CalendarDays size={18} strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Bookings</div>
                    <div style={{ fontSize: 14, color: MUTED }}>Recent services and bookings under your account.</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {allBookings.length === 0 ? (
                    <div style={{ borderRadius: 20, border: `1px dashed ${BORDER}`, background: SOFT_SURFACE, padding: '18px 20px', fontSize: 14, color: MUTED }}>
                      No account-linked bookings yet.
                    </div>
                  ) : allBookings.slice(0, 5).map((booking) => (
                    <div key={`booking-${booking.activity_id || booking.reference}`} style={{ borderRadius: 20, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: '16px 18px', display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{booking.store_name || 'DGFY Store'}</div>
                      <div style={{ fontSize: 13, color: MUTED }}>{booking.reference}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, color: MUTED }}>{formatDate(booking.occurred_at)}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{prettyStatus(booking.status_label || booking.status)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: showAddresses ? 'grid' : 'none', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                    <MapPin size={18} strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Saved Locations</div>
                    <div style={{ fontSize: 14, color: MUTED }}>Addresses and optional map pins linked to your DGFY customer account.</div>
                  </div>
                </div>
                {typeof onSaveAddress === 'function' ? (
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const saved = await onSaveAddress(addressDraft);
                      if (saved !== false) resetAddressDraft();
                    }}
                    style={{ borderRadius: 20, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: '16px 18px', display: 'grid', gap: 10 }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Add Location</div>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: MUTED }}>
                      Label
                      <input
                        value={addressDraft.label}
                        onChange={(event) => setAddressDraft((previous) => ({ ...previous, label: event.target.value }))}
                        placeholder="Home, Office, Branch"
                        style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '0 12px', fontSize: 14, color: TEXT }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: MUTED }}>
                      Address
                      <textarea
                        value={addressDraft.address_line}
                        onChange={(event) => setAddressDraft((previous) => ({ ...previous, address_line: event.target.value }))}
                        placeholder="Street, barangay, city, province"
                        rows={3}
                        style={{ minHeight: 76, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '10px 12px', fontSize: 14, color: TEXT, resize: 'vertical' }}
                      />
                    </label>
                    {renderPinEditor(addressDraft, setAddressDraft, 'create')}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT, fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={addressDraft.is_default}
                        onChange={(event) => setAddressDraft((previous) => ({ ...previous, is_default: event.target.checked }))}
                      />
                      Make default address
                    </label>
                    <button
                      type="submit"
                      disabled={accountAddressActionId === 'new'}
                      style={{ justifySelf: 'start', minHeight: 40, borderRadius: 14, border: 'none', background: PRIMARY, color: '#FFFFFF', padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: accountAddressActionId === 'new' ? 'wait' : 'pointer', opacity: accountAddressActionId === 'new' ? 0.72 : 1 }}
                    >
                      {accountAddressActionId === 'new' ? 'Saving...' : 'Save Location'}
                    </button>
                  </form>
                ) : null}
                <div style={{ display: 'grid', gap: 12 }}>
                  {allAddresses.length === 0 ? (
                    <div style={{ borderRadius: 20, border: `1px dashed ${BORDER}`, background: SOFT_SURFACE, padding: '18px 20px', fontSize: 14, color: MUTED }}>
                      No saved locations yet.
                    </div>
                  ) : allAddresses.map((address) => {
                    const label = String(address.label || 'Address').trim() || 'Address';
                    const labelText = address.is_default ? `${label} - Default` : label;
                    const isEditing = editingAddressId === address.address_id;
                    const addressBusy = accountAddressActionId === String(address.address_id);
                    return (
                    <div key={`address-${address.address_id}`} style={{ borderRadius: 20, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: '16px 18px', display: 'grid', gap: 8 }}>
                      {isEditing ? (
                        <form
                          onSubmit={async (event) => {
                            event.preventDefault();
                            const saved = await onSaveAddress?.(editingAddressDraft, address);
                            if (saved !== false) cancelEditAddress();
                          }}
                          style={{ display: 'grid', gap: 10 }}
                        >
                          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: MUTED }}>
                            Label
                            <input
                              value={editingAddressDraft.label}
                              onChange={(event) => setEditingAddressDraft((previous) => ({ ...previous, label: event.target.value }))}
                              style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '0 12px', fontSize: 14, color: TEXT }}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: MUTED }}>
                            Address
                            <textarea
                              value={editingAddressDraft.address_line}
                              onChange={(event) => setEditingAddressDraft((previous) => ({ ...previous, address_line: event.target.value }))}
                              rows={3}
                              style={{ minHeight: 76, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '10px 12px', fontSize: 14, color: TEXT, resize: 'vertical' }}
                            />
                          </label>
                          {renderPinEditor(editingAddressDraft, setEditingAddressDraft, 'edit')}
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT, fontWeight: 700 }}>
                            <input
                              type="checkbox"
                              checked={editingAddressDraft.is_default}
                              onChange={(event) => setEditingAddressDraft((previous) => ({ ...previous, is_default: event.target.checked }))}
                            />
                            Make default address
                          </label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="submit"
                              disabled={addressBusy}
                              style={{ minHeight: 38, borderRadius: 14, border: 'none', background: PRIMARY, color: '#FFFFFF', padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: addressBusy ? 'wait' : 'pointer', opacity: addressBusy ? 0.72 : 1 }}
                            >
                              {addressBusy ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditAddress}
                              disabled={addressBusy}
                              style={{ minHeight: 38, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: addressBusy ? 'wait' : 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{labelText}</div>
                            {address.is_default ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#EFF6FF', color: PRIMARY, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>
                                Default
                              </span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 14, lineHeight: 1.6, color: MUTED }}>{address.address_line || 'Address details unavailable.'}</div>
                          {address.latitude != null && address.longitude != null ? (
                            <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY }}>
                              Pinned at {Number(address.latitude).toFixed(6)}, {Number(address.longitude).toFixed(6)}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: MUTED }}>No map pin saved for this address.</div>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {typeof onUseAddressForCheckout === 'function' ? (
                              <button
                                type="button"
                                onClick={() => onUseAddressForCheckout(address)}
                                style={{ minHeight: 38, borderRadius: 14, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, color: PRIMARY, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Use for Checkout
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => startEditAddress(address)}
                              disabled={addressBusy}
                              style={{ minHeight: 38, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: addressBusy ? 'wait' : 'pointer' }}
                            >
                              Edit
                            </button>
                            {!address.is_default && typeof onSetDefaultAddress === 'function' ? (
                              <button
                                type="button"
                                onClick={() => onSetDefaultAddress(address)}
                                disabled={addressBusy}
                                style={{ minHeight: 38, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: addressBusy ? 'wait' : 'pointer' }}
                              >
                                Set Default
                              </button>
                            ) : null}
                            {typeof onDeleteAddress === 'function' ? (
                              <button
                                type="button"
                                onClick={() => onDeleteAddress(address)}
                                disabled={addressBusy}
                                style={{ minHeight: 38, borderRadius: 14, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B42318', padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: addressBusy ? 'wait' : 'pointer' }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: showLoyalty ? 'grid' : 'none', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                    <Zap size={18} strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Loyalty</div>
                    <div style={{ fontSize: 14, color: MUTED }}>Read-only balance from your DGFY customer activity.</div>
                  </div>
                </div>
                <div style={{ borderRadius: 20, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: '18px 20px', display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, color: MUTED }}>Current balance</div>
                      <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800, color: TEXT }}>{Number(loyalty.balance || 0)}</div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#FFFFFF', border: `1px solid ${BORDER}`, color: PRIMARY, padding: '7px 10px', fontSize: 12, fontWeight: 700 }}>
                      <Star size={13} strokeWidth={2.1} />
                      Loyalty points
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {loyaltyTransactions.length === 0 ? (
                      <div style={{ fontSize: 14, color: MUTED }}>No loyalty transactions yet.</div>
                    ) : loyaltyTransactions.map((entry, index) => (
                      <div key={`loyalty-${entry.id || index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 14 }}>
                        <div>
                          <div style={{ color: TEXT, fontWeight: 700 }}>{prettyStatus(entry.reason || 'activity')}</div>
                          <div style={{ color: MUTED, marginTop: 2 }}>{formatDate(entry.created_at)}</div>
                        </div>
                        <div style={{ color: Number(entry.points_delta || 0) >= 0 ? '#15803D' : '#B42318', fontWeight: 700 }}>
                          {Number(entry.points_delta || 0) >= 0 ? '+' : ''}{Number(entry.points_delta || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {activeNav === 'account' ? (
            <section style={{ borderRadius: 24, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: isMobileViewport ? 18 : 24, display: 'grid', gap: 18, boxShadow: '0 18px 42px rgba(15,23,42,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 16, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                  <User size={20} strokeWidth={2.2} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>Profile Overview</div>
                  <div style={{ marginTop: 4, fontSize: 14, color: MUTED }}>Your DGFY identity used across participating storefronts.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                {[
                  ['Name', accountIdentityName],
                  ['Contact', accountIdentityContact],
                  ['Email status', accountPanel?.me?.is_email_verified ? 'Verified' : 'Unverified'],
                  ['Account scope', 'Global DGFY customer']
                ].map(([label, value]) => (
                  <div key={label} style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: '14px 16px', display: 'grid', gap: 5 }}>
                    <div style={{ fontSize: 12, color: MUTED, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
                    <div style={{ fontSize: 15, color: TEXT, fontWeight: 700, lineHeight: 1.45 }}>{value || 'Not available'}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: '#F8FAFC', padding: '14px 16px', fontSize: 14, lineHeight: 1.6, color: MUTED }}>
                DGFY account activity only shows orders, bookings, addresses, and loyalty events explicitly linked to this account. Guest history is not auto-adopted by email or phone.
              </div>
            </section>
          ) : null}

          {activeNav === 'business' ? (
            <section style={{ borderRadius: 24, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: isMobileViewport ? 20 : 28, display: 'grid', gap: 20, boxShadow: '0 18px 42px rgba(15,23,42,0.05)' }}>
              <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', alignItems: isMobileViewport ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 18, background: '#EAF2FF', color: PRIMARY, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Store size={26} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div style={{ fontSize: isMobileViewport ? 24 : 26, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>Your businesses</div>
                    <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.55, color: MUTED }}>
                      Manage companies connected to this DGFY account and accept invitations sent from IMS.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRegisterBusiness}
                  style={{ minHeight: 44, borderRadius: 14, border: 'none', background: PRIMARY, color: '#FFFFFF', padding: '0 18px', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', width: isMobileViewport ? '100%' : 'auto' }}
                >
                  <Store size={16} strokeWidth={2.2} />
                  Register Your Business
                </button>
              </div>

              {businessActionError ? (
                <div style={{ borderRadius: 14, border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>
                  {businessActionError}
                </div>
              ) : null}

              {pendingInvitations.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending invitations</div>
                  {pendingInvitations.map((company) => (
                    <div key={`pending-${company.membership_id}`} style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: ACCENT_SURFACE, padding: 16, display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, overflowWrap: 'anywhere' }}>{company.company_name || 'Company invitation'}</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: MUTED }}>Role: {prettyStatus(company.role)} · Invitation from IMS</div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => startBusinessAction('reject', company)}
                          disabled={businessActionLoading}
                          style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#991B1B', padding: '0 14px', fontSize: 13, fontWeight: 800, cursor: businessActionLoading ? 'not-allowed' : 'pointer' }}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => startBusinessAction('accept', company)}
                          disabled={businessActionLoading}
                          style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 13, fontWeight: 800, cursor: businessActionLoading ? 'not-allowed' : 'pointer' }}
                        >
                          Accept invitation
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {businessStepUpAction ? (
                <div style={{ borderRadius: 18, border: '1px solid #BFDBFE', background: '#EFF6FF', padding: 16, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={20} color="#1D4ED8" />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1E3A8A' }}>Email security check</div>
                      <div style={{ marginTop: 3, fontSize: 13, color: '#1D4ED8' }}>{businessOtpSent ? 'Enter the 6-digit code sent to your DGFY email.' : 'Sending security code...'}</div>
                    </div>
                  </div>
                  <input
                    value={businessEmailOtpCode}
                    onChange={(event) => setBusinessEmailOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="000000"
                    style={{ minHeight: 44, borderRadius: 12, border: '1px solid #93C5FD', background: '#FFFFFF', color: TEXT, padding: '0 12px', fontSize: 16, fontWeight: 800, letterSpacing: '0.18em', outline: 'none', maxWidth: 220 }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => { setBusinessStepUpAction(null); setBusinessEmailOtpCode(''); setBusinessActionError(''); }}
                      style={{ minHeight: 40, borderRadius: 12, border: '1px solid #BFDBFE', background: '#FFFFFF', color: '#1E40AF', padding: '0 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitBusinessStepUpAction}
                      disabled={businessActionLoading}
                      style={{ minHeight: 40, borderRadius: 12, border: 'none', background: '#1D4ED8', color: '#FFFFFF', padding: '0 16px', fontSize: 13, fontWeight: 800, cursor: businessActionLoading ? 'not-allowed' : 'pointer' }}
                    >
                      {businessActionLoading ? 'Verifying...' : 'Verify and continue'}
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Companies you own</div>
                {ownedCompanies.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    {ownedCompanies.map((company) => (
                      <div key={`owned-${company.membership_id}`} style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: 16, display: 'grid', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, overflowWrap: 'anywhere' }}>{company.company_name || 'Company'}</div>
                          <div style={{ marginTop: 4, fontSize: 13, color: MUTED }}>{prettyStatus(company.role)} · {prettyStatus(company.plan)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startBusinessAction('switch', company)}
                          style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                        >
                          Open in SKUpervisor
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: 16, fontSize: 14, lineHeight: 1.55, color: MUTED }}>
                    No companies owned by this DGFY account yet.
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Companies you were invited to</div>
                {invitedCompanies.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    {invitedCompanies.map((company) => (
                      <div key={`invited-${company.membership_id}`} style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: 16, display: 'grid', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, overflowWrap: 'anywhere' }}>{company.company_name || 'Company'}</div>
                          <div style={{ marginTop: 4, fontSize: 13, color: MUTED }}>{prettyStatus(company.role)} | Member</div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {company.can_leave === true ? (
                            <button
                              type="button"
                              onClick={() => startBusinessAction('leave', company)}
                              disabled={businessActionLoading}
                              style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: '#991B1B', padding: '0 14px', fontSize: 13, fontWeight: 800, cursor: businessActionLoading ? 'not-allowed' : 'pointer' }}
                            >
                              Leave company
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => startBusinessAction('switch', company)}
                            style={{ minHeight: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                          >
                            Open in SKUpervisor
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: 16, fontSize: 14, lineHeight: 1.55, color: MUTED }}>
                    No accepted invitation memberships yet.
                  </div>
                )}
              </div>
            </section>
          ) : null}
            </div>
          </section>
        </div>

        <footer
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            borderTop: `1px solid ${BORDER}`,
            padding: isMobileViewport ? '14px 16px' : '16px 32px',
            display: isMobileViewport ? 'flex' : 'none',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(14px)'
          }}
        >
          <button
            type="button"
            onClick={onSignOut}
            style={{ border: 'none', background: 'transparent', padding: 0, color: '#EF4444', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <LogOut size={18} strokeWidth={2.2} />
            Sign out
          </button>
          <button
            type="button"
            onClick={onHelp}
            style={{ border: 'none', background: 'transparent', padding: 0, color: TEXT, fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <HelpCircle size={18} strokeWidth={2.1} />
            Need help?
          </button>
        </footer>
      </section>
      {pendingCancelOrder ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm order cancellation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2600,
            display: 'grid',
            placeItems: 'center',
            padding: 18,
            background: 'rgba(15,23,42,0.42)'
          }}
        >
          <div style={{ width: 'min(100%, 460px)', borderRadius: 22, border: `1px solid ${BORDER}`, background: '#FFFFFF', boxShadow: '0 28px 70px rgba(15,23,42,0.24)', padding: 22, display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Cancel this order?</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: MUTED }}>
              This will send a cancellation request for {pendingCancelOrder.reference}. Orders can only be cancelled before preparation starts.
            </div>
            <div style={{ borderRadius: 16, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, padding: '12px 14px', display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{pendingCancelOrder.store_name || 'DGFY Store'}</div>
              <div style={{ fontSize: 13, color: MUTED }}>{prettyStatus(pendingCancelOrder.status_label || pendingCancelOrder.status)} | {formatDate(pendingCancelOrder.occurred_at)}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setPendingCancelOrder(null)}
                style={{ minHeight: 42, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={() => {
                  const order = pendingCancelOrder;
                  setPendingCancelOrder(null);
                  onCancelOrder?.(order);
                }}
                style={{ minHeight: 42, borderRadius: 14, border: '1px solid #FECACA', background: '#DC2626', color: '#FFFFFF', padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default DgfyCustomerAccountPage;
