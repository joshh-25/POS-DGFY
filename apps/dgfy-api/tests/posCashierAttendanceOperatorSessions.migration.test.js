import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260824000001-create-pos-cashier-attendance-operator-sessions.cjs');

const tableNames = [
    'employee_attendance_sessions',
    'employee_break_segments',
    'pos_terminal_operator_sessions',
    'pos_drawer_handoff_events',
    'pos_transactions'
];

const buildQueryInterface = ({ existingTables = tableNames, describedTables = {}, indexes = {} } = {}) => {
    const queryInterface = {
        showAllTables: jest.fn().mockResolvedValue(existingTables),
        describeTable: jest.fn((tableName) => Promise.resolve(describedTables[tableName] || {})),
        showIndex: jest.fn((tableName) => Promise.resolve(indexes[tableName] || [])),
        createTable: jest.fn().mockResolvedValue(undefined),
        addColumn: jest.fn().mockResolvedValue(undefined),
        addIndex: jest.fn().mockResolvedValue(undefined),
        removeColumn: jest.fn().mockResolvedValue(undefined),
        removeIndex: jest.fn().mockResolvedValue(undefined),
        dropTable: jest.fn().mockResolvedValue(undefined),
        sequelize: {
            query: jest.fn().mockResolvedValue([[], undefined])
        }
    };
    return queryInterface;
};

const Sequelize = {
    INTEGER: 'INTEGER',
    STRING: (length) => `VARCHAR(${length})`,
    DATE: 'DATE',
    DECIMAL: (precision, scale) => `DECIMAL(${precision},${scale})`,
    ENUM: (...values) => ({ values }),
    literal: (value) => ({ value })
};

describe('cashier attendance/operator-session persistence migration', () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = buildQueryInterface({ existingTables: ['pos_transactions'] });
    });

    it('creates all persistence tables in foreign-key dependency order', async () => {
        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.createTable.mock.calls.map(([table]) => table)).toEqual([
            'employee_attendance_sessions',
            'employee_break_segments',
            'pos_terminal_operator_sessions',
            'pos_drawer_handoff_events'
        ]);
        expect(queryInterface.createTable.mock.calls[0][1].user_id.onUpdate).toBe('RESTRICT');
        expect(queryInterface.createTable.mock.calls[1][1].employee_attendance_session_id.onDelete).toBe('RESTRICT');
        expect(queryInterface.createTable.mock.calls[2][1].employee_attendance_session_id.onDelete).toBe('SET NULL');
        expect(queryInterface.createTable.mock.calls[3][1].recorded_by.onDelete).toBe('RESTRICT');
    });

    it('adds generated active-state constraints and nullable transaction attribution', async () => {
        await migration.up(queryInterface, Sequelize);

        const sql = queryInterface.sequelize.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('active_user_id');
        expect(sql).toContain('active_attendance_session_id');
        expect(sql).toContain('active_terminal_id');
        expect(sql).toContain("CASE WHEN status = 'active' THEN UPPER(TRIM(terminal_id)) ELSE NULL END");
        expect(queryInterface.addColumn).toHaveBeenCalledWith(
            'pos_transactions',
            'operator_session_id',
            expect.objectContaining({ allowNull: true, onDelete: 'SET NULL', onUpdate: 'RESTRICT' })
        );
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_terminal_operator_sessions',
            ['active_terminal_id'],
            { name: 'uq_pos_terminal_operator_sessions_active_terminal', unique: true }
        );
        expect(queryInterface.addIndex).toHaveBeenCalledWith(
            'pos_transactions',
            ['operator_session_id'],
            { name: 'idx_pos_transactions_operator_session_id' }
        );
    });

    it('is idempotent when all tables, generated columns, indexes, and attribution exist', async () => {
        const generatedColumns = {
            employee_attendance_sessions: { active_user_id: {} },
            employee_break_segments: { active_attendance_session_id: {} },
            pos_terminal_operator_sessions: { active_terminal_id: {}, active_operator_user_id: {} },
            pos_transactions: { operator_session_id: {} }
        };
        const indexNames = [
            'uq_employee_attendance_sessions_active_user',
            'idx_employee_attendance_sessions_employee_started',
            'idx_employee_attendance_sessions_user_started',
            'idx_employee_attendance_sessions_location_status_started',
            'idx_employee_attendance_sessions_duty_started',
            'uq_employee_break_segments_active_session',
            'idx_employee_break_segments_attendance_started',
            'idx_employee_break_segments_status_started',
            'uq_pos_terminal_operator_sessions_active_terminal',
            'uq_pos_terminal_operator_sessions_active_user',
            'idx_pos_terminal_operator_sessions_shift_started',
            'idx_pos_terminal_operator_sessions_terminal_started',
            'idx_pos_terminal_operator_sessions_location_started',
            'idx_pos_terminal_operator_sessions_user_started',
            'idx_pos_terminal_operator_sessions_status_started',
            'uq_pos_drawer_handoff_events_shift_idempotency',
            'idx_pos_drawer_handoff_events_shift_event',
            'idx_pos_drawer_handoff_events_terminal_event',
            'idx_pos_drawer_handoff_events_location_event',
            'idx_pos_drawer_handoff_events_type_event',
            'idx_pos_drawer_handoff_events_incoming_event',
            'idx_pos_drawer_handoff_events_outgoing_event',
            'idx_pos_transactions_operator_session_id'
        ];
        queryInterface = buildQueryInterface({
            describedTables: generatedColumns,
            indexes: Object.fromEntries(tableNames.map((table) => [
                table,
                indexNames.map((name) => ({ name }))
            ]))
        });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.createTable).not.toHaveBeenCalled();
        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.sequelize.query).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('rolls back attribution first, then drops child tables before parents', async () => {
        queryInterface = buildQueryInterface({
            describedTables: {
                pos_transactions: { operator_session_id: {} }
            },
            indexes: {
                pos_transactions: [{ name: 'idx_pos_transactions_operator_session_id' }]
            }
        });

        await migration.down(queryInterface);

        expect(queryInterface.removeIndex).toHaveBeenCalledWith(
            'pos_transactions',
            'idx_pos_transactions_operator_session_id'
        );
        expect(queryInterface.removeColumn).toHaveBeenCalledWith('pos_transactions', 'operator_session_id');
        expect(queryInterface.dropTable.mock.calls.map(([table]) => table)).toEqual([
            'pos_drawer_handoff_events',
            'pos_terminal_operator_sessions',
            'employee_break_segments',
            'employee_attendance_sessions'
        ]);
    });
});
