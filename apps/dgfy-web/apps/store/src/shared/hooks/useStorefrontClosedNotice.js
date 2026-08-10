import { useMemo } from 'react';
import { getStorefrontClosedBody, getStorefrontClosedToastMessage } from '../model/storefrontClosedState.js';
import { formatStorefrontHoursLabel } from '../model/storefrontHoursModel.js';
import { parseBooleanFlag } from '../model/storefrontJsonModel.js';
import { createStorefrontClosedNoticeRenderer } from '../components/StorefrontClosedNotice.jsx';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the storefront-hours/closed-notice
 * derivations (`storefrontHoursStatus`, `storefrontClosedByHours`,
 * `storefrontHoursLabel`, `storefrontClosedMessageBody`,
 * `storefrontClosedToastMessage`, `renderStorefrontClosedNotice`) plus the
 * `followUiEnabledForStore`/`shareEnabledForStore` follow/share flags that
 * sat alongside them. The `useStorefrontShareActions({...})` call itself
 * stays in the shell (it's already its own hook), so `followState` is
 * passed in here rather than recomputed.
 *
 * `storefrontClosedByHours` is consumed downstream by
 * `useCheckoutTotalsAndGating`'s `fnbCartStatusLabel` - this hook's call
 * site must stay above that one in the shell (same as before the move).
 */
export function useStorefrontClosedNotice({ followEnabledForStore, followState, selectedStore }) {
  const followUiEnabledForStore = followEnabledForStore && followState.supported !== false;
  const shareEnabledForStore = parseBooleanFlag(selectedStore?.storefront_share_enabled, true);
  const storefrontHoursStatus = selectedStore?.storefront_hours_status || null;
  const storefrontClosedByHours = storefrontHoursStatus?.is_open_now === false;
  const storefrontHoursLabel = formatStorefrontHoursLabel(
    selectedStore?.storefront_hours,
    storefrontHoursStatus?.display || ''
  );
  const storefrontClosedMessageBody = getStorefrontClosedBody(storefrontHoursLabel);
  const storefrontClosedToastMessage = getStorefrontClosedToastMessage(storefrontHoursLabel);
  const renderStorefrontClosedNotice = useMemo(
    () => createStorefrontClosedNoticeRenderer(storefrontClosedMessageBody),
    [storefrontClosedMessageBody]
  );

  return {
    followUiEnabledForStore,
    renderStorefrontClosedNotice,
    shareEnabledForStore,
    storefrontClosedByHours,
    storefrontClosedMessageBody,
    storefrontClosedToastMessage,
    storefrontHoursLabel,
    storefrontHoursStatus
  };
}
