import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260824000002-add-pos-attendance-idempotency.cjs');

const Sequelize = {
    STRING: (length) => `VARCHAR(${length})`
};

const buildQueryInterface = ({ describedTables = {}, indexes = {} } = {}) => ({
    showAllTables: jest.fn().mockResolvedValue([
        'employee_attendance_sessions',
        'employee_break_segments'
    ]),
    describeTable: jest.fn((tableName) => Promise.resolve(describedTables[tableName] || {})),
    showIndex: jest.fn((tableName) => Promise.resolve(indexes[tableName] || [])),
    addColumn: jest.fn().mockResolvedValue(undefined),
    addIndex: jest.fn().mockResolvedValue(undefined),
    removeColumn: jest.fn().mockResolvedValue(undefined),
    removeIndex: jest.fn().mockResolvedValue(undefined)
});

describe('cashier attendance idempotency migration', () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = buildQueryInterface();
    });

    it('adds nullable start/end keys and unique retry indexes without rewriting rows', async () => {
        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn.mock.calls).toEqual([
            ['employee_attendance_sessions', 'start_idempotency_key', { type: 'VARCHAR(120)', allowNull: true }],
            ['employee_attendance_sessions', 'end_idempotency_key', { type: 'VARCHAR(120)', allowNull: true }],
            ['employee_break_segments', 'start_idempotency_key', { type: 'VARCHAR(120)', allowNull: true }],
            ['employee_break_segments', 'end_idempotency_key', { type: 'VARCHAR(120)', allowNull: true }]
        ]);
        expect(queryInterface.addIndex.mock.calls).toEqual([
            ['employee_attendance_sessions', ['user_id', 'start_idempotency_key'], { name: 'uq_employee_attendance_sessions_user_start_idempotency', unique: true }],
            ['employee_attendance_sessions', ['user_id', 'end_idempotency_key'], { name: 'uq_employee_attendance_sessions_user_end_idempotency', unique: true }],
            ['employee_break_segments', ['employee_attendance_session_id', 'start_idempotency_key'], { name: 'uq_employee_break_segments_session_start_idempotency', unique: true }],
            ['employee_break_segments', ['employee_attendance_session_id', 'end_idempotency_key'], { name: 'uq_employee_break_segments_session_end_idempotency', unique: true }]
        ]);
    });

    it('is safe to rerun when all columns and indexes already exist', async () => {
        const columns = {
            employee_attendance_sessions: { start_idempotency_key: {}, end_idempotency_key: {} },
            employee_break_segments: { start_idempotency_key: {}, end_idempotency_key: {} }
        };
        const indexes = {
            employee_attendance_sessions: [
                { name: 'uq_employee_attendance_sessions_user_start_idempotency' },
                { name: 'uq_employee_attendance_sessions_user_end_idempotency' }
            ],
            employee_break_segments: [
                { name: 'uq_employee_break_segments_session_start_idempotency' },
                { name: 'uq_employee_break_segments_session_end_idempotency' }
            ]
        };
        queryInterface = buildQueryInterface({ describedTables: columns, indexes });

        await migration.up(queryInterface, Sequelize);

        expect(queryInterface.addColumn).not.toHaveBeenCalled();
        expect(queryInterface.addIndex).not.toHaveBeenCalled();
    });

    it('removes only its own indexes and columns on rollback', async () => {
        queryInterface = buildQueryInterface({
            describedTables: {
                employee_attendance_sessions: { start_idempotency_key: {}, end_idempotency_key: {} },
                employee_break_segments: { start_idempotency_key: {}, end_idempotency_key: {} }
            },
            indexes: {
                employee_attendance_sessions: [
                    { name: 'uq_employee_attendance_sessions_user_start_idempotency' },
                    { name: 'uq_employee_attendance_sessions_user_end_idempotency' }
                ],
                employee_break_segments: [
                    { name: 'uq_employee_break_segments_session_start_idempotency' },
                    { name: 'uq_employee_break_segments_session_end_idempotency' }
                ]
            }
        });

        await migration.down(queryInterface);

        expect(queryInterface.removeIndex.mock.calls).toEqual([
            ['employee_break_segments', 'uq_employee_break_segments_session_end_idempotency'],
            ['employee_break_segments', 'uq_employee_break_segments_session_start_idempotency'],
            ['employee_attendance_sessions', 'uq_employee_attendance_sessions_user_end_idempotency'],
            ['employee_attendance_sessions', 'uq_employee_attendance_sessions_user_start_idempotency']
        ]);
        expect(queryInterface.removeColumn.mock.calls).toEqual([
            ['employee_break_segments', 'end_idempotency_key'],
            ['employee_break_segments', 'start_idempotency_key'],
            ['employee_attendance_sessions', 'end_idempotency_key'],
            ['employee_attendance_sessions', 'start_idempotency_key']
        ]);
    });
});
