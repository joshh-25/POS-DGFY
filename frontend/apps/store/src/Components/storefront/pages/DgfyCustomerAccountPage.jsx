import React from 'react';
import { useState } from 'react';
import {
  Award,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  HeadphonesIcon,
  Home,
  HelpCircle,
  LogOut,
  MapPin,
  Menu,
  Package,
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
                    <div style={{ fontSize: isMobileViewport ? 24 : 28, fontWeight: 700, color: TEXT, lineHeight: 1.08, letterSpacing: '-0.02em' }}>
                      {accountIdentityName}
                    </div>
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
                    {navItems.find((item) => item.id === activeNav)?.label || 'Overview'}
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
            <section style={{ borderRadius: 24, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: isMobileViewport ? 20 : 28, display: 'grid', gap: 18, textAlign: 'center', justifyItems: 'center', boxShadow: '0 18px 42px rgba(15,23,42,0.05)' }}>
              <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#EAF2FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                <Store size={34} strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ fontSize: isMobileViewport ? 24 : 28, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>Register your business</div>
                <div style={{ marginTop: 10, maxWidth: 560, fontSize: 15, lineHeight: 1.65, color: MUTED }}>
                  Use this DGFY account to create and manage your business profile. Company registration remains separate from customer login.
                </div>
              </div>
              <button
                type="button"
                onClick={onRegisterBusiness}
                style={{ minHeight: 48, borderRadius: 16, border: 'none', background: PRIMARY, color: '#FFFFFF', padding: '0 22px', fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
              >
                <Store size={17} strokeWidth={2.2} />
                Register Your Business
              </button>
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
