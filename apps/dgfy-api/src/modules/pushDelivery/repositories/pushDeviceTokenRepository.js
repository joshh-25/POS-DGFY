import { Op } from 'sequelize';
import { PushDeviceToken, PushDeliveryLog, StorefrontDiscoveryIndex, Tenant } from '../../../models/index.js';

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);
const isDuplicateKeyError = (error) => (
    error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === 'ER_DUP_ENTRY'
);

const ownerMatches = (row, owner = {}) => (
    String(row?.dgfy_account_id || '') === String(owner.dgfy_account_id || '')
    && String(row?.guest_tenant_id || '') === String(owner.guest_tenant_id || '')
    && String(row?.guest_order_reference || '') === String(owner.guest_order_reference || '')
    && Number(row?.guest_pos_transaction_id || 0) === Number(owner.guest_pos_transaction_id || 0)
);

const hasExactlyOneOwner = (owner = {}) => {
    const hasAccountOwner = Boolean(owner.dgfy_account_id);
    const hasGuestOwner = Boolean(
        owner.guest_tenant_id && owner.guest_order_reference && Number(owner.guest_pos_transaction_id) > 0
    );
    return hasAccountOwner !== hasGuestOwner
        && (!hasAccountOwner || (!owner.guest_tenant_id && !owner.guest_order_reference && !owner.guest_pos_transaction_id))
        && (!hasGuestOwner || !owner.dgfy_account_id);
};

