// Landlord-DB-only (issue #178 Phase 39): whether a registration Industry
// (packages/shared-constants/src/registrationIndustries.js) is offered on
// merchant-facing signup surfaces. A row's absence means "visible" - only a
// deliberate admin hide creates a row. Keyed by the industry's natural
// string key, not a template_id: four industries (healthcare,
// ticketing_transport, logistics_distribution, education_institutions)
// have no store_configuration_templates row at all, so the existing
// (dead/write-only) `visibility` ENUM on that table can't cover them.
// Never cloned into a tenant database - see NON_TENANT_MODEL_EXPORTS in
// backend/src/utils/tenantModelFactory.js.

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => {
        const value = typeof entry === 'string'
            ? entry
            : (entry?.tableName || entry?.table_name || String(entry));
        return String(value).toLowerCase() === String(tableName).toLowerCase();
    });
};

const hasIndex = async (queryInterface, tableName, indexName) => {
    try {
        const indexes = await queryInterface.showIndex(tableName);
        return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
    } catch {
        return false;
    }
};

const addIndexIfMissing = async (queryInterface, tableName, columns, options = {}) => {
    if (options.name && await hasIndex(queryInterface, tableName, options.name)) return;
    await queryInterface.addIndex(tableName, columns, options);
};

const removeIndexIfExists = async (queryInterface, tableName, indexName) => {
    if (await hasIndex(queryInterface, tableName, indexName)) {
        await queryInterface.removeIndex(tableName, indexName);
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!await tableExists(queryInterface, 'registration_industry_visibility')) {
            await queryInterface.createTable('registration_industry_visibility', {
                industry_key: {
                    type: Sequelize.STRING(80),
                    primaryKey: true
                },
                hidden: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                reason: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                updated_by: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
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
        }

        if (!await tableExists(queryInterface, 'registration_industry_visibility_audit_logs')) {
            await queryInterface.createTable('registration_industry_visibility_audit_logs', {
                audit_log_id: {
                    type: Sequelize.BIGINT,
                    autoIncrement: true,
                    primaryKey: true
                },
                industry_key: {
                    type: Sequelize.STRING(80),
                    allowNull: false
                },
                action: {
                    type: Sequelize.ENUM('hidden', 'unhidden'),
                    allowNull: false
                },
                actor_username: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                reason: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                before_snapshot: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
                after_snapshot: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
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
        }

        await addIndexIfMissing(queryInterface, 'registration_industry_visibility_audit_logs', ['industry_key', 'created_at'], {
            name: 'idx_registration_industry_visibility_audit_key_time'
        });
        await addIndexIfMissing(queryInterface, 'registration_industry_visibility_audit_logs', ['action'], {
            name: 'idx_registration_industry_visibility_audit_action'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'registration_industry_visibility_audit_logs')) {
            await removeIndexIfExists(queryInterface, 'registration_industry_visibility_audit_logs', 'idx_registration_industry_visibility_audit_key_time');
            await removeIndexIfExists(queryInterface, 'registration_industry_visibility_audit_logs', 'idx_registration_industry_visibility_audit_action');
            await queryInterface.dropTable('registration_industry_visibility_audit_logs');
        }
        if (await tableExists(queryInterface, 'registration_industry_visibility')) {
            await queryInterface.dropTable('registration_industry_visibility');
        }
        if (queryInterface.sequelize.getDialect() === 'mysql') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_registration_industry_visibility_audit_logs_action').catch(() => {});
        }
    }
};
