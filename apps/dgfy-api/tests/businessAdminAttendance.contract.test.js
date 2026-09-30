import { jest } from '@jest/globals';
import { PERMISSIONS } from '../src/config/permissions.js';
import { buildGetBusinessAdminAttendanceUseCase } from '../src/modules/businessAdmin/usecases/businessAdminAttendanceUseCase.js';

const ADMIN = {
    user_id: 7,
    role: 'manager',
    permissions: [
        PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
        PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES
    ]
};

const lifecycle = {
    attendance: { rows: [{ attendance_session_id: 11 }], pagination: { page: 1, limit: 50, total: 1, total_pages: 1 } },
    operators: { rows: [{ operator_session_id: 21 }], pagination: { page: 1, limit: 50, total: 1, total_pages: 1 } }
};

describe('Business Admin attendance read model', () => {
    it('projects the canonical POS lifecycle rows with validated filters', async () => {
        const getCashierLifecycleReport = jest.fn().mockResolvedValue(lifecycle);
        const useCase = buildGetBusinessAdminAttendanceUseCase({
            businessAdminOverviewRepository: { listUserLocationGrantIds: jest.fn() },
            posRepository: { getCashierLifecycleReport }
        });

        const result = await useCase({
            user: ADMIN,
            query: { date_from: '2026-09-16', date_to: '2026-09-16', branch_id: '4', location_ids: ['99'] }
        });

        expect(result).toMatchObject({
            success: true,
            data: {
                attendance: lifecycle.attendance,
                operators: lifecycle.operators,
                filters: { date_from: '2026-09-16', date_to: '2026-09-16', branch_id: 4 },
                meta: { source: 'pos_cashier_lifecycle_read_model', scope: 'all' }
            }
        });
        expect(getCashierLifecycleReport).toHaveBeenCalledWith(expect.objectContaining({
            date_from: '2026-09-16',
            date_to: '2026-09-16',
            location_id: 4,
            page: 1,
            limit: 50
        }));
        expect(getCashierLifecycleReport.mock.calls[0][0]).not.toHaveProperty('location_ids');
    });

    it('passes all assigned branch ids to the canonical reader when no branch is selected', async () => {
        const getCashierLifecycleReport = jest.fn().mockResolvedValue(lifecycle);
        const listUserLocationGrantIds = jest.fn().mockResolvedValue([12, 15]);
        const useCase = buildGetBusinessAdminAttendanceUseCase({
            businessAdminOverviewRepository: { listUserLocationGrantIds },
            posRepository: { getCashierLifecycleReport }
        });

        const result = await useCase({
            user: { role: 'manager', user_id: 8, permissions: [PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS] },
            query: { date_from: '2026-09-01', date_to: '2026-09-02' }
        });

        expect(result.success).toBe(true);
        expect(getCashierLifecycleReport).toHaveBeenCalledWith(expect.objectContaining({ location_ids: [12, 15] }));
        expect(listUserLocationGrantIds).toHaveBeenCalledWith(8);
    });

    it('rejects an assigned manager request for an unauthorized branch before querying POS', async () => {
        const getCashierLifecycleReport = jest.fn();
        const useCase = buildGetBusinessAdminAttendanceUseCase({
            businessAdminOverviewRepository: { listUserLocationGrantIds: jest.fn().mockResolvedValue([12]) },
            posRepository: { getCashierLifecycleReport }
        });

        const result = await useCase({
            user: { role: 'manager', user_id: 8, permissions: [PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS] },
            query: { branch_id: '99' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details).toEqual({ reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
        expect(getCashierLifecycleReport).not.toHaveBeenCalled();
    });

    it('rejects invalid and over-broad date ranges without querying POS', async () => {
        const getCashierLifecycleReport = jest.fn();
        const useCase = buildGetBusinessAdminAttendanceUseCase({
            businessAdminOverviewRepository: { listUserLocationGrantIds: jest.fn() },
            posRepository: { getCashierLifecycleReport }
        });

        const invalidDate = await useCase({ user: ADMIN, query: { date_from: '2026-02-31' } });
        const overBroad = await useCase({ user: ADMIN, query: { date_from: '2025-01-01', date_to: '2026-09-16' } });

        expect(invalidDate.error.details).toEqual({ reason_code: 'BUSINESS_ADMIN_INVALID_DATE' });
        expect(overBroad.error.details).toEqual({ reason_code: 'BUSINESS_ADMIN_ATTENDANCE_DATE_RANGE_EXCEEDED' });
        expect(getCashierLifecycleReport).not.toHaveBeenCalled();
    });
});
