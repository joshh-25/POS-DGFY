import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Edit,
  CheckCircle2,
  Mail,
  Phone,
  HeadphonesIcon,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  Menu,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  User,
  X,
  Package,
  Award
} from 'lucide-react';
import { EmptyState, StatusBadge, THEME, formatDate, prettyStatus } from '../account/DgfyCustomerAccountUi.jsx';
import {
  AccountSection,
  AddressesSection,
  BookingsSection,
  LoyaltySection,
  OrdersSection
} from '../account/DgfyCustomerAccountSections.jsx';

export function DgfyCustomerAccountPage({
  isMobileViewport,
  onClose,
  onTrackReference,
  onSignOut,
  onRegisterBusiness,
  accountIdentityInitials,
  accountIdentityName,
  accountIdentityContact,
  accountPanel,
  activeOrders,
  activeOrderCount,
  customerTrackLoadingReference,
  onOpenBusinessInventory
}) {
  const allOrders = Array.isArray(accountPanel?.orders) ? accountPanel.orders : [];
  const allBookings = Array.isArray(accountPanel?.bookings) ? accountPanel.bookings : [];
  const allAddresses = Array.isArray(accountPanel?.addresses) ? accountPanel.addresses : [];
  const defaultAddress = allAddresses.find(a => a.is_default) || allAddresses[0];
  const accountContactParts = String(accountIdentityContact || '').split(' | ').map((value) => String(value || '').trim());
  const overviewPhone = String(accountPanel?.me?.phone || accountContactParts[0] || '').trim();
  const overviewEmail = String(accountPanel?.me?.email || accountContactParts[1] || '').trim();
  
  const loyalty = accountPanel?.loyalty || { balance: 0, transactions: [] };
  const businessMemberships = Array.isArray(accountPanel?.memberships)
    ? accountPanel.memberships.filter((membership) => membership?.company)
    : [];
  
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

  const renderBusiness = () => {
    const registeredBusinesses = businessMemberships;
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 18 : 24, animation: 'fadeIn 300ms ease-in-out' }}>
        <h2 style={{ fontSize: isMobileViewport ? 20 : 24, fontWeight: 700, color: THEME.text, margin: 0 }}>Registered Businesses</h2>
        
        {registeredBusinesses.length > 0 ? (
          <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 20 }}>
            {registeredBusinesses.map((membership) => {
              const company = membership.company || {};
              const companyName = String(company.name || 'Business').trim();
              const companyInitials = companyName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join('') || 'B';
              const companyStatus = prettyStatus(company.status || membership.status || 'active');
              const roleLabel = prettyStatus(membership.role || 'member');
              const planLabel = prettyStatus(company.plan || 'premium');
              return (
                <div key={membership.id || `${membership.tenant_id}-${company.company_token || companyName}`} style={{ background: THEME.surface, borderRadius: isMobileViewport ? 16 : 20, border: `1px solid ${THEME.border}`, overflow: 'hidden', boxShadow: '0 10px 30px rgba(16,24,40,0.06)' }}>
                  <div style={{ height: isMobileViewport ? 92 : 140, background: 'linear-gradient(135deg, #1A4E8D 0%, #4F8CC9 58%, #AEE8F4 100%)', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(16,24,40,0.18) 100%)' }} />
                  </div>
                  <div style={{ padding: isMobileViewport ? 16 : 24, display: 'grid', gap: isMobileViewport ? 14 : 18, marginTop: isMobileViewport ? -34 : -52, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', flexDirection: isMobileViewport ? 'column' : 'row' }}>
                      <div style={{ display: 'flex', alignItems: isMobileViewport ? 'center' : 'flex-end', gap: isMobileViewport ? 12 : 16 }}>
                        <div style={{ width: isMobileViewport ? 64 : 96, height: isMobileViewport ? 64 : 96, borderRadius: '50%', border: isMobileViewport ? '3px solid #FFFFFF' : '4px solid #FFFFFF', background: '#EAF3FF', color: THEME.primary, display: 'grid', placeItems: 'center', fontSize: isMobileViewport ? 22 : 30, fontWeight: 800, boxShadow: '0 10px 24px rgba(16,24,40,0.12)', flexShrink: 0 }}>
                          {companyInitials}
                        </div>
                        <div style={{ display: 'grid', gap: 8, paddingBottom: isMobileViewport ? 0 : 6, minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: isMobileViewport ? 18 : 24, fontWeight: 800, color: THEME.text, lineHeight: 1.2 }}>{companyName}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: THEME.successBg, color: THEME.success, fontSize: 12, fontWeight: 700 }}>
                              <CheckCircle2 size={14} /> {companyStatus}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: THEME.infoBg, color: THEME.info, fontSize: 12, fontWeight: 700 }}>
                              <Store size={14} /> {roleLabel}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: THEME.purpleBg, color: THEME.purple, fontSize: 12, fontWeight: 700 }}>
                              {planLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => onOpenBusinessInventory?.(membership)}
                        style={{ background: THEME.primary, color: '#FFFFFF', border: 'none', borderRadius: 10, padding: isMobileViewport ? '11px 14px' : '12px 18px', fontSize: isMobileViewport ? 13 : 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap', width: isMobileViewport ? '100%' : 'auto' }}
                      >
                        Go to Inventory
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 13, color: THEME.muted }}>
                        Open this business directly in IMS using your current DGFY account session.
                      </div>
                      {company.company_token ? (
                        <div style={{ fontSize: 12, color: THEME.muted }}>
                          Company token: <span style={{ color: THEME.text, fontWeight: 600 }}>{company.company_token}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: THEME.surface, borderRadius: 16, border: `1px solid ${THEME.border}`, padding: isMobileViewport ? '32px 18px' : '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: isMobileViewport ? 64 : 80, height: isMobileViewport ? 64 : 80, borderRadius: '50%', background: THEME.infoBg, color: THEME.info, display: 'grid', placeItems: 'center', marginBottom: isMobileViewport ? 18 : 24 }}>
              <Store size={isMobileViewport ? 30 : 40} />
            </div>
            <h3 style={{ fontSize: isMobileViewport ? 18 : 22, fontWeight: 700, color: THEME.text, marginBottom: 12 }}>Ready to reach more customers?</h3>
            <p style={{ fontSize: isMobileViewport ? 14 : 16, color: THEME.muted, lineHeight: 1.5, maxWidth: 480, marginBottom: isMobileViewport ? 24 : 32 }}>
              It looks like you haven't registered a business to this account yet. Set up your storefront to digitize your catalog and get discovered on the local map!
            </p>
            <button
              onClick={onRegisterBusiness}
              style={{ background: THEME.primary, color: '#FFFFFF', border: 'none', borderRadius: 8, padding: isMobileViewport ? '12px 18px' : '14px 28px', fontSize: isMobileViewport ? 14 : 16, fontWeight: 600, cursor: 'pointer', transition: 'background 200ms', width: isMobileViewport ? '100%' : 'auto' }}
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
                        <button onClick={() => onTrackReference(booking)} style={{ background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: THEME.primary, cursor: 'pointer' }}>
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
            { label: 'Help Center', icon: HelpCircle, color: THEME.purple, disabled: true },
            { label: 'Contact Support', icon: HeadphonesIcon, color: THEME.info, disabled: true }
          ].map((action, i) => {
            const Icon = action.icon;
            return (
              <button 
                key={i} 
                type="button"
                disabled={action.disabled}
                title={action.disabled ? `${action.label} is not available yet.` : undefined}
                onClick={action.disabled ? undefined : (
                  action.label === 'Reorder Items' ? () => setActiveNav('orders') :
                  action.label === 'Add Address' ? () => setActiveNav('addresses') :
                  () => setActiveNav('account')
                )}
                style={{ background: action.disabled ? THEME.bg : THEME.surface, borderRadius: 12, border: `1px solid ${THEME.border}`, padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: action.disabled ? 'not-allowed' : 'pointer', opacity: action.disabled ? 0.62 : 1, transition: 'background 200ms' }}
                onMouseOver={e => { if (!action.disabled) e.currentTarget.style.background = THEME.bg; }}
                onMouseOut={e => { if (!action.disabled) e.currentTarget.style.background = THEME.surface; }}
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

          <button type="button" disabled title="Help Center is not available yet." style={{ background: THEME.bg, border: 'none', color: THEME.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, fontWeight: 500, cursor: 'not-allowed', opacity: 0.62 }}>
            <HelpCircle size={20} /> Help Center
          </button>
          <button type="button" disabled title="Contact Support is not available yet." style={{ background: THEME.bg, border: 'none', color: THEME.muted, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15, fontWeight: 500, cursor: 'not-allowed', opacity: 0.62 }}>
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
            <button type="button" disabled title="Notifications are not available yet." style={{ position: 'relative', background: 'none', border: 'none', cursor: 'not-allowed', opacity: 0.62 }}>
              <Bell size={20} color={THEME.text} />
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
          {activeNav === 'orders' && <OrdersSection orders={allOrders} onTrackReference={onTrackReference} loadingReference={customerTrackLoadingReference} />}
          {activeNav === 'bookings' && <BookingsSection bookings={allBookings} onTrackReference={onTrackReference} />}
          {activeNav === 'addresses' && <AddressesSection addresses={allAddresses} />}
          {activeNav === 'loyalty' && <LoyaltySection loyalty={loyalty} />}
          {activeNav === 'account' && <AccountSection initials={accountIdentityInitials} name={accountIdentityName} contact={accountIdentityContact} account={accountPanel?.me} />}
          {activeNav === 'business' && renderBusiness()}
        </main>

      </div>
    </div>
  );
}

export default DgfyCustomerAccountPage;
