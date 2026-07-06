import { Op } from 'sequelize';
import registerModels from '../models/index.js';

export const buildDgfyAccountRepository = ({ sequelize }) => {
    const { DgfyAccount, DgfyAccountHandoff, DgfyLegalAcknowledgement } = registerModels(sequelize);

    return {
        models: { DgfyAccount, DgfyAccountHandoff, DgfyLegalAcknowledgement },

        transaction(callback) {
            return DgfyAccount.sequelize.transaction(callback);
        },

        findByEmail(email) {
            return DgfyAccount.findOne({
                where: {
                    email: String(email || '').trim().toLowerCase(),
                    deleted_at: null
                }
            });
        },

        findByPhone(phone) {
            return DgfyAccount.findOne({
                where: {
                    phone: String(phone || '').trim(),
                    deleted_at: null
                }
            });
        },

        findById(id, options = {}) {
            return DgfyAccount.findByPk(id, options);
        },

        create(data, options = {}) {
            return DgfyAccount.create(data, options);
        },

        recordLegalAcknowledgement(payload, options = {}) {
            return DgfyLegalAcknowledgement.create(payload, options);
        },

        updateLastLogin(account) {
            if (!account) return null;
            return account.update({ last_login_at: new Date() });
        },

        markEmailVerified(account) {
            if (!account) return null;
            return account.update({
                email_verified_at: account.email_verified_at || new Date(),
                email_verification_source: account.email_verification_source || 'public_otp'
            });
        },

        updateProfile(account, data = {}) {
            if (!account) return null;
            return account.update(data);
        },

        updatePassword(account, passwordHash, extraUpdates = {}) {
            if (!account) return null;
            return account.update({ password_hash: passwordHash, ...extraUpdates });
        },

        createHandoff({ jti, dgfyAccountId, expiresAt }) {
            return DgfyAccountHandoff.create({
                jti,
                dgfy_account_id: dgfyAccountId,
                expires_at: expiresAt
            });
        },

        async consumeHandoff({ jti, dgfyAccountId }) {
            const [updatedCount] = await DgfyAccountHandoff.update(
                { consumed_at: new Date() },
                {
                    where: {
                        jti,
                        dgfy_account_id: dgfyAccountId,
                        consumed_at: null,
                        expires_at: { [Op.gt]: new Date() }
                    }
                }
            );
            if (updatedCount !== 1) return null;
            return DgfyAccountHandoff.findOne({ where: { jti, dgfy_account_id: dgfyAccountId } });
        }
    };
};

export default buildDgfyAccountRepository;
