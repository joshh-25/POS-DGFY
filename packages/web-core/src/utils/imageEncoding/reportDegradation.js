import { trackEvent } from '../../observability/analyticsClient.js';

/**
 * Client-emitted fallback-rate signal (epic #265, Phase 298). `prepareImageVariants`'s `degraded`
 * array always includes `'flag_off'` when client conversion is intentionally disabled -- that's
 * expected, inert behavior, not a degradation worth counting. Every other code (probe failure,
 * encode throw, deadline expired, EXIF-orientation-unknown, blank-canvas discard) is a real
 * fallback and gets exactly one `trackEvent` call per `prepareImageVariants` invocation that
 * produced it.
 *
 * This reuses the existing PostHog `trackEvent` wrapper (`analyticsClient.js`) -- a routine,
 * expected-to-happen-sometimes fallback is not an error-tracking event, so this deliberately does
 * not add a new Sentry capture (see this phase's ADR 0017 amendment for the reasoning).
 */
export function reportImageClientConversionDegradation({ scope, degraded = [], manifest = null } = {}) {
  const reasons = Array.isArray(degraded) ? degraded.filter((code) => code !== 'flag_off') : [];
  if (reasons.length === 0) return;

  trackEvent('image_client_conversion_degraded', {
    scope: scope || null,
    reason: reasons[0],
    degraded_codes: reasons,
    targets: manifest?.variants ? Object.keys(manifest.variants) : null,
  });
}
