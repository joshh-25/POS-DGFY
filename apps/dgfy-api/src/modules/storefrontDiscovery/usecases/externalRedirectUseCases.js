import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  EXTERNAL_REDIRECT_SITES,
  normalizeExternalSiteKey,
  normalizeRedirectTemplate,
  resolveExternalRedirectUrl
} from '../domain/externalRedirectPolicy.js';

const slugPattern = /^[a-z0-9-]{1,80}$/;
const invalid = (message) => fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, message, { statusCode: 400 }));
const missing = (message) => fail(new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, message, { statusCode: 404 }));

export const buildResolveExternalRedirectUseCase = ({ repository }) => async ({ slug } = {}) => {
  const key = String(slug || '').trim().toLowerCase();
  if (!slugPattern.test(key)) return missing('External listing not found');
  const listing = await repository.getVisibleListing(key);
  if (!listing) return missing('External listing not found');
  const siteKey = normalizeExternalSiteKey(listing.external_provider);
  if (!siteKey || !listing.external_reference_id) return missing('External destination is unavailable');
  const site = await repository.getSite(siteKey);
  if (!site?.enabled) return missing('External destination is unavailable');
  const destination = resolveExternalRedirectUrl({
    template: site.url_template,
    allowedHostname: site.allowed_hostname,
    referenceId: listing.external_reference_id
  });
  if (!destination) return missing('External destination is unavailable');
  return ok({ destination, site_key: siteKey });
};

export const buildListExternalAdminUseCase = ({ repository }) => async () => {
  const [sites, listings] = await Promise.all([repository.listSites(), repository.listListings()]);
  return ok({
    sites: Object.entries(EXTERNAL_REDIRECT_SITES).map(([siteKey, meta]) => ({
      site_key: siteKey,
      display_name: meta.label,
      url_template: '',
      enabled: false,
      ...sites.find((site) => site.site_key === siteKey)
    })),
    listings: listings.filter((row) => normalizeExternalSiteKey(row.external_provider)).map((row) => ({
      slug: row.slug,
      title: row.tenant_name,
      external_provider: row.external_provider,
      external_reference_id: row.external_reference_id,
      external_record_origin: row.external_record_origin || 'manual',
      latitude: row.latitude,
      longitude: row.longitude,
      address_line: row.address_line,
      description: row.storefront_tagline,
      is_visible: row.is_visible
    }))
  });
};

export const buildSaveExternalSiteUseCase = ({ repository }) => async ({ siteKey, payload, admin } = {}) => {
  const key = normalizeExternalSiteKey(siteKey);
  if (!key) return invalid('Unknown external site');
  const template = normalizeRedirectTemplate(payload?.url_template);
  if (!template) return invalid('Use a public HTTPS URL containing exactly one {id} placeholder');
  if (typeof payload?.enabled !== 'boolean') return invalid('enabled must be a boolean');
  const site = await repository.saveSite({
    siteKey: key,
    config: { ...template, enabled: payload.enabled },
    admin
  });
  return ok({ site_key: site.site_key, url_template: site.url_template, allowed_hostname: site.allowed_hostname, enabled: site.enabled });
};

const PROVIDER_WORKFLOW_MODE = Object.freeze({
  proventus: 'services',
  eytitu: 'ticketing_transport',
  mapviu: 'services',
  synqcore: 'hospitality'
});

export const buildSaveExternalListingUseCase = ({ repository }) => async ({ slug, payload, admin } = {}) => {
  const key = String(slug || '').trim().toLowerCase();
  if (!slugPattern.test(key)) return invalid('slug must contain 1–80 lowercase letters, numbers, or hyphens');
  const siteKey = normalizeExternalSiteKey(payload?.external_provider);
  if (!siteKey) return invalid('Unknown external site');
  const reference = String(payload?.external_reference_id ?? '').trim();
  if (!reference || reference.length > 120) return invalid('external_reference_id is required (max 120 characters)');
  const title = String(payload?.title || '').trim();
  if (!title || title.length > 255) return invalid('title is required (max 255 characters)');
  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  if (payload?.latitude == null || payload?.longitude == null || payload.latitude === '' || payload.longitude === ''
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || (latitude === 0 && longitude === 0)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return invalid('Valid latitude and longitude are required for a map pin');
  }
  if (!['event_seed', 'manual'].includes(payload?.external_record_origin)) return invalid('external_record_origin must be event_seed or manual');
  const site = await repository.getSite(siteKey);
  if (!site?.enabled) return invalid('Configure and enable this site before publishing its listings');
  const result = await repository.saveListing({
    slug: key,
    admin,
    payload: {
      tenant_name: title,
      external_provider: siteKey,
      external_reference_id: reference,
      external_record_origin: payload.external_record_origin,
      external_storefront_url: '',
      workflow_mode: PROVIDER_WORKFLOW_MODE[siteKey],
      latitude,
      longitude,
      address_line: String(payload?.address_line || '').trim().slice(0, 255),
      storefront_tagline: String(payload?.description || '').trim().slice(0, 120),
      is_visible: payload?.is_visible !== false,
      storefront_open: true,
      supports_delivery: false,
      supports_pickup: false,
      supports_dine_in: false
    }
  });
  if (result.status === 'conflict') return fail(new DomainError(DomainErrorCode.CONFLICT, 'Slug belongs to a native storefront', { statusCode: 409 }));
  if (result.status === 'duplicate') return fail(new DomainError(DomainErrorCode.CONFLICT, 'Partner record is already listed under another DGFY link ID', { statusCode: 409 }));
  return ok({ slug: key, status: result.status });
};

export const buildRemoveExternalListingUseCase = ({ repository }) => async ({ slug, admin } = {}) => {
  const key = String(slug || '').trim().toLowerCase();
  if (!slugPattern.test(key)) return invalid('Invalid external listing slug');
  const result = await repository.removeListing({ slug: key, admin });
  return result.status === 'not_found' ? missing('External listing not found') : ok(result);
};

export const buildClearTemporaryExternalListingsUseCase = ({ repository }) => async ({ admin } = {}) => {
  const result = await repository.clearTemporary({ admin });
  return ok(result);
};
