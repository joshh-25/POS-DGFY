import React from 'react';
import { Bell, Menu, X } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY, prettyCustomerStatus } from '../model/customerDashboardPresentation.jsx';

const DGFY_LOGO_URL = '/dgfy-logo.png';
const FEEDBACK_ICON_URL = '/feedback%20icon.jpg';

export function CustomerDashboardHeader({ style, theme, isMobileViewport, isDrawer, onOpenMenu, onClose, onGoDiscovery = () => {}, onFeedback = () => {}, notifications, unreadCount, isOpen, setIsOpen, onMarkRead, onMarkAllRead, onTrackReference }) {
  const openNotification = (notification) => {
    if (notification?.notification_id) onMarkRead?.(notification);
    if (notification?.reference) {
      onTrackReference?.({ reference: notification.reference, status: notification.status });
      setIsOpen(false);
    }
  };
  return (
    <header style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 8 : 16, minWidth: 0 }}>
        {isMobileViewport ? <button type="button" aria-label="Open menu" onClick={onOpenMenu} style={{ background: 'transparent', border: 'none', color: theme.text, minWidth: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><Menu size={24} /></button> : null}
        {isDrawer && typeof onClose === 'function' ? <button type="button" aria-label="Close account" onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.text, minWidth: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><X size={20} /></button> : null}
        <button type="button" onClick={onGoDiscovery} aria-label="Go to DGFY discovery map" title="Go to DGFY discovery map" style={{ minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: isMobileViewport ? 0 : 10, padding: 0, border: 'none', background: 'transparent', color: theme.primary, cursor: 'pointer', textAlign: 'left' }}>
          <img src={DGFY_LOGO_URL} alt="DGFY" style={{ width: isMobileViewport ? 82 : 86, maxHeight: isMobileViewport ? 28 : 30, objectFit: 'contain', objectPosition: 'left center', flexShrink: 0 }} />
          {!isMobileViewport ? <span style={{ minWidth: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, lineHeight: 1.25, fontWeight: 700, color: theme.primary, whiteSpace: 'nowrap' }}>Discover Goods For You</span> : null}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 10 : 16, position: 'relative', flexShrink: 0 }}>
        <button type="button" aria-label="Send feedback" title="Send feedback" onClick={onFeedback} style={{ minWidth: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile : 'auto', minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.desktop, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: isMobileViewport ? 0 : '0 4px', border: 'none', borderRadius: 8, background: 'transparent', color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <img data-testid="feedback-icon" src={FEEDBACK_ICON_URL} alt="" aria-hidden="true" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center', display: 'block', flexShrink: 0 }} />
          {!isMobileViewport ? 'Feedback' : null}
        </button>
        <button type="button" aria-label="Notifications" onClick={() => setIsOpen((current) => !current)} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', minWidth: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.desktop, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.desktop, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Bell size={20} color={theme.text} />{unreadCount > 0 ? <span data-testid="customer-notification-badge" aria-label={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`} style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, padding: '0 4px', background: theme.orange, color: '#FFF', borderRadius: 999, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', display: 'grid', placeItems: 'center', border: '2px solid #FFF', boxSizing: 'border-box', zIndex: 1 }}>{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</button>
        {isOpen ? <div style={{ position: 'fixed', top: 84, right: isMobileViewport ? 12 : 24, width: isMobileViewport ? 'min(320px, calc(100vw - 24px))' : 360, maxHeight: 'min(420px, calc(100vh - 108px))', overflow: 'hidden', border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.surface, boxShadow: '0 18px 40px rgba(15,23,42,.16)', zIndex: 80 }}><div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between' }}><strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle }}>Notifications</strong>{unreadCount > 0 ? <button type="button" onClick={onMarkAllRead} style={{ border: 'none', background: 'transparent', color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 700, cursor: 'pointer' }}>Mark all read</button> : null}</div><div style={{ maxHeight: 352, overflowY: 'auto' }}>{notifications.length === 0 ? <div style={{ padding: 28, textAlign: 'center', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>No notifications</div> : notifications.map((notification) => <button key={notification.notification_id || `${notification.reference}-${notification.created_at}`} type="button" onClick={() => openNotification(notification)} style={{ width: '100%', border: 'none', borderBottom: `1px solid ${theme.border}`, background: notification.read_at ? theme.surface : '#F8FBFF', padding: '12px 16px', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4 }}><strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>{notification.title || 'Order updated'}</strong><span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted }}>{notification.body || prettyCustomerStatus(notification.status)}</span>{notification.reference ? <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.primary, fontWeight: 700 }}>{notification.reference} - Track Order</span> : null}</button>)}</div></div> : null}
      </div>
    </header>
  );
}
