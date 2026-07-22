import { useCallback } from 'react';
import { toast } from 'sonner';

export function useCustomerDashboardBusinessAccess({ handleLoadAccountPanel, requestJson, readDgfyAuthToken, buildSkupervisorPath, buildPosAppUrl, startDgfyTenantSession, dgfySessionAccount, normalizeStorefrontErrorMessage }) {
  const navigateToBusinessPos = useCallback(() => {
    if (typeof window !== 'undefined') window.location.href = buildPosAppUrl();
  }, [buildPosAppUrl]);

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
    await requestJson(`/api/v1/dgfy/account/companies/${encodeURIComponent(normalizedTenantId)}/switch`, { method: 'POST', authToken: readDgfyAuthToken(), body: { email_otp_code: emailOtpCode }, cache: 'no-store' });
    window.location.href = buildSkupervisorPath('/items');
  }, [buildSkupervisorPath, readDgfyAuthToken, requestJson]);
  const handleOpenBusinessInventory = useCallback(async (membership) => {
    const company = membership?.company || {};
    const companyToken = String(company.company_token || '').trim();
    const tenantId = company.id ?? membership?.tenant_id ?? null;
    const token = readDgfyAuthToken();
    if (!tenantId && !companyToken) return toast.error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) return toast.error('Sign in again to open this business inventory.');
    try { await startDgfyTenantSession({ tenantId, companyToken }, token); window.location.href = buildSkupervisorPath('/items'); } catch (error) { toast.error(normalizeStorefrontErrorMessage(error, 'Unable to open the business inventory right now.')); }
  }, [buildSkupervisorPath, dgfySessionAccount?.id, normalizeStorefrontErrorMessage, readDgfyAuthToken, startDgfyTenantSession]);
  const handleOpenBusinessPos = useCallback(async (membership) => {
    const tenantId = String(membership?.tenant_id || membership?.tenantId || membership?.company?.tenant_id || membership?.company?.id || membership?.tenant?.id || membership?.storefront?.tenant_id || membership?.storefront?.id || membership?.id || '').trim();
    const token = readDgfyAuthToken();
    if (!tenantId) return toast.error('Business session details are unavailable.');
    if (!token && !dgfySessionAccount?.id) return toast.error('Sign in again to open this business POS.');
    navigateToBusinessPos();
  }, [dgfySessionAccount?.id, navigateToBusinessPos, readDgfyAuthToken]);
  return { requestDgfyBusinessSecurityCode, handleAcceptDgfyCompanyInvitation, handleRejectDgfyCompanyInvitation, handleLeaveDgfyCompany, switchDgfyCompanyFromStorefront, handleOpenBusinessInventory, handleOpenBusinessPos };
}
