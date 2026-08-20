/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePosFinancialWorkflow } from '../usePosFinancialWorkflow.js';

const renderFinancials = (overrides = {}) => renderHook(() => usePosFinancialWorkflow({
    cart: [
        {
            line_key: 'coffee-1',
            item_id: 1,
            quantity: 2,
            sale_price: 112,
            vat_type: 'vatable'
        },
        {
            line_key: 'snack-1',
            item_id: 2,
            quantity: 1,
            sale_price: 50,
            vat_type: 'vat_exempt'
        }
    ],
    customerPaymentAmountInput: '250',
    ...overrides
}));

describe('usePosFinancialWorkflow', () => {
    it('keeps item, global, net, and cash change calculations consistent', () => {
        const { result } = renderFinancials({
            cart: [{
                line_key: 'coffee-1',
                item_id: 1,
                quantity: 2,
                sale_price: 112,
                vat_type: 'vatable',
                item_discount: {
                    discount_type: 'manual',
                    method: 'percentage',
                    rate: 10
                }
            }],
            manualDiscountMode: 'percentage',
            manualDiscountRateInput: '10'
        });

        expect(result.current.cartSubtotal).toBe(224);
        expect(result.current.itemDiscountTotals.discountAmount).toBe(22.4);
        expect(result.current.globalDiscountAmount).toBe(20.16);
        expect(result.current.calculatedDiscountAmount).toBe(42.56);
        expect(result.current.netItemsTotal).toBe(181.44);
        expect(result.current.cartTotal).toBe(181.44);
        expect(result.current.customerPaymentShortfall).toBe(0);
        expect(result.current.customerPaymentChange).toBe(68.56);
        expect(result.current.isCustomerPaymentSufficient).toBe(true);
    });

    it('preserves Senior/PWD VAT removal and exempt sales totals', () => {
        const { result } = renderFinancials({
            cart: [{
                line_key: 'meal-1',
                item_id: 10,
                quantity: 1,
                sale_price: 112,
                vat_type: 'vatable'
            }],
            appliedDiscount: {
                type: 'senior',
                label: 'Senior Discount',
                eligible_item_ids: [10],
                eligible_items: []
            },
            safeAppliedDiscount: {
                type: 'senior',
                label: 'Senior Discount',
                eligible_item_ids: [10],
                eligible_items: []
            },
            customerPaymentAmountInput: '80'
        });

        expect(result.current.governedDiscountTotals.vatRemoved).toBe(12);
        expect(result.current.governedDiscountTotals.discountAmount).toBe(20);
        expect(result.current.netItemsTotal).toBe(80);
        expect(result.current.vatBreakdown).toMatchObject({
            vatableSales: 0,
            vatAmount: 0,
            vatExemptSales: 80,
            zeroRatedSales: 0
        });
        expect(result.current.isCustomerPaymentSufficient).toBe(true);
    });

    it('includes a taxable restaurant service charge in the total and VAT base', () => {
        const { result } = renderFinancials({
            cart: [{ item_id: 1, quantity: 1, sale_price: 112, vat_type: 'vatable' }],
            normalizedFnbContext: {
                restaurant_service_charge: {
                    enabled: true,
                    rate: 10,
                    taxable: true
                }
            },
            customerPaymentAmountInput: '123.20'
        });

        expect(result.current.restaurantServiceChargeAmount).toBe(11.2);
        expect(result.current.cartTotal).toBe(123.2);
        expect(result.current.vatBreakdown).toMatchObject({
            vatableSales: 110,
            vatAmount: 13.2
        });
    });

    it('requires a verified eligible employee account and summarizes split payment state', () => {
        const { result } = renderFinancials({
            paymentType: 'employee_credit',
            employeeCreditAccount: { employee_name: 'Employee' },
            selectedEmployeeCreditOption: { account_configured: true, is_eligible: true },
            splitPaymentSession: {
                status: 'ready_to_complete',
                remaining_amount: 0,
                paid_amount: 100,
                allocations: [
                    { status: 'successful', change_amount: 2 },
                    { status: 'failed', change_amount: 99 }
                ]
            }
        });

        expect(result.current.employeeCreditReady).toBe(true);
        expect(result.current.isCustomerPaymentSufficient).toBe(true);
        expect(result.current.splitPaymentReady).toBe(true);
        expect(result.current.hasSplitPaymentSummary).toBe(true);
        expect(result.current.splitPaymentSummaryPaidAmount).toBe(100);
        expect(result.current.splitPaymentSummaryChangeAmount).toBe(2);
        expect(result.current.splitPaymentSuccessfulAllocations).toHaveLength(1);
    });
});
