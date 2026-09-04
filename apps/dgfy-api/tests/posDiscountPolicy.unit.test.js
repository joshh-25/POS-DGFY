import { resolvePosGovernedDiscount } from '../src/modules/pos/domain/posDiscountPolicy.js';

const preparedLines = [
    { item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100, senior_pwd_discount_eligible: true },
    { item_id: 2, quantity: 1, sale_price: 80, line_subtotal: 80, senior_pwd_discount_eligible: false }
];

const rules = {
    senior: { id: 10, name: 'Senior Citizen', type: 'senior', method: 'percentage', rate: 20, is_active: true },
    pwd: { id: 11, name: 'PWD', type: 'pwd', method: 'percentage', rate: 20, is_active: true },
    employee: { id: 12, name: 'Employee Discount', type: 'employee', method: 'percentage', rate: 15, is_active: true },
    manual: { id: 13, name: 'Manual Discount', type: 'manual', method: 'percentage', rate: null, is_active: true }
};

describe('POS governed discount policy', () => {
    test('preserves a selected statutory quantity for an eligible item', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'senior', customer_name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        });

        expect(result.application.lines).toEqual([{ item_id: 1, eligible_quantity: 1 }]);
    });

    test('rejects a statutory quantity above the cart quantity', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'pwd', customer_name: 'Maria', id_number: 'PWD-1', eligible_items: [{ item_id: 1, eligible_quantity: 3 }] },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.pwd
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_QUANTITY_INVALID' } });
    });

    test('accepts multiple statutory beneficiaries with non-overlapping quantities', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] },
                    { category: 'senior', name: 'Pedro', id_number: 'SC-2', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] }
                ]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        });

        expect(result.application.beneficiaries).toHaveLength(2);
        expect(result.application.customer_name).toBeNull();
    });

    test('rejects combined beneficiary quantities above the cart quantity', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 2 }] },
                    { category: 'senior', name: 'Pedro', id_number: 'SC-2', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] }
                ]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_QUANTITY_INVALID' } });
    });

    test('rejects duplicate beneficiary IDs case-insensitively', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                beneficiaries: [
                    { category: 'senior', name: 'Juan', id_number: 'SC-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] },
                    { category: 'senior', name: 'Pedro', id_number: 'sc-1', eligible_items: [{ item_id: 1, eligible_quantity: 1 }] }
                ]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 112, senior_pwd_discount_eligible: true }],
            findActiveRule: async () => rules.senior
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_BENEFICIARY_DUPLICATE' } });
    });
    test('uses the active statutory rule and selected eligible items', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'senior',
                method: 'fixed',
                rate: 100,
                customer_name: 'Juan Dela Cruz',
                id_number: 'SC-123',
                eligible_item_ids: [1]
            },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        });

        expect(result.application).toMatchObject({
            rule_id: 10,
            method: 'percentage',
            rate: 20,
            lines: [{ item_id: 1 }]
        });
    });

    test('rejects statutory selection for an ineligible item', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'pwd', customer_name: 'Maria', id_number: 'PWD-1', eligible_item_ids: [2] },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        })).rejects.toMatchObject({ details: { reason_code: 'STATUTORY_ITEM_NOT_ELIGIBLE' } });
    });

    test('resolves promo rate and targets from commercial Storefront configuration', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: ' save10 ', method: 'fixed', rate: 99, customer_name: 'Promo Buyer' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [2] }
                }
            }
        });

        expect(result.application).toMatchObject({
            type: 'promo',
            method: 'percentage',
            rate: 10,
            promo_code: 'SAVE10',
            lines: [{ item_id: 2 }]
        });
        expect(result.promo.discountAmount).toBe(8);
    });

    test('honors the selected item scope when applying a configured promo', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'promo',
                promo_code: 'SAVE10',
                customer_name: 'Promo Buyer',
                eligible_item_ids: [1]
            },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1, 2] }
                }
            }
        });

        expect(result.application.lines).toEqual([{ item_id: 1 }]);
        expect(result.promo.discountAmount).toBe(10);
    });

    test('preserves selected quantities for employee discounts', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'employee',
                employee_directory_id: 42,
                customer_name: '',
                eligible_item_ids: [1],
                eligible_items: [{ item_id: 1, eligible_quantity: 0.5 }]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 100, line_subtotal: 200 }],
            subtotalAmount: 200,
            findActiveRule: async () => rules.employee,
            findActiveEmployeeDirectory: async () => ({ employee_id: 42, employee_code: 'E-42', full_name: 'Staff Member', email: 'staff@example.com' })
        });

        expect(result.application.lines).toEqual([{ item_id: 1, eligible_quantity: 0.5 }]);
    });

    test('preserves exact line selection when duplicate cart lines share an item ID', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'employee',
                employee_directory_id: 42,
                eligible_items: [{ line_ref: 'coffee-cold', item_id: 1, eligible_quantity: 1 }]
            },
            preparedLines: [
                { line_ref: 'coffee-hot', item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100 },
                { line_ref: 'coffee-cold', item_id: 1, quantity: 1, sale_price: 150, line_subtotal: 150 }
            ],
            subtotalAmount: 250,
            findActiveRule: async () => rules.employee,
            findActiveEmployeeDirectory: async () => ({ employee_id: 42, employee_code: 'E-42', full_name: 'Staff Member', email: 'staff@example.com' })
        });

        expect(result.application.lines).toEqual([
            { line_ref: 'coffee-cold', item_id: 1, eligible_quantity: 1 }
        ]);
    });

    test('rejects ambiguous quantity selection from a legacy client when duplicate lines share an item ID', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: {
                type: 'employee',
                employee_directory_id: 42,
                eligible_items: [{ item_id: 1, eligible_quantity: 1 }]
            },
            preparedLines: [
                { line_ref: 'coffee-hot', item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100 },
                { line_ref: 'coffee-cold', item_id: 1, quantity: 1, sale_price: 150, line_subtotal: 150 }
            ],
            subtotalAmount: 250,
            findActiveRule: async () => rules.employee,
            findActiveEmployeeDirectory: async () => ({ employee_id: 42, employee_code: 'E-42', full_name: 'Staff Member' })
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_LINE_SELECTION_AMBIGUOUS' } });
    });

    test('preserves selected quantities for configured promos', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'promo',
                promo_code: 'SAVE10',
                customer_name: 'Promo Buyer',
                eligible_item_ids: [1],
                eligible_items: [{ item_id: 1, eligible_quantity: 0.5 }]
            },
            preparedLines: [{ item_id: 1, quantity: 2, sale_price: 100, line_subtotal: 200 }],
            subtotalAmount: 200,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] }
                }
            }
        });

        expect(result.application.lines).toEqual([{ item_id: 1, eligible_quantity: 0.5 }]);
        expect(result.promo.discountAmount).toBe(5);
    });

    test('resolves promo rate and targets from multiple Storefront promo configurations', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: ' meal15 ', method: 'fixed', rate: 99, customer_name: 'Promo Buyer' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promos: {
                    value: [
                        { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] },
                        { active: true, promo_code: 'MEAL15', discount_percent: 15, target_item_ids: [2] }
                    ]
                }
            }
        });

        expect(result.application).toMatchObject({
            type: 'promo',
            method: 'percentage',
            rate: 15,
            promo_code: 'MEAL15',
            lines: [{ item_id: 2 }]
        });
        expect(result.promo.config).toMatchObject({
            sourceKey: 'storefront_promos',
            sourceIndex: 1
        });
        expect(result.promo.discountAmount).toBe(12);
    });

    test('falls back to legacy single Storefront promo when multi-promo settings are absent', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: 'save10', customer_name: 'Promo Buyer' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] }
                }
            }
        });

        expect(result.promo.config).toMatchObject({
            sourceKey: 'storefront_promo',
            promoCode: 'SAVE10'
        });
        expect(result.promo.discountAmount).toBe(10);
    });

    test('rejects legacy POS-user employee identities', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'employee', customer_name: 'Employee Buyer', employee_id: '7', employee_name: 'Spoofed', method: 'percentage', rate: 50 },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type],
            findActiveEmployee: async () => ({ user_id: 7, username: 'cashier-seven' })
        })).rejects.toMatchObject({ details: { reason_code: 'EMPLOYEE_DIRECTORY_ID_REQUIRED' } });
    });

    test('canonicalizes employee code from the Employee Directory without coercing 001 to POS user 1', async () => {
        let legacyUserLookupCalled = false;
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'employee',
                employee_directory_id: 14,
                employee_id: '001',
                employee_name: 'Spoofed',
                method: 'percentage',
                rate: 50
            },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type],
            findActiveEmployeeDirectory: async () => ({
                employee_id: 14,
                employee_code: '001',
                full_name: 'Joshua Guto',
                email: 'joshua@example.com'
            }),
            findActiveEmployee: async () => {
                legacyUserLookupCalled = true;
                return { user_id: 1, username: 'wrong-user' };
            }
        });

        expect(legacyUserLookupCalled).toBe(false);
        expect(result.application).toMatchObject({
            employee_directory_id: 14,
            employee_id: '001',
            employee_name: 'Joshua Guto',
            employee_email: 'joshua@example.com',
            employee_user_id: null,
            rate: 15
        });
    });

    test('rejects free-text employee discounts without an Employee Directory ID', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'employee', method: 'percentage', rate: 50, employee_name: 'Employee Name Only' },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        })).rejects.toMatchObject({ details: { reason_code: 'EMPLOYEE_DIRECTORY_ID_REQUIRED' } });
    });

    test('requires customer name for non-statutory promo discounts', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'promo', promo_code: 'SAVE10' },
            preparedLines,
            subtotalAmount: 180,
            settings: {
                storefront_promo: {
                    value: { active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] }
                }
            }
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_CUSTOMER_NAME_REQUIRED' } });
    });

    test('uses the registered employee name even when the client omits it', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'employee', employee_directory_id: 14 },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type],
            findActiveEmployeeDirectory: async () => ({
                employee_id: 14,
                employee_code: '001',
                full_name: 'Joshua Guto',
                email: 'joshua@example.com'
            })
        });

        expect(result.application).toMatchObject({
            employee_directory_id: 14,
            employee_id: '001',
            employee_name: 'Joshua Guto'
        });
    });

    test('requires customer name for manual discounts while preserving existing manual controls', async () => {
        await expect(resolvePosGovernedDiscount({
            draft: { type: 'manual', method: 'percentage', rate: 10, reason: 'Manager approved' },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_CUSTOMER_NAME_REQUIRED' } });
    });

    test('allows a manual discount without a reason when the customer identity is present', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: { type: 'manual', method: 'percentage', rate: 10, customer_name: 'Walk-in Customer' },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type]
        });

        expect(result.application).toMatchObject({
            type: 'manual',
            customer_name: 'Walk-in Customer',
            rate: 10
        });
        expect(result.application.reason || '').toBe('');
    });

    test('restricts employee and manual discounts to selected cart items', async () => {
        const result = await resolvePosGovernedDiscount({
            draft: {
                type: 'employee',
                customer_name: 'Employee Buyer',
                employee_directory_id: 14,
                eligible_item_ids: [2]
            },
            preparedLines,
            subtotalAmount: 180,
            findActiveRule: async (type) => rules[type],
            findActiveEmployeeDirectory: async () => ({
                employee_id: 14,
                employee_code: '001',
                full_name: 'Employee Name'
            })
        });

        expect(result.application.lines).toEqual([{ item_id: 2 }]);
    });

    // #712: POS voucher redemption -- the domain policy stays DB-agnostic, so `redeemVoucher` is a
    // fake caller-bound async function here, matching how findActiveRule/findActiveEmployee are
    // faked above.
    describe('voucher discounts (#712)', () => {
        const percentOffVoucher = {
            applied: true,
            code: 'GRACEOFFER',
            title: 'Grace Offer',
            badge: null,
            benefitClass: 'percent_off',
            percentOffBps: 1000, // 10%
            discountCentavos: 800,
            lineAllocations: [
                { item_id: 1, quantity: 1, discountCentavos: 800, eligible: true },
                { item_id: 2, quantity: 1, discountCentavos: 0, eligible: false }
            ]
        };

        test('requires customer name for a voucher discount, matching the promo requirement', async () => {
            await expect(resolvePosGovernedDiscount({
                draft: { type: 'voucher', voucher_code: 'GRACEOFFER' },
                preparedLines,
                subtotalAmount: 180,
                redeemVoucher: async () => percentOffVoucher
            })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_CUSTOMER_NAME_REQUIRED' } });
        });

        test('requires a voucher code before calling redeemVoucher at all', async () => {
            let callCount = 0;
            const redeemVoucher = async () => { callCount += 1; return percentOffVoucher; };
            await expect(resolvePosGovernedDiscount({
                draft: { type: 'voucher', customer_name: 'Walk-in Customer', voucher_code: '  ' },
                preparedLines,
                subtotalAmount: 180,
                redeemVoucher
            })).rejects.toMatchObject({ details: { reason_code: 'VOUCHER_CODE_REQUIRED' } });
            expect(callCount).toBe(0);
        });

        test('throws when no redeemVoucher dependency is provided for a voucher discount', async () => {
            await expect(resolvePosGovernedDiscount({
                draft: { type: 'voucher', customer_name: 'Walk-in Customer', voucher_code: 'GRACEOFFER' },
                preparedLines,
                subtotalAmount: 180
            })).rejects.toThrow('redeemVoucher dependency is required for voucher governed discounts');
        });

        test('shapes a percent_off voucher application from the redemption result', async () => {
            const result = await resolvePosGovernedDiscount({
                draft: { type: 'voucher', customer_name: 'Walk-in Customer', voucher_code: ' graceoffer ' },
                preparedLines,
                subtotalAmount: 180,
                redeemVoucher: async () => percentOffVoucher
            });

            expect(result.application).toMatchObject({
                type: 'voucher',
                method: 'percentage',
                rate: 10,
                amount: null,
                promo_code: 'GRACEOFFER',
                customer_name: 'Walk-in Customer',
                lines: [{ item_id: 1 }]
            });
            expect(result.promo).toBeNull();
            expect(result.voucher).toBe(percentOffVoucher);
        });

        test('shapes a fixed-benefit (amount_off / fixed_price) voucher application', async () => {
            const fixedVoucher = {
                applied: true,
                code: 'PHARMA50',
                title: 'Pharmacy Fixed Price',
                badge: 'B2B',
                benefitClass: 'fixed_price',
                percentOffBps: null,
                discountCentavos: 500,
                lineAllocations: [
                    { item_id: 1, quantity: 1, discountCentavos: 500, eligible: true }
                ]
            };
            const result = await resolvePosGovernedDiscount({
                draft: { type: 'voucher', customer_name: 'Walk-in Customer', voucher_code: 'PHARMA50' },
                preparedLines,
                subtotalAmount: 180,
                redeemVoucher: async () => fixedVoucher
            });

            expect(result.application).toMatchObject({
                type: 'voucher',
                method: 'fixed',
                rate: null,
                label: 'B2B',
                promo_code: 'PHARMA50'
            });
        });

        test('passes only selected lines to redeemVoucher while preserving all-line fallback', async () => {
            let capturedLines = null;
            await resolvePosGovernedDiscount({
                draft: { type: 'voucher', customer_name: 'Walk-in Customer', voucher_code: 'GRACEOFFER', eligible_item_ids: [2] },
                preparedLines,
                subtotalAmount: 180,
                redeemVoucher: async ({ lines }) => {
                    capturedLines = lines;
                    return percentOffVoucher;
                }
            });

            expect(capturedLines).toEqual([
                expect.objectContaining({ item_id: 2 })
            ]);
        });

        test('passes the selected quantity to redeemVoucher', async () => {
            let capturedLines = null;
            await resolvePosGovernedDiscount({
                draft: {
                    type: 'voucher',
                    customer_name: 'Walk-in Customer',
                    voucher_code: 'GRACEOFFER',
                    eligible_item_ids: [1],
                    eligible_items: [{ item_id: 1, eligible_quantity: 0.5 }]
                },
                preparedLines: [{ item_id: 1, quantity: 2, sale_price: 100, line_subtotal: 200 }],
                subtotalAmount: 200,
                redeemVoucher: async ({ lines }) => {
                    capturedLines = lines;
                    return percentOffVoucher;
                }
            });

            expect(capturedLines).toEqual([
                expect.objectContaining({ item_id: 1, quantity: 0.5, line_subtotal: 50 })
            ]);
        });

        test('passes every prepared line when no selection is supplied for legacy clients', async () => {
            let capturedLines = null;
            await resolvePosGovernedDiscount({
                draft: { type: 'voucher', customer_name: 'Walk-in Customer', voucher_code: 'GRACEOFFER' },
                preparedLines,
                subtotalAmount: 180,
                redeemVoucher: async ({ lines }) => {
                    capturedLines = lines;
                    return percentOffVoucher;
                }
            });

            expect(capturedLines).toEqual([
                expect.objectContaining({ item_id: 1 }),
                expect.objectContaining({ item_id: 2 })
            ]);
        });

        test('never reaches the unsupported-discount-type rejection for a voucher', async () => {
            // Regression guard: the voucher branch must be checked BEFORE the RULE_TYPES rejection,
            // or every voucher discount would 422 with UNSUPPORTED_DISCOUNT_TYPE.
            const result = await resolvePosGovernedDiscount({
                draft: { type: 'voucher', customer_name: 'Walk-in Customer', voucher_code: 'GRACEOFFER' },
                preparedLines,
                subtotalAmount: 180,
                redeemVoucher: async () => percentOffVoucher
            });

            expect(result.application.type).toBe('voucher');
        });
    });
});
