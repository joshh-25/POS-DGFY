/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const artifactInfo = await queryInterface.describeTable('tenant_compliance_artifacts').catch(() => ({}));
        const peripheralInfo = await queryInterface.describeTable('tenant_compliance_peripherals').catch(() => ({}));
        const posTransactionInfo = await queryInterface.describeTable('pos_transactions').catch(() => ({}));

        if (artifactInfo && Object.keys(artifactInfo).length > 0) {
            if (!artifactInfo.verification_status) {
                await queryInterface.addColumn('tenant_compliance_artifacts', 'verification_status', {
                    type: Sequelize.ENUM('pending_review', 'verified', 'rejected', 'revoked'),
                    allowNull: false,
                    defaultValue: 'pending_review'
                });
            }
            if (!artifactInfo.verified_by_actor_type) {
                await queryInterface.addColumn('tenant_compliance_artifacts', 'verified_by_actor_type', {
                    type: Sequelize.ENUM('tenant_master_admin', 'platform_admin'),
                    allowNull: true
                });
            }
            if (!artifactInfo.verified_by_user_id) {
                await queryInterface.addColumn('tenant_compliance_artifacts', 'verified_by_user_id', {
                    type: Sequelize.INTEGER,
                    allowNull: true
                });
            }
            if (!artifactInfo.verified_at) {
                await queryInterface.addColumn('tenant_compliance_artifacts', 'verified_at', {
                    type: Sequelize.DATE,
                    allowNull: true
                });
            }
            if (!artifactInfo.verification_note) {
                await queryInterface.addColumn('tenant_compliance_artifacts', 'verification_note', {
                    type: Sequelize.TEXT,
                    allowNull: true
                });
            }
            if (!artifactInfo.verification_evidence_ref) {
                await queryInterface.addColumn('tenant_compliance_artifacts', 'verification_evidence_ref', {
                    type: Sequelize.STRING(255),
                    allowNull: true
                });
            }

            await queryInterface.sequelize.query(`
                UPDATE tenant_compliance_artifacts
                SET verification_status = CASE
                    WHEN status = 'revoked' THEN 'revoked'
                    WHEN status = 'valid' THEN 'pending_review'
                    ELSE 'pending_review'
                END
                WHERE verification_status IS NULL OR verification_status = '' OR verification_status = 'verified'
            `);

            await queryInterface.addIndex('tenant_compliance_artifacts', ['verification_status'], {
                name: 'tenant_compliance_artifacts_verification_status_idx'
            }).catch(() => null);
        }

        if (peripheralInfo && Object.keys(peripheralInfo).length > 0) {
            if (!peripheralInfo.is_shared) {
                await queryInterface.addColumn('tenant_compliance_peripherals', 'is_shared', {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                });
            }
            if (!peripheralInfo.verification_status) {
                await queryInterface.addColumn('tenant_compliance_peripherals', 'verification_status', {
                    type: Sequelize.ENUM('pending_review', 'verified', 'rejected', 'revoked'),
                    allowNull: false,
                    defaultValue: 'pending_review'
                });
            }
            if (!peripheralInfo.verified_by_actor_type) {
                await queryInterface.addColumn('tenant_compliance_peripherals', 'verified_by_actor_type', {
                    type: Sequelize.ENUM('tenant_master_admin', 'platform_admin'),
                    allowNull: true
                });
            }
            if (!peripheralInfo.verified_by_user_id) {
                await queryInterface.addColumn('tenant_compliance_peripherals', 'verified_by_user_id', {
                    type: Sequelize.INTEGER,
                    allowNull: true
                });
            }
            if (!peripheralInfo.verified_at) {
                await queryInterface.addColumn('tenant_compliance_peripherals', 'verified_at', {
                    type: Sequelize.DATE,
                    allowNull: true
                });
            }
            if (!peripheralInfo.verification_note) {
                await queryInterface.addColumn('tenant_compliance_peripherals', 'verification_note', {
                    type: Sequelize.TEXT,
                    allowNull: true
                });
            }
            if (!peripheralInfo.verification_evidence_ref) {
                await queryInterface.addColumn('tenant_compliance_peripherals', 'verification_evidence_ref', {
                    type: Sequelize.STRING(255),
                    allowNull: true
                });
            }

            await queryInterface.sequelize.query(`
                UPDATE tenant_compliance_peripherals
                SET verification_status = CASE
                    WHEN status = 'revoked' THEN 'revoked'
                    WHEN status = 'accredited' THEN 'pending_review'
                    ELSE 'pending_review'
                END
                WHERE verification_status IS NULL OR verification_status = '' OR verification_status = 'verified'
            `);

            await queryInterface.addIndex('tenant_compliance_peripherals', ['verification_status'], {
                name: 'tenant_compliance_peripherals_verification_status_idx'
            }).catch(() => null);
            await queryInterface.addIndex('tenant_compliance_peripherals', ['is_shared'], {
                name: 'tenant_compliance_peripherals_is_shared_idx'
            }).catch(() => null);
        }

        if (posTransactionInfo && Object.keys(posTransactionInfo).length > 0 && !posTransactionInfo.document_type) {
            await queryInterface.addColumn('pos_transactions', 'document_type', {
                type: Sequelize.ENUM('non_fiscal_slip', 'fiscal_invoice'),
                allowNull: false,
                defaultValue: 'non_fiscal_slip'
            });

            await queryInterface.sequelize.query(`
                UPDATE pos_transactions
                SET document_type = CASE
                    WHEN invoice_number LIKE 'INV-%' THEN 'fiscal_invoice'
                    ELSE 'non_fiscal_slip'
                END
            `);

            await queryInterface.addIndex('pos_transactions', ['document_type'], {
                name: 'pos_transactions_document_type_idx'
            }).catch(() => null);
        }
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('tenant_compliance_artifacts', 'tenant_compliance_artifacts_verification_status_idx').catch(() => null);
        await queryInterface.removeIndex('tenant_compliance_peripherals', 'tenant_compliance_peripherals_verification_status_idx').catch(() => null);
        await queryInterface.removeIndex('tenant_compliance_peripherals', 'tenant_compliance_peripherals_is_shared_idx').catch(() => null);
        await queryInterface.removeIndex('pos_transactions', 'pos_transactions_document_type_idx').catch(() => null);

        const artifactInfo = await queryInterface.describeTable('tenant_compliance_artifacts').catch(() => ({}));
        const peripheralInfo = await queryInterface.describeTable('tenant_compliance_peripherals').catch(() => ({}));
        const posTransactionInfo = await queryInterface.describeTable('pos_transactions').catch(() => ({}));

        if (artifactInfo.verification_evidence_ref) await queryInterface.removeColumn('tenant_compliance_artifacts', 'verification_evidence_ref');
        if (artifactInfo.verification_note) await queryInterface.removeColumn('tenant_compliance_artifacts', 'verification_note');
        if (artifactInfo.verified_at) await queryInterface.removeColumn('tenant_compliance_artifacts', 'verified_at');
        if (artifactInfo.verified_by_user_id) await queryInterface.removeColumn('tenant_compliance_artifacts', 'verified_by_user_id');
        if (artifactInfo.verified_by_actor_type) await queryInterface.removeColumn('tenant_compliance_artifacts', 'verified_by_actor_type');
        if (artifactInfo.verification_status) await queryInterface.removeColumn('tenant_compliance_artifacts', 'verification_status');

        if (peripheralInfo.verification_evidence_ref) await queryInterface.removeColumn('tenant_compliance_peripherals', 'verification_evidence_ref');
        if (peripheralInfo.verification_note) await queryInterface.removeColumn('tenant_compliance_peripherals', 'verification_note');
        if (peripheralInfo.verified_at) await queryInterface.removeColumn('tenant_compliance_peripherals', 'verified_at');
        if (peripheralInfo.verified_by_user_id) await queryInterface.removeColumn('tenant_compliance_peripherals', 'verified_by_user_id');
        if (peripheralInfo.verified_by_actor_type) await queryInterface.removeColumn('tenant_compliance_peripherals', 'verified_by_actor_type');
        if (peripheralInfo.verification_status) await queryInterface.removeColumn('tenant_compliance_peripherals', 'verification_status');
        if (peripheralInfo.is_shared) await queryInterface.removeColumn('tenant_compliance_peripherals', 'is_shared');

        if (posTransactionInfo.document_type) await queryInterface.removeColumn('pos_transactions', 'document_type');
    }
};

