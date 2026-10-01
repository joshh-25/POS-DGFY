import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { validateTerminalShiftHistoryQuery } from '../src/validators/posValidator.js';

const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pos.js'), 'utf8');

const runValidator = (value) => {
    const req = { query: value };
    const res = { status: () => res, json: () => res };
    let nextCalled = false;
    validateTerminalShiftHistoryQuery(req, res, () => { nextCalled = true; });
    return { req, nextCalled };
};

describe('POS cashier shift history route contract', () => {
    it('keeps the endpoint behind POS view permission', () => {
        expect(routeSource).toContain("router.get('/terminal/shifts/history', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateTerminalShiftHistoryQuery, posController.getCashierShiftHistory);");
    });

    it('strips client-controlled cashier and scope selectors', () => {
        const result = runValidator({
            date_from: '2026-09-01',
            date_to: '2026-09-28',
            location_id: '12',
            page: '2',
            limit: '50',
            cashier_id: '999',
            scope: 'company'
        });

        expect(result.nextCalled).toBe(true);
        expect(result.req.validatedQuery).toEqual(expect.objectContaining({
            location_id: 12,
            page: 2,
            limit: 50
        }));
        expect(result.req.validatedQuery).not.toHaveProperty('cashier_id');
        expect(result.req.validatedQuery).not.toHaveProperty('scope');
    });
});
