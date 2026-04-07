/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));

        if (!tableInfo.compliance_mode_state) {
            await queryInterface.addColumn('tenants', 'compliance_mode_state', {
                type: Sequelize.ENUM('non_compliant_active', 'compliant_pending', 'compliant_active'),
                allowNull: true
            });
        }

        if (!tableInfo.compliance_mode_choice_required) {
            await queryInterface.addColumn('tenants', 'compliance_mode_choice_required', {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            });
        }

        if (!tableInfo.compliance_mode_selected_at) {
            await queryInterface.addColumn('tenants', 'compliance_mode_selected_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.compliance_mode_selected_by) {
            await queryInterface.addColumn('tenants', 'compliance_mode_selected_by', {
                type: Sequelize.STRING(120),
                allowNull: true
            });
        }

        if (!tableInfo.compliance_activated_at) {
            await queryInterface.addColumn('tenants', 'compliance_activated_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.compliance_policy_version) {
            await queryInterface.addColumn('tenants', 'compliance_policy_version', {
                type: Sequelize.STRING(40),
                allowNull: true
            });
        }

        if (!tableInfo.compliance_profile) {
            await queryInterface.addColumn('tenants', 'compliance_profile', {
                type: Sequelize.JSON,
                allowNull: true
            });
        }

        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET
                compliance_mode_choice_required = CASE
                    WHEN compliance_mode_state IS NULL THEN 1
                    ELSE 0
                END,
                compliance_policy_version = COALESCE(compliance_policy_version, '2026.04.06')
        `);

        const [artifactTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'tenant_compliance_artifacts'");
        if (!Array.isArray(artifactTables) || artifactTables.length === 0) {
            await queryInterface.createTable('tenant_compliance_artifacts', {
                tenant_compliance_artifact_id: {
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
                artifact_type: {
                    type: Sequelize.ENUM(
                        'bir_accreditation_certificate',
                        'bir_ptu_document',
                        'npc_dps_certificate',
                        'bsp_ops_certificate',
                        'ops_security_controls_attestation',
                        'other'
                    ),
                    allowNull: false
                },
                artifact_name: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                reference_number: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                valid_from: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                valid_until: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                status: {
                    type: Sequelize.ENUM('pending', 'valid', 'expired', 'revoked'),
                    allowNull: false,
                    defaultValue: 'pending'
                },
                metadata: {
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

            await queryInterface.addIndex('tenant_compliance_artifacts', ['tenant_id']);
            await queryInterface.addIndex('tenant_compliance_artifacts', ['artifact_type']);
            await queryInterface.addIndex('tenant_compliance_artifacts', ['status']);
            await queryInterface.addIndex('tenant_compliance_artifacts', ['valid_until']);
        }

        const [peripheralTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'tenant_compliance_peripherals'");
        if (!Array.isArray(peripheralTables) || peripheralTables.length === 0) {
            await queryInterface.createTable('tenant_compliance_peripherals', {
                tenant_compliance_peripheral_id: {
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
                terminal_id: {
                    type: Sequelize.STRING(100),
                    allowNull: true
                },
                device_class: {
                    type: Sequelize.ENUM('receipt_printer', 'cash_drawer', 'scanner', 'payment_terminal', 'other'),
                    allowNull: false
                },
                brand: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                model: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                serial_number: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                accreditation_reference: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                accreditation_valid_from: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                accreditation_valid_until: {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                status: {
                    type: Sequelize.ENUM('pending', 'accredited', 'expired', 'revoked'),
                    allowNull: false,
                    defaultValue: 'pending'
                },
                metadata: {
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

            await queryInterface.addIndex('tenant_compliance_peripherals', ['tenant_id']);
            await queryInterface.addIndex('tenant_compliance_peripherals', ['terminal_id']);
            await queryInterface.addIndex('tenant_compliance_peripherals', ['device_class']);
            await queryInterface.addIndex('tenant_compliance_peripherals', ['status']);
            await queryInterface.addIndex('tenant_compliance_peripherals', ['accreditation_valid_until']);
            await queryInterface.addIndex('tenant_compliance_peripherals', ['tenant_id', 'serial_number'], {
                unique: true,
                name: 'tenant_compliance_peripherals_tenant_serial_unique'
            });
        }

        const [auditTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'tenant_compliance_audit_logs'");
        if (!Array.isArray(auditTables) || auditTables.length === 0) {
            await queryInterface.createTable('tenant_compliance_audit_logs', {
                tenant_compliance_audit_log_id: {
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
                event_type: {
                    type: Sequelize.ENUM(
                        'mode_selection',
                        'mode_upgrade',
                        'mode_activation',
                        'blocked_operation',
                        'artifact_expiry',
                        'device_mismatch',
                        'preflight_evaluation'
                    ),
                    allowNull: false
                },
                operation: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                decision: {
                    type: Sequelize.ENUM('allow', 'deny', 'requires_setup'),
                    allowNull: true
                },
                reason_code: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                actor_user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                metadata: {
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

            await queryInterface.addIndex('tenant_compliance_audit_logs', ['tenant_id']);
            await queryInterface.addIndex('tenant_compliance_audit_logs', ['event_type']);
            await queryInterface.addIndex('tenant_compliance_audit_logs', ['decision']);
            await queryInterface.addIndex('tenant_compliance_audit_logs', ['created_at']);
        }

        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenants_compliance_no_downgrade');
        await queryInterface.sequelize.query(`
            CREATE TRIGGER trg_tenants_compliance_no_downgrade
            BEFORE UPDATE ON tenants
            FOR EACH ROW
            BEGIN
                IF OLD.compliance_mode_state = 'compliant_active' AND NEW.compliance_mode_state <> 'compliant_active' THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Compliance mode downgrade from compliant_active is not allowed';
                END IF;

                IF OLD.compliance_mode_state = 'compliant_pending' AND NEW.compliance_mode_state = 'non_compliant_active' THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Compliance mode downgrade from compliant_pending is not allowed';
                END IF;

                IF OLD.compliance_mode_state IN ('compliant_pending', 'compliant_active') AND NEW.compliance_mode_state IS NULL THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Compliance mode cannot be unset once compliant state has started';
                END IF;
            END
        `);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenants_compliance_no_downgrade');

        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (tableInfo.compliance_profile) await queryInterface.removeColumn('tenants', 'compliance_profile');
        if (tableInfo.compliance_policy_version) await queryInterface.removeColumn('tenants', 'compliance_policy_version');
        if (tableInfo.compliance_activated_at) await queryInterface.removeColumn('tenants', 'compliance_activated_at');
        if (tableInfo.compliance_mode_selected_by) await queryInterface.removeColumn('tenants', 'compliance_mode_selected_by');
        if (tableInfo.compliance_mode_selected_at) await queryInterface.removeColumn('tenants', 'compliance_mode_selected_at');
        if (tableInfo.compliance_mode_choice_required) await queryInterface.removeColumn('tenants', 'compliance_mode_choice_required');
        if (tableInfo.compliance_mode_state) await queryInterface.removeColumn('tenants', 'compliance_mode_state');

        await queryInterface.dropTable('tenant_compliance_audit_logs').catch(() => null);
        await queryInterface.dropTable('tenant_compliance_peripherals').catch(() => null);
        await queryInterface.dropTable('tenant_compliance_artifacts').catch(() => null);
    }
};
