import { useEffect, useState } from 'react';

import {
  readRouteSlug,
  readStoreItemId,
  readStoreReviewToken,
  readStoreServiceItemId,
  readStoreSubpage,
  setCustomStorefrontRouteContext
} from '../routing/storefrontRouting.js';
import { toSlug } from '../../shared/utils/storefrontFormatters.js';
import { isKnownDgfyPlatformHost } from '../../shared/utils/storefrontPlatformHost.js';

/**
 * Owns the browser route state used by the storefront shell.
 *
 * Route parsing remains in storefrontRouting.js. This hook only coordinates the
 * reactive route values and custom-domain resolution so the app shell can focus
 * on composing the active page. URL shapes and redirect behavior are unchanged.
 */
export function useStorefrontRouteRuntime() {
  const [routeSlug, setRouteSlug] = useState(() => readRouteSlug());
  const [routeSubpage, setRouteSubpage] = useState(() => readStoreSubpage());
  const [routeServiceItemId, setRouteServiceItemId] = useState(() => readStoreServiceItemId());
  const [routeItemId, setRouteItemId] = useState(() => readStoreItemId());
  const [routeReviewToken, setRouteReviewToken] = useState(() => readStoreReviewToken());

  useEffect(() => {
    if (routeSlug || typeof window === 'undefined') return undefined;
    // Platform hosts intentionally return no storefront context. Only probe a
    // custom domain where the request can resolve a customer storefront.
    if (isKnownDgfyPlatformHost(window.location.hostname)) return undefined;
    let cancelled = false;

    fetch('/api/v1/store/domain-context', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        return payload?.data || null;
      })
      .then((context) => {
        if (cancelled || !context?.slug) return;

        if (context.routing_mode === 'custom_domain_alias' && context.redirect_to) {
          const target = new URL(context.redirect_to);
          target.pathname = window.location.pathname;
          target.search = window.location.search;
          target.hash = window.location.hash;
          window.location.replace(target.toString());
          return;
        }

        if (context.routing_mode !== 'custom_domain') return;
        setCustomStorefrontRouteContext(context);
        setRouteSlug(toSlug(context.slug));
        setRouteSubpage(readStoreSubpage());
        setRouteServiceItemId(readStoreServiceItemId());
        setRouteItemId(readStoreItemId());
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [routeSlug]);

  return {
    routeSlug,
    routeSubpage,
    routeServiceItemId,
    routeItemId,
    routeReviewToken,
    setRouteSlug,
    setRouteSubpage,
    setRouteServiceItemId,
    setRouteItemId,
    setRouteReviewToken
  };
}
