import { describe, expect, it, jest } from '@jest/globals';
import { createPosCashierAttendanceConfigRepository } from '../src/modules/pos/repositories/posCashierAttendanceConfigRepository.js';

const transaction = { LOCK: { UPDATE: 'UPDATE' } };

describe('POS cashier attendance configuration repository', () => {
    it('maps every active workflow blocker with actionable tenant-location context', async () => {
        const models = {
            PosTerminalShift: {
                findAll: jest.fn().mockResolvedValue([
                    { pos_terminal_shift_id: 21, location_id: 1, terminal_id: 'COUNTER-01' }
                ])
            },
            EmployeeAttendanceSession: {
                findAll: jest.fn().mockResolvedValue([
                    { employee_attendance_session_id: 31, location_id: 1, user_id: 8 }
                ])
            },
            EmployeeBreakSegment: {
                findAll: jest.fn().mockResolvedValue([
                    { employee_break_segment_id: 41, employee_attendance_session_id: 31 }
                ])
            },
            PosTerminalOperatorSession: {
                findAll: jest.fn().mockResolvedValue([
                    {
                        pos_terminal_operator_session_id: 51,
                        location_id: 1,
                        terminal_id: 'COUNTER-01',
                        user_id: 8,
                        protected_operation_key: 'request-payment-001',
                        protected_operation_type: 'POST /api/v1/pos/checkouts',
                        protected_operation_started_at: new Date('2026-08-25T01:00:00Z')
                    }
                ])
            }
        };
        const repository = createPosCashierAttendanceConfigRepository(models);

        const blockers = await repository.findActiveWorkflowBlockers({ locationIds: [1], transaction });

        expect(blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'open_register_shift', location_id: 1, record_id: 21 }),
            expect.objectContaining({ type: 'open_attendance', location_id: 1, user_id: 8, record_id: 31 }),
            expect.objectContaining({ type: 'open_break', location_id: 1, record_id: 41 }),
            expect.objectContaining({
                type: 'protected_operation',
                location_id: 1,
                record_id: 51,
                operation_key: 'request-payment-001'
            })
        ]));
    });

    it('creates the dedicated JSON setting without exposing a general settings write', async () => {
        const setting = { setting_id: 7 };
        const findOrCreate = jest.fn().mockResolvedValue([setting, true]);
        const models = { SystemSetting: { findOrCreate } };
        const repository = createPosCashierAttendanceConfigRepository(models);

        const result = await repository.ensureSetting({ transaction });

        expect(result).toEqual({ setting, created: true });
        expect(findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
            where: { setting_key: 'pos_cashier_attendance_lifecycle_v1' },
            defaults: expect.objectContaining({ data_type: 'json' }),
            transaction
        }));
    });
});
