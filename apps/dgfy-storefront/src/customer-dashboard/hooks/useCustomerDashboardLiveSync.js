import { useEffect } from 'react';
import { isDocumentVisibleAndOnline } from '../../shared/utils/browserAvailability.js';

export function useCustomerDashboardLiveSync({ isDgfyCustomerSignedIn, isAccountDrawerOpen, isStandaloneAccountPage, isGuestTrackingDrawerOpen, activeCustomerOrderCount, accountPanelRefreshInFlightRef, loadAccountPanelRef, mergeLiveAccountActivityRef, setAccountPanel, withApiOrigin }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !isDgfyCustomerSignedIn) return undefined;
    const enabled = isAccountDrawerOpen || isStandaloneAccountPage || isGuestTrackingDrawerOpen || activeCustomerOrderCount > 0;
    if (!enabled) return undefined;
    let cancelled = false;
    // Skip the fetch (not the timer) when the tab is hidden or the browser
    // reports offline -- a backgrounded tab on a dead connection would
    // otherwise keep firing this poll's 11-request loadDgfyPanel fan-out
    // every tick indefinitely, each rejection burning a Sentry event.
    // Skipping the work still lets schedule() re-arm on its own once the
    // tab returns, rather than requiring a separate resume path.
    const refresh = async () => {
      if (cancelled || accountPanelRefreshInFlightRef.current || !isDocumentVisibleAndOnline()) return;
      accountPanelRefreshInFlightRef.current = true;
      try { await loadAccountPanelRef.current?.({ silent: true }); } finally { accountPanelRefreshInFlightRef.current = false; }
    };
    const pollMs = () => typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 30000 : activeCustomerOrderCount > 0 ? 3000 : 15000;
    let timerId = null;
    const schedule = () => {
      if (cancelled) return;
      timerId = window.setTimeout(async () => { await refresh(); schedule(); }, pollMs());
    };
    void refresh();
    schedule();
    return () => { cancelled = true; if (timerId) window.clearTimeout(timerId); };
  }, [activeCustomerOrderCount, accountPanelRefreshInFlightRef, isAccountDrawerOpen, isDgfyCustomerSignedIn, isGuestTrackingDrawerOpen, isStandaloneAccountPage, loadAccountPanelRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined' || !isDgfyCustomerSignedIn) return undefined;
    const enabled = isAccountDrawerOpen || isStandaloneAccountPage || isGuestTrackingDrawerOpen || activeCustomerOrderCount > 0;
    if (!enabled) return undefined;
    let closed = false;
    const source = new EventSource(withApiOrigin('/api/v1/dgfy/customer/events'), { withCredentials: true });
    source.addEventListener('activity.updated', (event) => {
      try { mergeLiveAccountActivityRef.current?.(JSON.parse(event.data || '{}').activity); } catch { /* polling repairs malformed events */ }
    });
    source.addEventListener('notification.created', (event) => {
      try {
        const notification = JSON.parse(event.data || '{}').notification;
        if (!notification?.notification_id) return;
        setAccountPanel((previous) => {
          const existing = Array.isArray(previous.notifications) ? previous.notifications : [];
          if (existing.some((entry) => entry?.notification_id === notification.notification_id)) return previous;
          return { ...previous, notifications: [notification, ...existing].slice(0, 50), unreadNotificationCount: Number(previous.unreadNotificationCount || 0) + (notification.read_at ? 0 : 1) };
        });
      } catch { /* polling repairs malformed events */ }
    });
    source.addEventListener('notification.read', (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        setAccountPanel((previous) => {
          const readAt = payload.read_at || payload.notification?.read_at || new Date().toISOString();
          if (payload.all) return { ...previous, notifications: (Array.isArray(previous.notifications) ? previous.notifications : []).map((entry) => ({ ...entry, read_at: entry.read_at || readAt })), unreadNotificationCount: 0 };
          const notificationId = payload.notification?.notification_id;
          if (!notificationId) return previous;
          let unreadDelta = 0;
          const notifications = (Array.isArray(previous.notifications) ? previous.notifications : []).map((entry) => {
            if (entry?.notification_id !== notificationId) return entry;
            if (!entry.read_at) unreadDelta = 1;
            return { ...entry, read_at: readAt };
          });
          return { ...previous, notifications, unreadNotificationCount: Math.max(0, Number(previous.unreadNotificationCount || 0) - unreadDelta) };
        });
      } catch { /* polling repairs malformed events */ }
    });
    source.onerror = () => { if (!closed && !accountPanelRefreshInFlightRef.current && isDocumentVisibleAndOnline()) void loadAccountPanelRef.current?.({ silent: true }); };
    return () => { closed = true; source.close(); };
  }, [activeCustomerOrderCount, accountPanelRefreshInFlightRef, isAccountDrawerOpen, isDgfyCustomerSignedIn, isGuestTrackingDrawerOpen, isStandaloneAccountPage, loadAccountPanelRef, mergeLiveAccountActivityRef, setAccountPanel, withApiOrigin]);
}
