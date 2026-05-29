import React from 'react';
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  HelpCircle,
  LogOut,
  MapPin,
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
  onClose,
  onRefresh,
  onTrackReference,
  onSignOut,
  onHelp,
  onRegisterBusiness,
  onClearSavedDetails,
  onUseAddressForCheckout,
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
  customerTrackError
}) {
  const allOrders = Array.isArray(accountPanel?.orders) ? accountPanel.orders : [];
  const allBookings = Array.isArray(accountPanel?.bookings) ? accountPanel.bookings : [];
  const allAddresses = Array.isArray(accountPanel?.addresses) ? accountPanel.addresses : [];
  const loyalty = accountPanel?.loyalty || { balance: 0, transactions: [] };
  const loyaltyTransactions = Array.isArray(loyalty?.transactions) ? loyalty.transactions.slice(0, 3) : [];

  return (
    <>
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
      <section
        role="dialog"
        aria-modal="true"
        aria-label="My Account"
        style={{
          position: 'fixed',
          inset: isMobileViewport ? 0 : 16,
          zIndex: 2499,
          background: SURFACE,
          borderRadius: isMobileViewport ? 0 : 28,
          border: isMobileViewport ? 'none' : `1px solid ${BORDER}`,
          boxShadow: '0 32px 72px rgba(15,23,42,0.16)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          overflow: 'hidden'
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
              <div style={{ fontSize: isMobileViewport ? 30 : 32, fontWeight: 700, lineHeight: 1.04, color: TEXT, letterSpacing: '-0.03em' }}>
                My Account
              </div>
              <div style={{ marginTop: 10, fontSize: isMobileViewport ? 15 : 16, lineHeight: 1.6, color: MUTED, maxWidth: 720 }}>
                View your orders, bookings, tracking references, saved addresses, and loyalty activity across DGFY stores.
              </div>
            </div>
          </div>
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
        </header>

        <div
          style={{
            overflowY: 'auto',
            background: SURFACE,
            padding: isMobileViewport ? '18px 16px 20px' : '24px 32px 28px',
            display: 'grid',
            gap: 24,
            alignContent: 'start'
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
                { label: 'Saved Addresses', value: allAddresses.length, icon: MapPin }
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

          {activeOrders.length > 0 && (
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
                          style={{ minHeight: 42, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          style={{ minHeight: 42, borderRadius: 14, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: TEXT, padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Reorder
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {trackedCustomerActivity || customerTrackError ? (
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

          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 0.85fr)', gap: 24 }}>
            <section style={{ display: 'grid', gap: 14 }}>
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

            <section style={{ display: 'grid', gap: 24 }}>
              <div style={{ display: 'grid', gap: 14 }}>
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

              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: '#EFF6FF', color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                    <MapPin size={18} strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>Saved Addresses</div>
                    <div style={{ fontSize: 14, color: MUTED }}>Addresses currently linked to your DGFY customer account.</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {allAddresses.length === 0 ? (
                    <div style={{ borderRadius: 20, border: `1px dashed ${BORDER}`, background: SOFT_SURFACE, padding: '18px 20px', fontSize: 14, color: MUTED }}>
                      No saved addresses yet.
                    </div>
                  ) : allAddresses.map((address) => {
                    const label = String(address.label || 'Address').trim() || 'Address';
                    const labelText = address.is_default ? `${label} - Default` : label;
                    return (
                    <div key={`address-${address.address_id}`} style={{ borderRadius: 20, border: `1px solid ${BORDER}`, background: '#FFFFFF', padding: '16px 18px', display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{labelText}</div>
                        {address.is_default ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#EFF6FF', color: PRIMARY, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, color: MUTED }}>{address.address_line || 'Address details unavailable.'}</div>
                      {typeof onUseAddressForCheckout === 'function' ? (
                        <button
                          type="button"
                          onClick={() => onUseAddressForCheckout(address)}
                          style={{ justifySelf: 'start', minHeight: 38, borderRadius: 14, border: `1px solid ${BORDER}`, background: SOFT_SURFACE, color: PRIMARY, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Use for Checkout
                        </button>
                      ) : null}
                    </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
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
        </div>

        <footer
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            borderTop: `1px solid ${BORDER}`,
            padding: isMobileViewport ? '14px 16px' : '16px 32px',
            display: 'flex',
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
    </>
  );
}

export default DgfyCustomerAccountPage;
