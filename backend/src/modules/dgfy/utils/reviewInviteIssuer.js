import crypto from 'crypto';
import { dgfyCustomerRepository, hashReviewInviteToken } from '../repositories/dgfyCustomerRepository.js';

const REVIEW_INVITE_TTL_HOURS = Math.max(1, Number.parseInt(process.env.DGFY_REVIEW_INVITE_TTL_HOURS || '168', 10));

const normalizeReference = (value) => String(value || '').trim().toUpperCase();

const buildPublicToken = () => crypto.randomBytes(24).toString('hex');

export const issueReviewInvitesForOrder = async ({
    tenantId,
    order = null,
    trackingPin = '',
    deliveryChannel = 'tracking'
} = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    const normalizedTrackingPin = normalizeReference(trackingPin || order?.tracking_pin);
    const lines = Array.isArray(order?.lines) ? order.lines : [];
    if (!normalizedTenantId || !normalizedTrackingPin || lines.length === 0) return [];

    const activity = await dgfyCustomerRepository.findActivityByTenantReference({
        tenantId: normalizedTenantId,
        reference: normalizedTrackingPin
    }).catch(() => null);

    const seen = new Set();
    const invites = [];
    for (const line of lines) {
        const itemId = Number.parseInt(line?.item_id, 10);
        if (!Number.isInteger(itemId) || itemId <= 0 || seen.has(itemId)) continue;
        seen.add(itemId);

        const existingReview = await dgfyCustomerRepository.findReviewByTrackingActivityTarget({
            tenantId: normalizedTenantId,
            activityId: activity?.activity_id || null,
            targetType: 'fnb_item',
            targetId: itemId
        });
        if (existingReview) continue;

        await dgfyCustomerRepository.revokeActiveReviewInvites({
            tenantId: normalizedTenantId,
            trackingPin: normalizedTrackingPin,
            targetType: 'fnb_item',
            targetId: itemId
        });

        const publicToken = buildPublicToken();
        await dgfyCustomerRepository.createReviewInvite({
            tenant_id: normalizedTenantId,
            activity_id: activity?.activity_id || null,
            tracking_pin: normalizedTrackingPin,
            target_type: 'fnb_item',
            target_id: itemId,
            item_name: line?.item?.name || line?.item_name || null,
            delivery_channel: deliveryChannel,
            token_hash: hashReviewInviteToken(publicToken),
            status: 'issued',
            expires_at: new Date(Date.now() + (REVIEW_INVITE_TTL_HOURS * 60 * 60 * 1000))
        });

        invites.push({
            target_type: 'fnb_item',
            target_id: itemId,
            item_name: line?.item?.name || line?.item_name || 'Menu item',
            token: publicToken
        });
    }

    return invites;
};

export default {
    issueReviewInvitesForOrder
};
