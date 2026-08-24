import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { requestJson } from '../../services/requestJson.js';
import { normalizeStorefrontErrorMessage } from '../model/storefrontErrorMessages.js';
import { DGFY_BRAND_NAME } from '../model/storefrontConstants.js';

/**
 * ViewModel hook for the storefront follow + share actions.
 * Owns follow status loading, follow toggle, and native/clipboard share.
 */
export function useStorefrontShareActions({
  selectedStore,
  isStorePage,
  isStorefrontV2,
  followEnabledForStore,
  storefrontVisitorId
}) {
  const [followState, setFollowState] = useState({
    loading: false,
    isFollowing: false,
    followersCount: 0,
    error: '',
    supported: true
  });

  useEffect(() => {
    const slug = String(selectedStore?.slug || '').trim().toLowerCase();
    if (!isStorePage || !isStorefrontV2 || !followEnabledForStore || !slug || !storefrontVisitorId) {
      // Intentional reset-to-default when this store can't be followed; preserved
      // verbatim from the previous inline implementation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFollowState({ loading: false, isFollowing: false, followersCount: 0, error: '', supported: true });
      return;
    }
    let cancelled = false;
    const loadFollowStatus = async () => {
      setFollowState((prev) => ({ ...prev, loading: true }));
      try {
        const status = await requestJson(`/api/v1/store/follow/status?storefront_slug=${encodeURIComponent(slug)}&visitor_id=${encodeURIComponent(storefrontVisitorId)}`, {
          method: 'GET',
          storeSlug: slug,
          credentials: 'omit'
        });
        if (cancelled) return;
        setFollowState({
          loading: false,
          isFollowing: status?.is_following === true,
          followersCount: Number(status?.followers_count || 0),
          error: '',
          supported: true
        });
      } catch (error) {
        if (cancelled) return;
        const normalizedError = normalizeStorefrontErrorMessage(error, 'Follow status unavailable.');
        const backendContractDrift = /unknown column|provisioning_status/i.test(normalizedError);
        setFollowState({
          loading: false,
          isFollowing: false,
          followersCount: 0,
          error: backendContractDrift ? '' : 'Follow status unavailable.',
          supported: !backendContractDrift
        });
      }
    };
    loadFollowStatus();
    return () => {
      cancelled = true;
    };
  }, [isStorePage, isStorefrontV2, followEnabledForStore, selectedStore?.slug, storefrontVisitorId]);

  const handleFollowAction = async () => {
    const slug = String(selectedStore?.slug || '').trim().toLowerCase();
    if (!slug || !storefrontVisitorId || followState.loading || followState.supported === false) return;
    const nextIsFollowing = !followState.isFollowing;
    setFollowState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const response = await requestJson('/api/v1/store/follow', {
        method: nextIsFollowing ? 'POST' : 'DELETE',
        storeSlug: slug,
        credentials: 'omit',
        body: {
          storefront_slug: slug,
          visitor_id: storefrontVisitorId
        }
      });
      setFollowState({
        loading: false,
        isFollowing: response?.is_following === true,
        followersCount: Number(response?.followers_count || 0),
        error: ''
      });
      toast.success(response?.is_following ? 'Storefront followed.' : 'Storefront unfollowed.');
    } catch (error) {
      let followError = normalizeStorefrontErrorMessage(error, 'Unable to update follow status.');
      if (Number(error?.status) === 404) {
        followError = 'Storefront is unavailable for follow.';
      } else if (Number(error?.status) === 429) {
        followError = 'Too many follow requests. Please wait and retry.';
      }
      setFollowState((prev) => ({ ...prev, loading: false, error: followError }));
      toast.error(followError);
    }
  };

  const handleShareAction = async () => {
    const targetUrl = typeof window !== 'undefined' ? window.location.href : '';
    const sharePayload = {
      title: selectedStore?.tenant_name || 'Storefront',
      text: selectedStore?.storefront_tagline || `${DGFY_BRAND_NAME} tenant storefront`,
      url: targetUrl
    };
    try {
      if (navigator?.share) {
        await navigator.share(sharePayload);
        return;
      }
      if (navigator?.clipboard?.writeText && targetUrl) {
        await navigator.clipboard.writeText(targetUrl);
        toast.success('Storefront link copied.');
        return;
      }
    } catch {
      // fallback to toast below
    }
    toast.info('Sharing is unavailable in this browser.');
  };

  return { followState, handleFollowAction, handleShareAction };
}
