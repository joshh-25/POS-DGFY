'use strict';

// Affiliate invite links - lets a merchant invite an affiliate by email before that person is
// enrolled (or even has a DGFY account). One landlord/global table keyed by the invitee's email.
// Existing accounts accept via an emailed magic link; brand-new accounts are auto-enrolled on
// register via the by-email match. Idempotent guards mirror
// 20260723000001-create-affiliates-program.cjs so re-running against a migrated DB is a no-op.

const TABLE = 'dgfy_affiliate_invites';

const timestampColumns = (Sequelize) => ({
    created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    }
});

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (indexes.some((index) => index.name === options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable(TABLE).catch(() => null);
        if (!table) {
            await queryInterface.createTable(TABLE, {
                invite_id: {
                    type: Sequelize.UUID,
                    defaultValue: Sequelize.UUIDV4,
                    primaryKey: true,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                email: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                // SHA-256 hex digest of the opaque invite token. Only the hash is persisted; the raw
                // token lives solely inside the emailed magic link.
                token_hash: {
                    type: Sequelize.STRING(128),
                    allowNull: false
                },
                commission_rate_bps: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                status: {
                    type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled'),
                    allowNull: false,
                    defaultValue: 'pending'
                },
                dgfy_account_id: {
                    type: Sequelize.UUID,
                    allowNull: true
                },
                invited_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                expires_at: {
                    type: Sequelize.DATE,
                    allowNull: false
                },
                last_sent_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                accepted_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                ...timestampColumns(Sequelize)
            });
        }

        await addIndexIfMissing(queryInterface, TABLE, ['token_hash'], {
            name: 'unique_dgfy_affiliate_invites_token_hash',
            unique: true
        });
        await addIndexIfMissing(queryInterface, TABLE, ['tenant_id', 'status'], {
            name: 'idx_dgfy_affiliate_invites_tenant_status'
        });
        await addIndexIfMissing(queryInterface, TABLE, ['email'], {
            name: 'idx_dgfy_affiliate_invites_email'
        });
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable(TABLE).catch(() => null);
        if (table) {
            await queryInterface.dropTable(TABLE);
        }
    }
};
