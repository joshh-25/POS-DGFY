import { useEffect, useRef } from 'react';
import { readAffiliateShortCode, setAffiliateShareRouteSlug } from '../../app/routing/storefrontRouting.js';
import { requestJson } from '../../services/requestJson.js';

/**
 * Best-effort, once-per-load resolution + capture of a `/s/{short_code}` affiliate share link
 * (#452, Phase 212).
 *
 * Two steps, both fire-and-forget from the caller's point of view:
 *
 * 1. Resolve the short code to a store slug via `GET /affiliate/s/:short_code` (a browse-tier
 *    limiter, deliberately not the auth-tier limiter the capture POST below sits on -- see
 *    docs/api/RATE_LIMITING.md). On `resolved: true`, calls `setAffiliateShareRouteSlug` so
 *    `readRouteSlug()` can return the resolved slug, then `onShareRouteResolved` so the caller
 *    (StorefrontApp) can update its own `routeSlug` state and boot the store. On `resolved: false`,
 *    a 429, or a network error, this is a silent no-op -- the storefront falls through to the
 *    ordinary discovery home, no error page, no retry (A3's degrade path).
 * 2. Once a slug is known, POST to the public attribution-capture endpoint, which sets an HttpOnly
 *    `sku_aff_attr` cookie server-side keyed by tenant_id. That cookie rides along automatically on
 *    the same-origin checkout POST (`requestJson` always sends `credentials: 'include'`), where the
 *    backend checkout controller/use case reads it and records a `pending` commission - no further
 *    frontend wiring is needed once this fires.
 *
 * `?p=` is retired entirely (#452 E1 decision, 2026-08-30) -- `readAffiliateShortCode()` only ever
 * reads the `/s/{short_code}` path now, so every non-empty code arriving here needs resolution;
 * there is no "code already implies a known slug" shortcut left to take.
 */
export function useAffiliateAttributionCapture({ routeSlug, onShareRouteResolved } = {}) {
  const capturedRef = useRef(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (capturedRef.current) return;

    const shortCode = readAffiliateShortCode();
    if (!shortCode) {
      capturedRef.current = true;
      return;
    }

    // Already resolved (routeSlug came back from a previous pass through this effect) - fire the
    // capture POST now.
    if (routeSlug) {
      capturedRef.current = true;
      requestJson('/api/v1/dgfy/affiliate/attribution/capture', {
        method: 'POST',
        body: { short_code: shortCode, store_slug: routeSlug }
      }).catch(() => {});
      return;
    }

    if (resolvedRef.current) return;
    resolvedRef.current = true;

    requestJson(`/api/v1/dgfy/affiliate/s/${encodeURIComponent(shortCode)}`)
      .then((data) => {
        if (!data?.resolved || !data?.store_slug) return;
        setAffiliateShareRouteSlug(data.store_slug);
        onShareRouteResolved?.(data.store_slug);
      })
      .catch(() => {});
  }, [routeSlug, onShareRouteResolved]);
}

export default useAffiliateAttributionCapture;
