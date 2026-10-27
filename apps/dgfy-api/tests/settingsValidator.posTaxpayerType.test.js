import { describe, expect, it, jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

const buildResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
});

describe('settings validator POS taxpayer type contract', () => {
    it('rejects an unknown nonblank taxpayer type on bulk updates', () => {
        const req = { body: { pos_taxpayer_type: 'legacy_unknown' } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].errors[0].message).toContain('POS taxpayer type');
    });

    it('rejects an unknown nonblank taxpayer type on single-setting updates', () => {
        const req = {
            params: { key: 'pos_taxpayer_type' },
            body: { value: 'legacy_unknown' }
        };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSingleSetting(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it.each(['VAT', 'VAT_REGISTERED', 'non-vat', 'NON_VAT_REGISTERED', 'nonvat'])('accepts legacy alias %s without rewriting it', (value) => {
        const req = { body: { pos_taxpayer_type: value } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.pos_taxpayer_type).toBe(value);
    });

    it('accepts a blank taxpayer type as not configured', () => {
        const req = { body: { pos_taxpayer_type: '' } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.pos_taxpayer_type).toBe('');
    });
});
