import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { hasDgfyExplicitSignOut, readDgfySignedOutEmail } from '../../auth/storefrontSessionStorage.js';
import { useCustomerDashboardIdentity } from '../../customer-dashboard/hooks/useCustomerDashboardIdentity.js';
import { useStorefrontSession } from '../../shared/hooks/useStorefrontSession.js';
import { maskValue, readSavedCustomerDetails } from '../../shared/model/storefrontCustomerStorage.js';
import { buildDgfyAuthUrl } from '../../shared/utils/businessRegistrationUrl.js';
import { resolveStorefrontAccountUrl } from '../../../../../packages/web-core/src/features/dgfyRouteHelpers.js';
import { useStorefrontStore } from '../../store/useStorefrontStore.js';

export function useDiscoveryHeaderAccount() {
  const navigate = useNavigate();
  const setIsAccountDrawerOpen = useStorefrontStore((state) => state.uiSetAccountDrawerOpen);
  const {
    dgfySessionAccount,
    isDgfyCustomerSignedIn
  } = useStorefrontSession({ setIsAccountDrawerOpen });
  const {
    accountIdentityContact,
    accountIdentityInitials,
    accountIdentityName,
    accountIdentityRawEmail
  } = useCustomerDashboardIdentity({
    accountPanel: null,
    dgfySessionAccount,
    savedCustomerDetails: readSavedCustomerDetails(),
    maskValue
  });

  const handleAccountClick = useCallback(() => {
    if (typeof window === 'undefined') return;

    const accountUrl = resolveStorefrontAccountUrl();
    if (isDgfyCustomerSignedIn) {
      const target = new URL(accountUrl, window.location.href);
      if (target.origin === window.location.origin) {
        window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }
      window.location.href = target.toString();
      return;
    }

    const explicitlySignedOut = hasDgfyExplicitSignOut();
    const authUrl = new URL(buildDgfyAuthUrl({
      intent: 'customer',
      mode: 'sign-in',
      returnTo: accountUrl,
      reason: explicitlySignedOut ? 'signed-out' : '',
      email: explicitlySignedOut ? readDgfySignedOutEmail() : ''
    }));
    navigate(`/login${authUrl.search}`);
  }, [isDgfyCustomerSignedIn, navigate]);

  return {
    accountIdentityContact,
    accountIdentityInitials,
    accountIdentityName,
    accountIdentityRawEmail,
    handleAccountClick,
    isDgfyCustomerSignedIn
  };
}
