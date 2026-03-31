import { StorefrontDiscoveryIndex } from '../models/index.js';
import { reconcileStorefrontDiscoveryIndex } from './storefrontDiscoveryIndexService.js';
import logger from '../config/logger.js';
import { getStorefrontDiscoveryCacheVersion } from './storefrontDiscoveryCacheState.js';
import { getStorefrontDiscoverySharedSignature } from './storefrontDiscoveryFreshnessService.js';

const CACHE_TTL_MS = 30 * 1000;
let cache = {
  expiresAt: 0,
  bySlug: new Map(),
  version: -1,
  signature: '0:0'
};
let emptyAutoRepairInFlight = false;

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

  let rows = await StorefrontDiscoveryIndex.findAll({
    where: { is_visible: true },
    attributes: ['tenant_id', 'tenant_name', 'tenant_company_token', 'slug']
  });

  if ((!rows || rows.length === 0) && shouldAutoRepairEmptyIndex() && !emptyAutoRepairInFlight) {
    emptyAutoRepairInFlight = true;
    try {
      await reconcileStorefrontDiscoveryIndex();
      rows = await StorefrontDiscoveryIndex.findAll({
        where: { is_visible: true },
        attributes: ['tenant_id', 'tenant_name', 'tenant_company_token', 'slug']
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
    const slug = normalizeSlug(row.slug);
    if (!slug) return;
    bySlug.set(slug, {
      id: row.tenant_id,
      name: row.tenant_name,
      company_token: row.tenant_company_token
    });
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
  const map = await warmMap();
  return map.get(normalizedSlug) || null;
};

export const clearStorefrontTenantResolverCache = () => {
  cache = {
    expiresAt: 0,
    bySlug: new Map(),
    version: -1,
    signature: '0:0'
  };
};
