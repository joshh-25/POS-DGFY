import { describe, expect, it } from 'vitest';
import { resolvePaymentMethodColorStyles } from '../utils/posCheckoutTerminalUtils.js';

describe('POS payment method colors', () => {
    it.each([
        ['cash', 'bg-amber-100'],
        ['gcash', 'bg-blue-100'],
        ['maya', 'bg-emerald-100'],
        ['card', 'bg-[#E8D2BF]'],
        ['bank_transfer', 'bg-[#EDE9FE]'],
        ['employee_credit', 'bg-[#DBEAFE]']
    ])('maps %s to the expected color family', (method, expectedClassName) => {
        const styles = resolvePaymentMethodColorStyles(method);
        expect(styles.selectClassName).toContain(expectedClassName);
        expect(styles.inactiveSelectClassName).toBeTruthy();
        expect(styles.activeRingClassName).toBeTruthy();
    });

    it('falls back safely for an unknown payment method', () => {
        expect(resolvePaymentMethodColorStyles('unknown').selectClassName).toContain('bg-slate-50');
    });

    it('keeps Bank Transfer and Employee Credit visually distinct', () => {
        const bankTransfer = resolvePaymentMethodColorStyles('bank_transfer');
        const employeeCredit = resolvePaymentMethodColorStyles('employee_credit');

        expect(bankTransfer.selectClassName).not.toBe(employeeCredit.selectClassName);
        expect(bankTransfer.badgeClassName).not.toBe(employeeCredit.badgeClassName);
    });
});
