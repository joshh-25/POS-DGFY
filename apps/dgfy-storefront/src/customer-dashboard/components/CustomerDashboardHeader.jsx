import React from 'react';
import { Bell, ChevronDown, Menu, X } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY, prettyCustomerStatus } from '../model/customerDashboardPresentation.jsx';

export function CustomerDashboardHeader({ style, theme, isMobileViewport, isDrawer, onOpenMenu, onClose, notifications, unreadCount, isOpen, setIsOpen, onMarkRead, onMarkAllRead, onTrackReference, initials, name }) {
  const openNotification = (notification) => {
    if (notification?.notification_id) onMarkRead?.(notification);
    if (notification?.reference) {
      onTrackReference?.({ reference: notification.reference, status: notification.status });
      setIsOpen(false);
    }
  };
  return (
    <header style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {isMobileViewport ? <button type="button" aria-label="Open menu" onClick={onOpenMenu} style={{ background: 'transparent', border: 'none', color: theme.text, minWidth: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><Menu size={24} /></button> : null}
        {isDrawer && typeof onClose === 'function' ? <button type="button" aria-label="Close account" onClick={onClose} style={{ background: 'transparent', border: 'none', color: theme.text, minWidth: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, minHeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><X size={20} /></button> : null}
        <h1 style={{ margin: 0, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.headerTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.headerTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.headerTitleWeight, color: theme.primary }}>My Account</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
        <button type="button" aria-label="Notifications" onClick={() => setIsOpen((current) => !current)} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', minWidth: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.desktop, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.iconControlSize.desktop, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Bell size={20} color={theme.text} />{unreadCount > 0 ? <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14, padding: '0 3px', background: theme.orange, color: '#FFF', borderRadius: 999, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid #FFF', boxSizing: 'border-box' }}>{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</button>
        {isOpen ? <div style={{ position: 'fixed', top: 84, right: isMobileViewport ? 12 : 24, width: isMobileViewport ? 'min(320px, calc(100vw - 24px))' : 360, maxHeight: 'min(420px, calc(100vh - 108px))', overflow: 'hidden', border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.surface, boxShadow: '0 18px 40px rgba(15,23,42,.16)', zIndex: 80 }}><div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between' }}><strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle }}>Notifications</strong>{unreadCount > 0 ? <button type="button" onClick={onMarkAllRead} style={{ border: 'none', background: 'transparent', color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 700, cursor: 'pointer' }}>Mark all read</button> : null}</div><div style={{ maxHeight: 352, overflowY: 'auto' }}>{notifications.length === 0 ? <div style={{ padding: 28, textAlign: 'center', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>No notifications</div> : notifications.map((notification) => <button key={notification.notification_id || `${notification.reference}-${notification.created_at}`} type="button" onClick={() => openNotification(notification)} style={{ width: '100%', border: 'none', borderBottom: `1px solid ${theme.border}`, background: notification.read_at ? theme.surface : '#F8FBFF', padding: '12px 16px', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4 }}><strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>{notification.title || 'Order updated'}</strong><span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted }}>{notification.body || prettyCustomerStatus(notification.status)}</span>{notification.reference ? <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.primary, fontWeight: 700 }}>{notification.reference} - Track Order</span> : null}</button>)}</div></div> : null}
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: 700 }}>{initials}</div>
        {!isMobileViewport ? <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: 600, color: theme.text }}>{name?.split(' ')[0] || 'User'}</span> : null}<ChevronDown size={16} color={theme.muted} />
      </div>
    </header>
  );
}
