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
  Check,
  CheckCircle2,
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
  Award
} from 'lucide-react';

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
  onOpenBusinessInventory,
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
  const [addressDraft, setAddressDraft] = useState({ label: 'Home', address_line: '', latitude: null, longitude: null, is_default: false });
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [editingAddressDraft, setEditingAddressDraft] = useState({ label: '', address_line: '', latitude: null, longitude: null, is_default: false });

  useEffect(() => {
    if (isMobileViewport) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  }, [activeNav, isMobileViewport]);

  const NAV_ITEMS = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'addresses', label: 'Addresses', icon: MapPin },
    { id: 'loyalty', label: 'Loyalty', icon: Award },
    { id: 'account', label: 'Account', icon: User },
    { id: 'business', label: 'Business', icon: Store }
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
          <div><h2 style={{ margin: 0, fontSize: isMobileViewport ? 20 : 24 }}>Your businesses</h2><p style={{ margin: '6px 0 0', color: THEME.muted }}>Manage companies and invitations connected to this DGFY account.</p></div>
          <button type="button" onClick={onRegisterBusiness} style={{ border: 0, borderRadius: 10, background: THEME.primary, color: '#fff', minHeight: 42, padding: '0 16px', fontWeight: 700, cursor: 'pointer' }}>Register New Company</button>
        </div>
        {businessActionError ? <div role="alert" style={{ borderRadius: 10, background: '#FEF2F2', color: '#991B1B', padding: 12 }}>{businessActionError}</div> : null}
        {pending.length > 0 ? <section style={{ display: 'grid', gap: 10 }}><strong>Pending invitations</strong>{pending.map((company) => <div key={`invite-${company.membership_id}`} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, background: THEME.infoBg, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{company.company_name || company.name || 'Company invitation'}</strong><div style={{ marginTop: 4, color: THEME.muted, fontSize: 13 }}>Invitation from IMS</div></div><div style={{ display: 'flex', gap: 8 }}><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('reject', company)}>Reject</button><button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('accept', company)}>Accept</button></div></div>)}</section> : null}
        {businessStepUpAction ? <section style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}><strong>Email security check</strong><span style={{ color: THEME.muted, fontSize: 13 }}>Enter the 6-digit code sent to your DGFY email.</span><input inputMode="numeric" value={businessEmailOtpCode} onChange={(event) => setBusinessEmailOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} aria-label="Business security code" /><div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setBusinessStepUpAction(null)}>Cancel</button><button type="button" disabled={businessActionLoading} onClick={submitBusinessStepUpAction}>Verify and continue</button></div></section> : null}
        {accepted.length > 0 ? <div style={{ display: 'grid', gap: 14 }}>{accepted.map((company) => { const name=company.company_name || company.name || 'Business'; const owned=company.is_owner === true || company.membership_type === 'owner' || company.role === 'owner'; return <article key={`company-${company.membership_id || company.tenant_id}`} style={{ border: `1px solid ${THEME.border}`, borderRadius: 18, overflow: 'hidden', background: '#fff' }}><div style={{ height: isMobileViewport ? 72 : 104, background: 'linear-gradient(135deg,#1A4E8D,#4F8CC9,#AEE8F4)' }} /><div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><div><div style={{ fontSize: 18, fontWeight: 800 }}>{name}</div><div style={{ marginTop: 4, color: THEME.muted, fontSize: 13 }}>{owned ? 'Company you own' : 'Company membership'}</div></div><div style={{ display: 'flex', gap: 8 }} >{!owned && company.can_leave !== false ? <button type="button" disabled={businessActionLoading} onClick={() => startBusinessAction('leave', company)}>Leave</button> : null}<button type="button" disabled={businessActionLoading} onClick={() => company.tenant_id ? startBusinessAction('switch', company) : onOpenBusinessInventory?.(company)}>Go to Inventory</button></div></div></article>; })}</div> : <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 16, padding: 28, textAlign: 'center' }}><Store size={36} color={THEME.primary} /><h3>No registered business yet</h3><p style={{ color: THEME.muted }}>Register a business or accept an IMS invitation.</p></div>}
      </div>
    );
  };
  // --- SECTIONS ---

  const renderOverview = () => (
    <div style={{ display: 'grid', gap: isMobileViewport ? 18 : 24 }}>
      
      {/* 1. Profile Header Section */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1.5fr 1fr', gap: isMobileViewport ? 16 : 24 }}>
        
        {/* Profile Card */}
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobileViewport ? 14 : 20, flexDirection: isMobileViewport ? 'column' : 'row' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 14 : 20 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: isMobileViewport ? 60 : 80, height: isMobileViewport ? 60 : 80, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? 22 : 28, fontWeight: 800 }}>
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
                <div style={{ fontSize: isMobileViewport ? 18 : 24, fontWeight: 700, color: THEME.text, lineHeight: 1.2 }}>{accountIdentityName}</div>
                {Boolean(accountPanel?.me?.is_email_verified) && (
                  <span style={{ background: THEME.primary, color: '#FFF', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={10} /> Verified
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 10 : 16, color: THEME.muted, fontSize: isMobileViewport ? 13 : 14, flexWrap: 'wrap' }}>
                {overviewPhone ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={16} /> {overviewPhone}
                  </span>
                ) : null}
                {overviewEmail ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={16} /> {overviewEmail}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button onClick={() => setActiveNav('account')} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: isMobileViewport ? '10px 14px' : '8px 16px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, width: isMobileViewport ? '100%' : 'auto' }}>
            <Edit size={14} /> Edit Profile
          </button>
        </div>

        {/* Register Business Card */}
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow 200ms', flexDirection: isMobileViewport ? 'column' : 'row', gap: isMobileViewport ? 14 : 20 }} onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'} onMouseOut={e => e.currentTarget.style.boxShadow = 'none'} onClick={onRegisterBusiness}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 14 : 20 }}>
            <div style={{ width: isMobileViewport ? 48 : 64, height: isMobileViewport ? 48 : 64, borderRadius: isMobileViewport ? 14 : 16, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Store size={isMobileViewport ? 24 : 32} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>Grow your business</div>
              <div style={{ fontSize: isMobileViewport ? 13 : 14, color: THEME.muted, lineHeight: 1.4 }}>Register your business on DGFY and unlock more opportunities.</div>
            </div>
          </div>
          <ChevronRight size={isMobileViewport ? 20 : 24} color={THEME.text} style={{ flexShrink: 0, alignSelf: isMobileViewport ? 'flex-end' : 'center' }} />
        </div>

      </div>

      {/* 2. Summary Statistics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, 1fr)', gap: isMobileViewport ? 12 : 16 }}>
        {[
          { label: 'Active Orders', value: activeOrderCount, icon: ShoppingBag, color: THEME.success, bg: THEME.successBg, link: 'View all', action: () => setActiveNav('orders') },
          { label: 'Past Orders', value: allOrders.length, icon: Package, color: THEME.info, bg: THEME.infoBg, link: 'View all', action: () => setActiveNav('orders') },
          { label: 'Bookings', value: allBookings.length, icon: CalendarDays, color: THEME.purple, bg: THEME.purpleBg, link: 'View all', action: () => setActiveNav('bookings') },
          { label: 'Addresses', value: allAddresses.length, icon: MapPin, color: THEME.orange, bg: THEME.orangeBg, link: 'Manage', action: () => setActiveNav('addresses') },
          { label: 'Loyalty Points', value: loyalty.balance, icon: Award, color: THEME.success, bg: THEME.successBg, link: 'View details', action: () => setActiveNav('loyalty') }
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} style={{ background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? '12px' : '16px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 10 : 12, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: isMobileViewport ? 18 : 22, fontWeight: 700, color: THEME.text, lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: isMobileViewport ? 11 : 12, color: THEME.muted, marginTop: 4, lineHeight: 1.35 }}>{stat.label}</div>
                </div>
                <div style={{ width: isMobileViewport ? 34 : 40, height: isMobileViewport ? 34 : 40, borderRadius: 10, background: stat.bg, color: stat.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={isMobileViewport ? 17 : 20} />
                </div>
              </div>
              <div style={{ fontSize: isMobileViewport ? 11 : 12, fontWeight: 600, color: THEME.primary, cursor: 'pointer', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={stat.action}>
                {stat.link} <ChevronRight size={14} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Main Dashboard & Utility Panel Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '2fr 1fr', gap: 24 }}>
        
        {/* Activity Tabs Section */}
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${THEME.border}`, padding: '0 24px' }}>
            {[
              { id: 'active_orders', label: 'Active Orders', icon: ShoppingBag },
              { id: 'upcoming_bookings', label: 'Upcoming Bookings', icon: CalendarDays },
              { id: 'need_reviews', label: 'Need Reviews', icon: Star }
            ].map(tab => {
              const isActive = activeActivityTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveActivityTab(tab.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? `2px solid ${THEME.primary}` : '2px solid transparent',
                    color: isActive ? THEME.primary : THEME.muted,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    padding: '20px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    transition: 'all 200ms'
                  }}
                >
                  <Icon size={16} /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ padding: 24, flex: 1 }}>
            {activeActivityTab === 'active_orders' && (
              <div style={{ display: 'grid', gap: 16 }}>
                {activeOrders.length === 0 ? (
                  <EmptyState title="No active orders" desc="You don't have any orders in progress right now." />
                ) : (
                  activeOrders.slice(0, 3).map((order) => (
                    <div key={order.reference} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: `1px solid ${THEME.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: THEME.text, color: '#FFF', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>
                          {order.store_name ? order.store_name.substring(0,4).toUpperCase() : 'STORE'}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text }}>{order.store_name || 'DGFY Store'}</div>
                          <div style={{ fontSize: 13, color: THEME.muted }}>{order.reference}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <StatusBadge status={order.status_label || order.status} />
                        <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>Placed on {formatDate(order.occurred_at)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button 
                          onClick={() => onTrackReference(order)}
                          style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: THEME.primary, cursor: 'pointer' }}
                        >
                          Track
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveNav('orders')}
                          style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: THEME.muted, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <ChevronRight size={16} color={THEME.muted} />
                      </div>
                    </div>
                  ))
                )}
                <div style={{ textAlign: 'center', marginTop: 8 }}>
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
                <EmptyState title="No pending reviews" desc="You have reviewed all your eligible orders." />
              </div>
            )}
          </div>
        </div>

        {/* Right Utility Panel */}
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
                  <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text, marginBottom: 4 }}>
                    {defaultAddress.label || 'Address'}{defaultAddress.is_default ? ' - Default' : ''}
                  </div>
                  <span style={{ background: THEME.successBg, color: THEME.success, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginBottom: 4, display: 'inline-block' }}>Default</span>
                  <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.5 }}>
                    {defaultAddress.address_line || 'Address line unavailable.'}
                  </div>
                  {onUseAddressForCheckout ? (
                    <button type="button" onClick={() => onUseAddressForCheckout(defaultAddress)} style={{ marginTop: 10 }}>
                      Use for Checkout
                    </button>
                  ) : null}
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

      </div>

      {/* 4. Quick Actions */}
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

    </div>
  );

  const renderOrders = () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Orders</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {allOrders.length === 0 ? (
          <EmptyState title="No orders found" desc="You don't have any past or active orders." />
        ) : allOrders.map((order) => (
          <div key={`all-order-${order.reference}`} style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.info, display: 'grid', placeItems: 'center' }}>
                <Package size={24} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>{order.store_name || 'DGFY Store'}</div>
                <div style={{ fontSize: 13, color: THEME.muted }}>{order.reference} â€¢ {formatDate(order.occurred_at)}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>{money(order.total_amount)}</div>
              <StatusBadge status={order.status_label || order.status} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => onTrackReference(order)} disabled={customerTrackLoadingReference === order.reference} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: customerTrackLoadingReference === order.reference ? 'wait' : 'pointer' }}>
                {customerTrackLoadingReference === order.reference ? 'Loading...' : 'Track'}
              </button>
              <button onClick={() => onTrackReference(order)} style={{ background: THEME.primary, border: 'none', color: '#FFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                View Receipt
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

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
                <div style={{ fontSize: 13, color: THEME.muted }}>{booking.reference} â€¢ {formatDate(booking.occurred_at)}</div>
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

  const renderAddresses = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <div><h2 style={{ margin: 0, fontSize: isMobileViewport ? 20 : 24 }}>Saved Locations</h2><p style={{ margin: '6px 0 0', color: THEME.muted }}>Locations saved here are available during checkout and booking.</p></div>
      {typeof onSaveAddress === 'function' ? <form onSubmit={async (event) => { event.preventDefault(); if (await onSaveAddress(addressDraft)) setAddressDraft({ label: 'Home', address_line: '', latitude: null, longitude: null, is_default: false }); }} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
        <strong>Add Location</strong>
        <input value={addressDraft.label} onChange={(event) => setAddressDraft((previous) => ({ ...previous, label: event.target.value }))} placeholder="Label, e.g. Home" />
        <textarea value={addressDraft.address_line} onChange={(event) => setAddressDraft((previous) => ({ ...previous, address_line: event.target.value }))} placeholder="Street, barangay, city, province" rows={3} />
        {renderAddressPinEditor?.({ draft: addressDraft, onChange: setAddressDraft, mode: 'create' })}
        <label><input type="checkbox" checked={addressDraft.is_default} onChange={(event) => setAddressDraft((previous) => ({ ...previous, is_default: event.target.checked }))} /> Make default address</label>
        <button type="submit" disabled={accountAddressActionId === 'new'} style={{ justifySelf: 'start' }}>{accountAddressActionId === 'new' ? 'Saving...' : 'Save Location'}</button>
      </form> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {allAddresses.length === 0 ? <EmptyState title="No addresses saved" desc="Add an address for faster checkout." /> : allAddresses.map((address) => {
          const isEditing = editingAddressId === address.address_id;
          const busy = accountAddressActionId === String(address.address_id);
          if (isEditing) return <form key={`edit-${address.address_id}`} onSubmit={async (event) => { event.preventDefault(); if (await onSaveAddress?.(editingAddressDraft, address)) setEditingAddressId(null); }} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 16, display: 'grid', gap: 10 }}><input value={editingAddressDraft.label} onChange={(event) => setEditingAddressDraft((previous) => ({ ...previous, label: event.target.value }))} /><textarea rows={3} value={editingAddressDraft.address_line} onChange={(event) => setEditingAddressDraft((previous) => ({ ...previous, address_line: event.target.value }))} />{renderAddressPinEditor?.({ draft: editingAddressDraft, onChange: setEditingAddressDraft, mode: `edit-${address.address_id}` })}<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setEditingAddressId(null)}>Cancel</button><button type="submit" disabled={busy}>Save Changes</button></div></form>;
          return <article key={`addr-${address.address_id}`} style={{ border: `1px solid ${THEME.border}`, borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><MapPin size={18} color={THEME.primary} /><strong>{address.label || 'Address'}</strong>{address.is_default ? <span style={{ color: THEME.success, fontSize: 12 }}>Default</span> : null}</div><div style={{ marginTop: 8, color: THEME.muted }}>{address.address_line}</div></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{onUseAddressForCheckout ? <button type="button" onClick={() => onUseAddressForCheckout(address)}>Use for Checkout</button> : null}<button type="button" onClick={() => { setEditingAddressId(address.address_id); setEditingAddressDraft({ label: address.label || 'Address', address_line: address.address_line || '', latitude: address.latitude, longitude: address.longitude, is_default: address.is_default === true }); }}>Edit</button>{!address.is_default ? <button type="button" disabled={busy} onClick={() => onSetDefaultAddress?.(address)}>Set Default</button> : null}<button type="button" disabled={busy} onClick={() => onDeleteAddress?.(address)}>Remove</button></div></article>;
        })}
      </div>
    </div>
  );
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
      <h2 style={{ fontSize: 28, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Account Settings</h2>
      
      {/* Container 1: Profile Overview */}
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Profile Overview</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 100, height: 100, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: 36, fontWeight: 800 }}>
                {accountIdentityInitials}
              </div>
              <div style={{ position: 'absolute', bottom: 4, right: 4, width: 28, height: 28, borderRadius: '50%', background: THEME.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '3px solid #FFF' }}>
                <Check size={16} strokeWidth={4} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: THEME.text }}>{accountIdentityName}</div>
                {Boolean(accountPanel?.me?.is_email_verified) && (
                  <div style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={14} /> Verified Customer
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.muted, fontSize: 14 }}>
                  <Phone size={16} /> {accountIdentityContact?.split(' | ')[0] || '+63 *** *** ****'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.muted, fontSize: 14 }}>
                  <Mail size={16} /> {accountIdentityContact?.split(' | ')[1] || 'customer@email.com'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => alert('Editing profile is coming soon.')} style={{ background: 'transparent', border: `1px solid ${THEME.primary}`, color: THEME.primary, borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Edit2 size={16} /> Edit Profile
          </button>
        </div>
      </div>

      {/* Container 2: Contact Information */}
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Contact Information</h3>
        <div style={{ display: 'grid', gap: 16 }}>
          
          {/* Email Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center' }}>
                <Mail size={24} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: THEME.text, fontWeight: 700, marginBottom: 4 }}>Email Address</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: THEME.text }}>{accountIdentityContact?.split(' | ')[1] || 'customer@email.com'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              {Boolean(accountPanel?.me?.is_email_verified) ? (
                <span style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Verified <CheckCircle2 size={14} />
                </span>
              ) : (
                <span style={{ background: '#FFF3E0', color: '#E65100', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Unverified
                </span>
              )}
              <button onClick={() => alert('Change email flow initiated.')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Change <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Phone Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center' }}>
                <Phone size={24} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: THEME.text, fontWeight: 700, marginBottom: 4 }}>Phone Number</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: THEME.text }}>{accountIdentityContact?.split(' | ')[0] || '+63 *** *** ****'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <span style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                Verified <CheckCircle2 size={14} />
              </span>
              <button onClick={() => alert('Change phone flow initiated.')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Change <ChevronRight size={16} />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Container 3: Security */}
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Security</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0px 0px 8px 0px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center' }}>
              <Lock size={24} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: THEME.text, fontWeight: 700 }}>Password</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: THEME.text, marginTop: 4, letterSpacing: 2, lineHeight: 1 }}>â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢</div>
            </div>
          </div>
          <button onClick={() => alert('Change password flow initiated.')} style={{ background: 'transparent', border: 'none', color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            Change Password <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2499, minHeight: '100vh', background: THEME.bg, display: 'flex', fontFamily: "'Inter', sans-serif" }}>
      
      {/* --- LEFT NAVIGATION SIDEBAR --- */}
      <aside style={{ 
        width: 260, 
        background: THEME.surface, 
        borderRight: `1px solid ${THEME.border}`, 
        display: isMobileViewport && !isMobileMenuOpen ? 'none' : 'flex', 
        flexDirection: 'column',
        position: isMobileViewport ? 'fixed' : 'relative',
        inset: isMobileViewport ? 0 : 'auto',
        zIndex: 50
      }}>
        {/* Logo Area */}
        <div style={{ height: 72, padding: '0 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', borderBottom: `1px solid ${THEME.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/dgfy-logo.png" alt="DGFY Logo" style={{ height: 28 }} />
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
                <Icon size={20} /> {item.label}
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        
        {/* Header Shell */}
        <header style={{ height: 72, background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', position: 'sticky', top: 0, zIndex: 30, flexShrink: 0 }}>
          
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
              <div style={{ position: 'absolute', top: 44, right: isMobileViewport ? -72 : 92, width: isMobileViewport ? 'min(320px, calc(100vw - 24px))' : 360, maxHeight: 420, overflow: 'hidden', border: `1px solid ${THEME.border}`, borderRadius: 8, background: THEME.surface, boxShadow: '0 18px 40px rgba(15,23,42,.16)', zIndex: 60 }}>
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
        <main style={{ padding: isMobileViewport ? 16 : 40, maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <h1 style={{ margin: '0 0 18px', fontSize: isMobileViewport ? 24 : 30, lineHeight: 1.15, color: THEME.text }}>
            My Account
          </h1>
          {activeNav === 'overview' && renderOverview()}
          {activeNav === 'orders' && renderOrders()}
          {activeNav === 'bookings' && renderBookings()}
          {activeNav === 'addresses' && renderAddresses()}
          {activeNav === 'loyalty' && renderLoyalty()}
          {activeNav === 'account' && renderAccount()}
          {activeNav === 'business' && renderBusiness()}
        </main>

      </div>
    </div>
  );
}

export default DgfyCustomerAccountPage;
