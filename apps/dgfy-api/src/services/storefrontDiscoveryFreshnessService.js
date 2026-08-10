import { fn, col } from 'sequelize';
import { StorefrontDiscoveryIndex } from '../models/index.js';

const SIGNATURE_CACHE_TTL_MS = Math.max(
    250,
    Number.parseInt(process.env.STOREFRONT_DISCOVERY_SIGNATURE_TTL_MS || '1000', 10) || 1000
);

let signatureCache = {
    expiresAt: 0,
    signature: '0:0'
};

const toTimestamp = (value) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
};

export const getStorefrontDiscoverySharedSignature = async () => {
    const now = Date.now();
    if (signatureCache.expiresAt > now) {
        return signatureCache.signature;
    }

    const row = await StorefrontDiscoveryIndex.findOne({
        where: { is_visible: true },
        attributes: [
            [fn('COUNT', col('storefront_discovery_index_id')), 'row_count'],
            [fn('MAX', col('updated_at')), 'last_updated_at']
        ],
        raw: true
    });

    const rowCount = Number(row?.row_count || 0);
    const lastUpdatedAt = toTimestamp(row?.last_updated_at);
    const signature = `${rowCount}:${lastUpdatedAt}`;

    signatureCache = {
        signature,
        expiresAt: now + SIGNATURE_CACHE_TTL_MS
    };

    return signature;
};

export const invalidateStorefrontDiscoverySharedSignatureCache = () => {
    signatureCache = {
        expiresAt: 0,
        signature: '0:0'
    };
};
