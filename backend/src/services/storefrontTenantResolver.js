import { StorefrontDiscoveryIndex } from '../models/index.js';
import { reconcileStorefrontDiscoveryIndex } from './storefrontDiscoveryIndexService.js';
import logger from '../config/logger.js';
import { getStorefrontDiscoveryCacheVersion } from './storefrontDiscoveryCacheState.js';
import { getStorefrontDiscoverySharedSignature } from './storefrontDiscoveryFreshnessService.js';

const CACHE_TTL_MS = 30 * 1000;
const MISS_REPAIR_TTL_MS = 30 * 1000;
let cache = {
  expiresAt: 0,
  bySlug: new Map(),
  version: -1,
  signature: '0:0'
};
let emptyAutoRepairInFlight = false;
const missRepairCooldownBySlug = new Map();

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
const shouldAutoRepairEmptyIndex = () => process.env.STOREFRONT_DISCOVERY_INDEX_AUTO_REPAIR_ON_EMPTY !== 'false';

const warmMap = async () => {
  const now = Date.now();
  const version = getStorefrontDiscoveryCacheVersion();
  const signature = await getStorefrontDiscoverySharedSignature();
  if (
    cache.expiresAt > now
    && cache.bySlug instanceof Map
    && cache.version === version
    && cache.signature === signature
  ) {
    return cache.bySlug;
  }

  // entity_type: 'dgfy_native' — this resolver maps a slug to a real DGFY Tenant
  // to open in this platform's own storefront shell. External listings have no
  // tenant to resolve to; including them here would hand a visitor a "tenant"
  // object with a null id and route them into a broken storefront.
  let rows = await StorefrontDiscoveryIndex.findAll({
    where: { is_visible: true, entity_type: 'dgfy_native' },
    attributes: ['tenant_id', 'tenant_name', 'tenant_company_token', 'slug', 'affiliate_slug']
  });

  if ((!rows || rows.length === 0) && shouldAutoRepairEmptyIndex() && !emptyAutoRepairInFlight) {
    emptyAutoRepairInFlight = true;
    try {
      await reconcileStorefrontDiscoveryIndex();
      rows = await StorefrontDiscoveryIndex.findAll({
        where: { is_visible: true, entity_type: 'dgfy_native' },
        attributes: ['tenant_id', 'tenant_name', 'tenant_company_token', 'slug', 'affiliate_slug']
      });
    } catch (error) {
      logger.warn('[StorefrontTenantResolver] Auto repair reconcile failed', {
        error: error?.message || 'unknown_error'
      });
    } finally {
      emptyAutoRepairInFlight = false;
    }
  }

  const bySlug = new Map();
  (rows || []).forEach((row) => {
    const tenantEntry = {
      id: row.tenant_id,
      name: row.tenant_name,
      company_token: row.tenant_company_token
    };
    const slug = normalizeSlug(row.slug);
    if (slug) bySlug.set(slug, tenantEntry);
    const affiliateSlug = normalizeSlug(row.affiliate_slug);
    if (affiliateSlug) bySlug.set(affiliateSlug, tenantEntry);
  });

  cache = {
    bySlug,
    expiresAt: now + CACHE_TTL_MS,
    version,
    signature
  };
  return bySlug;
};

export const resolveTenantByStoreSlug = async (slug) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;
  let map = await warmMap();
  const cachedMatch = map.get(normalizedSlug);
  if (cachedMatch) return cachedMatch;

  const now = Date.now();
  const missRepairCooldown = Number(missRepairCooldownBySlug.get(normalizedSlug) || 0);
  if (missRepairCooldown > now) {
    return null;
  }

  missRepairCooldownBySlug.set(normalizedSlug, now + MISS_REPAIR_TTL_MS);
  try {
    await reconcileStorefrontDiscoveryIndex({ pruneStale: false });
    clearStorefrontTenantResolverCache();
    map = await warmMap();
    return map.get(normalizedSlug) || null;
  } catch (error) {
    logger.warn('[StorefrontTenantResolver] Miss repair reconcile failed', {
      slug: normalizedSlug,
      error: error?.message || 'unknown_error'
    });
    return null;
  }
};

export const clearStorefrontTenantResolverCache = () => {
  cache = {
    expiresAt: 0,
    bySlug: new Map(),
    version: -1,
    signature: '0:0'
  };
  missRepairCooldownBySlug.clear();
};
