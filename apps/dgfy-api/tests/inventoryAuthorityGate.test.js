import { jest } from '@jest/globals';

const mockResolveInventoryAuthority = jest.fn();

jest.unstable_mockModule('../src/modules/shared/utils/inventoryAuthoritySettingsCache.js', () => ({
    resolveInventoryAuthority: mockResolveInventoryAuthority
}));

let requireLocalInventoryLedgerOwnership;
let bodyDeclaresCurrentStock;

beforeAll(async () => {
    ({ requireLocalInventoryLedgerOwnership, bodyDeclaresCurrentStock } = await import('../src/middleware/inventoryAuthorityGate.js'));
});

const buildRes = () => {
    const res = { statusCode: null, body: null };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res.body = body; return res; });
    return res;
};

describe('requireLocalInventoryLedgerOwnership (Phase 9 sibling to requireWorkflowCapability)', () => {
    beforeEach(() => {
        mockResolveInventoryAuthority.mockReset();
    });

    it('is a no-op for the default (platform-owned) inventory_authority', async () => {
        mockResolveInventoryAuthority.mockResolvedValue('platform');
        const middleware = requireLocalInventoryLedgerOwnership('Purchase order receiving');
        const next = jest.fn();
        const res = buildRes();

        await middleware({}, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('fails closed with a 403 WORKFLOW_MODE_CAPABILITY_DENIED-shaped response when delegated', async () => {
        mockResolveInventoryAuthority.mockResolvedValue('external_ims');
        const middleware = requireLocalInventoryLedgerOwnership('Purchase order receiving');
        const next = jest.fn();
        const res = buildRes();

        await middleware({}, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error_code: 'INVENTORY_AUTHORITY_DELEGATED_DENIED',
            errors: expect.objectContaining({ inventory_authority: 'external_ims' })
        }));
    });

    it('respects a shouldBlock predicate to scope the gate to a subset of requests', async () => {
        mockResolveInventoryAuthority.mockResolvedValue('external_ims');
        const middleware = requireLocalInventoryLedgerOwnership('Item write', { shouldBlock: bodyDeclaresCurrentStock });
        const next = jest.fn();
        const res = buildRes();

        await middleware({ body: { name: 'Widget' } }, res, next);
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();

        const res2 = buildRes();
        const next2 = jest.fn();
        await middleware({ body: { name: 'Widget', current_stock: 10 } }, res2, next2);
        expect(next2).not.toHaveBeenCalled();
        expect(res2.status).toHaveBeenCalledWith(403);
    });

    it('passes resolver errors to next(error) rather than throwing', async () => {
        const boom = new Error('settings lookup failed');
        mockResolveInventoryAuthority.mockRejectedValue(boom);
        const middleware = requireLocalInventoryLedgerOwnership('Purchase order receiving');
        const next = jest.fn();
        const res = buildRes();

        await middleware({}, res, next);

        expect(next).toHaveBeenCalledWith(boom);
        expect(res.status).not.toHaveBeenCalled();
    });
});

describe('bodyDeclaresCurrentStock', () => {
    it('is false for a missing/blank current_stock and true once a real value is present', () => {
        expect(bodyDeclaresCurrentStock({ body: {} })).toBe(false);
        expect(bodyDeclaresCurrentStock({ body: { current_stock: null } })).toBe(false);
        expect(bodyDeclaresCurrentStock({ body: { current_stock: '' } })).toBe(false);
        expect(bodyDeclaresCurrentStock({ body: { current_stock: 0 } })).toBe(true);
        expect(bodyDeclaresCurrentStock({ body: { current_stock: 25 } })).toBe(true);
    });
});
