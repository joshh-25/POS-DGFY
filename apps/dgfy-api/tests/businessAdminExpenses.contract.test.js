import { jest } from '@jest/globals';
import { PERMISSIONS } from '../src/config/permissions.js';
import {
    buildCreateBusinessAdminExpenseUseCase,
    buildListBusinessAdminExpensesUseCase,
    buildVoidBusinessAdminExpenseUseCase
} from '../src/modules/businessAdmin/usecases/businessAdminExpenseUseCase.js';

const MANAGER = {
    user_id: 17,
    username: 'manager',
    role: 'manager',
    permissions: [
        PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
        PERMISSIONS.EXPENSES.actions.VIEW,
        PERMISSIONS.EXPENSES.actions.CREATE,
        PERMISSIONS.EXPENSES.actions.VOID
    ]
};

const buildDependencies = () => ({
    businessAdminOverviewRepository: {
        listUserLocationGrantIds: jest.fn().mockResolvedValue([4, 9]),
        listActiveLocations: jest.fn().mockResolvedValue([{ location_id: 4, name: 'Masu Cafe' }])
    },
    businessAdminExpenseRepository: {
        list: jest.fn().mockResolvedValue({ expenses: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } }),
        getSummary: jest.fn().mockResolvedValue({ entry_count: 0, total_amount: 0, posted_amount: 0, voided_amount: 0, posted_entries: 0, voided_entries: 0 }),
        findByIdempotencyKey: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ expense_id: 55, expense_date: '2026-09-17', location_id: 4, category: 'supplies', description: 'Paper cups', amount: 120, payment_method: 'cash', status: 'posted' }),
        appendAudit: jest.fn().mockResolvedValue(undefined),
        findRawById: jest.fn(),
        voidPosted: jest.fn()
    }
});

describe('Business Admin operational expense ledger', () => {
    it('lists only the manager branch scope and returns ledger metadata', async () => {
        const dependencies = buildDependencies();
        const useCase = buildListBusinessAdminExpensesUseCase(dependencies);
        const result = await useCase({
            user: MANAGER,
            query: { date_from: '2026-09-01', date_to: '2026-09-17', limit: '20', search: 'cups' }
        });

        expect(result).toMatchObject({
            success: true,
            data: {
                categories: expect.arrayContaining(['supplies', 'other']),
                meta: {
                    currency: 'PHP',
                    timezone: 'Asia/Manila',
                    source: 'business_admin_operational_expense_ledger',
                    profit_after_expenses: 'deferred'
                }
            }
        });
        expect(dependencies.businessAdminExpenseRepository.list).toHaveBeenCalledWith({
            filters: expect.objectContaining({
                allowedLocationIds: [4, 9],
                dateFrom: '2026-09-01',
                dateTo: '2026-09-17',
                search: 'cups',
                limit: 20
            })
        });
    });

    it('creates a branch expense with a stable PHP value and audit event', async () => {
        const dependencies = buildDependencies();
        const useCase = buildCreateBusinessAdminExpenseUseCase(dependencies);
        const result = await useCase({
            user: MANAGER,
            body: {
                expense_date: '2026-09-17',
                branch_id: '4',
                category: 'supplies',
                description: 'Paper cups',
                amount: '120.5',
                payment_method: 'cash',
                vendor_name: 'Supplier',
                idempotency_key: 'expense-test-1'
            },
            auditContext: { requestId: 'request-1' }
        });

        expect(result).toMatchObject({ success: true, data: { idempotent: false, expense: { expense_id: 55 } } });
        expect(dependencies.businessAdminExpenseRepository.create).toHaveBeenCalledWith({
            values: expect.objectContaining({
                expense_date: '2026-09-17',
                location_id: 4,
                location_name_snapshot: 'Masu Cafe',
                amount: '120.5',
                currency: 'PHP',
                created_by: 17,
                idempotency_key: 'expense-test-1'
            })
        });
        expect(dependencies.businessAdminExpenseRepository.appendAudit).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'business_admin_expense_created',
            auditContext: { requestId: 'request-1' }
        }));
    });

    it('requires a reason and only voids a posted expense in the assigned branch scope', async () => {
        const dependencies = buildDependencies();
        dependencies.businessAdminExpenseRepository.findRawById.mockResolvedValue({
            business_admin_expense_id: 55,
            location_id: 4,
            status: 'posted',
            amount: '120.5000'
        });
        dependencies.businessAdminExpenseRepository.voidPosted.mockResolvedValue({
            expense_id: 55,
            location_id: 4,
            status: 'voided',
            void_reason: 'Duplicate receipt'
        });
        const useCase = buildVoidBusinessAdminExpenseUseCase(dependencies);

        const missingReason = await useCase({ user: MANAGER, expenseId: 55, body: {} });
        expect(missingReason.error.details).toEqual({ reason_code: 'BUSINESS_ADMIN_EXPENSE_VOID_REASON_REQUIRED' });
        expect(dependencies.businessAdminExpenseRepository.voidPosted).not.toHaveBeenCalled();

        const result = await useCase({ user: MANAGER, expenseId: 55, body: { reason: 'Duplicate receipt' } });
        expect(result).toMatchObject({ success: true, data: { expense: { expense_id: 55, status: 'voided' } } });
        expect(dependencies.businessAdminExpenseRepository.appendAudit).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'business_admin_expense_voided',
            reason: 'Duplicate receipt'
        }));
    });

    it('resolves a concurrent idempotency insert as a safe retry', async () => {
        const dependencies = buildDependencies();
        dependencies.businessAdminExpenseRepository.create.mockRejectedValueOnce({ name: 'SequelizeUniqueConstraintError' });
        dependencies.businessAdminExpenseRepository.findByIdempotencyKey
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                expense_id: 56,
                expense_date: '2026-09-17',
                location_id: 4,
                category: 'supplies',
                description: 'Paper cups',
                amount: 120.5,
                payment_method: 'cash',
                vendor_name: 'Supplier',
                reference: '',
                notes: ''
            });

        const useCase = buildCreateBusinessAdminExpenseUseCase(dependencies);
        const result = await useCase({
            user: MANAGER,
            body: {
                expense_date: '2026-09-17',
                branch_id: '4',
                category: 'supplies',
                description: 'Paper cups',
                amount: '120.5',
                payment_method: 'cash',
                vendor_name: 'Supplier',
                idempotency_key: 'expense-race-1'
            }
        });

        expect(result).toMatchObject({ success: true, data: { idempotent: true, expense: { expense_id: 56 } } });
        expect(dependencies.businessAdminExpenseRepository.appendAudit).not.toHaveBeenCalled();
    });

    it('does not allow cashiers to read or mutate the expense ledger', async () => {
        const dependencies = buildDependencies();
        const listUseCase = buildListBusinessAdminExpensesUseCase(dependencies);
        const createUseCase = buildCreateBusinessAdminExpenseUseCase(dependencies);

        const listResult = await listUseCase({ user: { user_id: 22, role: 'cashier' }, query: {} });
        const createResult = await createUseCase({ user: { user_id: 22, role: 'cashier' }, body: {} });

        expect(listResult.error.statusCode).toBe(403);
        expect(createResult.error.statusCode).toBe(403);
        expect(dependencies.businessAdminExpenseRepository.list).not.toHaveBeenCalled();
        expect(dependencies.businessAdminExpenseRepository.create).not.toHaveBeenCalled();
    });
});