const registerTokenInTransaction = async (payload, owner, { retry = true, maxActiveGuestTokens = 0 } = {}) => {
    try {
        return await PushDeviceToken.sequelize.transaction(async (transaction) => {
            const hasGuestOwner = Boolean(owner.guest_tenant_id);
            if (hasGuestOwner && maxActiveGuestTokens > 0) {
                // The landlord tenant row is a stable mutex shared by all registrations for this
                // tenant. It serializes the active-token count and insert so parallel requests
                // cannot exceed the per-order guest cap.
                const tenant = await Tenant.findByPk(owner.guest_tenant_id, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!tenant) {
                    const error = new Error('Guest push token tenant was not found');
                    error.code = 'push_guest_tenant_missing';
                    throw error;
                }
            }

            const rows = await PushDeviceToken.findAll({
                where: { token: payload.token },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            const active = rows.find((row) => !row.revoked_at);
            const now = new Date();
            if (active && ownerMatches(active, owner)) {
                await active.update({
                    platform: payload.platform,
                    app: payload.app,
                    brand: payload.brand,
                    last_seen_at: now
                }, { transaction });
                return toPlain(active);
            }

            if (hasGuestOwner && maxActiveGuestTokens > 0) {
                const activeGuestCount = await PushDeviceToken.count({
                    where: {
                        guest_tenant_id: owner.guest_tenant_id,
                        guest_order_reference: owner.guest_order_reference,
                        guest_pos_transaction_id: owner.guest_pos_transaction_id,
                        revoked_at: null
                    },
                    transaction
                });
                if (activeGuestCount >= maxActiveGuestTokens) {
                    const error = new Error('This order already has the maximum number of push devices');
                    error.code = 'push_guest_token_limit';
                    throw error;
                }
            }

            if (active) {
                await active.update({ revoked_at: now, revoke_reason: 'reassigned' }, { transaction });
            }

            const created = await PushDeviceToken.create({
                token: payload.token,
                platform: payload.platform,
                app: payload.app,
                brand: payload.brand,
                ...owner,
                last_seen_at: now,
                revoked_at: null,
                revoke_reason: null
            }, { transaction });
            return toPlain(created);
        });
    } catch (error) {
        if (retry && isDuplicateKeyError(error)) {
            return registerTokenInTransaction(payload, owner, { retry: false, maxActiveGuestTokens });
        }
        throw error;
    }
};

export const pushDeviceTokenRepository = {
    async registerToken(payload = {}, owner = {}, options = {}) {
        if (!hasExactlyOneOwner(owner)) throw new Error('Push token must have exactly one complete owner binding');
        return registerTokenInTransaction(payload, owner, options);
    },

    findActiveByToken(token) {
        return PushDeviceToken.findOne({ where: { token, revoked_at: null } }).then(toPlain);
    },

    listActiveForAccount(accountId) {
        return PushDeviceToken.findAll({
            where: { dgfy_account_id: accountId, revoked_at: null },
            order: [['created_at', 'ASC']]
        }).then((rows) => rows.map(toPlain));
    },

    listActiveForGuestOrder({ tenantId, reference, posTransactionId = null } = {}) {
        return PushDeviceToken.findAll({
            where: {
                guest_tenant_id: tenantId,
                guest_order_reference: reference,
                ...(posTransactionId ? { guest_pos_transaction_id: posTransactionId } : {}),
                revoked_at: null
            },
            order: [['created_at', 'ASC']]
        }).then((rows) => rows.map(toPlain));
    },

    countActiveForGuestOrder({ tenantId, reference } = {}) {
        return PushDeviceToken.count({
            where: {
                guest_tenant_id: tenantId,
                guest_order_reference: reference,
                revoked_at: null
            }
        });
    },

    async revokeAccountToken({ token, accountId, reason = 'deleted' } = {}) {
        const [affected] = await PushDeviceToken.update({ revoked_at: new Date(), revoke_reason: reason }, {
            where: { token, dgfy_account_id: accountId, revoked_at: null }
        });
        return affected;
    },

    async revokeGuestToken({ token, tenantId, reference, posTransactionId = null, reason = 'deleted' } = {}) {
        const [affected] = await PushDeviceToken.update({ revoked_at: new Date(), revoke_reason: reason }, {
            where: {
                token,
                guest_tenant_id: tenantId,
                guest_order_reference: reference,
                ...(posTransactionId ? { guest_pos_transaction_id: posTransactionId } : {}),
                revoked_at: null
            }
        });
        return affected;
    },

    async revokeTokenById(tokenId, reason = 'device_not_registered') {
        const [affected] = await PushDeviceToken.update({ revoked_at: new Date(), revoke_reason: reason }, {
            where: { id: tokenId, revoked_at: null }
        });
        return affected;
    },

    async revokeGuestOrderTokens({ tenantId, reference, posTransactionId = null, reason = 'order_final' } = {}) {
        const [affected] = await PushDeviceToken.update({ revoked_at: new Date(), revoke_reason: reason }, {
            where: {
                guest_tenant_id: tenantId,
                guest_order_reference: reference,
                ...(posTransactionId ? { guest_pos_transaction_id: posTransactionId } : {}),
                revoked_at: null
            }
        });
        return affected;
    },

    async findPublicStoreSlug({ tenantId, locationId = null } = {}) {
        if (!tenantId) return null;
        const baseWhere = { tenant_id: tenantId, entity_type: 'dgfy_native', is_visible: true };
        if (locationId !== null && locationId !== undefined) {
            const locationRow = await StorefrontDiscoveryIndex.findOne({
                where: { ...baseWhere, location_id: locationId },
                attributes: ['slug']
            });
            if (locationRow?.slug) return locationRow.slug;
        }
        const tenantRow = await StorefrontDiscoveryIndex.findOne({
            where: { ...baseWhere, location_id: null },
            attributes: ['slug']
        });
        return tenantRow?.slug || null;
    },

    async revokeGuestBindingsPastTtl(cutoff, { limit = 1000 } = {}) {
        const rows = await PushDeviceToken.findAll({
            where: {
                guest_tenant_id: { [Op.ne]: null },
                revoked_at: null,
                created_at: { [Op.lt]: cutoff }
            },
            attributes: ['id'], limit, order: [['created_at', 'ASC']]
        });
        if (!rows.length) return 0;
        const [affected] = await PushDeviceToken.update({ revoked_at: new Date(), revoke_reason: 'guest_ttl_expired' }, {
            where: { id: { [Op.in]: rows.map((row) => row.id) }, revoked_at: null }
        });
        return affected;
    },

    async revokeInactiveAccountTokens(cutoff, { limit = 1000 } = {}) {
        const rows = await PushDeviceToken.findAll({
            where: {
                dgfy_account_id: { [Op.ne]: null },
                revoked_at: null,
                last_seen_at: { [Op.lt]: cutoff }
            },
            attributes: ['id'], limit, order: [['last_seen_at', 'ASC']]
        });
        if (!rows.length) return 0;
        const [affected] = await PushDeviceToken.update({ revoked_at: new Date(), revoke_reason: 'account_inactive' }, {
            where: { id: { [Op.in]: rows.map((row) => row.id) }, revoked_at: null }
        });
        return affected;
    },

    async purgeRevokedTokens(cutoff, { limit = 1000 } = {}) {
        const rows = await PushDeviceToken.findAll({
            where: { revoked_at: { [Op.lt]: cutoff } },
            attributes: ['id'], limit, order: [['revoked_at', 'ASC']]
        });
        if (!rows.length) return 0;
        return PushDeviceToken.destroy({ where: { id: { [Op.in]: rows.map((row) => row.id) } } });
    }
};

export const pushDeliveryLogRepository = {
    async reservePending(payload, { tokenSince, tokenLimit = 10, orderLimit = 15, owner = {} } = {}) {
        try {
            return await PushDeliveryLog.sequelize.transaction(async (transaction) => {
                const tenant = await Tenant.findByPk(payload.tenant_id, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!tenant) throw new Error('Push delivery tenant was not found');

                const token = await PushDeviceToken.findByPk(payload.token_id, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!token || token.revoked_at || !ownerMatches(token, owner)) {
                    return { status: 'stale_token', log: null };
                }

                const existing = await PushDeliveryLog.findOne({
                    where: { dedupe_key: payload.dedupe_key },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (existing) return { status: 'duplicate', log: toPlain(existing) };

                const countedStatuses = { [Op.in]: ['pending', 'accepted', 'rejected', 'failed'] };
                const tokenCount = await PushDeliveryLog.count({
                    where: { token_id: payload.token_id, status: countedStatuses, sent_at: { [Op.gte]: tokenSince } },
                    transaction
                });
                if (tokenCount >= tokenLimit) return { status: 'token_limit', log: null };

                const orderCount = await PushDeliveryLog.count({
                    where: { tenant_id: payload.tenant_id, reference: payload.reference, status: countedStatuses },
                    transaction
                });
                if (orderCount >= orderLimit) return { status: 'order_limit', log: null };

                const log = await PushDeliveryLog.create(payload, { transaction });
                return { status: 'created', log: toPlain(log) };
            });
        } catch (error) {
            if (isDuplicateKeyError(error)) return { status: 'duplicate', log: null };
            throw error;
        }
    },

    async updateById(id, payload) {
        const row = await PushDeliveryLog.findByPk(id);
        if (!row) return null;
        await row.update(payload);
        return toPlain(row);
    },

    async findReceiptCandidates({ olderThan, youngerThan, limit = 1000 } = {}) {
        const rows = await PushDeliveryLog.findAll({
            where: {
                status: 'accepted',
                simulated: false,
                ticket_id: { [Op.ne]: null },
                receipt_checked_at: null,
                sent_at: { [Op.lte]: olderThan, [Op.gte]: youngerThan }
            },
            attributes: ['id', 'token_id', 'ticket_id', 'tenant_id', 'reference'],
            order: [['sent_at', 'ASC']],
            limit
        });
        return rows.map(toPlain);
    },

    async purgeDeliveryLogs(cutoff, { limit = 1000 } = {}) {
        const rows = await PushDeliveryLog.findAll({
            where: { sent_at: { [Op.lt]: cutoff } },
            attributes: ['id'], limit, order: [['sent_at', 'ASC']]
        });
        if (!rows.length) return 0;
        return PushDeliveryLog.destroy({ where: { id: { [Op.in]: rows.map((row) => row.id) } } });
    }
};

export default { pushDeviceTokenRepository, pushDeliveryLogRepository };
