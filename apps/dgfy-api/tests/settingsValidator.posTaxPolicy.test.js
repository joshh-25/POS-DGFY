import { jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const taxPolicies = {
    version: 1,
    categories: {
        senior: { vat_treatment: 'vat_exempt' },
        pwd: { vat_treatment: 'vat_exempt' },
        manual: { vat_treatment: 'standard' },
        employee: { vat_treatment: 'standard' },
        promo: { vat_treatment: 'standard' },
        voucher: { vat_treatment: 'standard' }
    }
};

const runMiddleware = (middleware, req) => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    const next = jest.fn();
    middleware(req, res, next);
    return { req, res, next };
};

describe('POS tax policy settings validation', () => {
    test('accepts the complete category matrix for bulk and single-setting writes', () => {
        const bulk = runMiddleware(validateUpdateSettings, { body: { pos_tax_policies: taxPolicies } });
        expect(bulk.next).toHaveBeenCalledTimes(1);
        expect(bulk.req.validatedData.pos_tax_policies).toEqual(taxPolicies);

        const single = runMiddleware(validateUpdateSingleSetting, {
            params: { key: 'pos_tax_policies' },
            body: { value: taxPolicies }
        });
        expect(single.next).toHaveBeenCalledTimes(1);
        expect(single.req.validatedData.value).toEqual(taxPolicies);
    });

    test('rejects a missing category or unsupported VAT treatment', () => {
        const missingVoucher = {
            ...taxPolicies,
            categories: { ...taxPolicies.categories }
        };
        delete missingVoucher.categories.voucher;
        const missingResult = runMiddleware(validateUpdateSettings, { body: { pos_tax_policies: missingVoucher } });
        expect(missingResult.next).not.toHaveBeenCalled();
        expect(missingResult.res.status).toHaveBeenCalledWith(422);

        const invalidTreatment = {
            ...taxPolicies,
            categories: {
                ...taxPolicies.categories,
                manual: { vat_treatment: 'ten_percent' }
            }
        };
        const invalidResult = runMiddleware(validateUpdateSingleSetting, {
            params: { key: 'pos_tax_policies' },
            body: { value: invalidTreatment }
        });
        expect(invalidResult.next).not.toHaveBeenCalled();
        expect(invalidResult.res.status).toHaveBeenCalledWith(422);
    });
});
