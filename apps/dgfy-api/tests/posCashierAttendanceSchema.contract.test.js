import { describe, expect, it } from '@jest/globals';
import { createRequire } from 'module';
import {
    REQUIRED_TENANT_SCHEMA_COLUMNS,
    REQUIRED_TENANT_SCHEMA_INDEXES,
    REQUIRED_TENANT_SCHEMA_TABLES,
    buildTenantSchemaRepairSql,
    buildTenantSchemaTableRepairSql,
    buildTenantSchemaIndexRepairSql
} from '../scripts/sync-tenant-schemas.js';
import EmployeeAttendanceSession from '../src/models/EmployeeAttendanceSession.js';
import EmployeeBreakSegment from '../src/models/EmployeeBreakSegment.js';
import PosTerminalOperatorSession from '../src/models/PosTerminalOperatorSession.js';
import PosDrawerHandoffEvent from '../src/models/PosDrawerHandoffEvent.js';
import PosTransaction from '../src/models/PosTransaction.js';

const require = createRequire(import.meta.url);
const migrationSource = require('fs').readFileSync(
    require.resolve('../../dgfy-migration-runner/migrations/20260824000001-create-pos-cashier-attendance-operator-sessions.cjs'),
    'utf8'
);

describe('cashier attendance/operator-session schema contract', () => {
    it('keeps model table names and the tenant table registry aligned', () => {
        const models = [
            EmployeeAttendanceSession,
            EmployeeBreakSegment,
            PosTerminalOperatorSession,
            PosDrawerHandoffEvent
        ];
        for (const model of models) {
            expect(REQUIRED_TENANT_SCHEMA_TABLES).toHaveProperty(model.tableName);
            expect(buildTenantSchemaTableRepairSql([model.tableName])[0].sql)
                .toContain(`CREATE TABLE \`${model.tableName}\``);
        }
        expect(PosTransaction.rawAttributes.operator_session_id.allowNull).toBe(true);
        expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions.operator_session_id.sql)
            .toContain('REFERENCES `pos_terminal_operator_sessions`');
    });

    it('registers every active-state uniqueness index and its generated-column repair', () => {
        const contracts = [
            ['employee_attendance_sessions', 'active_user_id', 'uq_employee_attendance_sessions_active_user'],
            ['employee_break_segments', 'active_attendance_session_id', 'uq_employee_break_segments_active_session'],
            ['pos_terminal_operator_sessions', 'active_terminal_id', 'uq_pos_terminal_operator_sessions_active_terminal'],
            ['pos_terminal_operator_sessions', 'active_operator_user_id', 'uq_pos_terminal_operator_sessions_active_user']
        ];
        for (const [table, column, indexName] of contracts) {
            expect(REQUIRED_TENANT_SCHEMA_COLUMNS[table]).toHaveProperty(column);
            expect(REQUIRED_TENANT_SCHEMA_INDEXES[table]).toHaveProperty(indexName);
            const [columnRepair] = buildTenantSchemaRepairSql([{ table, column }]);
            expect(columnRepair.sql).toContain('GENERATED ALWAYS AS');
            const [indexRepair] = buildTenantSchemaIndexRepairSql([{ table, indexName }]);
            expect(indexRepair.sql).toContain(`ADD UNIQUE INDEX \`${indexName}\``);
        }
    });

    it('keeps the migration additive and free of historical backfill updates', () => {
        expect(migrationSource).toContain("createTable('employee_attendance_sessions'");
        expect(migrationSource).toContain("addColumn('pos_transactions', 'operator_session_id'");
        expect(migrationSource).not.toMatch(/UPDATE\s+pos_terminal_shifts/i);
        expect(migrationSource).not.toMatch(/UPDATE\s+pos_transactions/i);
    });
});
