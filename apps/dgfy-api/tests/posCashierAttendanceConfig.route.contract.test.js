import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { validateAttendanceConfigUpdate } from '../src/validators/posValidator.js';

const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pos.js'), 'utf8');

const runValidator = (body) => {
    const req = { body };
    let statusCode = null;
    let responseBody = null;
    const res = {
        status(code) { statusCode = code; return res; },
        json(value) { responseBody = value; return res; }
    };
    let nextCalled = false;
    validateAttendanceConfigUpdate(req, res, () => { nextCalled = true; });
    return { req, nextCalled, statusCode, responseBody };
};

describe('POS cashier attendance configuration route contract', () => {
    it('uses settings view/edit permissions and a dedicated write boundary', () => {
        expect(routeSource).toContain("router.get('/attendance/config', checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS), posController.getAttendanceConfig);");
        expect(routeSource).toContain("router.put('/attendance/config', checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS), validateAttendanceConfigUpdate, posController.updateAttendanceConfig);");
    });

    it('accepts a revision-bound active-location payload and strips unsupported fields', () => {
        const result = runValidator({
            enabled: true,
            location_ids: [2, 1],
            revision: null,
            setting_key: 'client-controlled'
        });
        expect(result.nextCalled).toBe(true);
        expect(result.req.validatedData).toEqual({ enabled: true, location_ids: [2, 1], revision: null });
    });

    it('rejects enabling without a location and duplicate location IDs', () => {
        const missing = runValidator({ enabled: true, location_ids: [], revision: null });
        const duplicate = runValidator({ enabled: true, location_ids: [1, 1], revision: null });
        expect(missing.nextCalled).toBe(false);
        expect(missing.statusCode).toBe(422);
        expect(duplicate.nextCalled).toBe(false);
        expect(duplicate.statusCode).toBe(422);
    });
});
