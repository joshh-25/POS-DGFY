import { Op } from 'sequelize';
import { PushDeliveryLog, PushDiagnosticDevice, PushDiagnosticEnrollmentCode } from '../../../models/index.js';

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);
const isDuplicateKeyError = (error) => (
    error?.name === 'SequelizeUniqueConstraintError' || error?.original?.code === 'ER_DUP_ENTRY'
);

export const pushDiagnosticEnrollmentCodeRepository = {
    async create({ codeHash, adminId, expiresAt }) {
        return toPlain(await PushDiagnosticEnrollmentCode.create({
            code_hash: codeHash,
            created_by_admin_id: adminId,
            expires_at: expiresAt
        }));
    },

    // Atomically consumes a code and enrolls (or refreshes) the device. Every failure mode returns
    // the same `invalid_code` status so a caller cannot tell an unknown code from an expired or
    // already-used one.
    async consumeAndEnroll({ codeHash, device, now = new Date() }) {
        const attempt = async (retry) => {
            try {
                return await PushDiagnosticEnrollmentCode.sequelize.transaction(async (transaction) => {
                    const code = await PushDiagnosticEnrollmentCode.findOne({
                        where: { code_hash: codeHash },
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    if (!code || code.consumed_at || new Date(code.expires_at).getTime() <= now.getTime()) {
                        return { status: 'invalid_code' };
                    }

                    const existing = await PushDiagnosticDevice.findOne({
                        where: { token: device.token, revoked_at: null },
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    let row;
                    if (existing) {
                        await existing.update({
                            platform: device.platform,
                            app: device.app,
                            brand: device.brand,
                            enrolled_by_admin_id: code.created_by_admin_id,
                            last_seen_at: now
                        }, { transaction });
                        row = existing;
                    } else {
                        row = await PushDiagnosticDevice.create({
                            token: device.token,
                            platform: device.platform,
                            app: device.app,
                            brand: device.brand,
                            label: null,
                            enrolled_by_admin_id: code.created_by_admin_id,
                            last_seen_at: now
                        }, { transaction });
                    }
                    await code.update({ consumed_at: now, consumed_device_id: row.id }, { transaction });
                    return { status: 'enrolled', device: toPlain(row), adminId: code.created_by_admin_id };
                });
            } catch (error) {
                if (retry && isDuplicateKeyError(error)) return attempt(false);
                throw error;
            }
        };
        return attempt(true);
    },

    async purgeExpired(cutoff, { limit = 1000 } = {}) {
        const rows = await PushDiagnosticEnrollmentCode.findAll({
            where: { expires_at: { [Op.lt]: cutoff } },
            attributes: ['id'], limit, order: [['expires_at', 'ASC']]
        });
        if (!rows.length) return 0;
        return PushDiagnosticEnrollmentCode.destroy({ where: { id: { [Op.in]: rows.map((row) => row.id) } } });
    }
};

export const pushDiagnosticDeviceRepository = {
    list({ includeRevoked = false, limit = 50 } = {}) {
        return PushDiagnosticDevice.findAll({
            where: includeRevoked ? {} : { revoked_at: null },
            order: [['created_at', 'DESC']],
            limit
        }).then((rows) => rows.map(toPlain));
    },

    findActiveById(id) {
        return PushDiagnosticDevice.findOne({ where: { id, revoked_at: null } }).then(toPlain);
    },

    async revokeById(id, reason = 'revoked_by_operator') {
        const [affected] = await PushDiagnosticDevice.update({ revoked_at: new Date(), revoke_reason: reason }, {
            where: { id, revoked_at: null }
        });
        return affected;
    },

    async purgeRevoked(cutoff, { limit = 1000 } = {}) {
        const rows = await PushDiagnosticDevice.findAll({
            where: { revoked_at: { [Op.lt]: cutoff } },
            attributes: ['id'], limit, order: [['revoked_at', 'ASC']]
        });
        if (!rows.length) return 0;
        return PushDiagnosticDevice.destroy({ where: { id: { [Op.in]: rows.map((row) => row.id) } } });
    },

    // Test sends are written to push_delivery_logs (token_id has no foreign key) so they share the
    // receipt poller and the operator attempts view with real traffic.
    async countRecentTestSends(deviceId, since) {
        return PushDeliveryLog.count({
            where: { token_id: deviceId, purpose: 'diagnostic_test', sent_at: { [Op.gte]: since } }
        });
    },

    async createTestSendLog(payload) {
        return toPlain(await PushDeliveryLog.create(payload));
    }
};

export default { pushDiagnosticDeviceRepository, pushDiagnosticEnrollmentCodeRepository };
