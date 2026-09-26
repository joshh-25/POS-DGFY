import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapCustomerBusinessCompanies } from '../model/customerBusinessAssets.js';
import { getTrackingRetryAfterSeconds } from '../../tracking/customerTrackingRefresh.js';

export function useCustomerAccountPanel({
  EMPTY_ACCOUNT_PANEL,
  selectedStore,
  selectedLocation,
  selectedLocationId,
  isGlobalAccountPage,
  knownStoreRouteCandidates,
  isDgfyCustomerSignedIn,
  dgfySessionAccount,
  setDgfySessionAccount,
  setDgfyAuthTokenState,
  requestJson,
  normalizeStorefrontErrorMessage,
  deriveAccountActivityCollections,
  readDgfyAuthToken,
  readStoreAuthToken,
  clearDgfyAuthToken
}) {
  const [accountPanel, setAccountPanel] = useState(EMPTY_ACCOUNT_PANEL);
  const loadRequestRef = useRef(0);
  const loadedScopeRef = useRef('');
  const loadingScopeRef = useRef('');
  const selectedStoreSlug = isGlobalAccountPage ? '' : String(selectedStore?.slug || '').trim().toLowerCase();
  const normalizedLocationId = isGlobalAccountPage
    ? ''
    : (selectedLocationId == null || selectedLocationId === ''
    ? ''
    : String(Number.parseInt(selectedLocationId, 10)));
  const historyScopeKey = selectedStoreSlug
    ? `store:${selectedStoreSlug}:location:${normalizedLocationId || 'all'}`
    : 'all-stores';
  const historyScope = useMemo(() => (selectedStoreSlug
    ? {
        mode: normalizedLocationId ? 'branch' : 'store',
        storeSlug: selectedStoreSlug,
        storeName: String(selectedStore?.tenant_name || selectedStore?.name || '').trim(),
        locationId: normalizedLocationId ? Number(normalizedLocationId) : null,
        locationName: String(selectedLocation?.name || '').trim(),
        label: normalizedLocationId
          ? `${String(selectedStore?.tenant_name || selectedStore?.name || 'Selected store').trim()} · ${String(selectedLocation?.name || `Branch ${normalizedLocationId}`).trim()}`
          : `${String(selectedStore?.tenant_name || selectedStore?.name || 'Selected store').trim()} · All branches`
      }
    : { mode: 'all_stores', label: 'All stores', storeSlug: '', storeName: '', locationId: null, locationName: '' }), [
    normalizedLocationId,
    selectedLocation?.name,
    selectedStore?.name,
    selectedStore?.tenant_name,
    selectedStoreSlug
  ]);

  const handleLoadAccountPanel = useCallback(async ({ silent = false } = {}) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const dgfyToken = readDgfyAuthToken();
    const storeToken = readStoreAuthToken();

    if (!dgfyToken && !storeToken && !dgfySessionAccount?.id) {
      if (requestId === loadRequestRef.current) {
        setAccountPanel({ ...EMPTY_ACCOUNT_PANEL, error: '' });
      }
      return;
    }
    loadingScopeRef.current = historyScopeKey;
    if (!silent || loadedScopeRef.current !== historyScopeKey) {
      setAccountPanel((previous) => ({
        ...previous,
        loading: true,
        error: '',
        activities: [],
        orders: [],
        bookings: [],
        orderHistoryScope: historyScope,
        affiliateAccessStatus: 'loading'
      }));
    }

    const loadDgfyPanel = async (authToken = '') => {
      const activityQuery = new URLSearchParams({ limit: '100' });
      if (selectedStoreSlug) activityQuery.set('store_slug', selectedStoreSlug);
      if (normalizedLocationId) activityQuery.set('location_id', normalizedLocationId);
      const hasScopedHistory = Boolean(selectedStoreSlug);
      const [meData, dashboardData, activitiesData, loyaltyData, companiesData, notificationsData, addressesData, affiliateEnrollmentsResult, affiliateEarningsData, affiliatePayoutMethodsData, affiliateCashoutsData] = await Promise.all([
        requestJson('/api/v1/dgfy/auth/me', { authToken, cache: 'no-store' }),
        requestJson('/api/v1/dgfy/customer/dashboard', { authToken, cache: 'no-store' }),
        requestJson(`/api/v1/dgfy/customer/activities?${activityQuery.toString()}`, { authToken, cache: 'no-store' }).catch(() => (hasScopedHistory ? { activities: [] } : {})),
        requestJson('/api/v1/dgfy/customer/loyalty', { authToken, cache: 'no-store' }).catch(() => null),
        requestJson('/api/v1/dgfy/account/companies', { authToken, cache: 'no-store' }).catch(() => ({ companies: [] })),
        requestJson('/api/v1/dgfy/customer/notifications?limit=50', { authToken, cache: 'no-store' }).catch(() => ({ notifications: [], unread_count: 0 })),
        requestJson('/api/v1/dgfy/customer/addresses', { authToken, cache: 'no-store' }).catch(() => ({ addresses: [] })),
        requestJson('/api/v1/dgfy/affiliate/enrollments', { authToken, cache: 'no-store' }).then((data) => ({ status: 'ready', data })).catch(() => ({ status: 'error', data: { enrollments: [] } })),
        requestJson('/api/v1/dgfy/affiliate/earnings', { authToken, cache: 'no-store' }).catch(() => ({ earnings: null, by_store: [] })),
        requestJson('/api/v1/dgfy/affiliate/payout-methods', { authToken, cache: 'no-store' }).catch(() => ({ payout_methods: [] })),
        requestJson('/api/v1/dgfy/affiliate/cashouts', { authToken, cache: 'no-store' }).catch(() => ({ cashouts: [] }))
      ]);
      return { meData, dashboardData, activitiesData, loyaltyData, companiesData, notificationsData, addressesData, affiliateEnrollmentsData: affiliateEnrollmentsResult.data, affiliateAccessStatus: affiliateEnrollmentsResult.status, affiliateEarningsData, affiliatePayoutMethodsData, affiliateCashoutsData };
    };

    try {
      if (dgfyToken || dgfySessionAccount?.id) {
        let panelData;
        try {
          panelData = await loadDgfyPanel(dgfyToken || '');
        } catch (error) {
          if (error?.status !== 401 || !dgfyToken) throw error;
          clearDgfyAuthToken();
          setDgfyAuthTokenState('');
          panelData = await loadDgfyPanel('');
        }
        if (requestId !== loadRequestRef.current) return;

        const { meData, dashboardData, activitiesData, loyaltyData, companiesData, notificationsData, addressesData, affiliateEnrollmentsData, affiliateAccessStatus, affiliateEarningsData, affiliatePayoutMethodsData, affiliateCashoutsData } = panelData;
        const activityCollections = deriveAccountActivityCollections({ dashboardData, activitiesData });
        const addresses = Array.isArray(addressesData?.addresses) && addressesData.addresses.length > 0
          ? addressesData.addresses
          : (Array.isArray(dashboardData?.addresses) ? dashboardData.addresses : []);
        const account = meData?.account || dashboardData?.account || meData || null;
        const nextAccountPanel = {
          loading: false,
          error: '',
          me: account,
          memberships: Array.isArray(meData?.memberships) ? meData.memberships : [],
          activities: activityCollections.activities,
          orders: activityCollections.orders,
          bookings: activityCollections.bookings,
          notifications: Array.isArray(notificationsData?.notifications) ? notificationsData.notifications : [],
          unreadNotificationCount: Number(notificationsData?.unread_count || 0),
          addresses,
          loyalty: loyaltyData?.loyalty || dashboardData?.loyalty || null,
          businessCompanies: mapCustomerBusinessCompanies(companiesData?.companies, knownStoreRouteCandidates),
          businessStepUp: companiesData?.business_step_up || { verified: false },
          affiliateAccessStatus,
          affiliateEnrollments: Array.isArray(affiliateEnrollmentsData?.enrollments) ? affiliateEnrollmentsData.enrollments : [],
          affiliateEarnings: affiliateEarningsData?.earnings || null,
          affiliateEarningsByStore: Array.isArray(affiliateEarningsData?.by_store) ? affiliateEarningsData.by_store : [],
          affiliatePayoutMethods: Array.isArray(affiliatePayoutMethodsData?.payout_methods) ? affiliatePayoutMethodsData.payout_methods : [],
          affiliateCashouts: Array.isArray(affiliateCashoutsData?.cashouts) ? affiliateCashoutsData.cashouts : [],
          orderHistoryScope: historyScope
        };
        loadedScopeRef.current = historyScopeKey;
        setAccountPanel(nextAccountPanel);
        // Avoid publishing an equivalent account object on every dashboard
        // refresh. The session store is an external subscription and can
        // flush synchronously; replacing an equal object here would rerender
        // the shell before the panel's loaded marker is committed, causing
        // its bootstrap effect to start the same request again.
        if (String(dgfySessionAccount?.id || '') !== String(account?.id || '')) {
          setDgfySessionAccount(account || dgfySessionAccount || null);
        }
        return;
      }

      if (!selectedStore?.slug) {
        if (requestId === loadRequestRef.current) {
          setAccountPanel({ ...EMPTY_ACCOUNT_PANEL, error: 'Select a storefront to view tenant-specific account activity.' });
        }
        return;
      }

      const orderQuery = new URLSearchParams({ limit: '25' });
      if (normalizedLocationId) orderQuery.set('location_id', normalizedLocationId);
      const [me, ordersData, bookingsData] = await Promise.all([
        requestJson('/api/v1/store/auth/me', { storeSlug: selectedStore.slug, authToken: storeToken }),
        requestJson(`/api/v1/store/orders?${orderQuery.toString()}`, { storeSlug: selectedStore.slug, authToken: storeToken, cache: 'no-store' }),
        requestJson('/api/v1/store/services/bookings?limit=25', { storeSlug: selectedStore.slug, authToken: storeToken }).catch(() => ({ bookings: [] }))
      ]);
      if (requestId !== loadRequestRef.current) return;
      setAccountPanel({
        loading: false,
        error: '',
        me: me?.customer || me || null,
        memberships: [],
        activities: [],
        orders: Array.isArray(ordersData?.orders) ? ordersData.orders : [],
        bookings: Array.isArray(bookingsData?.bookings) ? bookingsData.bookings : [],
        notifications: [],
        unreadNotificationCount: 0,
        addresses: [],
        loyalty: null,
        businessCompanies: [],
        businessStepUp: { verified: false },
        affiliateAccessStatus: 'ready',
        affiliateEnrollments: [],
        affiliateEarnings: null,
        affiliateEarningsByStore: [],
        affiliatePayoutMethods: [],
        affiliateCashouts: [],
        orderHistoryScope: historyScope
      });
      loadedScopeRef.current = historyScopeKey;
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      loadedScopeRef.current = historyScopeKey;
      if (error?.status === 401) {
        clearDgfyAuthToken();
        setDgfyAuthTokenState('');
        setDgfySessionAccount(null);
      }
      setAccountPanel({ ...EMPTY_ACCOUNT_PANEL, affiliateAccessStatus: 'error', error: normalizeStorefrontErrorMessage(error, 'Unable to load account.'), orderHistoryScope: historyScope });
      // Surface retryAfterSeconds (never thrown further -- this function
      // always resolves) so a caller polling on an interval, e.g.
      // useCustomerDashboardLiveSync, can back off instead of retrying at
      // its normal cadence into a limiter that's already rejecting it.
      // #958/#509.
      if (error?.status === 429) {
        return { retryAfterSeconds: getTrackingRetryAfterSeconds(error) };
      }
    }
  }, [
    EMPTY_ACCOUNT_PANEL,
    clearDgfyAuthToken,
    deriveAccountActivityCollections,
    dgfySessionAccount,
    knownStoreRouteCandidates,
    normalizeStorefrontErrorMessage,
    readDgfyAuthToken,
    readStoreAuthToken,
    historyScope,
    historyScopeKey,
    normalizedLocationId,
    selectedStoreSlug,
    requestJson,
    selectedStore,
    setDgfyAuthTokenState,
    setDgfySessionAccount
  ]);

  useEffect(() => {
    if (!isDgfyCustomerSignedIn) return;
    const scopeChanged = loadedScopeRef.current !== historyScopeKey;
    if (accountPanel?.loading && loadingScopeRef.current === historyScopeKey) return;
    const hasLoadedData = Boolean(
      accountPanel?.me
      || accountPanel?.orders?.length
      || accountPanel?.bookings?.length
      || accountPanel?.addresses?.length
      || accountPanel?.loyalty
      || accountPanel?.error
    );
    if (scopeChanged || !hasLoadedData) void handleLoadAccountPanel();
  }, [accountPanel, handleLoadAccountPanel, historyScopeKey, isDgfyCustomerSignedIn]);

  return { accountPanel, setAccountPanel, handleLoadAccountPanel };
}
