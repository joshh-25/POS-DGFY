import React from 'react';
import {
  Award,
  CalendarDays,
  Check,
  ChevronRight,
  Edit2,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck
} from 'lucide-react';
import { EmptyState, StatusBadge, THEME, formatDate, money, prettyStatus } from './DgfyCustomerAccountUi.jsx';

export function OrdersSection({ orders, onTrackReference, loadingReference }) {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Orders</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {orders.length === 0 ? (
          <EmptyState title="No orders found" desc="You don't have any past or active orders." />
        ) : orders.map((order) => (
          <div key={`all-order-${order.reference}`} style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.infoBg, color: THEME.info, display: 'grid', placeItems: 'center' }}><Package size={24} /></div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>{order.store_name || 'DGFY Store'}</div>
                <div style={{ fontSize: 13, color: THEME.muted }}>{order.reference} • {formatDate(order.occurred_at)}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>{money(order.total_amount)}</div>
              <StatusBadge status={order.status_label || order.status} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => onTrackReference(order)} disabled={loadingReference === order.reference} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: loadingReference === order.reference ? 'wait' : 'pointer' }}>
                {loadingReference === order.reference ? 'Loading...' : 'Track'}
              </button>
              <button type="button" onClick={() => onTrackReference(order)} style={{ background: THEME.primary, border: 'none', color: '#FFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View Receipt</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BookingsSection({ bookings, onTrackReference }) {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Bookings</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {bookings.length === 0 ? (
          <EmptyState title="No bookings found" desc="You don't have any appointments scheduled." />
        ) : bookings.map((booking) => (
          <div key={`all-booking-${booking.reference}`} style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.purpleBg, color: THEME.purple, display: 'grid', placeItems: 'center' }}><CalendarDays size={24} /></div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>{booking.store_name || 'DGFY Service'}</div>
                <div style={{ fontSize: 13, color: THEME.muted }}>{booking.reference} • {formatDate(booking.occurred_at)}</div>
              </div>
            </div>
            <StatusBadge status={booking.status_label || booking.status} />
            <button type="button" onClick={() => onTrackReference(booking)} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View Details</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AddressesSection({ addresses }) {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text }}>Addresses</h2>
        <button type="button" disabled title="Address management is not available from this page yet." style={{ background: THEME.border, border: 'none', color: THEME.muted, borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={16} /> Add Address</button>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {addresses.length === 0 ? (
          <EmptyState title="No addresses saved" desc="Add an address for faster checkout." />
        ) : addresses.map((address) => (
          <div key={`addr-${address.address_id}`} style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.orangeBg, color: THEME.orange, display: 'grid', placeItems: 'center', flexShrink: 0 }}><MapPin size={24} /></div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>{String(address.label || 'Address').trim() || 'Address'}</div>
                  {address.is_default ? <span style={{ background: THEME.successBg, color: THEME.success, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>Default</span> : null}
                </div>
                <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.5, maxWidth: 400 }}>{address.address_line || 'Address details unavailable.'}</div>
              </div>
            </div>
            <button type="button" disabled title="Address editing is not available from this page yet." style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.muted, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed' }}>Edit</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoyaltySection({ loyalty }) {
  const transactions = Array.isArray(loyalty?.transactions) ? loyalty.transactions.slice(0, 3) : [];
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Loyalty Rewards</h2>
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: THEME.successBg, color: THEME.success, display: 'grid', placeItems: 'center' }}><Award size={40} /></div>
          <div>
            <div style={{ fontSize: 14, color: THEME.muted, fontWeight: 500, marginBottom: 4 }}>Current Balance</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: THEME.text, lineHeight: 1 }}>{Number(loyalty?.balance || 0)} <span style={{ fontSize: 16, color: THEME.muted, fontWeight: 500 }}>Points</span></div>
          </div>
        </div>
        <button type="button" disabled title="Loyalty redemption is not available yet." style={{ background: THEME.border, border: 'none', color: THEME.muted, borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'not-allowed' }}>Redeem Rewards</button>
      </div>
      <p style={{ margin: '-12px 0 0', fontSize: 13, color: THEME.muted }}>Points are currently view-only. Redemption is not available yet.</p>
      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: THEME.text, marginBottom: 16 }}>Recent Transactions</h3>
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
          {transactions.length === 0 ? <EmptyState title="No transactions yet" desc="Make a purchase to start earning points." /> : transactions.map((entry, index) => (
            <div key={`loy-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: index < transactions.length - 1 ? `1px solid ${THEME.border}` : 'none' }}>
              <div><div style={{ fontSize: 15, fontWeight: 600, color: THEME.text, marginBottom: 4 }}>{prettyStatus(entry.reason || 'Activity')}</div><div style={{ fontSize: 13, color: THEME.muted }}>{formatDate(entry.created_at)}</div></div>
              <div style={{ fontSize: 16, fontWeight: 700, color: Number(entry.points_delta || 0) >= 0 ? THEME.success : THEME.text }}>{Number(entry.points_delta || 0) >= 0 ? '+' : ''}{Number(entry.points_delta || 0)} pts</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AccountSection({ initials, name, contact, account }) {
  const [phone, email] = String(contact || '').split(' | ');
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>Account Settings</h2>
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Profile Overview</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 100, height: 100, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: 36, fontWeight: 800 }}>{initials}</div>
              <div style={{ position: 'absolute', bottom: 4, right: 4, width: 28, height: 28, borderRadius: '50%', background: THEME.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '3px solid #FFF' }}><Check size={16} strokeWidth={4} /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: THEME.text }}>{name}</div>
                {account?.is_email_verified ? <div style={{ background: '#E6F4EA', color: '#137333', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={14} /> Verified Customer</div> : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.muted, fontSize: 14 }}><Phone size={16} /> {phone || '+63 *** *** ****'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.muted, fontSize: 14 }}><Mail size={16} /> {email || 'customer@email.com'}</span>
              </div>
            </div>
          </div>
          <button type="button" disabled title="Profile editing is not available from this page yet." style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.muted, borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'not-allowed' }}><Edit2 size={16} /> Edit Profile</button>
        </div>
      </div>
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${THEME.border}` }}><h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Contact Information</h3></div>
        <AccountRow icon={Mail} label="Email Address" value={email || 'customer@email.com'} badge={account?.is_email_verified ? 'Verified' : 'Unverified'} action="Change" title="Email changes require a verified email-change flow and are not available yet." />
        <AccountRow icon={Phone} label="Phone Number" value={phone || '+63 *** *** ****'} badge="Not verified" action="Change" title="Phone changes are not available from this page yet." />
      </div>
      <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${THEME.border}` }}><h3 style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>Security</h3></div>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><Lock size={20} color={THEME.muted} /><div><div style={{ fontSize: 13, color: THEME.text, fontWeight: 700 }}>Password</div><div style={{ fontSize: 24, fontWeight: 700, color: THEME.text, marginTop: 4, letterSpacing: 2, lineHeight: 1 }}>••••••••</div></div></div>
          <button type="button" disabled title="Password changes are not available from this page yet." style={{ background: 'transparent', border: 'none', color: THEME.muted, fontSize: 14, fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 4 }}>Change Password <ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ icon: Icon, label, value, badge, action, title }) {
  const verified = badge === 'Verified';
  return (
    <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, borderBottom: `1px solid ${THEME.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><Icon size={20} color={THEME.muted} /><div><div style={{ fontSize: 13, color: THEME.muted }}>{label}</div><div style={{ fontSize: 14, fontWeight: 600, color: THEME.text, marginTop: 4 }}>{value}</div></div></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <span style={{ background: verified ? '#E6F4EA' : '#FFF3E0', color: verified ? '#137333' : '#E65100', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6 }}>{badge}</span>
        <button type="button" disabled title={title} style={{ background: 'transparent', border: 'none', color: THEME.muted, fontSize: 14, fontWeight: 600, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 4 }}>{action} <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
