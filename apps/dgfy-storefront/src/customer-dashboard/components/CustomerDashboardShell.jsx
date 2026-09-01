import React, { useState } from 'react';
import { FeedbackModal } from './FeedbackModal.jsx';
import { CustomerDashboardHeader } from './CustomerDashboardHeader.jsx';
import { CustomerDashboardSidebar } from './CustomerDashboardSidebar.jsx';
import { CUSTOMER_DASHBOARD_THEME } from '../model/customerDashboardPresentation.jsx';

export function CustomerDashboardShell({ presentation, isMobileViewport, activeNav, setActiveNav, notifications, unreadNotificationCount, accountIdentityInitials, accountIdentityName, onClose, onSignOut, onHelp, onFeedback, onGoDiscovery, onMarkNotificationRead, onMarkAllNotificationsRead, onTrackReference, children }) {
  const isDrawer = presentation === 'drawer';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const theme = CUSTOMER_DASHBOARD_THEME;
  const contentGutter = isMobileViewport ? 16 : 28;
  const selectNavigation = (nextNav) => {
    setActiveNav(nextNav);
    if (isMobileViewport) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  };
  const openFeedback = () => {
    setIsFeedbackOpen(true);
    onFeedback?.();
  };
  const rootStyle = isDrawer
    ? { position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(15, 23, 42, 0.42)', display: 'flex', justifyContent: 'flex-end', fontFamily: "'Inter', sans-serif" }
    : { position: 'relative', width: '100%', minHeight: '100vh', background: theme.bg, display: 'flex', fontFamily: "'Inter', sans-serif" };
  const shellStyle = isDrawer
    ? { width: isMobileViewport ? '100%' : 'min(1280px, calc(100vw - 40px))', height: '100%', background: theme.bg, display: 'flex', boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)', overflow: 'hidden' }
    : { width: '100%', minHeight: '100vh', background: theme.bg, display: 'flex' };
  const sidebarStyle = isDrawer
    ? { width: 260, background: theme.surface, borderRight: `1px solid ${theme.border}`, display: isMobileViewport && !isMobileMenuOpen ? 'none' : 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden', zIndex: 2, flexShrink: 0 }
    : { width: 260, background: theme.surface, borderRight: `1px solid ${theme.border}`, display: isMobileViewport && !isMobileMenuOpen ? 'none' : 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0, bottom: 0, inset: isMobileViewport ? 0 : '0 auto 0 0', height: '100vh', overflow: 'hidden', zIndex: 50 };
  const contentStyle = isDrawer
    ? { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: 0, minHeight: 0 }
    : { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: isMobileViewport ? 0 : 260 };
  const headerStyle = isDrawer
    ? { height: 72, background: theme.surface, borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${contentGutter}px`, position: 'sticky', top: 0, zIndex: 30, flexShrink: 0, overflow: 'visible' }
    : { height: 72, background: theme.surface, borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${contentGutter}px`, position: 'fixed', top: 0, left: isMobileViewport ? 0 : 260, right: 0, zIndex: 30, flexShrink: 0, overflow: 'visible' };
  const mainStyle = isDrawer
    ? { padding: isMobileViewport ? '20px 16px 24px' : '24px 28px 32px', maxWidth: 1360, margin: '0 auto', width: '100%', boxSizing: 'border-box', overflowY: 'auto', minHeight: 0 }
    : { padding: isMobileViewport ? '88px 16px 16px' : '104px 28px 32px', maxWidth: isMobileViewport ? 1200 : 1360, margin: '0 auto', width: '100%', boxSizing: 'border-box' };
  return (
    <>
      <div data-testid="dgfy-customer-account-page" style={rootStyle}><div style={shellStyle}>
      <CustomerDashboardSidebar activeNav={activeNav} onSelectNav={selectNavigation} onHelp={onHelp} onSignOut={onSignOut} isMobileViewport={isMobileViewport} onCloseMobile={() => setIsMobileMenuOpen(false)} accountIdentityInitials={accountIdentityInitials} accountIdentityName={accountIdentityName} style={sidebarStyle} theme={theme} />
      <div style={contentStyle}>
        <CustomerDashboardHeader style={headerStyle} theme={theme} isMobileViewport={isMobileViewport} isDrawer={isDrawer} onOpenMenu={() => setIsMobileMenuOpen(true)} onClose={onClose} onGoDiscovery={onGoDiscovery} onFeedback={openFeedback} notifications={notifications} unreadCount={unreadNotificationCount} isOpen={isNotificationPanelOpen} setIsOpen={setIsNotificationPanelOpen} onMarkRead={onMarkNotificationRead} onMarkAllRead={onMarkAllNotificationsRead} onTrackReference={onTrackReference} />
        <main style={mainStyle}>{children}</main>
      </div>
      </div></div>
      <FeedbackModal key={isFeedbackOpen ? 'feedback-open' : 'feedback-closed'} open={isFeedbackOpen} isMobileViewport={isMobileViewport} onClose={() => setIsFeedbackOpen(false)} theme={theme} />
    </>
  );
}
