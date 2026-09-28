import { Op } from 'sequelize';
import { Tenant } from '../../../models/index.js';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => {
    if (!value) return null;
    if (typeof value.get === 'function') return value.get({ plain: true });
    return { ...value };
};

const transactionLock = (transaction, lock) => (
    lock && transaction ? transaction.LOCK.UPDATE : undefined
);

const model = (name) => dbStore.get(name);

const withTransaction = async (callback, transaction = null) => {
    if (transaction) return callback(transaction);
    const sequelize = dbStore.getStore()?.sequelize;
    if (!sequelize?.transaction) {
        throw new Error('Tenant transaction context is unavailable');
    }
    return sequelize.transaction(callback);
};

const findById = async (Model, id, { transaction = null, lock = false } = {}) => {
    if (!id) return null;
    return Model.findByPk(id, {
        transaction,
        lock: transactionLock(transaction, lock)
    });
};

export const posTerminalDeviceEnrollmentRepository = {
    withTransaction,

    async findTenantById(tenantId) {
        return Tenant.findByPk(tenantId);
    },

    async createActivation(payload, options = {}) {
        return model('PosTerminalDeviceActivation').create(payload, {
            transaction: options.transaction
        });
    },

    async findActivationByHash(activationHash, options = {}) {
        return model('PosTerminalDeviceActivation').findOne({
            where: { activation_hash: activationHash },
            transaction: options.transaction,
            lock: transactionLock(options.transaction, options.lock)
        });
    },

    async consumeActivation(id, { deviceId, consumedAt = new Date(), transaction } = {}) {
        const Activation = model('PosTerminalDeviceActivation');
        const [updated] = await Activation.update(
            { consumed_at: consumedAt, consumed_by_device_id: deviceId },
            { where: { pos_terminal_device_activation_id: id, consumed_at: { [Op.is]: null } }, transaction }
        );
        return updated === 1;
    },

    async createEnrollment(payload, options = {}) {
        return model('PosTerminalDeviceEnrollment').create(payload, {
            transaction: options.transaction
        });
    },

    async findEnrollmentById(id, options = {}) {
        return findById(model('PosTerminalDeviceEnrollment'), id, options);
    },

    async findActiveEnrollmentByTerminal(terminalId, options = {}) {
        return model('PosTerminalDeviceEnrollment').findOne({
            where: { active_terminal_key: terminalId },
            transaction: options.transaction,
            lock: transactionLock(options.transaction, options.lock)
        });
    },

    async findActiveEnrollmentByDevice(deviceId, options = {}) {
        return model('PosTerminalDeviceEnrollment').findOne({
            where: { active_device_key: deviceId },
            transaction: options.transaction,
            lock: transactionLock(options.transaction, options.lock)
        });
    },

    async listEnrollments(options = {}) {
        return model('PosTerminalDeviceEnrollment').findAll({
            where: options.where,
            order: options.order || [['enrolled_at', 'DESC'], ['pos_terminal_device_enrollment_id', 'DESC']],
            transaction: options.transaction
        });
    },

    async updateEnrollment(id, changes, options = {}) {
        const Enrollment = model('PosTerminalDeviceEnrollment');
        return Enrollment.update(changes, {
            where: { pos_terminal_device_enrollment_id: id },
            transaction: options.transaction
        });
    },

    async createChallenge(payload, options = {}) {
        return model('PosTerminalDeviceChallenge').create(payload, {
            transaction: options.transaction
        });
    },

    async findChallengeByHash(challengeHash, options = {}) {
        return model('PosTerminalDeviceChallenge').findOne({
            where: { challenge_hash: challengeHash },
            transaction: options.transaction,
            lock: transactionLock(options.transaction, options.lock)
        });
    },

    async consumeChallenge(id, { consumedAt = new Date(), requestId = null, transaction } = {}) {
        const Challenge = model('PosTerminalDeviceChallenge');
        const [updated] = await Challenge.update(
            { consumed_at: consumedAt, consumed_request_id: requestId },
            { where: { pos_terminal_device_challenge_id: id, consumed_at: { [Op.is]: null } }, transaction }
        );
        return updated === 1;
    },

    async touchEnrollment(id, lastSeenAt, options = {}) {
        return this.updateEnrollment(id, { last_seen_at: lastSeenAt }, options);
    },

    async createAuditLog(payload, options = {}) {
        const AuditLog = model('AuditLog');
        if (!AuditLog?.create) throw new Error('Tenant audit log model is unavailable');
        return AuditLog.create(payload, { transaction: options.transaction });
    },

    toPlain
};

export default posTerminalDeviceEnrollmentRepository;
