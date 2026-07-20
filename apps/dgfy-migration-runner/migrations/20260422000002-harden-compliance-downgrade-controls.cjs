/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        const tenantInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (!tenantInfo || Object.keys(tenantInfo).length === 0) {
            return;
        }

        // Backfill existing compliant tenants so one-per-cycle revert can operate immediately.
        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET compliance_cycle_version = COALESCE(compliance_cycle_version, 0)
        `);
        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET compliance_cycle_version = 1
            WHERE compliance_mode_state IN ('compliant_pending', 'compliant_active')
              AND COALESCE(compliance_cycle_version, 0) <= 0
        `);
        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET compliance_revert_last_cycle_version = COALESCE(compliance_revert_last_cycle_version, 0)
        `);
        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET compliance_revert_last_cycle_version = 0
            WHERE compliance_revert_last_cycle_version < 0
        `);
        await queryInterface.sequelize.query(`
            UPDATE tenants
            SET compliance_revert_last_cycle_version = compliance_cycle_version
            WHERE compliance_revert_last_cycle_version > compliance_cycle_version
        `);

        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenants_compliance_no_downgrade');
        await queryInterface.sequelize.query(`
            CREATE TRIGGER trg_tenants_compliance_no_downgrade
            BEFORE UPDATE ON tenants
            FOR EACH ROW
            BEGIN
                IF OLD.compliance_mode_state IN ('compliant_pending', 'compliant_active')
                   AND NEW.compliance_mode_state = 'non_compliant_active' THEN
                    IF (
                        (
                            NOT (NEW.compliance_mode_override_at <=> OLD.compliance_mode_override_at)
                            OR NOT (NEW.compliance_mode_override_by <=> OLD.compliance_mode_override_by)
                            OR NOT (NEW.compliance_mode_override_reason <=> OLD.compliance_mode_override_reason)
                        )
                        AND
                        (
                            NOT (NEW.compliance_mode_revert_at <=> OLD.compliance_mode_revert_at)
                            OR NOT (NEW.compliance_mode_revert_by <=> OLD.compliance_mode_revert_by)
                            OR NOT (NEW.compliance_mode_revert_reason <=> OLD.compliance_mode_revert_reason)
                            OR NOT (NEW.compliance_revert_last_cycle_version <=> OLD.compliance_revert_last_cycle_version)
                        )
                    ) THEN
                        SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Compliance downgrade must mutate either override markers or revert markers, not both';
                    END IF;

                    IF NOT (
                        (
                            NOT (NEW.compliance_mode_override_at <=> OLD.compliance_mode_override_at)
                            OR NOT (NEW.compliance_mode_override_by <=> OLD.compliance_mode_override_by)
                            OR NOT (NEW.compliance_mode_override_reason <=> OLD.compliance_mode_override_reason)
                        )
                        OR
                        (
                            NOT (NEW.compliance_mode_revert_at <=> OLD.compliance_mode_revert_at)
                            OR NOT (NEW.compliance_mode_revert_by <=> OLD.compliance_mode_revert_by)
                            OR NOT (NEW.compliance_mode_revert_reason <=> OLD.compliance_mode_revert_reason)
                            OR NOT (NEW.compliance_revert_last_cycle_version <=> OLD.compliance_revert_last_cycle_version)
                        )
                    ) THEN
                        SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Compliance downgrade requires governed marker mutation in the same update';
                    END IF;

                    IF (
                        NOT (NEW.compliance_mode_revert_at <=> OLD.compliance_mode_revert_at)
                        OR NOT (NEW.compliance_mode_revert_by <=> OLD.compliance_mode_revert_by)
                        OR NOT (NEW.compliance_mode_revert_reason <=> OLD.compliance_mode_revert_reason)
                        OR NOT (NEW.compliance_revert_last_cycle_version <=> OLD.compliance_revert_last_cycle_version)
                    ) THEN
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

    async down(queryInterface) {
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
    }
};
