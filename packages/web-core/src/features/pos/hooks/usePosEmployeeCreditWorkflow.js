import { useCallback, useRef, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { fetchEmployeeCreditAccount } from '../services/employeeCreditService.js';

/**
 * Owns Employee Credit selection and online account verification. The hook
 * returns the original state names/setters so the terminal's payment panel
 * and checkout payload remain unchanged.
 */
export const usePosEmployeeCreditWorkflow = () => {
    const [employeeCreditAccountCode, setEmployeeCreditAccountCode] = useState('');
    const [employeeCreditAccount, setEmployeeCreditAccount] = useState(null);
    const [selectedEmployeeCreditOption, setSelectedEmployeeCreditOption] = useState(null);
    const [employeeCreditLookupLoading, setEmployeeCreditLookupLoading] = useState(false);
    const employeeCreditValidationSequenceRef = useRef(0);

    const resetEmployeeCredit = useCallback(() => {
        setEmployeeCreditAccountCode('');
        setEmployeeCreditAccount(null);
        setSelectedEmployeeCreditOption(null);
        setEmployeeCreditLookupLoading(false);
        employeeCreditValidationSequenceRef.current += 1;
    }, []);

    const handleSelectEmployeeCredit = useCallback(async (employeeOption) => {
        const accountCode = String(employeeOption?.account_code || '').trim().toUpperCase();
        const sameSelectedAccount = Boolean(
            accountCode
            && accountCode === employeeCreditAccountCode
            && (employeeCreditLookupLoading || employeeCreditAccount)
        );

        // The combobox can emit the current option again while it re-renders.
        // Keep verified account evidence visible instead of resetting it.
        if (sameSelectedAccount) {
            setSelectedEmployeeCreditOption(employeeOption || null);
            return;
        }

        const requestId = employeeCreditValidationSequenceRef.current + 1;
        employeeCreditValidationSequenceRef.current = requestId;
        setSelectedEmployeeCreditOption(employeeOption || null);
        setEmployeeCreditAccountCode(accountCode);
        setEmployeeCreditAccount(null);
        setEmployeeCreditLookupLoading(false);
        if (!employeeOption?.account_configured || !accountCode) {
            toast.error('Employee Credit is not configured for this employee.');
            return;
        }
        if (!employeeOption?.is_eligible) {
            toast.error('This employee is not eligible for Employee Credit.');
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Employee Credit requires an online connection.');
            return;
        }
        setEmployeeCreditLookupLoading(true);
        try {
            const account = await fetchEmployeeCreditAccount(accountCode);
            if (employeeCreditValidationSequenceRef.current === requestId) {
                setEmployeeCreditAccount(account);
                toast.success(`Employee Credit account verified for ${account?.employee_name || 'employee'}.`);
            }
        } catch (error) {
            if (employeeCreditValidationSequenceRef.current === requestId) {
                toast.error(error?.response?.data?.message || 'Eligible Employee Credit account was not found.');
            }
        } finally {
            if (employeeCreditValidationSequenceRef.current === requestId) {
                setEmployeeCreditLookupLoading(false);
            }
        }
    }, [employeeCreditAccount, employeeCreditAccountCode, employeeCreditLookupLoading]);

    return {
        employeeCreditAccountCode,
        setEmployeeCreditAccountCode,
        employeeCreditAccount,
        setEmployeeCreditAccount,
        selectedEmployeeCreditOption,
        setSelectedEmployeeCreditOption,
        employeeCreditLookupLoading,
        setEmployeeCreditLookupLoading,
        employeeCreditValidationSequenceRef,
        resetEmployeeCredit,
        handleSelectEmployeeCredit
    };
};

export default usePosEmployeeCreditWorkflow;
