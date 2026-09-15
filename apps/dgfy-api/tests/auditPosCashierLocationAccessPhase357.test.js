import { describe, expect, it } from '@jest/globals';
import {
    buildPhase357TenantReport,
    parsePhase357FeatureSetting,
    PHASE357_REQUIRED_OPERATING_INDEXES
} from '../scripts/audit-pos-cashier-location-access-phase357.js';

describe('Phase 357 cashier location audit report', () => {
    it('normalizes feature flags without hiding invalid or duplicate location entries', () => {
        expect(parsePhase357FeatureSetting({
            setting_value: JSON.stringify({ enabled: true, location_ids: ['7', 7, 0, 'bad'] })
        })).toEqual({
            present: true,
            enabled: true,
            location_count: 1,
            configured_location_ids: [7],
            invalid_location_entry_count: 2,
            duplicate_location_entry_count: 1
        });
    });

    it('reports ambiguous cashier grants, actor gaps, and the exact operating-index contract', () => {
        const report = buildPhase357TenantReport({
            tenant: { id: 41 },
            cashierUsers: [
                { user_id: 11, is_active: 1, permissions: ['items:view'] },
                { user_id: 12, is_active: 0, permissions: JSON.stringify(['items:edit']) }
            ],
            indexes: [
                { table_name: 'pos_terminal_shifts', name: 'uq_pos_terminal_shifts_active_operator', non_unique: 0, columns: 'active_operator_user_id' },
                { table_name: 'pos_terminal_operator_sessions', name: 'uq_pos_terminal_operator_sessions_active_user', non_unique: 0, columns: 'active_operator_user_id' },
                { table_name: 'pos_terminal_operator_sessions', name: 'uq_pos_terminal_operator_sessions_active_terminal', non_unique: 1, columns: 'active_terminal_id' },
                { table_name: 'employee_attendance_sessions', name: 'uq_employee_attendance_sessions_active_user', non_unique: 0, columns: 'wrong_column' }
            ],
            featureSetting: { setting_value: JSON.stringify({ enabled: true, location_ids: [3, 4] }) },
            state: {
                open_shifts: '2',
                active_operator_sessions: 1,
                open_attendance_sessions: 1,
                lifecycle_audit_events: 4,
                open_shifts_without_user: 1,
                active_operators_without_user: 0,
                open_attendance_without_user: 1,
                lifecycle_audit_events_without_actor: 1
            },
            schemaErrors: ['missing_table', 'missing_table']
        });

        expect(report).toMatchObject({
            tenant_id: 41,
            read_only: true,
            feature: { enabled: true, location_count: 2 },
            state: {
                open_shifts: 2,
                active_operator_sessions: 1,
                open_attendance_sessions: 1,
                lifecycle_audit_events: 4
            },
            actor_attribution: {
                open_shifts_without_user: 1,
                active_operators_without_user: 0,
                open_attendance_without_user: 1,
                lifecycle_audit_events_without_actor: 1
            },
            grant_reconciliation: {
                cashier_count: 2,
                active_cashier_count: 1,
                ambiguous_item_edit_count: 1,
                automatic_rewrite: false
            },
            operating_indexes: {
                healthy: false,
                missing: [
                    'uq_pos_terminal_operator_sessions_active_terminal',
                    'uq_employee_attendance_sessions_active_user'
                ]
            },
            schema_errors: ['missing_table']
        });
        expect(report.grant_reconciliation.users).toEqual([
            { user_id: 11, is_active: true, item_edit_grant: 'no_stored_edit' },
            { user_id: 12, is_active: false, item_edit_grant: 'review_required_ambiguous_edit' }
        ]);
        expect(report.operating_indexes.required).toHaveLength(PHASE357_REQUIRED_OPERATING_INDEXES.length);
    });
});
