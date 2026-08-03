import { useCallback } from 'react';
import { toast } from 'sonner';

export function useCustomerDashboardBusinessAccess({ handleLoadAccountPanel, requestJson, readDgfyAuthToken, buildSkupervisorHandoffUrl, createDgfyHandoff, buildPosAppUrl, dgfySessionAccount, normalizeStorefrontErrorMessage }) {
  const navigateToBusinessPos = useCallback(() => {
    if (typeof window !== 'undefined') window.location.href = buildPosAppUrl();
  }, [buildPosAppUrl]);

  // Sends the DGFY session over to SKUpervisor for the tenant the user just
  // picked, via the single-use handoff token (frontend/src/features/pos/utils/skupervisorHandoff.js
  // buildSkupervisorHandoffUrl). Starting a tenant session here instead would
  // set its cookies on dgfy.ph's origin, which the cross-origin jump then
  // discards - SKUpervisor's own /dgfy/companies (DgfyCompanySelect.jsx)
  // starts the tenant session on its own origin once it exchanges the token.
  // Minting the handoff is best-effort: if it fails, still send the user
  // over without one and let SKUpervisor ask them to sign in there, rather
  // than dead-ending on this page.
  const redirectToSkupervisorCompany = useCallback(async (tenantId, token) => {
    let handoffToken = '';
    try {
      const handoff = await createDgfyHandoff(token);
      handoffToken = String(handoff?.handoff_token || '').trim();
    } catch {
      // Degrade below.
    }
    window.location.href = buildSkupervisorHandoffUrl({ tenantId, next: '/items', handoffToken });
  }, [buildSkupervisorHandoffUrl, createDgfyHandoff]);

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
    if (!normalizedTenantId) throw new Error('Select a company to open in SKUpervisor.');
    const token = readDgfyAuthToken();
    await requestJson(`/api/v1/dgfy/account/companies/${encodeURIComponent(normalizedTenantId)}/switch`, { method: 'POST', authToken: token, body: { email_otp_code: emailOtpCode }, cache: 'no-store' });
    await redirectToSkupervisorCompany(normalizedTenantId, token);
  }, [readDgfyAuthToken, redirectToSkupervisorCompany, requestJson]);
  const handleOpenBusinessInventory = useCallback(async (membership) => {
    const company = membership?.company || {};
    const tenantId = company.id ?? membership?.tenant_id ?? null;
    const token = readDgfyAuthToken();
    if (!tenantId) return toast.error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) return toast.error('Sign in again to open this business inventory.');
    try { await redirectToSkupervisorCompany(tenantId, token); } catch (error) { toast.error(normalizeStorefrontErrorMessage(error, 'Unable to open the business inventory right now.')); }
  }, [dgfySessionAccount?.id, normalizeStorefrontErrorMessage, readDgfyAuthToken, redirectToSkupervisorCompany]);
  const handleOpenBusinessPos = useCallback(async (membership) => {
    const tenantId = String(membership?.tenant_id || membership?.tenantId || membership?.company?.tenant_id || membership?.company?.id || membership?.tenant?.id || membership?.storefront?.tenant_id || membership?.storefront?.id || membership?.id || '').trim();
    const token = readDgfyAuthToken();
    if (!tenantId) return toast.error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) return toast.error('Sign in again to open this business POS.');
    navigateToBusinessPos();
  }, [dgfySessionAccount?.id, navigateToBusinessPos, readDgfyAuthToken]);
  return { requestDgfyBusinessSecurityCode, handleAcceptDgfyCompanyInvitation, handleRejectDgfyCompanyInvitation, handleLeaveDgfyCompany, switchDgfyCompanyFromStorefront, handleOpenBusinessInventory, handleOpenBusinessPos };
}
