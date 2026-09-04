import { validateTenantAffiliateSlotsPatch } from '../src/validators/adminTenantValidator.js';
import { jest } from '@jest/globals';

const runMiddleware = (middleware, req) => {
    const res = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
    const next = jest.fn();
    middleware(req, res, next);
    return { res, next };
};

describe('tenant affiliate-slots patch validator (#1190, Phase 213)', () => {
    it('accepts a valid patch and converts a string integer', () => {
        const req = { body: { max_affiliate_slots: '2', reason: 'raised per commercial agreement' } };
        const { res, next } = runMiddleware(validateTenantAffiliateSlotsPatch, req);

        expect(res.statusCode).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData).toEqual({ max_affiliate_slots: 2, reason: 'raised per commercial agreement' });
    });

    it.each([
        [{ max_affiliate_slots: 0, reason: 'valid reason text' }, 'max_affiliate_slots'],
        [{ max_affiliate_slots: -1, reason: 'valid reason text' }, 'max_affiliate_slots'],
        [{ max_affiliate_slots: 1.5, reason: 'valid reason text' }, 'max_affiliate_slots'],
        [{ max_affiliate_slots: 101, reason: 'valid reason text' }, 'max_affiliate_slots'],
        [{ reason: 'valid reason text' }, 'max_affiliate_slots'],
        [{ max_affiliate_slots: 2 }, 'reason'],
        [{ max_affiliate_slots: 2, reason: 'no' }, 'reason'],
        [{ max_affiliate_slots: 2, reason: 'x'.repeat(501) }, 'reason'],
        [{ max_affiliate_slots: 2, reason: 'valid reason text', extra: 'nope' }, 'extra']
    ])('rejects %j (bad field: %s)', (body, badField) => {
        const { res, next } = runMiddleware(validateTenantAffiliateSlotsPatch, { body });

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(422);
        expect(res.payload.errors.map((error) => error.field)).toEqual(expect.arrayContaining([badField]));
    });
});
