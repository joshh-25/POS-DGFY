import { jest } from '@jest/globals';
import { validatePosCheckout } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS checkout discount policy validator', () => {
    it.each(['cash', 'card', 'gcash', 'maya', 'bank_transfer', 'employee_credit'])(
        'accepts the Voucher UI null method with %s payment', (payment_type) => {
            const req = { body: {
                idempotency_key: 'idem-voucher-null-method',
                payment_type,
                ...(payment_type === 'employee_credit' ? { employee_credit: { account_code: 'TEST123' } } : {}),
                governed_discount: { type: 'voucher', voucher_code: 'TEST', method: null, rate: null },
                lines: [{ item_id: 1, quantity: 1 }]
            } };
            const res = mockRes();
            const next = jest.fn();
            validatePosCheckout(req, res, next);
            expect(res.status).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
            expect(req.validatedData.governed_discount.method).toBeNull();
        }
    );

    it('still rejects null method for Other discounts', () => {
        const req = { body: {
            idempotency_key: 'idem-manual-null-method',
            governed_discount: { type: 'manual', method: null },
            lines: [{ item_id: 1, quantity: 1 }]
        } };
        const res = mockRes();
        const next = jest.fn();
        validatePosCheckout(req, res, next);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(next).not.toHaveBeenCalled();
    });
    describe.each(['pwd', 'senior'])('%s beneficiary line references', (type) => {
        const requestFor = (entry) => ({
            body: {
                idempotency_key: 'idem-beneficiary-line-ref',
                lines: [{ line_ref: 'item-1-0', item_id: 1, quantity: 1, sale_price: 100 }],
                governed_discount: {
                    type,
                    beneficiaries: [{
                        category: type,
                        name: 'Sample Customer',
                        id_number: 'ID-1234',
                        eligible_items: [{ item_id: 1, eligible_quantity: 1, ...entry }]
                    }]
                }
            }
        });

        it.each(['item-1-0', 'x'.repeat(160), '', null, undefined])(
            'accepts and preserves a supported line_ref: %p', (lineRef) => {
                const req = requestFor(lineRef === undefined ? {} : { line_ref: lineRef });
                const res = mockRes();
                const next = jest.fn();

                validatePosCheckout(req, res, next);

                expect(res.status).not.toHaveBeenCalled();
                expect(next).toHaveBeenCalledTimes(1);
                expect(req.validatedData.governed_discount.beneficiaries[0].eligible_items[0])
                    .toEqual(req.body.governed_discount.beneficiaries[0].eligible_items[0]);
            }
        );

        it.each([
            [{ line_ref: 'x'.repeat(161) }, 'line_ref'],
            [{ line_ref: 123 }, 'line_ref'],
            [{ line_ref: 'item-1-0', unexpected: true }, 'unexpected']
        ])('rejects invalid beneficiary item input: %p', (entry, field) => {
            const req = requestFor(entry);
            const res = mockRes();
            const next = jest.fn();

            validatePosCheckout(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.json.mock.calls[0][0].errors).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    field: `governed_discount.beneficiaries.0.eligible_items.0.${field}`
                })
            ]));
        });
    });

    it('allows non-zero manual discount without a discount profile', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 10,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_amount).toBe(10);
    });

  it('allows non-zero discount when discount profile is provided', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 10,
                discount_profile_name: 'Employee Discount',
                discount_rate: 20,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_profile_name).toBe('Employee Discount');
    });

    it('rejects manual discount_rate without a computed discount amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 0,
                discount_rate: 20,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    it('allows manual amount discount mode without a percentage rate', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'amount',
                discount_amount: 25,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_mode).toBe('amount');
        expect(req.validatedData.discount_amount).toBe(25);
        expect(req.validatedData.discount_rate).toBeUndefined();
    });

    it('allows an item-only discount without treating it as a global discount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-item-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 15,
                item_discount_amount: 15,
                lines: [{
                    item_id: 1,
                    quantity: 1,
                    sale_price: 100,
                    item_discount: { method: 'percentage', rate: 15 },
                    item_discount_approval: { approver_user_id: 99, manager_pin: '1234' }
                }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.lines[0].item_discount.rate).toBe(15);
    });

    it('allows a governed discount as a computed amount without generic profile or rate fields', () => {
        const req = {
            body: {
                idempotency_key: 'idem-governed-123',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'amount',
                discount_amount: 74.44,
                discount_beneficiary: {
                    category: 'senior',
                    name: 'Sample Customer',
                    id_number: 'SC-1234'
                },
                governed_discount: {
                    type: 'senior',
                    label: 'Senior Citizen',
                    method: 'percentage',
                    rate: 20,
                    customer_name: 'Sample Customer',
                    id_number: 'SC-1234',
                    vat_removed: 48.21,
                    vat_exempt_amount: 221.79,
                    discount_amount: 44.36
                },
                lines: [{ item_id: 1, quantity: 1, sale_price: 270 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_profile_name).toBeUndefined();
        expect(req.validatedData.discount_rate).toBeUndefined();
        expect(req.validatedData.governed_discount.rate).toBe(20);
    });

    it('allows manual percentage discount mode with a rate and computed amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'percentage',
                discount_amount: 10,
                discount_rate: 10,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_mode).toBe('percentage');
        expect(req.validatedData.discount_rate).toBe(10);
    });

    it('rejects amount discount mode when a percentage rate is included', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'amount',
                discount_amount: 25,
                discount_rate: 10,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    it('accepts optional non-negative service_fee_amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'delivery',
                payment_type: 'cash',
                service_fee_amount: 50,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.service_fee_amount).toBe(50);
    });

    it('rejects negative service_fee_amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'delivery',
                payment_type: 'cash',
                service_fee_amount: -1,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    // #712: POS voucher redemption, sale-level only.
    it('accepts a governed voucher discount with a voucher_code', () => {
        const req = {
            body: {
                idempotency_key: 'idem-voucher-123',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'amount',
                discount_amount: 16,
                governed_discount: {
                    type: 'voucher',
                    voucher_code: 'graceoffer',
                    customer_name: 'Walk-in Customer',
                    method: 'percentage',
                    rate: 10,
                    discount_amount: 16
                },
                lines: [{ item_id: 1, quantity: 1, sale_price: 160 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.governed_discount.type).toBe('voucher');
        // Uppercased and trimmed, matching promo_code's own normalization.
        expect(req.validatedData.governed_discount.voucher_code).toBe('GRACEOFFER');
    });

    it('accepts a voucher discount_type on the approval payload', () => {
        const req = {
            body: {
                idempotency_key: 'idem-voucher-approval-123',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'amount',
                discount_amount: 16,
                discount_approval: {
                    approver_user_id: 5,
                    manager_pin: '1234',
                    discount_type: 'voucher'
                },
                governed_discount: {
                    type: 'voucher',
                    voucher_code: 'GRACEOFFER',
                    customer_name: 'Walk-in Customer',
                    discount_amount: 16
                },
                lines: [{ item_id: 1, quantity: 1, sale_price: 160 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_approval.discount_type).toBe('voucher');
    });

    it('accepts canonical Employee Directory identity for sale and item discounts', () => {
        const req = {
            body: {
                idempotency_key: 'idem-directory-employee-123',
                order_method: 'dine_in',
                payment_type: 'cash',
                governed_discount: {
                    type: 'employee',
                    employee_directory_id: 14,
                    employee_name: 'Joshua Guto',
                    employee_id: '001',
                    method: 'percentage',
                    rate: 15
                },
                discount_approval: {
                    approver_user_id: 7,
                    manager_pin: '1234',
                    employee_directory_id: 14,
                    discount_type: 'employee'
                },
                lines: [{
                    item_id: 1,
                    quantity: 1,
                    sale_price: 100,
                    item_discount: {
                        discount_type: 'employee',
                        employee_directory_id: 14,
                        employee_name: 'Joshua Guto',
                        employee_id: '001',
                        method: 'percentage',
                        rate: 15
                    },
                    item_discount_approval: {
                        approver_user_id: 7,
                        manager_pin: '1234',
                        employee_directory_id: 14,
                        discount_type: 'employee'
                    }
                }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.governed_discount.employee_directory_id).toBe(14);
        expect(req.validatedData.lines[0].item_discount.employee_directory_id).toBe(14);
    });

    it('accepts an empty beneficiaries array from an older client for an employee discount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-directory-employee-empty-beneficiaries',
                order_method: 'dine_in',
                payment_type: 'cash',
                governed_discount: {
                    type: 'employee',
                    employee_directory_id: 14,
                    method: 'percentage',
                    rate: 15,
                    beneficiaries: []
                },
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.governed_discount.beneficiaries).toEqual([]);
    });

    it('rejects an employee discount that is not linked to the Employee Directory', () => {
        const req = {
            body: {
                idempotency_key: 'idem-unregistered-employee-123',
                order_method: 'dine_in',
                payment_type: 'cash',
                governed_discount: {
                    type: 'employee',
                    employee_name: 'Free Text Employee',
                    employee_id: '001',
                    method: 'percentage',
                    rate: 15
                },
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects a voucher_code longer than 40 characters, matching the fiscal audit column width', () => {
        const req = {
            body: {
                idempotency_key: 'idem-voucher-long',
                order_method: 'dine_in',
                payment_type: 'cash',
                governed_discount: {
                    type: 'voucher',
                    voucher_code: 'A'.repeat(41),
                    customer_name: 'Walk-in Customer'
                },
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    // Sale-level only (#712) -- item_discount never gains a 'voucher' type or a voucher_code field.
    it('rejects a voucher discount_type on a per-line item_discount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-voucher-item-123',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 10,
                item_discount_amount: 10,
                lines: [{
                    item_id: 1,
                    quantity: 1,
                    sale_price: 100,
                    item_discount: { discount_type: 'voucher', method: 'percentage', rate: 10 },
                    item_discount_approval: { approver_user_id: 99, manager_pin: '1234' }
                }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects non-numeric service_fee_amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'delivery',
                payment_type: 'cash',
                service_fee_amount: 'abc',
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });
});
