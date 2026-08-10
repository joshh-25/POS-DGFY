import { StorefrontDiscoveryIndex } from '../models/index.js';
import { reconcileStorefrontDiscoveryIndex } from './storefrontDiscoveryIndexService.js';
import logger from '../config/logger.js';
import { getStorefrontDiscoveryCacheVersion } from './storefrontDiscoveryCacheState.js';
import { getStorefrontDiscoverySharedSignature } from './storefrontDiscoveryFreshnessService.js';

const CACHE_TTL_MS = 30 * 1000;
const MISS_REPAIR_TTL_MS = 30 * 1000;
// Bound on the per-slug cooldown map. Slugs come straight off an unauthenticated
// request header, so without a cap this Map grows for as long as someone keeps
// inventing new ones.
const MAX_TRACKED_MISS_SLUGS = 1000;
let cache = {
  expiresAt: 0,
  bySlug: new Map(),
  version: -1,
  signature: '0:0'
};
const missRepairCooldownBySlug = new Map();

// A reconcile opens a DB connection to EVERY active tenant. Both repair paths
// below are reachable from unauthenticated storefront traffic, so they have to
// be coalesced process-wide rather than per-slug: on 2026-07-27 a burst of
// storefront requests turned into an all-tenant connection sweep that exhausted
// MySQL's max_connections and took down unrelated storefronts. See
// docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md.
//
// Holding the in-flight promise (rather than a boolean) means concurrent callers
// await the SAME reconcile and all observe its result, instead of either
// stampeding or silently giving up and caching an empty map.
let emptyAutoRepairInFlight = null;
let missRepairInFlight = null;
let missRepairCooldownUntil = 0;

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();
const shouldAutoRepairEmptyIndex = () => process.env.STOREFRONT_DISCOVERY_INDEX_AUTO_REPAIR_ON_EMPTY !== 'false';

/**
 * Reset only the slug->tenant row cache, leaving miss cooldowns intact.
 *
 * The exported clearStorefrontTenantResolverCache() also wipes the cooldown map,
 * which is right for tests and for "something changed, forget everything" but
 * wrong immediately after a miss repair: it would drop the cooldown entry that
 * was just recorded, so the very next request for the same unknown slug would
 * trigger another all-tenant reconcile.
 */
const clearIndexCache = () => {
  cache = {
    expiresAt: 0,
    bySlug: new Map(),
    version: -1,
    signature: '0:0'
  };
};

const rememberMissedSlug = (normalizedSlug, now) => {
  if (missRepairCooldownBySlug.size >= MAX_TRACKED_MISS_SLUGS) {
    // Insertion-ordered, so the first key is the oldest entry.
    const oldest = missRepairCooldownBySlug.keys().next();
    if (!oldest.done) missRepairCooldownBySlug.delete(oldest.value);
  }
  missRepairCooldownBySlug.set(normalizedSlug, now + MISS_REPAIR_TTL_MS);
};

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

  if ((!rows || rows.length === 0) && shouldAutoRepairEmptyIndex()) {
    if (!emptyAutoRepairInFlight) {
      emptyAutoRepairInFlight = (async () => {
        try {
          await reconcileStorefrontDiscoveryIndex();
          return await StorefrontDiscoveryIndex.findAll({
            where: { is_visible: true, entity_type: 'dgfy_native' },
            attributes: ['tenant_id', 'tenant_name', 'tenant_company_token', 'slug', 'affiliate_slug']
          });
        } catch (error) {
          logger.warn('[StorefrontTenantResolver] Auto repair reconcile failed', {
            error: error?.message || 'unknown_error'
          });
          return null;
        } finally {
          emptyAutoRepairInFlight = null;
        }
      })();
    }
    // Callers that arrive mid-repair join the running one instead of skipping it.
    // Previously they fell through with zero rows and cached that empty map for
    // the full TTL, so an empty index stayed empty for everyone for 30s.
    rows = (await emptyAutoRepairInFlight) || rows;
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

  // Global cooldown, checked in addition to the per-slug one. The per-slug
  // cooldown alone bounds repeats of the SAME slug but not the number of
  // distinct ones, so N unknown slugs used to mean N all-tenant sweeps — the
  // amplifier behind the 2026-07-27 stage outage. One sweep per window, total.
  if (missRepairCooldownUntil > now && !missRepairInFlight) {
    rememberMissedSlug(normalizedSlug, now);
    return null;
  }

  rememberMissedSlug(normalizedSlug, now);

  if (!missRepairInFlight) {
    missRepairInFlight = (async () => {
      try {
        await reconcileStorefrontDiscoveryIndex({ pruneStale: false });
        return true;
      } finally {
        missRepairCooldownUntil = Date.now() + MISS_REPAIR_TTL_MS;
        missRepairInFlight = null;
      }
    })();
  }

  try {
    // Concurrent misses for different slugs all await this single reconcile,
    // then each re-read the refreshed index for their own slug.
    await missRepairInFlight;
    clearIndexCache();
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
  clearIndexCache();
  missRepairCooldownBySlug.clear();
  missRepairCooldownUntil = 0;
};
