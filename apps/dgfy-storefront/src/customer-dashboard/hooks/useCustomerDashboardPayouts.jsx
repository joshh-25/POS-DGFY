import { useCallback, useState } from 'react';
import { toast } from 'sonner';

/**
 * CRUD action hook for affiliate payout methods - mirrors the shape of
 * useCustomerDashboardAddresses.jsx (busy-token state, optimistic
 * set-default with rollback, toast + handleLoadAccountPanel() refresh
 * after every mutation), minus the address-specific pin/geolocation
 * logic that doesn't apply here.
 */
export function useCustomerDashboardPayouts({
  accountPanel,
  setAccountPanel,
  handleLoadAccountPanel,
  dgfySessionAccount,
  requestJson,
  readDgfyAuthToken,
  normalizeStorefrontErrorMessage
}) {
  const [accountPayoutActionId, setAccountPayoutActionId] = useState('');

  const handleSavePayoutMethod = useCallback(async (draft = {}, existingMethod = null) => {
    const token = readDgfyAuthToken();
    if (!token && !dgfySessionAccount?.id) { toast.error('Sign in to manage payout methods.'); return false; }
    const methodType = String(draft.method_type || 'bank').trim();
    if (methodType === 'bank') {
      if (!String(draft.bank_name || '').trim() || !String(draft.account_name || '').trim() || !String(draft.account_number || '').trim()) {
        toast.error('Bank name, account name, and account number are required.');
        return false;
      }
    } else if (!String(draft.mobile_number || '').trim()) {
      toast.error('Mobile number is required for GCash/Maya.');
      return false;
    }
    const methodId = existingMethod?.payout_method_id;
    setAccountPayoutActionId(methodId ? `save:${methodId}` : 'new');
    try {
      await requestJson(methodId ? `/api/v1/dgfy/affiliate/payout-methods/${encodeURIComponent(methodId)}` : '/api/v1/dgfy/affiliate/payout-methods', {
        method: methodId ? 'PUT' : 'POST',
        authToken: token,
        cache: 'no-store',
        body: {
          method_type: methodType,
          label: String(draft.label || '').trim() || null,
          bank_name: methodType === 'bank' ? String(draft.bank_name || '').trim() : null,
          account_name: methodType === 'bank' ? String(draft.account_name || '').trim() : null,
          account_number: methodType === 'bank' ? String(draft.account_number || '').trim() : null,
          mobile_number: methodType !== 'bank' ? String(draft.mobile_number || '').trim() : null,
          is_default: draft.is_default === true
        }
      });
      toast.success(methodId ? 'Payout method updated.' : 'Payout method saved.');
      await handleLoadAccountPanel();
      return true;
    } catch (error) {
      toast.error(normalizeStorefrontErrorMessage(error, 'Unable to save this payout method.'));
      return false;
    } finally {
      setAccountPayoutActionId('');
    }
  }, [dgfySessionAccount?.id, handleLoadAccountPanel, normalizeStorefrontErrorMessage, readDgfyAuthToken, requestJson]);

  const handleSetDefaultPayoutMethod = useCallback(async (method = {}) => {
    if (!method.payout_method_id) return;
    const targetId = String(method.payout_method_id);
    const previousMethods = Array.isArray(accountPanel?.affiliatePayoutMethods) ? accountPanel.affiliatePayoutMethods : [];
    setAccountPanel((previous) => ({ ...previous, affiliatePayoutMethods: previousMethods.map((entry) => ({ ...entry, is_default: String(entry?.payout_method_id || '') === targetId })) }));
    setAccountPayoutActionId(`default:${targetId}`);
    try {
      await requestJson(`/api/v1/dgfy/affiliate/payout-methods/${encodeURIComponent(targetId)}/default`, { method: 'PATCH', authToken: readDgfyAuthToken(), cache: 'no-store' });
      toast.success('Default payout method updated.');
      await handleLoadAccountPanel();
    } catch (error) {
      setAccountPanel((previous) => ({ ...previous, affiliatePayoutMethods: previousMethods }));
      toast.error(normalizeStorefrontErrorMessage(error, 'Unable to update default payout method.'));
    } finally {
      setAccountPayoutActionId('');
    }
  }, [accountPanel?.affiliatePayoutMethods, handleLoadAccountPanel, normalizeStorefrontErrorMessage, readDgfyAuthToken, requestJson, setAccountPanel]);

  const handleDeletePayoutMethod = useCallback(async (method = {}) => {
    if (!method.payout_method_id) return;
    setAccountPayoutActionId(`delete:${method.payout_method_id}`);
    try { await requestJson(`/api/v1/dgfy/affiliate/payout-methods/${encodeURIComponent(method.payout_method_id)}`, { method: 'DELETE', authToken: readDgfyAuthToken(), cache: 'no-store' }); toast.success('Payout method deleted.'); await handleLoadAccountPanel(); }
    finally { setAccountPayoutActionId(''); }
  }, [handleLoadAccountPanel, readDgfyAuthToken, requestJson]);

  return { accountPayoutActionId, handleSavePayoutMethod, handleSetDefaultPayoutMethod, handleDeletePayoutMethod };
}

export default useCustomerDashboardPayouts;
