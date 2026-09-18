'use strict';

const TABLES = Object.freeze([
    'employee_attendance_sessions',
    'employee_break_segments',
    'pos_terminal_operator_sessions',
    'pos_drawer_handoff_events'
]);

const normalizeTableName = (table) => typeof table === 'string'
    ? table
    : (table?.tableName || table?.TABLE_NAME || '');

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

const columnExists = async (queryInterface, tableName, columnName) => {
    const definition = await queryInterface.describeTable(tableName).catch(() => ({}));
    return Boolean(definition?.[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    return indexes.some((index) => index.name === indexName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    if (!(await indexExists(queryInterface, tableName, options.name))) {
        await queryInterface.addIndex(tableName, fields, options);
    }
};

const findForeignKeyForColumn = async (queryInterface, tableName, columnName) => {
    const [rows] = await queryInterface.sequelize.query(`
        SELECT k.CONSTRAINT_NAME AS constraintName
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
        WHERE k.CONSTRAINT_SCHEMA = DATABASE()
          AND k.TABLE_NAME = '${tableName}'
          AND k.COLUMN_NAME = '${columnName}'
          AND k.REFERENCED_TABLE_NAME IS NOT NULL
    `);
    return rows?.[0]?.constraintName || null;
};

const dropForeignKeyForColumn = async (queryInterface, tableName, columnName) => {
    const constraintName = await findForeignKeyForColumn(queryInterface, tableName, columnName);
    if (!constraintName) return;
    const escapedConstraintName = String(constraintName).replace(/`/g, '``');
    await queryInterface.sequelize.query(
        `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${escapedConstraintName}\``
    );
};

// #1166: which table/column an existing FK on (tableName, columnName) references, so it can be
// dropped and recreated around a DDL change that MySQL/InnoDB otherwise rejects with it present.
// Distinct from findForeignKeyForColumn above (which only needs the constraint name for a plain
// drop) -- this also captures what to reference when recreating it.
const getForeignKeyDefinition = async (queryInterface, tableName, columnName) => {
    const [rows] = await queryInterface.sequelize.query(`
        SELECT k.CONSTRAINT_NAME AS constraintName,
               k.REFERENCED_TABLE_NAME AS referencedTable,
               k.REFERENCED_COLUMN_NAME AS referencedColumn
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
        WHERE k.CONSTRAINT_SCHEMA = DATABASE()
          AND k.TABLE_NAME = '${tableName}'
          AND k.COLUMN_NAME = '${columnName}'
          AND k.REFERENCED_TABLE_NAME IS NOT NULL
    `);
    return rows?.[0] || null;
};

// #1166: root cause, established by live reproduction against real MySQL 8.0.46 (not just the
// errno-150 message): MySQL/InnoDB unconditionally rejects a foreign key whose ON UPDATE/ON
// DELETE action is CASCADE or SET NULL when the FK's own column is also the base column of a
// STORED generated column elsewhere in the table -- confirmed by direct experiment (RESTRICT
// succeeds, CASCADE/SET NULL fail, regardless of whether the FK was added inline at CREATE TABLE
// time or via a later ALTER). The actual defect is one layer up from what #1166 first suspected:
// this migration's own `createTable()` branch above declares `onUpdate: 'RESTRICT', onDelete:
// 'RESTRICT'` for every one of these columns, matching what these associations
// (`EmployeeBreakSegment.belongsTo(EmployeeAttendanceSession, ...)` etc., src/models/index.js)
// also declare -- but `Sequelize.sync()` (the tenant-provisioning path, not this migration's own
// createTable()) materializes the association's FK as `ON UPDATE CASCADE ON DELETE CASCADE`
// instead, confirmed live via INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS. That CASCADE/CASCADE
// FK is what collides with the generated column, not merely "a FK existing" as first suspected.
// The fix here does not touch the sync()/association mismatch itself (a separate, real
// inconsistency, tracked as its own follow-up) -- it drops whatever FK sync() left behind and
// recreates it as RESTRICT/RESTRICT, matching this migration's own createTable() intent, which is
// also the only action MySQL will accept here regardless of what sync() originally chose.
const addGeneratedColumnIfMissing = async (
    queryInterface,
    tableName,
    columnName,
    expression,
    columnType = 'INTEGER',
    { dependsOnColumn } = {}
) => {
    if (await columnExists(queryInterface, tableName, columnName)) return;

    const fk = dependsOnColumn
        ? await getForeignKeyDefinition(queryInterface, tableName, dependsOnColumn)
        : null;
    if (fk) {
        await dropForeignKeyForColumn(queryInterface, tableName, dependsOnColumn);
    }

    let alterError = null;
    try {
        await queryInterface.sequelize.query(`
            ALTER TABLE \`${tableName}\`
            ADD COLUMN \`${columnName}\` ${columnType}
            GENERATED ALWAYS AS (${expression}) STORED
        `);
    } catch (error) {
        alterError = error;
    }

    if (fk) {
        // Recreate the FK regardless of whether the ALTER above succeeded -- leaving the table
        // permanently missing a constraint the model still declares would be a silent integrity
        // regression, worse than surfacing the original ALTER failure (if any) below. Always
        // RESTRICT/RESTRICT: it's what this migration's own createTable() branch already uses for
        // this exact column, and it's the only action MySQL accepts on a generated column's base
        // column -- never re-derive this from whatever action the dropped FK happened to have.
        await queryInterface.sequelize.query(`
            ALTER TABLE \`${tableName}\`
            ADD CONSTRAINT \`${fk.constraintName}\`
            FOREIGN KEY (\`${dependsOnColumn}\`) REFERENCES \`${fk.referencedTable}\` (\`${fk.referencedColumn}\`)
            ON UPDATE RESTRICT ON DELETE RESTRICT
        `);
    }

    if (alterError) throw alterError;
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, 'employee_attendance_sessions'))) {
            await queryInterface.createTable('employee_attendance_sessions', {
                employee_attendance_session_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
                employee_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'employees', key: 'employee_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'tenant_locations', key: 'location_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                duty_type: { type: Sequelize.ENUM('regular', 'relief'), allowNull: false },
                status: { type: Sequelize.ENUM('open', 'closed'), allowNull: false, defaultValue: 'open' },
                started_at: { type: Sequelize.DATE, allowNull: false },
                ended_at: { type: Sequelize.DATE, allowNull: true },
                closed_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
            });
        }
        await addGeneratedColumnIfMissing(
            queryInterface,
            'employee_attendance_sessions',
            'active_user_id',
            "CASE WHEN status = 'open' THEN user_id ELSE NULL END",
            'INTEGER',
            { dependsOnColumn: 'user_id' }
        );
        await addIndexIfMissing(queryInterface, 'employee_attendance_sessions', ['active_user_id'], {
            name: 'uq_employee_attendance_sessions_active_user',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'employee_attendance_sessions', ['employee_id', 'started_at'], {
            name: 'idx_employee_attendance_sessions_employee_started'
        });
        await addIndexIfMissing(queryInterface, 'employee_attendance_sessions', ['user_id', 'started_at'], {
            name: 'idx_employee_attendance_sessions_user_started'
        });
        await addIndexIfMissing(queryInterface, 'employee_attendance_sessions', ['location_id', 'status', 'started_at'], {
            name: 'idx_employee_attendance_sessions_location_status_started'
        });
        await addIndexIfMissing(queryInterface, 'employee_attendance_sessions', ['duty_type', 'started_at'], {
            name: 'idx_employee_attendance_sessions_duty_started'
        });

        if (!(await tableExists(queryInterface, 'employee_break_segments'))) {
            await queryInterface.createTable('employee_break_segments', {
                employee_break_segment_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
                employee_attendance_session_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'employee_attendance_sessions', key: 'employee_attendance_session_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                status: { type: Sequelize.ENUM('open', 'closed'), allowNull: false, defaultValue: 'open' },
                started_at: { type: Sequelize.DATE, allowNull: false },
                ended_at: { type: Sequelize.DATE, allowNull: true },
                ended_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
            });
        }
        await addGeneratedColumnIfMissing(
            queryInterface,
            'employee_break_segments',
            'active_attendance_session_id',
            "CASE WHEN status = 'open' THEN employee_attendance_session_id ELSE NULL END",
            'INTEGER',
            { dependsOnColumn: 'employee_attendance_session_id' }
        );
        await addIndexIfMissing(queryInterface, 'employee_break_segments', ['active_attendance_session_id'], {
            name: 'uq_employee_break_segments_active_session',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'employee_break_segments', ['employee_attendance_session_id', 'started_at'], {
            name: 'idx_employee_break_segments_attendance_started'
        });
        await addIndexIfMissing(queryInterface, 'employee_break_segments', ['status', 'started_at'], {
            name: 'idx_employee_break_segments_status_started'
        });

        if (!(await tableExists(queryInterface, 'pos_terminal_operator_sessions'))) {
            await queryInterface.createTable('pos_terminal_operator_sessions', {
                pos_terminal_operator_session_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
                pos_terminal_shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                terminal_id: { type: Sequelize.STRING(100), allowNull: false },
                location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'tenant_locations', key: 'location_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                employee_attendance_session_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'employee_attendance_sessions', key: 'employee_attendance_session_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                status: { type: Sequelize.ENUM('active', 'ended'), allowNull: false, defaultValue: 'active' },
                started_at: { type: Sequelize.DATE, allowNull: false },
                ended_at: { type: Sequelize.DATE, allowNull: true },
                ended_reason: { type: Sequelize.STRING(80), allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
            });
        }
        await addGeneratedColumnIfMissing(
            queryInterface,
            'pos_terminal_operator_sessions',
            'active_terminal_id',
            "CASE WHEN status = 'active' THEN UPPER(TRIM(terminal_id)) ELSE NULL END",
            'VARCHAR(100)'
        );
        await addGeneratedColumnIfMissing(
            queryInterface,
            'pos_terminal_operator_sessions',
            'active_operator_user_id',
            "CASE WHEN status = 'active' THEN user_id ELSE NULL END",
            'INTEGER',
            { dependsOnColumn: 'user_id' }
        );
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['active_terminal_id'], {
            name: 'uq_pos_terminal_operator_sessions_active_terminal',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['active_operator_user_id'], {
            name: 'uq_pos_terminal_operator_sessions_active_user',
            unique: true
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['pos_terminal_shift_id', 'started_at'], {
            name: 'idx_pos_terminal_operator_sessions_shift_started'
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['terminal_id', 'started_at'], {
            name: 'idx_pos_terminal_operator_sessions_terminal_started'
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['location_id', 'started_at'], {
            name: 'idx_pos_terminal_operator_sessions_location_started'
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['user_id', 'started_at'], {
            name: 'idx_pos_terminal_operator_sessions_user_started'
        });
        await addIndexIfMissing(queryInterface, 'pos_terminal_operator_sessions', ['status', 'started_at'], {
            name: 'idx_pos_terminal_operator_sessions_status_started'
        });

        if (!(await tableExists(queryInterface, 'pos_drawer_handoff_events'))) {
            await queryInterface.createTable('pos_drawer_handoff_events', {
                pos_drawer_handoff_event_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
                pos_terminal_shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                terminal_id: { type: Sequelize.STRING(100), allowNull: false },
                location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'tenant_locations', key: 'location_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                event_type: { type: Sequelize.ENUM('shared_relief_start', 'shared_relief_end', 'counted_custody_transfer'), allowNull: false },
                custody_mode: { type: Sequelize.ENUM('shared_access', 'counted_transfer'), allowNull: false },
                outgoing_operator_user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                incoming_operator_user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                expected_cash_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
                counted_cash_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
                variance_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
                outgoing_acknowledged_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                outgoing_acknowledged_at: { type: Sequelize.DATE, allowNull: true },
                incoming_acknowledged_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'SET NULL'
                },
                incoming_acknowledged_at: { type: Sequelize.DATE, allowNull: true },
                recorded_by: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: { model: 'users', key: 'user_id' },
                    onUpdate: 'RESTRICT',
                    onDelete: 'RESTRICT'
                },
                event_at: { type: Sequelize.DATE, allowNull: false },
                idempotency_key: { type: Sequelize.STRING(120), allowNull: true },
                note: { type: Sequelize.STRING(500), allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
            });
        }
        await addIndexIfMissing(queryInterface, 'pos_drawer_handoff_events', ['pos_terminal_shift_id', 'event_at'], {
            name: 'idx_pos_drawer_handoff_events_shift_event'
        });
        await addIndexIfMissing(queryInterface, 'pos_drawer_handoff_events', ['terminal_id', 'event_at'], {
            name: 'idx_pos_drawer_handoff_events_terminal_event'
        });
        await addIndexIfMissing(queryInterface, 'pos_drawer_handoff_events', ['location_id', 'event_at'], {
            name: 'idx_pos_drawer_handoff_events_location_event'
        });
        await addIndexIfMissing(queryInterface, 'pos_drawer_handoff_events', ['event_type', 'event_at'], {
            name: 'idx_pos_drawer_handoff_events_type_event'
        });
        await addIndexIfMissing(queryInterface, 'pos_drawer_handoff_events', ['incoming_operator_user_id', 'event_at'], {
            name: 'idx_pos_drawer_handoff_events_incoming_event'
        });
        await addIndexIfMissing(queryInterface, 'pos_drawer_handoff_events', ['outgoing_operator_user_id', 'event_at'], {
            name: 'idx_pos_drawer_handoff_events_outgoing_event'
        });
        await addIndexIfMissing(queryInterface, 'pos_drawer_handoff_events', ['pos_terminal_shift_id', 'idempotency_key'], {
            name: 'uq_pos_drawer_handoff_events_shift_idempotency',
            unique: true
        });

        if (await tableExists(queryInterface, 'pos_transactions')
            && !(await columnExists(queryInterface, 'pos_transactions', 'operator_session_id'))) {
            await queryInterface.addColumn('pos_transactions', 'operator_session_id', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'pos_terminal_operator_sessions', key: 'pos_terminal_operator_session_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            });
        }
        if (await tableExists(queryInterface, 'pos_transactions')) {
            await addIndexIfMissing(queryInterface, 'pos_transactions', ['operator_session_id'], {
                name: 'idx_pos_transactions_operator_session_id'
            });
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'pos_transactions')) {
            if (await columnExists(queryInterface, 'pos_transactions', 'operator_session_id')) {
                // MySQL may use the attribution index to satisfy the FK. Drop the FK first;
                // otherwise removeIndex fails with ER_DROP_INDEX_FK on rollback.
                await dropForeignKeyForColumn(queryInterface, 'pos_transactions', 'operator_session_id');
            }
            if (await indexExists(queryInterface, 'pos_transactions', 'idx_pos_transactions_operator_session_id')) {
                await queryInterface.removeIndex('pos_transactions', 'idx_pos_transactions_operator_session_id');
            }
            if (await columnExists(queryInterface, 'pos_transactions', 'operator_session_id')) {
                await queryInterface.removeColumn('pos_transactions', 'operator_session_id');
            }
        }

        for (const tableName of [...TABLES].reverse()) {
            if (await tableExists(queryInterface, tableName)) {
                await queryInterface.dropTable(tableName);
            }
        }
    }
};
