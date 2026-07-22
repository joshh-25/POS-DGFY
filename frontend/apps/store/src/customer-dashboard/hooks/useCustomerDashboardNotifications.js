import { useCallback } from 'react';

export function useCustomerDashboardNotifications({ setAccountPanel, handleLoadAccountPanel, requestJson, readDgfyAuthToken }) {
  const handleMarkNotificationRead = useCallback(async (notification) => {
    const notificationId = notification?.notification_id;
    if (!notificationId) return;
    setAccountPanel((previous) => {
      let unreadDelta = 0;
      const notifications = (Array.isArray(previous.notifications) ? previous.notifications : []).map((entry) => {
        if (entry?.notification_id !== notificationId) return entry;
        if (!entry.read_at) unreadDelta = 1;
        return { ...entry, read_at: entry.read_at || new Date().toISOString() };
      });
      return { ...previous, notifications, unreadNotificationCount: Math.max(0, Number(previous.unreadNotificationCount || 0) - unreadDelta) };
    });
    try {
      await requestJson(`/api/v1/dgfy/customer/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH', authToken: readDgfyAuthToken(), cache: 'no-store' });
    } catch {
      void handleLoadAccountPanel();
    }
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson, setAccountPanel]);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    setAccountPanel((previous) => ({ ...previous, notifications: (Array.isArray(previous.notifications) ? previous.notifications : []).map((entry) => ({ ...entry, read_at: entry.read_at || readAt })), unreadNotificationCount: 0 }));
    try {
      await requestJson('/api/v1/dgfy/customer/notifications/read-all', { method: 'PATCH', authToken: readDgfyAuthToken(), cache: 'no-store' });
    } catch {
      void handleLoadAccountPanel();
    }
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson, setAccountPanel]);

  return { handleMarkNotificationRead, handleMarkAllNotificationsRead };
}
