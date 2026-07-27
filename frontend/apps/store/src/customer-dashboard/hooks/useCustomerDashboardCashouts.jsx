import { useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * Cashout request/history/cancel action hook - same busy-token +
 * toast + handleLoadAccountPanel() refresh shape as
 * useCustomerDashboardPayouts.jsx/useCustomerDashboardAddresses.jsx.
 * Cashouts are per-store (require tenant_id), unlike payout methods
 * which are account-level.
 */
export function useCustomerDashboardCashouts({
  handleLoadAccountPanel,
  dgfySessionAccount,
  requestJson,
  readDgfyAuthToken,
  normalizeStorefrontErrorMessage
}) {
  const [accountCashoutActionId, setAccountCashoutActionId] = useState('');

  const handleRequestCashout = useCallback(async ({ tenantId, payoutMethodId } = {}) => {
    const token = readDgfyAuthToken();
    if (!token && !dgfySessionAccount?.id) { toast.error('Sign in to request a cashout.'); return false; }
    if (!tenantId) { toast.error('Unable to determine which business this cashout is for.'); return false; }
    setAccountCashoutActionId(`request:${tenantId}`);
    try {
      await requestJson('/api/v1/dgfy/affiliate/cashouts', {
        method: 'POST',
        authToken: token,
        cache: 'no-store',
        body: { tenant_id: tenantId, ...(payoutMethodId ? { payout_method_id: payoutMethodId } : {}) }
      });
      toast.success('Cashout requested.');
      await handleLoadAccountPanel();
      return true;
    } catch (error) {
      toast.error(normalizeStorefrontErrorMessage(error, 'Unable to request a cashout right now.'));
      return false;
    } finally {
      setAccountCashoutActionId('');
    }
  }, [dgfySessionAccount?.id, handleLoadAccountPanel, normalizeStorefrontErrorMessage, readDgfyAuthToken, requestJson]);

  const handleCancelCashout = useCallback(async (cashout = {}) => {
    if (!cashout.cashout_id) return;
    setAccountCashoutActionId(`cancel:${cashout.cashout_id}`);
    try { await requestJson(`/api/v1/dgfy/affiliate/cashouts/${encodeURIComponent(cashout.cashout_id)}/cancel`, { method: 'PATCH', authToken: readDgfyAuthToken(), cache: 'no-store' }); toast.success('Cashout cancelled.'); await handleLoadAccountPanel(); }
    finally { setAccountCashoutActionId(''); }
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson]);

  return { accountCashoutActionId, handleRequestCashout, handleCancelCashout };
}

export default useCustomerDashboardCashouts;
