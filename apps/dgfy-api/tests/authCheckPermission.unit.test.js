import { describe, expect, it } from '@jest/globals';
import { checkPermission } from '../src/middleware/auth.js';

// #1045: checkPermission's 403 previously carried no machine-readable code,
// which is part of why a stale permission snapshot produced an unclassifiable
// failure the POS terminal could only render as the generic owner banner.
const runMiddleware = (req) => {
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    let nextCalled = false;
    checkPermission('pos:attendance:view')(req, res, () => { nextCalled = true; });
    return { res, nextCalled };
};

describe('checkPermission', () => {
    it('denies a user missing the required permission with a machine-readable reason code', () => {
        const { res, nextCalled } = runMiddleware({
            user: { is_master_admin: false, permissions: ['pos:view', 'pos:transact'] }
        });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(403);
        // Legacy fields preserved verbatim -- this is an additive change.
        expect(res.body.message).toBe('Access denied: Insufficient permissions');
        expect(res.body.required).toBe('pos:attendance:view');
        // New, machine-readable fields.
        expect(res.body.error_code).toBe('PERMISSION_DENIED');
        expect(res.body.errors).toEqual({
            reason_code: 'PERMISSION_DENIED',
            required_permission: 'pos:attendance:view'
        });
    });

    it('allows a user holding the required permission', () => {
        const { nextCalled } = runMiddleware({
            user: { is_master_admin: false, permissions: ['pos:attendance:view'] }
        });

        expect(nextCalled).toBe(true);
    });

    it('bypasses the check entirely for a master admin, regardless of stored permissions', () => {
        const { nextCalled } = runMiddleware({
            user: { is_master_admin: true, permissions: [] }
        });

        expect(nextCalled).toBe(true);
    });
});
