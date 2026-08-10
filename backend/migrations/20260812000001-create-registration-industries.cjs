// Landlord-DB-only (issue #316): the registration Industry catalog becomes
// a database table instead of the hardcoded REGISTRATION_INDUSTRIES
// constant (packages/shared-constants/src/registrationIndustries.js). The
// constant is demoted to seed baseline + fail-open fallback - see the
// companion seed migration (20260812000002) and ADR 0058. Unlike the
// Phase 39 visibility table this replaces (row absence = visible), every
// offered industry has a row here; `hidden` is a column, not a row's
// existence. `workflow_mode` is deliberately a plain STRING, not a DB
// ENUM - the mode vocabulary stays engineering-owned in shared-constants
// (ADR 0056 clause 3) and is validated at the application layer.
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
        if (!await tableExists(queryInterface, 'registration_industries')) {
            await queryInterface.createTable('registration_industries', {
                industry_key: {
                    type: Sequelize.STRING(80),
                    primaryKey: true
                },
                label: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                summary: {
                    type: Sequelize.STRING(500),
                    allowNull: false
                },
                niches: {
                    type: Sequelize.JSON,
                    allowNull: false
                },
                workflow_mode: {
                    type: Sequelize.STRING(40),
                    allowNull: false
                },
                template_key: {
                    type: Sequelize.STRING(80),
                    allowNull: true
                },
                display_order: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                hidden: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                hidden_reason: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                is_system: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                created_by: {
                    type: Sequelize.STRING(120),
                    allowNull: false
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

        if (!await tableExists(queryInterface, 'registration_industry_audit_logs')) {
            await queryInterface.createTable('registration_industry_audit_logs', {
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
                    // 'hidden'/'unhidden' are a strict superset of the Phase 39
                    // audit ENUM so its rows copy verbatim in 20260812000003.
                    type: Sequelize.ENUM('created', 'updated', 'hidden', 'unhidden'),
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

        await addIndexIfMissing(queryInterface, 'registration_industries', ['hidden'], {
            name: 'idx_registration_industries_hidden'
        });
        await addIndexIfMissing(queryInterface, 'registration_industries', ['display_order'], {
            name: 'idx_registration_industries_display_order'
        });
        await addIndexIfMissing(queryInterface, 'registration_industry_audit_logs', ['industry_key', 'created_at'], {
            name: 'idx_registration_industry_audit_key_time'
        });
        await addIndexIfMissing(queryInterface, 'registration_industry_audit_logs', ['action'], {
            name: 'idx_registration_industry_audit_action'
        });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'registration_industry_audit_logs')) {
            await removeIndexIfExists(queryInterface, 'registration_industry_audit_logs', 'idx_registration_industry_audit_key_time');
            await removeIndexIfExists(queryInterface, 'registration_industry_audit_logs', 'idx_registration_industry_audit_action');
            await queryInterface.dropTable('registration_industry_audit_logs');
        }
        if (await tableExists(queryInterface, 'registration_industries')) {
            await removeIndexIfExists(queryInterface, 'registration_industries', 'idx_registration_industries_hidden');
            await removeIndexIfExists(queryInterface, 'registration_industries', 'idx_registration_industries_display_order');
            await queryInterface.dropTable('registration_industries');
        }
        if (queryInterface.sequelize.getDialect() === 'mysql') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_registration_industry_audit_logs_action').catch(() => {});
        }
    }
};
