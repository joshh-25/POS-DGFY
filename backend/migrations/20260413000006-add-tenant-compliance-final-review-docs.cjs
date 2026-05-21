/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const [documentTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'tenant_compliance_final_review_documents'");
        if (!Array.isArray(documentTables) || documentTables.length === 0) {
            await queryInterface.createTable('tenant_compliance_final_review_documents', {
                tenant_compliance_final_review_document_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: {
                        model: 'tenants',
                        key: 'id'
                    },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                requirement_code: {
                    type: Sequelize.ENUM(
                        'submission_system_flow_diagram_mmd',
                        'submission_system_flow_diagram_png',
                        'submission_software_specification',
                        'submission_backup_dr_plan',
                        'submission_filing_instructions',
                        'evidence_restore_drill',
                        'evidence_encryption_verification'
                    ),
                    allowNull: false
                },
                source_type: {
                    type: Sequelize.ENUM('upload', 'external_url'),
                    allowNull: true
                },
                external_url: {
                    type: Sequelize.STRING(1000),
                    allowNull: true
                },
                file_name: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                file_path: {
                    type: Sequelize.STRING(800),
                    allowNull: true
                },
                mime_type: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                file_size_bytes: {
                    type: Sequelize.BIGINT,
                    allowNull: true
                },
                freshness_date: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                status: {
                    type: Sequelize.ENUM('auto_valid', 'invalid', 'revoked'),
                    allowNull: false,
                    defaultValue: 'invalid'
                },
                review_state: {
                    type: Sequelize.ENUM('pending_review', 'review_noted', 'revoked'),
                    allowNull: false,
                    defaultValue: 'pending_review'
                },
                review_note: {
                    type: Sequelize.TEXT,
                    allowNull: true
                },
                reviewed_by_actor_type: {
                    type: Sequelize.ENUM('platform_admin'),
                    allowNull: true
                },
                reviewed_by_user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                reviewed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                parsed_metadata: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
                created_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex('tenant_compliance_final_review_documents', ['tenant_id']);
            await queryInterface.addIndex('tenant_compliance_final_review_documents', ['requirement_code']);
            await queryInterface.addIndex('tenant_compliance_final_review_documents', ['status']);
            await queryInterface.addIndex('tenant_compliance_final_review_documents', ['review_state']);
            await queryInterface.addIndex('tenant_compliance_final_review_documents', ['tenant_id', 'requirement_code'], {
                unique: true,
                name: 'tenant_final_review_document_unique'
            });
        }

        const [signoffTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'tenant_compliance_final_review_signoffs'");
        if (!Array.isArray(signoffTables) || signoffTables.length === 0) {
            await queryInterface.createTable('tenant_compliance_final_review_signoffs', {
                tenant_compliance_final_review_signoff_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true,
                    allowNull: false
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: {
                        model: 'tenants',
                        key: 'id'
                    },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                engineering_approver: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                compliance_approver: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                filing_batch_id: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                engineering_signed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                compliance_signed_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                created_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex('tenant_compliance_final_review_signoffs', ['tenant_id'], {
                unique: true,
                name: 'tenant_final_review_signoff_tenant_unique'
            });
        }
    },

    async down(queryInterface) {
        await queryInterface.dropTable('tenant_compliance_final_review_signoffs').catch(() => null);
        await queryInterface.dropTable('tenant_compliance_final_review_documents').catch(() => null);
    }
};

