import { useEffect, useRef } from 'react';
import { readAffiliateShortCode } from '../../app/routing/storefrontRouting.js';
import { requestJson } from '../../services/requestJson.js';

/**
 * Best-effort, once-per-load capture of a `?p=<short_code>` affiliate link.
 *
 * Fires a single POST to the public attribution-capture endpoint, which sets
 * an HttpOnly `sku_aff_attr` cookie server-side keyed by tenant_id. That
 * cookie rides along automatically on the same-origin checkout POST
 * (`requestJson` always sends `credentials: 'include'`), where the backend
 * checkout controller/use case reads it and records a `pending` commission -
 * no further frontend wiring is needed once this fires.
 *
 * Waits for `routeSlug` to resolve before firing (it starts `null` on a
 * custom-domain visit until the domain-context fetch in StorefrontApp
 * completes), but only ever sends the request once per mount - if there is
 * no `?p=` at all, it no-ops immediately and never fires.
 */
export function useAffiliateAttributionCapture({ routeSlug }) {
  const capturedRef = useRef(false);

  useEffect(() => {
    if (capturedRef.current) return;

    const shortCode = readAffiliateShortCode();
    if (!shortCode) {
      capturedRef.current = true;
      return;
    }

    if (!routeSlug) return;

    capturedRef.current = true;
    requestJson('/api/v1/dgfy/affiliate/attribution/capture', {
      method: 'POST',
      body: { p: shortCode, store_slug: routeSlug }
    }).catch(() => {});
  }, [routeSlug]);
}

export default useAffiliateAttributionCapture;
