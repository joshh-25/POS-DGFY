import { useEffect } from 'react';
import { isDocumentVisibleAndOnline } from '../../shared/utils/browserAvailability.js';
import { resolveTrackingRetryDelayMs } from '../../tracking/customerTrackingRefresh.js';

export function useCustomerDashboardLiveSync({ isDgfyCustomerSignedIn, isAccountDrawerOpen, isStandaloneAccountPage, isGuestTrackingDrawerOpen, activeCustomerOrderCount, accountPanelRefreshInFlightRef, loadAccountPanelRef, mergeLiveAccountActivityRef, setAccountPanel, withApiOrigin }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !isDgfyCustomerSignedIn) return undefined;
    const enabled = isAccountDrawerOpen || isStandaloneAccountPage || isGuestTrackingDrawerOpen || activeCustomerOrderCount > 0;
    if (!enabled) return undefined;
    let cancelled = false;
    // 0 outside a 429 backoff window; otherwise the ms timestamp (Date.now()
    // basis) until which schedule() must not shorten the delay back down to
    // the normal cadence, even though pollMs() itself doesn't know a 429
    // just happened.
    let rateLimitedUntilMs = 0;
    // This poll is a reconciliation safety net, not the primary update path --
    // the second effect below holds a live EventSource on /dgfy/customer/events
    // delivering activity.updated/notification.created in real time. Skip the
    // fetch (not the timer) when the tab is hidden or the browser reports
    // offline -- a backgrounded tab on a dead connection would otherwise keep
    // firing this poll's 11-request loadDgfyPanel fan-out every tick
    // indefinitely, each rejection burning a Sentry event. Skipping the work
    // still lets schedule() re-arm on its own once the tab returns, rather
    // than requiring a separate resume path.
    //
    // #958/#509: this used to poll every 3s while an order was active --
    // ~3.7 req/s from the 11-request fan-out alone, enough for one phone to
    // exhaust the shared production rate-limit budget in ~5.5 minutes and
    // lock out everyone on the same network. The SSE channel already covers
    // the real-time case; this poll only needs to catch what SSE misses.
    const refresh = async () => {
      if (cancelled || accountPanelRefreshInFlightRef.current || !isDocumentVisibleAndOnline()) return;
      accountPanelRefreshInFlightRef.current = true;
      let result;
      try { result = await loadAccountPanelRef.current?.({ silent: true }); } finally { accountPanelRefreshInFlightRef.current = false; }
      // #958/#509: a rate-limited poller that keeps retrying at its normal
      // cadence re-arms its own lockout the instant the window clears.
      // Honour the server's retryAfterSeconds instead.
      if (result?.retryAfterSeconds > 0) {
        rateLimitedUntilMs = Date.now() + resolveTrackingRetryDelayMs({ error: { retryAfterSeconds: result.retryAfterSeconds }, normalDelayMs: 0 });
      }
    };
    const pollMs = () => typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 120000 : 60000;
    let timerId = null;
    const schedule = () => {
      if (cancelled) return;
      const delayMs = Math.max(pollMs(), rateLimitedUntilMs - Date.now());
      timerId = window.setTimeout(tick, delayMs);
    };
    // Await refresh() before arming the next tick (rather than scheduling
    // in parallel with the fetch) so a 429 detected on the very first
    // request -- not just on later ticks -- still extends the next poll's
    // delay. #958/#509.
    const tick = async () => { await refresh(); schedule(); };
    void tick();
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
