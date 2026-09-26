import { describe, expect, it, jest } from '@jest/globals';
import {
    validateConfigurableDiscountRuleId,
    validateCreateConfigurableDiscountRule,
    validateUpdateConfigurableDiscountRule
} from '../src/validators/settingsValidator.js';

const runValidator = async (validator, req) => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
    const next = jest.fn();
    validator(req, res, next);
    return { req, res, next };
};

describe('configurable discount management validation', () => {
    it('defaults newly created rules to disabled and unapproved', async () => {
        const result = await runValidator(validateCreateConfigurableDiscountRule, {
            body: {
                name: 'Employee Discount',
                percentage: 12
            }
        });

        expect(result.next).toHaveBeenCalledTimes(1);
        expect(result.req.validatedData).toMatchObject({
            name: 'Employee Discount',
            percentage: 12,
            is_enabled: false,
            is_approved: false,
            description: null
        });
    });

    it('requires a version and at least one editable field on update', async () => {
        const result = await runValidator(validateUpdateConfigurableDiscountRule, {
            body: { expected_configuration_version: 2 }
        });

        expect(result.next).not.toHaveBeenCalled();
        expect(result.res.status).toHaveBeenCalledWith(422);
        expect(result.res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            errors: expect.arrayContaining([
                expect.objectContaining({ field: '' })
            ])
        }));
    });

    it('accepts an approval toggle with an optimistic version', async () => {
        const result = await runValidator(validateUpdateConfigurableDiscountRule, {
            body: {
                is_approved: true,
                expected_configuration_version: 2
            }
        });

        expect(result.next).toHaveBeenCalledTimes(1);
        expect(result.req.validatedData).toEqual({
            is_approved: true,
            expected_configuration_version: 2
        });
    });

    it('validates the discount rule route id', async () => {
        const result = await runValidator(validateConfigurableDiscountRuleId, {
            params: { discountRuleId: '21' }
        });

        expect(result.next).toHaveBeenCalledTimes(1);
        expect(result.req.validatedParams).toEqual({ discountRuleId: 21 });
    });
});
