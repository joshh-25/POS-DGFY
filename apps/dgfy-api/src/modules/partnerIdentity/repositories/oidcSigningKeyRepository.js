import crypto from 'node:crypto';
import { Transaction } from 'sequelize';
import { OidcSigningKey, sequelize } from '../../../models/index.js';

export const oidcSigningKeyRepository = {
    count() {
        return OidcSigningKey.count();
    },

    findByKid(kid) {
        return OidcSigningKey.findOne({ where: { kid } });
    },

    findActive() {
        return OidcSigningKey.findOne({ where: { status: 'active' }, order: [['activated_at', 'DESC']] });
    },

    findVerificationKeys() {
        return OidcSigningKey.findAll({
            where: { status: ['active', 'retiring'] },
            order: [['activated_at', 'DESC']]
        });
    },

    async promote(kid) {
        return sequelize.transaction(async (transaction) => {
            const rows = await OidcSigningKey.findAll({
                where: { status: ['active', 'retiring'] },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            const target = rows.find((row) => row.kid === kid)
                || await OidcSigningKey.findOne({ where: { kid }, transaction, lock: transaction.LOCK.UPDATE });
            if (!target) throw new Error(`OIDC signing key not found: ${kid}`);
            if (target.status === 'revoked') throw new Error(`OIDC signing key is revoked: ${kid}`);
            const now = new Date();
            for (const row of rows) {
                if (row.kid !== kid && row.status === 'active') {
                    await row.update({ status: 'retiring', retired_at: now }, { transaction });
                }
            }
            await target.update({ status: 'active', activated_at: now, retired_at: null }, { transaction });
            return target;
        }, { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE });
    },

    async transition(kid, status) {
        const row = await OidcSigningKey.findOne({ where: { kid } });
        if (!row) throw new Error(`OIDC signing key not found: ${kid}`);
        const now = new Date();
        const updates = status === 'retiring'
            ? { status, retired_at: now }
            : { status, revoked_at: now };
        await row.update(updates);
        return row;
    },

    create({ kid, publicKeyPem, privateKeyEnvRef }) {
        return OidcSigningKey.create({
            id: crypto.randomUUID(),
            kid,
            public_key_pem: publicKeyPem,
            private_key_env_ref: privateKeyEnvRef,
            status: 'retiring'
        });
    }
};
