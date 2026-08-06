import { useCallback, useEffect, useRef, useState } from 'react';
import { mapCustomerBusinessCompanies } from '../model/customerBusinessAssets.js';

export function useCustomerAccountPanel({
  EMPTY_ACCOUNT_PANEL,
  selectedStore,
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
    if (!silent) {
      setAccountPanel((previous) => ({ ...previous, loading: true, error: '' }));
    }

    const loadDgfyPanel = async (authToken = '') => {
      const [meData, dashboardData, activitiesData, loyaltyData, companiesData, notificationsData, addressesData, affiliateEnrollmentsData, affiliateEarningsData, affiliatePayoutMethodsData, affiliateCashoutsData] = await Promise.all([
        requestJson('/api/v1/dgfy/auth/me', { authToken, cache: 'no-store' }),
        requestJson('/api/v1/dgfy/customer/dashboard', { authToken, cache: 'no-store' }),
        requestJson('/api/v1/dgfy/customer/activities?limit=100', { authToken, cache: 'no-store' }).catch(() => ({ activities: [] })),
        requestJson('/api/v1/dgfy/customer/loyalty', { authToken, cache: 'no-store' }).catch(() => null),
        requestJson('/api/v1/dgfy/account/companies', { authToken, cache: 'no-store' }).catch(() => ({ companies: [] })),
        requestJson('/api/v1/dgfy/customer/notifications?limit=50', { authToken, cache: 'no-store' }).catch(() => ({ notifications: [], unread_count: 0 })),
        requestJson('/api/v1/dgfy/customer/addresses', { authToken, cache: 'no-store' }).catch(() => ({ addresses: [] })),
        requestJson('/api/v1/dgfy/affiliate/enrollments', { authToken, cache: 'no-store' }).catch(() => ({ enrollments: [] })),
        requestJson('/api/v1/dgfy/affiliate/earnings', { authToken, cache: 'no-store' }).catch(() => ({ earnings: null, by_store: [] })),
        requestJson('/api/v1/dgfy/affiliate/payout-methods', { authToken, cache: 'no-store' }).catch(() => ({ payout_methods: [] })),
        requestJson('/api/v1/dgfy/affiliate/cashouts', { authToken, cache: 'no-store' }).catch(() => ({ cashouts: [] }))
      ]);
      return { meData, dashboardData, activitiesData, loyaltyData, companiesData, notificationsData, addressesData, affiliateEnrollmentsData, affiliateEarningsData, affiliatePayoutMethodsData, affiliateCashoutsData };
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

        const { meData, dashboardData, activitiesData, loyaltyData, companiesData, notificationsData, addressesData, affiliateEnrollmentsData, affiliateEarningsData, affiliatePayoutMethodsData, affiliateCashoutsData } = panelData;
        const activityCollections = deriveAccountActivityCollections({ dashboardData, activitiesData });
        const addresses = Array.isArray(addressesData?.addresses) && addressesData.addresses.length > 0
          ? addressesData.addresses
          : (Array.isArray(dashboardData?.addresses) ? dashboardData.addresses : []);
        const account = meData?.account || dashboardData?.account || meData || null;
        setDgfySessionAccount(account || dgfySessionAccount || null);
        setAccountPanel({
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
          affiliateEnrollments: Array.isArray(affiliateEnrollmentsData?.enrollments) ? affiliateEnrollmentsData.enrollments : [],
          affiliateEarnings: affiliateEarningsData?.earnings || null,
          affiliateEarningsByStore: Array.isArray(affiliateEarningsData?.by_store) ? affiliateEarningsData.by_store : [],
          affiliatePayoutMethods: Array.isArray(affiliatePayoutMethodsData?.payout_methods) ? affiliatePayoutMethodsData.payout_methods : [],
          affiliateCashouts: Array.isArray(affiliateCashoutsData?.cashouts) ? affiliateCashoutsData.cashouts : []
        });
        return;
      }

      if (!selectedStore?.slug) {
        if (requestId === loadRequestRef.current) {
          setAccountPanel({ ...EMPTY_ACCOUNT_PANEL, error: 'Select a storefront to view tenant-specific account activity.' });
        }
        return;
      }

      const [me, ordersData, bookingsData] = await Promise.all([
        requestJson('/api/v1/store/auth/me', { storeSlug: selectedStore.slug, authToken: storeToken }),
        requestJson('/api/v1/store/orders?limit=25', { storeSlug: selectedStore.slug, authToken: storeToken }),
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
        businessStepUp: { verified: false }
      });
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      if (error?.status === 401) {
        clearDgfyAuthToken();
        setDgfyAuthTokenState('');
        setDgfySessionAccount(null);
      }
      setAccountPanel({ ...EMPTY_ACCOUNT_PANEL, error: normalizeStorefrontErrorMessage(error, 'Unable to load account.') });
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
    requestJson,
    selectedStore,
    setDgfyAuthTokenState,
    setDgfySessionAccount
  ]);

  useEffect(() => {
    if (!isDgfyCustomerSignedIn || accountPanel?.loading) return;
    const hasLoadedData = Boolean(
      accountPanel?.me
      || accountPanel?.orders?.length
      || accountPanel?.bookings?.length
      || accountPanel?.addresses?.length
      || accountPanel?.loyalty
      || accountPanel?.error
    );
    if (!hasLoadedData) void handleLoadAccountPanel();
  }, [accountPanel, handleLoadAccountPanel, isDgfyCustomerSignedIn]);

  return { accountPanel, setAccountPanel, handleLoadAccountPanel };
}
