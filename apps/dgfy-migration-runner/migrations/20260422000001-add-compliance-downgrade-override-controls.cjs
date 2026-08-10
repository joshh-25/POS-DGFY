/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        const addColumnIfMissing = async (columnName, definition) => {
            if (!tableInfo[columnName]) {
                await queryInterface.addColumn('tenants', columnName, definition);
            }
        };

        await addColumnIfMissing('compliance_mode_override_by', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addColumnIfMissing('compliance_mode_override_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing('compliance_mode_override_reason', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await addColumnIfMissing('compliance_mode_revert_by', {
            type: Sequelize.STRING(120),
            allowNull: true
        });
        await addColumnIfMissing('compliance_mode_revert_at', {
            type: Sequelize.DATE,
            allowNull: true
        });
        await addColumnIfMissing('compliance_mode_revert_reason', {
            type: Sequelize.STRING(255),
            allowNull: true
        });
        await addColumnIfMissing('compliance_cycle_version', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        });
        await addColumnIfMissing('compliance_revert_last_cycle_version', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        });

        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET
                compliance_cycle_version = COALESCE(compliance_cycle_version, 0),
                compliance_revert_last_cycle_version = COALESCE(compliance_revert_last_cycle_version, 0)
        `);

        const auditInfo = await queryInterface.describeTable('tenant_compliance_audit_logs').catch(() => ({}));
        if (auditInfo && Object.keys(auditInfo).length > 0) {
            await queryInterface.changeColumn('tenant_compliance_audit_logs', 'event_type', {
                type: Sequelize.ENUM(
                    'mode_selection',
                    'mode_upgrade',
                    'mode_activation',
                    'mode_force_non_compliant',
                    'mode_revert_non_compliant',
                    'blocked_operation',
                    'artifact_expiry',
                    'device_mismatch',
                    'preflight_evaluation',
                    'security_login',
                    'security_logout',
                    'security_sensitive_action',
                    'security_signal'
                ),
                allowNull: false
            });
        }

        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenants_compliance_no_downgrade');
        await queryInterface.sequelize.query(`
            CREATE TRIGGER trg_tenants_compliance_no_downgrade
            BEFORE UPDATE ON tenants
            FOR EACH ROW
            BEGIN
                IF OLD.compliance_mode_state = 'compliant_active'
                   AND NEW.compliance_mode_state = 'non_compliant_active' THEN
                    IF NEW.compliance_mode_override_at IS NULL
                       AND NEW.compliance_mode_revert_at IS NULL THEN
                        SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Compliance mode downgrade from compliant_active requires override or revert marker';
                    END IF;
                END IF;

                IF OLD.compliance_mode_state = 'compliant_pending'
                   AND NEW.compliance_mode_state = 'non_compliant_active' THEN
                    IF NEW.compliance_mode_override_at IS NULL
                       AND NEW.compliance_mode_revert_at IS NULL THEN
                        SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Compliance mode downgrade from compliant_pending requires override or revert marker';
                    END IF;

                    IF NEW.compliance_mode_revert_at IS NOT NULL THEN
                        IF COALESCE(NEW.compliance_cycle_version, 0) <= 0 THEN
                            SIGNAL SQLSTATE '45000'
                            SET MESSAGE_TEXT = 'Compliance cycle version is required for tenant revert';
                        END IF;

                        IF COALESCE(OLD.compliance_revert_last_cycle_version, 0) >= COALESCE(OLD.compliance_cycle_version, 0) THEN
                            SIGNAL SQLSTATE '45000'
                            SET MESSAGE_TEXT = 'Tenant revert to non-compliant already used for current compliance cycle';
                        END IF;

                        IF COALESCE(NEW.compliance_revert_last_cycle_version, 0) <> COALESCE(NEW.compliance_cycle_version, 0) THEN
                            SIGNAL SQLSTATE '45000'
                            SET MESSAGE_TEXT = 'Tenant revert must persist current compliance cycle version';
                        END IF;
                    END IF;
                END IF;

                IF OLD.compliance_mode_state IN ('compliant_pending', 'compliant_active')
                   AND NEW.compliance_mode_state IS NULL THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Compliance mode cannot be unset once compliant state has started';
                END IF;
            END
        `);
    },

    async down(queryInterface, Sequelize) {
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

        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        const removeIfExists = async (columnName) => {
            if (tableInfo && tableInfo[columnName]) {
                await queryInterface.removeColumn('tenants', columnName);
            }
        };

        await removeIfExists('compliance_revert_last_cycle_version');
        await removeIfExists('compliance_cycle_version');
        await removeIfExists('compliance_mode_revert_reason');
        await removeIfExists('compliance_mode_revert_at');
        await removeIfExists('compliance_mode_revert_by');
        await removeIfExists('compliance_mode_override_reason');
        await removeIfExists('compliance_mode_override_at');
        await removeIfExists('compliance_mode_override_by');

        const auditInfo = await queryInterface.describeTable('tenant_compliance_audit_logs').catch(() => ({}));
        if (auditInfo && Object.keys(auditInfo).length > 0) {
            await queryInterface.sequelize.query(`
                UPDATE tenant_compliance_audit_logs
                SET event_type = 'mode_upgrade'
                WHERE event_type IN ('mode_force_non_compliant', 'mode_revert_non_compliant')
            `).catch(() => null);
            await queryInterface.changeColumn('tenant_compliance_audit_logs', 'event_type', {
                type: Sequelize.ENUM(
                    'mode_selection',
                    'mode_upgrade',
                    'mode_activation',
                    'blocked_operation',
                    'artifact_expiry',
                    'device_mismatch',
                    'preflight_evaluation',
                    'security_login',
                    'security_logout',
                    'security_sensitive_action',
                    'security_signal'
                ),
                allowNull: false
            }).catch(() => null);
        }
    }
};
