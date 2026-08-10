import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { requireTenantContext } from '../src/middleware/requireTenantContext.js';

const createRes = () => {
    const res = {
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

describe('requireTenantContext middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('allows request when tenant request/context are aligned and non-default', async () => {
        const req = { tenant: { id: 'tenant-123' } };
        const res = createRes();
        const next = jest.fn();

        await dbStore.run({ tenantId: 'tenant-123' }, async () => {
            requireTenantContext(req, res, next);
        });

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects request when request tenant is missing', async () => {
        const req = {};
        const res = createRes();
        const next = jest.fn();

        await dbStore.run({ tenantId: 'tenant-123' }, async () => {
            requireTenantContext(req, res, next);
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Company token required',
            error_code: 'TENANT_CONTEXT_MISSING'
        }));
    });

    it('rejects request when context falls back to default tenant', async () => {
        const req = { tenant: { id: 'tenant-123' } };
        const res = createRes();
        const next = jest.fn();

        await dbStore.run({ tenantId: 'default' }, async () => {
            requireTenantContext(req, res, next);
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects request when request tenant does not match context tenant', async () => {
        const req = { tenant: { id: 'tenant-a' } };
        const res = createRes();
        const next = jest.fn();

        await dbStore.run({ tenantId: 'tenant-b' }, async () => {
            requireTenantContext(req, res, next);
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
