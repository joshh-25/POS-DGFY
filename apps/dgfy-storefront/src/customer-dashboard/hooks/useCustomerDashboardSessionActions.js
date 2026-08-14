import { useCallback } from 'react';
import { toast } from 'sonner';

export function useCustomerDashboardSessionActions({ EMPTY_ACCOUNT_PANEL, accountPanel, setAccountPanel, dgfySessionAccount, setDgfySessionAccount, setDgfyAuthTokenState, setIsAccountDrawerOpen, setTrackedCustomerActivity, setCustomerTrackLoadingReference, setCustomerTrackError, routeSlug, routeSubpage, currentPathSubpage, storePath, resolveStorefrontMetaForAccountEntry, requestJson, readDgfyAuthToken, clearDgfyAuthToken, clearStoreAuthToken, rememberDgfySignedOutEmail, markDgfyExplicitSignOut, clearCheckoutAuthResumeDraft, handleLoadAccountPanel }) {
  const openStorefrontFromAccountEntry = useCallback((entry = {}) => {
    const resolved = resolveStorefrontMetaForAccountEntry(entry);
    if (resolved.slug) window.location.href = storePath(resolved.slug);
  }, [resolveStorefrontMetaForAccountEntry, storePath]);
  const submitAccountReviewFromDashboard = useCallback(async ({ activityId, targetType, targetId, rating, comment } = {}) => {
    const authToken = String(readDgfyAuthToken() || '').trim();
    if (!authToken) throw new Error('Sign in again before sending a review.');
    await requestJson('/api/v1/dgfy/customer/reviews', { method: 'POST', authToken, body: { activity_id: activityId, target_type: targetType, target_id: targetId, rating, comment: String(comment || '').trim() || null } });
    toast.success('Review submitted for approval.');
    await handleLoadAccountPanel();
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson]);
  const handleStorefrontSignOut = useCallback(async () => {
    const token = readDgfyAuthToken();
    rememberDgfySignedOutEmail(String(accountPanel?.me?.email || dgfySessionAccount?.email || '').trim());
    markDgfyExplicitSignOut();
    try { await requestJson('/api/v1/dgfy/auth/logout', { method: 'POST', authToken: token, cache: 'no-store' }); } catch { /* local sign-out still completes */ }
    clearDgfyAuthToken();
    clearStoreAuthToken();
    markDgfyExplicitSignOut();
    setDgfyAuthTokenState('');
    setDgfySessionAccount(null);
    setAccountPanel({ ...EMPTY_ACCOUNT_PANEL, error: '' });
    setTrackedCustomerActivity(null);
    setCustomerTrackLoadingReference('');
    setCustomerTrackError('');
    setIsAccountDrawerOpen(false);
    clearCheckoutAuthResumeDraft();
    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      const normalizedPath = String(currentUrl.pathname || '').replace(/\/+$/, '') || '/';
      if (currentUrl.searchParams.get('dgfy_account') === '1') { currentUrl.searchParams.delete('dgfy_account'); window.history.replaceState({}, '', currentUrl.toString()); }
      if (normalizedPath === '/map-dgfy/account' || normalizedPath === '/tenant-store/account') window.history.replaceState({}, '', '/map-dgfy');
      else if (routeSlug && (routeSubpage === 'account' || currentPathSubpage === 'account')) window.history.replaceState({}, '', storePath(routeSlug));
    }
    toast.success('Signed out.');
  }, [EMPTY_ACCOUNT_PANEL, accountPanel?.me?.email, clearCheckoutAuthResumeDraft, clearDgfyAuthToken, clearStoreAuthToken, currentPathSubpage, dgfySessionAccount?.email, markDgfyExplicitSignOut, readDgfyAuthToken, rememberDgfySignedOutEmail, requestJson, routeSlug, routeSubpage, setAccountPanel, setDgfyAuthTokenState, setDgfySessionAccount, setCustomerTrackError, setCustomerTrackLoadingReference, setIsAccountDrawerOpen, setTrackedCustomerActivity, storePath]);
  return { openStorefrontFromAccountEntry, submitAccountReviewFromDashboard, handleStorefrontSignOut };
}
