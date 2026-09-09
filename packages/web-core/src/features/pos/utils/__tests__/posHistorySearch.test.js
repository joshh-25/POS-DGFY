import { describe, expect, it } from 'vitest';
import { getPosHistorySearchValues, matchesPosHistorySearch } from '../posHistorySearch.js';

const employeeCreditRow = {
    invoice_number: 'NFS-000094',
    created_at: '2026-08-18T10:03:36.000Z',
    payment_type: 'employee_credit',
    total_amount: '326.4000',
    employee_credit_employee_name_snapshot: 'Maria Employee',
    discount: {
        employee_name: 'Maria Employee'
    },
    cashier: {
        username: 'Hernando'
    }
};

describe('POS history search normalization', () => {
    it('matches human-readable payment labels and cashier names', () => {
        expect(matchesPosHistorySearch(employeeCreditRow, 'Employee Credit')).toBe(true);
        expect(matchesPosHistorySearch(employeeCreditRow, 'hernando')).toBe(true);
        expect(matchesPosHistorySearch(employeeCreditRow, 'Maria Employee')).toBe(true);
    });

    it('matches formatted amounts and displayed dates', () => {
        expect(matchesPosHistorySearch(employeeCreditRow, '₱326.40')).toBe(true);
        expect(matchesPosHistorySearch(employeeCreditRow, '8/18/2026')).toBe(true);
        expect(getPosHistorySearchValues(employeeCreditRow)).toContain('2026-08-18');
    });
});
