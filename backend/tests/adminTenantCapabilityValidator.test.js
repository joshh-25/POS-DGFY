import {
    validateTenantCapabilityAuditLogQuery,
    validateTenantCapabilityPatch
} from '../src/validators/adminTenantValidator.js';
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

describe('admin tenant capability validators', () => {
    it('rejects string booleans and requires a reason', () => {
        const { res, next } = runMiddleware(validateTenantCapabilityPatch, {
            body: {
                pos_enabled: 'true'
            }
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(422);
        expect(res.payload.errors.map((error) => error.field)).toEqual(expect.arrayContaining([
            'pos_enabled',
            'reason'
        ]));
    });

    it('accepts a bounded audit log query limit', () => {
        const req = { query: { limit: '25' } };
        const { res, next } = runMiddleware(validateTenantCapabilityAuditLogQuery, req);

        expect(res.statusCode).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toEqual({ limit: 25 });
    });
});
