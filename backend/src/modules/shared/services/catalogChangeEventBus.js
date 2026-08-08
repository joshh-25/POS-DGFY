import crypto from 'crypto';
import { EventEmitter } from 'events';
import logger from '../../../config/logger.js';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';

const bus = new EventEmitter();
bus.setMaxListeners(0);

const INSTANCE_ID = crypto.randomUUID();
const REDIS_CHANNEL_PREFIX = 'dgfy:catalog-change:';
let redisSubscriber = null;
let redisSubscriberPromise = null;
const subscribedRedisChannels = new Set();
const pendingRedisChannelSubscriptions = new Map();

const normalizeTenantId = (tenantId) => String(tenantId || '').trim();
const normalizeItemIds = (itemIds = []) => [...new Set(
    (Array.isArray(itemIds) ? itemIds : [itemIds])
        .map((itemId) => Number.parseInt(itemId, 10))
        .filter((itemId) => Number.isInteger(itemId) && itemId > 0)
)];
const localChannel = (tenantId) => `catalog-change:${tenantId}`;
const redisChannel = (tenantId) => `${REDIS_CHANNEL_PREFIX}${tenantId}`;

const dispatch = (tenantId, event) => {
    bus.emit(localChannel(tenantId), event);
};

const safelyDispatchRedisEvent = (rawEvent) => {
    try {
        const event = JSON.parse(rawEvent);
        const tenantId = normalizeTenantId(event?.tenant_id);
        if (!tenantId || event?.origin_instance_id === INSTANCE_ID) return;
        dispatch(tenantId, event);
    } catch (error) {
        logger.warn('[CatalogChangeEvents] Ignored malformed Redis event', {
            event_type: 'catalog_change_event_malformed',
            error: error?.message || 'unknown'
        });
    }
};

const ensureRedisSubscriber = async () => {
    if (!isRedisConnected()) return null;
    if (redisSubscriber?.isReady) return redisSubscriber;
    if (redisSubscriberPromise) return redisSubscriberPromise;

    const redisClient = getRedisClient();
    if (!redisClient) return null;

    const candidate = redisClient.duplicate();
    candidate.on('error', (error) => {
        logger.warn('[CatalogChangeEvents] Redis subscriber error', {
            event_type: 'catalog_change_events_redis_subscriber_error',
            error: error?.message || 'unknown'
        });
    });

    redisSubscriberPromise = candidate.connect()
        .then(() => {
            redisSubscriber = candidate;
            return candidate;
        })
        .catch((error) => {
            logger.warn('[CatalogChangeEvents] Redis subscriber unavailable; local event delivery remains active', {
                event_type: 'catalog_change_events_redis_subscriber_unavailable',
                error: error?.message || 'unknown'
            });
            candidate.disconnect?.();
            return null;
        })
        .finally(() => {
            redisSubscriberPromise = null;
        });

    return redisSubscriberPromise;
};

const ensureRedisTenantSubscription = async (tenantId) => {
    const channel = redisChannel(tenantId);
    if (subscribedRedisChannels.has(channel)) return;
    if (pendingRedisChannelSubscriptions.has(channel)) {
        return pendingRedisChannelSubscriptions.get(channel);
    }

    const subscription = (async () => {
        const subscriber = await ensureRedisSubscriber();
        if (!subscriber || subscribedRedisChannels.has(channel)) return;
        await subscriber.subscribe(channel, safelyDispatchRedisEvent);
        subscribedRedisChannels.add(channel);
    })().catch((error) => {
        logger.warn('[CatalogChangeEvents] Redis tenant subscription unavailable; local event delivery remains active', {
            event_type: 'catalog_change_events_redis_subscription_unavailable',
            tenant_id: tenantId,
            error: error?.message || 'unknown'
        });
    }).finally(() => {
        pendingRedisChannelSubscriptions.delete(channel);
    });

    pendingRedisChannelSubscriptions.set(channel, subscription);
    return subscription;
};

export const publishCatalogChange = async ({ tenantId, reason = 'catalog_changed', itemIds = [] } = {}) => {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) return false;

    const event = {
        type: 'pos.catalog.changed',
        tenant_id: normalizedTenantId,
        reason: String(reason || 'catalog_changed').trim().slice(0, 80) || 'catalog_changed',
        item_ids: normalizeItemIds(itemIds),
        emitted_at: new Date().toISOString(),
        origin_instance_id: INSTANCE_ID
    };

    // Same-node cashier streams receive the event immediately. Redis fan-out
    // reaches cashier streams held by other API instances when Redis is enabled.
    dispatch(normalizedTenantId, event);

    if (!isRedisConnected()) return true;
    const redisClient = getRedisClient();
    if (!redisClient) return true;

    try {
        await redisClient.publish(redisChannel(normalizedTenantId), JSON.stringify(event));
    } catch (error) {
        logger.warn('[CatalogChangeEvents] Redis publish failed; local event delivery succeeded', {
            event_type: 'catalog_change_events_redis_publish_failed',
            tenant_id: normalizedTenantId,
            error: error?.message || 'unknown'
        });
    }

    return true;
};

export const subscribeCatalogChanges = (tenantId, listener) => {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId || typeof listener !== 'function') return () => {};

    const channel = localChannel(normalizedTenantId);
    bus.on(channel, listener);
    void ensureRedisTenantSubscription(normalizedTenantId);
    return () => bus.off(channel, listener);
};

export default {
    publishCatalogChange,
    subscribeCatalogChanges
};
