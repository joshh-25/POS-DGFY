// Landlord-DB-only (issue #316). Retires the Phase 39 visibility store
// (registration_industry_visibility / _audit_logs) now that every consumer
// has cut over to registration_industries (migration 20260812000003 folded
// its data across first, in an earlier commit; this migration only ever
// runs after that fold has already applied). Nothing reads either table
// after this point - repositories/models/index.js references were removed
// in the same commit as this migration.
//
// down() recreates both tables (same DDL as
// 20260811000001-create-registration-industry-visibility.cjs) and
// best-effort repopulates them from the catalog: a visibility row for
// every registration_industries row that is hidden or carries a
// hidden_reason, and an audit row for every hidden/unhidden catalog audit
// entry. This is a reconstruction, not a restore - any hide/unhide history
// that happened after the fold and before this down() runs is not
// distinguishable from the original Phase 39 data, so treat it as
// best-effort recovery, not an exact undo.

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

// before_snapshot/after_snapshot are Sequelize.JSON columns. The rows read
// here come from a raw SELECT, so mysql2 has already deserialized them into
// plain JS objects - and queryInterface.bulkInsert() has no attribute-type
// metadata to re-encode them, so handing an object straight through makes
// Sequelize's SqlString.escape() throw ("Invalid value {...}"). Re-stringify
// here; pass a value through untouched if it's already a string, so this can
// never double-encode. Same helper as 20260812000003's up() - duplicated
// rather than shared, since a migration is a frozen historical artifact and
// should not depend on a file outside itself that could change later.
const toJsonColumnValue = (value) => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
};

module.exports = {
    async up(queryInterface) {
        if (await tableExists(queryInterface, 'registration_industry_visibility_audit_logs')) {
            await queryInterface.dropTable('registration_industry_visibility_audit_logs');
        }
        if (await tableExists(queryInterface, 'registration_industry_visibility')) {
            await queryInterface.dropTable('registration_industry_visibility');
        }
        if (queryInterface.sequelize.getDialect() === 'mysql') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_registration_industry_visibility_audit_logs_action').catch(() => {});
        }
    },

    async down(queryInterface, Sequelize) {
        if (!await tableExists(queryInterface, 'registration_industry_visibility')) {
            await queryInterface.createTable('registration_industry_visibility', {
                industry_key: { type: Sequelize.STRING(80), primaryKey: true },
                hidden: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
                reason: { type: Sequelize.STRING(500), allowNull: true },
                updated_by: { type: Sequelize.STRING(120), allowNull: false },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
        }
        if (!await tableExists(queryInterface, 'registration_industry_visibility_audit_logs')) {
            await queryInterface.createTable('registration_industry_visibility_audit_logs', {
                audit_log_id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
                industry_key: { type: Sequelize.STRING(80), allowNull: false },
                action: { type: Sequelize.ENUM('hidden', 'unhidden'), allowNull: false },
                actor_username: { type: Sequelize.STRING(120), allowNull: false },
                reason: { type: Sequelize.STRING(500), allowNull: true },
                before_snapshot: { type: Sequelize.JSON, allowNull: true },
                after_snapshot: { type: Sequelize.JSON, allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
        }
        await addIndexIfMissing(queryInterface, 'registration_industry_visibility_audit_logs', ['industry_key', 'created_at'], {
            name: 'idx_registration_industry_visibility_audit_key_time'
        });
        await addIndexIfMissing(queryInterface, 'registration_industry_visibility_audit_logs', ['action'], {
            name: 'idx_registration_industry_visibility_audit_action'
        });

        if (!await tableExists(queryInterface, 'registration_industries')) return;

        const [industryRows] = await queryInterface.sequelize.query(
            `SELECT industry_key, hidden, hidden_reason, updated_by
             FROM registration_industries
             WHERE hidden = 1 OR hidden_reason IS NOT NULL`
        );
        for (const row of industryRows) {
            await queryInterface.bulkInsert('registration_industry_visibility', [{
                industry_key: row.industry_key,
                hidden: row.hidden,
                reason: row.hidden_reason,
                updated_by: row.updated_by,
                created_at: new Date(),
                updated_at: new Date()
            }]);
        }

        if (!await tableExists(queryInterface, 'registration_industry_audit_logs')) return;

        const [auditRows] = await queryInterface.sequelize.query(
            `SELECT industry_key, action, actor_username, reason, before_snapshot, after_snapshot, created_at, updated_at
             FROM registration_industry_audit_logs
             WHERE action IN ('hidden', 'unhidden')
             ORDER BY audit_log_id ASC`
        );
        if (auditRows.length > 0) {
            await queryInterface.bulkInsert('registration_industry_visibility_audit_logs', auditRows.map((row) => ({
                industry_key: row.industry_key,
                action: row.action,
                actor_username: row.actor_username,
                reason: row.reason,
                before_snapshot: toJsonColumnValue(row.before_snapshot),
                after_snapshot: toJsonColumnValue(row.after_snapshot),
                created_at: row.created_at,
                updated_at: row.updated_at
            })));
        }
    }
};
