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
  onSignOut,
  onHelp,
  onRegisterBusiness,
  onClearSavedDetails,
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
  const defaultAddress = allAddresses.find(a => a.is_default) || allAddresses[0];
  const accountContactParts = String(accountIdentityContact || '').split(' | ').map((value) => String(value || '').trim());
  const overviewPhone = String(accountPanel?.me?.phone || accountContactParts[0] || '').trim();
  const overviewEmail = String(accountPanel?.me?.email || accountContactParts[1] || '').trim();
  
  const loyalty = accountPanel?.loyalty || { balance: 0, transactions: [] };
  const loyaltyTransactions = Array.isArray(loyalty?.transactions) ? loyalty.transactions.slice(0, 3) : [];
  
  const [activeNav, setActiveNav] = useState('overview');
  const [activeActivityTab, setActiveActivityTab] = useState('active_orders');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const renderBusiness = () => {
    const registeredBusinesses = [];
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 300ms ease-in-out' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: THEME.text, margin: 0 }}>Registered Businesses</h2>
        
        {registeredBusinesses.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
             {/* Modern card container would go here */}
          </div>
        ) : (
          <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: THEME.infoBg, color: THEME.info, display: 'grid', placeItems: 'center', marginBottom: 24 }}>
              <Store size={40} />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: THEME.text, marginBottom: 12 }}>Ready to reach more customers?</h3>
            <p style={{ fontSize: 16, color: THEME.muted, lineHeight: 1.5, maxWidth: 480, marginBottom: 32 }}>
              It looks like you haven't registered a business to this account yet. Set up your storefront to digitize your catalog and get discovered on the local map!
            </p>
            <button
              onClick={onRegisterBusiness}
              style={{ background: THEME.primary, color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '14px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer', transition: 'background 200ms' }}
              onMouseOver={e => e.currentTarget.style.background = THEME.info}
              onMouseOut={e => e.currentTarget.style.background = THEME.primary}
            >
              Register Your Business
            </button>
          </div>
        )}
      </div>
    );
  };

  const EmptyState = ({ title, desc }) => (
    <div style={{ padding: '32px 0', textAlign: 'center', color: THEME.muted }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>{desc}</div>
    </div>
  );

  // --- SECTIONS ---

  const renderOverview = () => (
    <div style={{ display: 'grid', gap: 24 }}>
      
      {/* 1. Profile Header Section */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1.5fr 1fr', gap: 24 }}>
        
        {/* Profile Card */}
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 800 }}>
                {accountIdentityInitials}
              </div>
              {Boolean(accountPanel?.me?.is_email_verified) && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: THEME.success, color: '#FFF', display: 'grid', placeItems: 'center', border: '2px solid #FFF' }}>
                  <ShieldCheck size={14} strokeWidth={3} />
                </div>
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: THEME.text }}>{accountIdentityName}</div>
                {Boolean(accountPanel?.me?.is_email_verified) && (
                  <span style={{ background: THEME.primary, color: '#FFF', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={10} /> Verified
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: THEME.muted, fontSize: 14, flexWrap: 'wrap' }}>
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
          <button onClick={() => setActiveNav('account')} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
            <Edit size={14} /> Edit Profile
          </button>
        </div>

        {/* Register Business Card */}
        <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow 200ms' }} onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'} onMouseOut={e => e.currentTarget.style.boxShadow = 'none'} onClick={onRegisterBusiness}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Store size={32} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>Grow your business</div>
              <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.4 }}>Register your business on DGFY<br/>and unlock more opportunities.</div>
            </div>
          </div>
          <ChevronRight size={24} color={THEME.text} style={{ flexShrink: 0 }} />
        </div>

      </div>

      {/* 2. Summary Statistics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 16 }}>
        {[
          { label: 'Active Orders', value: activeOrderCount, icon: ShoppingBag, color: THEME.success, bg: THEME.successBg, link: 'View all', action: () => setActiveNav('orders') },
          { label: 'Past Orders', value: allOrders.length, icon: Package, color: THEME.info, bg: THEME.infoBg, link: 'View all', action: () => setActiveNav('orders') },
          { label: 'Bookings', value: allBookings.length, icon: CalendarDays, color: THEME.purple, bg: THEME.purpleBg, link: 'View all', action: () => setActiveNav('bookings') },
          { label: 'Addresses', value: allAddresses.length, icon: MapPin, color: THEME.orange, bg: THEME.orangeBg, link: 'Manage', action: () => setActiveNav('addresses') },
          { label: 'Loyalty Points', value: loyalty.balance, icon: Award, color: THEME.success, bg: THEME.successBg, link: 'View details', action: () => setActiveNav('loyalty') }
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} style={{ background: THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}`, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: THEME.text, lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>{stat.label}</div>
                </div>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: stat.bg, color: stat.color, display: 'grid', placeItems: 'center' }}>
                  <Icon size={20} />
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: THEME.primary, cursor: 'pointer', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={stat.action}>
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
                          onClick={() => onTrackReference(order.reference)}
                          style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: THEME.primary, cursor: 'pointer' }}
                        >
                          Track Order
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
                <div style={{ fontSize: 13, color: THEME.muted }}>{order.reference} • {formatDate(order.occurred_at)}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text, marginBottom: 8 }}>{money(order.total_amount)}</div>
              <StatusBadge status={order.status_label || order.status} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => onTrackReference(order.reference)} disabled={customerTrackLoadingReference === order.reference} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: customerTrackLoadingReference === order.reference ? 'wait' : 'pointer' }}>
                {customerTrackLoadingReference === order.reference ? 'Loading...' : 'Track'}
              </button>
              <button onClick={() => onTrackReference(order.reference)} style={{ background: THEME.primary, border: 'none', color: '#FFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
                <div style={{ fontSize: 13, color: THEME.muted }}>{booking.reference} • {formatDate(booking.occurred_at)}</div>
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
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: THEME.text }}>Addresses</h2>
        <button onClick={() => alert('Address adding is currently disabled for this demo.')} style={{ background: THEME.primary, border: 'none', color: '#FFF', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={16} /> Add Address
        </button>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {allAddresses.length === 0 ? (
          <EmptyState title="No addresses saved" desc="Add an address for faster checkout." />
        ) : allAddresses.map((address) => (
          <div key={`addr-${address.address_id}`} style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: THEME.orangeBg, color: THEME.orange, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <MapPin size={24} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text }}>{String(address.label || 'Address').trim() || 'Address'}</div>
                  {address.is_default && (
                    <span style={{ background: THEME.successBg, color: THEME.success, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>Default</span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: THEME.muted, lineHeight: 1.5, maxWidth: 400 }}>{address.address_line || 'Address details unavailable.'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => alert('Address editing is currently disabled.')} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, color: THEME.text, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
            </div>
          </div>
        ))}
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
              <div style={{ fontSize: 24, fontWeight: 700, color: THEME.text, marginTop: 4, letterSpacing: 2, lineHeight: 1 }}>••••••••</div>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Bell size={20} color={THEME.text} />
              <div style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, background: THEME.orange, color: '#FFF', borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid #FFF' }}>
                3
              </div>
            </button>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: THEME.infoBg, color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>
              {accountIdentityInitials}
            </div>
            {!isMobileViewport && <span style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>{accountIdentityName?.split(' ')[0] || 'User'}</span>}
            <ChevronDown size={16} color={THEME.muted} />
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main style={{ padding: isMobileViewport ? 16 : 40, maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
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
