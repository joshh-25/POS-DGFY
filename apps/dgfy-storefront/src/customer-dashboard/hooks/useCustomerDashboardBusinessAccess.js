import { useCallback } from 'react';
import { toast } from 'sonner';

export function useCustomerDashboardBusinessAccess({ handleLoadAccountPanel, requestJson, readDgfyAuthToken, buildBusinessBackOfficeHandoffUrl, createDgfyHandoff, startDgfyTenantSession, dgfySessionAccount, normalizeStorefrontErrorMessage }) {
  // Sends the DGFY session over to POS Back Office for the tenant the user
  // just picked, via the single-use handoff token. Starting a tenant session
  // here instead would set its cookies on the storefront origin, which the
  // cross-origin jump then discards; POS exchanges the token on its own
  // origin before opening the requested workspace.
  const redirectToBusinessBackOfficeCompany = useCallback(async (tenantId, token, next = '/backoffice/catalog') => {
    let handoffToken = '';
    try {
      const handoff = await createDgfyHandoff(token);
      handoffToken = String(handoff?.handoff_token || '').trim();
    } catch {
      // Degrade below.
    }
    window.location.href = buildBusinessBackOfficeHandoffUrl({ tenantId, next, handoffToken });
  }, [buildBusinessBackOfficeHandoffUrl, createDgfyHandoff]);

  const redirectToPosCompany = useCallback(async (tenantId, token, next = '/terminal', { targetWindow = null } = {}) => {
    const handoff = await createDgfyHandoff(token);
    const handoffToken = String(handoff?.handoff_token || '').trim();
    if (!handoffToken) {
      throw new Error('A secure POS sign-in could not be created. Please sign in again and retry.');
    }
    const targetUrl = buildBusinessBackOfficeHandoffUrl({ tenantId, next, handoffToken });
    if (targetWindow) {
      if (targetWindow.closed) throw new Error('The POS tab was closed before it could open.');
      targetWindow.location.replace(targetUrl);
      return;
    }
    window.location.href = targetUrl;
  }, [buildBusinessBackOfficeHandoffUrl, createDgfyHandoff]);

  const requestDgfyBusinessSecurityCode = useCallback(() => requestJson('/api/v1/dgfy/account/business-step-up/request', { method: 'POST', authToken: readDgfyAuthToken(), cache: 'no-store' }), [readDgfyAuthToken, requestJson]);
  const handleAcceptDgfyCompanyInvitation = useCallback(async ({ membershipId, emailOtpCode }) => {
    await requestJson(`/api/v1/dgfy/invitations/${encodeURIComponent(membershipId)}/accept`, { method: 'POST', authToken: readDgfyAuthToken(), body: { email_otp_code: emailOtpCode }, cache: 'no-store' });
    toast.success('Company invitation accepted.');
    await handleLoadAccountPanel();
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson]);
  const handleRejectDgfyCompanyInvitation = useCallback(async ({ membershipId }) => {
    await requestJson(`/api/v1/dgfy/invitations/${encodeURIComponent(membershipId)}/reject`, { method: 'POST', authToken: readDgfyAuthToken(), cache: 'no-store' });
    toast.success('Company invitation rejected.');
    await handleLoadAccountPanel();
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson]);
  const handleLeaveDgfyCompany = useCallback(async ({ tenantId }) => {
    await requestJson(`/api/v1/dgfy/account/companies/${encodeURIComponent(tenantId)}/leave`, { method: 'POST', authToken: readDgfyAuthToken(), cache: 'no-store' });
    toast.success('You left the company.');
    await handleLoadAccountPanel();
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson]);
  const switchDgfyCompanyFromStorefront = useCallback(async ({ tenantId, emailOtpCode }) => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) throw new Error('Select a company to open in POS Back Office.');
    const token = readDgfyAuthToken();
    await requestJson(`/api/v1/dgfy/account/companies/${encodeURIComponent(normalizedTenantId)}/switch`, { method: 'POST', authToken: token, body: { email_otp_code: emailOtpCode }, cache: 'no-store' });
    await redirectToBusinessBackOfficeCompany(normalizedTenantId, token, '/backoffice/overview');
  }, [readDgfyAuthToken, redirectToBusinessBackOfficeCompany, requestJson]);
  const handleOpenBusinessInventory = useCallback(async (membership) => {
    const company = membership?.company || {};
    const tenantId = company.id ?? membership?.tenant_id ?? null;
    const token = readDgfyAuthToken();
    if (!tenantId) return toast.error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) return toast.error('Sign in again to open this business inventory.');
    try { await redirectToBusinessBackOfficeCompany(tenantId, token, '/backoffice/catalog'); } catch (error) { toast.error(normalizeStorefrontErrorMessage(error, 'Unable to open the business Back Office right now.')); }
  }, [dgfySessionAccount?.id, normalizeStorefrontErrorMessage, readDgfyAuthToken, redirectToBusinessBackOfficeCompany]);
  const handleOpenBusinessPos = useCallback(async (membership, { openInNewTab = false, next = '/terminal' } = {}) => {
    const tenantId = String(membership?.tenant_id || membership?.tenantId || membership?.company?.tenant_id || membership?.company?.id || membership?.tenant?.id || membership?.storefront?.tenant_id || membership?.storefront?.id || membership?.id || '').trim();
    const token = readDgfyAuthToken();
    if (!tenantId) return toast.error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) return toast.error('Sign in again to open this business POS.');
    const targetWindow = openInNewTab && typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (openInNewTab && !targetWindow) {
      toast.error('Your browser blocked the POS tab. Allow pop-ups for DGFY, then try again.');
      return;
    }
    if (targetWindow) {
      try { targetWindow.opener = null; } catch { /* best-effort opener isolation before navigation */ }
    }
    try {
      await redirectToPosCompany(tenantId, token, next, { targetWindow });
    } catch (error) {
      try { targetWindow?.close?.(); } catch { /* best-effort cleanup */ }
      toast.error(normalizeStorefrontErrorMessage(error, 'Unable to open the business POS right now.'));
    }
  }, [dgfySessionAccount?.id, normalizeStorefrontErrorMessage, readDgfyAuthToken, redirectToPosCompany]);
  const getOwnBusinessDayCloseStatus = useCallback(async (membership) => {
    const tenantId = String(membership?.tenant_id || membership?.tenantId || membership?.company?.tenant_id || membership?.company?.id || membership?.tenant?.id || membership?.storefront?.tenant_id || membership?.storefront?.id || membership?.id || '').trim();
    const token = readDgfyAuthToken();
    if (!tenantId) throw new Error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) throw new Error('Sign in again to check Day Close access.');
    const session = await startDgfyTenantSession({ tenantId, accessScope: 'pos' }, token, { activate: false });
    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    return {
      canCloseDay: session?.is_master_admin === true || permissions.includes('pos:close_day'),
      pinConfigured: session?.pos_day_close_pin_configured === true
    };
  }, [dgfySessionAccount?.id, readDgfyAuthToken, startDgfyTenantSession]);
  const configureOwnBusinessDayClosePin = useCallback(async (membership, { currentPassword, pin } = {}) => {
    const tenantId = String(membership?.tenant_id || membership?.tenantId || membership?.company?.tenant_id || membership?.company?.id || membership?.tenant?.id || membership?.storefront?.tenant_id || membership?.storefront?.id || membership?.id || '').trim();
    const token = readDgfyAuthToken();
    if (!tenantId) throw new Error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) throw new Error('Sign in again to configure your Day Close PIN.');
    await requestJson(`/api/v1/dgfy/account/companies/${encodeURIComponent(tenantId)}/pos-day-close-pin`, {
      method: 'PUT',
      authToken: token,
      body: { current_password: currentPassword, pin },
      cache: 'no-store'
    });
  }, [dgfySessionAccount?.id, readDgfyAuthToken, requestJson]);
  return { requestDgfyBusinessSecurityCode, handleAcceptDgfyCompanyInvitation, handleRejectDgfyCompanyInvitation, handleLeaveDgfyCompany, switchDgfyCompanyFromStorefront, handleOpenBusinessInventory, handleOpenBusinessPos, getOwnBusinessDayCloseStatus, configureOwnBusinessDayClosePin };
}
