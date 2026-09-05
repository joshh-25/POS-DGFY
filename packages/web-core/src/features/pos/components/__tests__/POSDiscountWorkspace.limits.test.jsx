// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { POSDiscountWorkspace } from '../POSDiscountWorkspace.jsx';

afterEach(cleanup);

describe('statutory beneficiary form limits', () => {
    it.each([false, true])('caps beneficiaries and identity fields on tablet=%s', (isTabletViewport) => {
        const setDiscountDraft = vi.fn();
        const eligible_items = [{ line_ref: 'line-1', item_id: 1, eligible_quantity: 1 }];
        render(<POSDiscountWorkspace viewModel={{
            isTabletViewport,
            discountModalOpen: true,
            discountDraft: {
                type: 'pwd', customer_name: 'Ana', id_number: 'ID-1',
                beneficiaries: Array.from({ length: 19 }, (_, index) => ({
                    name: 'Beneficiary', id_number: `ID-${index + 2}`, eligible_items
                }))
            },
            safeCart: [{ line_key: 'line-1', item_id: 1, item_name: 'Meal', quantity: 30, senior_pwd_discount_eligible: true }],
            safeEligibleDiscountItems: eligible_items,
            setDiscountDraft,
            isCartLineSeniorPwdEligible: () => true
        }} />);
        const add = screen.getByRole('button', { name: /Add another Senior\/PWD/ });
        expect(add.disabled).toBe(true);
        expect(screen.getByText('Maximum of 20 beneficiaries reached.')).toBeTruthy();
        fireEvent.click(add);
        expect(setDiscountDraft).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('Enter customer name').maxLength).toBe(120);
        expect(screen.getByPlaceholderText('Enter ID number').maxLength).toBe(100);
        expect(screen.getByLabelText('Beneficiary 2 name').maxLength).toBe(120);
        expect(screen.getByLabelText('Beneficiary 2 ID number').maxLength).toBe(120);
    });
});
