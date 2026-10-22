import { jest } from '@jest/globals';
import { PERMISSIONS } from '../src/config/permissions.js';
import { buildBusinessAdminEndAttendanceShiftUseCase } from '../src/modules/businessAdmin/usecases/businessAdminEndAttendanceShiftUseCase.js';

const openShift = {
    pos_terminal_shift_id: 41,
    location_id: 4,
    status: 'open',
    cashier_id: 7
};

const buildUseCase = ({ user, allowedLocationIds = null, closeResult = { success: true, data: { x_reading: { recorded: true } } } }) => {
    const closeTerminalShiftUseCase = jest.fn().mockResolvedValue(closeResult);
    const useCase = buildBusinessAdminEndAttendanceShiftUseCase({
        businessAdminOverviewRepository: {
            listUserLocationGrantIds: jest.fn().mockResolvedValue(allowedLocationIds || [])
        },
        posRepository: {
            getTerminalShiftById: jest.fn().mockResolvedValue(openShift)
        },
        closeTerminalShiftUseCase
    });
    return { useCase, closeTerminalShiftUseCase };
};

describe('Business Admin end attendance shift', () => {
    it('lets an admin end an open shift without a cashier PIN and requests X-reading recording', async () => {
        const { useCase, closeTerminalShiftUseCase } = buildUseCase({
            user: { user_id: 1, role: 'admin' }
        });

        const result = await useCase({
            shiftId: 41,
            body: {
                closing_cash_amount: 1250,
                reason: 'Cashier finished duty early',
                idempotency_key: 'OPIS-END-SHIFT-41'
            },
            user: { user_id: 1, role: 'admin' }
        });

        expect(result.success).toBe(true);
        expect(closeTerminalShiftUseCase).toHaveBeenCalledWith(expect.objectContaining({
            shiftId: 41,
            recordXReading: true,
            locationScope: { allowedLocationIds: null },
            payload: expect.objectContaining({
                closing_cash_amount: 1250,
                override_reason: 'Cashier finished duty early'
            }),
            user: expect.objectContaining({ business_admin_force_close: true })
        }));
        expect(closeTerminalShiftUseCase.mock.calls[0][0].payload).not.toHaveProperty('pin');
    });

    it('requires the explicit force-close permission for non-admin Business Admin users', async () => {
        const { useCase, closeTerminalShiftUseCase } = buildUseCase({
            user: {
                user_id: 8,
                role: 'manager',
                permissions: [PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS]
            },
            allowedLocationIds: [4]
        });

        const result = await useCase({
            shiftId: 41,
            body: { closing_cash_amount: 100, reason: 'Manager closes shift' },
            user: {
                user_id: 8,
                role: 'manager',
                permissions: [PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details).toEqual({ reason_code: 'BUSINESS_ADMIN_FORCE_CLOSE_SHIFT_PERMISSION_DENIED' });
        expect(closeTerminalShiftUseCase).not.toHaveBeenCalled();
    });

    it('enforces assigned branch scope before closing the shift', async () => {
        const { useCase, closeTerminalShiftUseCase } = buildUseCase({
            user: {
                user_id: 8,
                role: 'manager',
                permissions: [
                    PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
                    PERMISSIONS.POS.actions.FORCE_CLOSE_SHIFT
                ]
            },
            allowedLocationIds: [12]
        });

        const result = await useCase({
            shiftId: 41,
            body: { closing_cash_amount: 100, reason: 'Manager closes shift' },
            user: {
                user_id: 8,
                role: 'manager',
                permissions: [
                    PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
                    PERMISSIONS.POS.actions.FORCE_CLOSE_SHIFT
                ]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }));
        expect(closeTerminalShiftUseCase).not.toHaveBeenCalled();
    });
});
