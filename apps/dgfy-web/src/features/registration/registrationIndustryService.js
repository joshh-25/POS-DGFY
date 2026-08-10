import api from '../../services/api.js';
import { REGISTRATION_INDUSTRIES_DESCRIBED } from '@sieitzz/shared-constants/registrationIndustries';

// issue #178 "templates become the Operating Mode" follow-up, made
// DB-driven by issue #316. Every signup surface's Industry picker reads
// GET /api/v1/registration/industries, but - unlike DGFY legal terms,
// which deliberately blocks registration until loaded - a fetch failure
// here falls back to the local, code-owned REGISTRATION_INDUSTRIES_DESCRIBED
// constant rather than blocking. That constant is now the seed baseline
// the DB catalog was populated from, not the live source: it carries no
// `hidden` field and no `template_modules` field (whatYoullGet.js falls
// back to STORE_TEMPLATE_PRESETS for the latter), so a fetch failure shows
// every seeded industry with no "What you'll get" for anything created
// after the fact - fail-open, matching the backend's own posture.
let cachedIndustries = null;
let inFlightRequest = null;

export const fetchRegistrationIndustries = async ({ force = false } = {}) => {
  if (cachedIndustries && !force) return cachedIndustries;
  if (inFlightRequest && !force) return inFlightRequest;

  inFlightRequest = api.get('/registration/industries', { skipTenantAuthHeaders: true })
    .then((response) => {
      const industries = response.data?.data?.industries;
      cachedIndustries = Array.isArray(industries) && industries.length > 0
        ? industries
        : REGISTRATION_INDUSTRIES_DESCRIBED;
      return cachedIndustries;
    })
    .catch(() => {
      cachedIndustries = REGISTRATION_INDUSTRIES_DESCRIBED;
      return cachedIndustries;
    })
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
};

// Test-only escape hatch - production code never needs to force a refetch
// mid-session, since the catalog only changes on an admin curation action.
export const resetRegistrationIndustriesCache = () => {
  cachedIndustries = null;
  inFlightRequest = null;
};
