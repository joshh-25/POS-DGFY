/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEmployeeCreditAccount } from '../../services/employeeCreditService.js';
import { usePosEmployeeCreditWorkflow } from '../usePosEmployeeCreditWorkflow.js';

vi.mock('../../services/employeeCreditService.js', () => ({
    fetchEmployeeCreditAccount: vi.fn()
}));

const eligibleEmployee = {
    employee_id: 44,
    account_code: 'ec-44',
    account_configured: true,
    is_eligible: true,
    employee_name: 'Branch Employee'
};

describe('usePosEmployeeCreditWorkflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchEmployeeCreditAccount.mockResolvedValue({
            employee_name: 'Branch Employee',
            outstanding_balance: 80
        });
    });

    it('normalizes the account code and retains verified account evidence', async () => {
        const { result } = renderHook(() => usePosEmployeeCreditWorkflow());

        await act(async () => {
            await result.current.handleSelectEmployeeCredit(eligibleEmployee);
        });

        expect(fetchEmployeeCreditAccount).toHaveBeenCalledWith('EC-44');
        expect(result.current.employeeCreditAccountCode).toBe('EC-44');
        expect(result.current.selectedEmployeeCreditOption).toBe(eligibleEmployee);
        expect(result.current.employeeCreditAccount).toMatchObject({
            employee_name: 'Branch Employee'
        });
        expect(result.current.employeeCreditLookupLoading).toBe(false);
    });

    it('does not call the lookup for an ineligible or unconfigured employee', async () => {
        const { result } = renderHook(() => usePosEmployeeCreditWorkflow());

        await act(async () => {
            await result.current.handleSelectEmployeeCredit({
                ...eligibleEmployee,
                account_code: '',
                account_configured: false
            });
        });

        expect(fetchEmployeeCreditAccount).not.toHaveBeenCalled();
        expect(result.current.employeeCreditAccount).toBe(null);
    });

    it('invalidates a pending lookup when the sale resets', async () => {
        let resolveLookup;
        fetchEmployeeCreditAccount.mockImplementation(() => new Promise((resolve) => {
            resolveLookup = resolve;
        }));
        const { result } = renderHook(() => usePosEmployeeCreditWorkflow());

        let pendingSelection;
        await act(async () => {
            pendingSelection = result.current.handleSelectEmployeeCredit(eligibleEmployee);
        });
        expect(result.current.employeeCreditLookupLoading).toBe(true);

        act(() => result.current.resetEmployeeCredit());
        resolveLookup({ employee_name: 'Stale Employee' });
        await act(async () => {
            await pendingSelection;
        });

        expect(result.current.employeeCreditAccount).toBe(null);
        expect(result.current.selectedEmployeeCreditOption).toBe(null);
        expect(result.current.employeeCreditAccountCode).toBe('');
    });

    it('clears a discount-prefilled account without clearing a later manual selection', async () => {
        const { result } = renderHook(() => usePosEmployeeCreditWorkflow());

        await act(async () => {
            await result.current.handlePrefillEmployeeCredit(eligibleEmployee);
        });
        act(() => {
            expect(result.current.clearDiscountEmployeeCreditPrefill()).toBe(true);
        });
        expect(result.current.selectedEmployeeCreditOption).toBe(null);

        const manualEmployee = {
            ...eligibleEmployee,
            employee_id: 45,
            account_code: 'ec-45',
            employee_name: 'Manual Employee'
        };
        await act(async () => {
            await result.current.handleSelectEmployeeCredit(manualEmployee);
        });
        act(() => {
            expect(result.current.clearDiscountEmployeeCreditPrefill()).toBe(false);
        });
        expect(result.current.selectedEmployeeCreditOption).toBe(manualEmployee);
        expect(result.current.employeeCreditAccountCode).toBe('EC-45');

        let prefillApplied;
        await act(async () => {
            prefillApplied = await result.current.handlePrefillEmployeeCredit(eligibleEmployee);
        });
        expect(prefillApplied).toBe(false);
        expect(result.current.selectedEmployeeCreditOption).toBe(manualEmployee);
    });
});
