import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.resolve(testDirectory, '../src/routes/pos.js'), 'utf8');
const controllerSource = fs.readFileSync(path.resolve(testDirectory, '../src/controllers/posController.js'), 'utf8');
const handlerSource = fs.readFileSync(path.resolve(testDirectory, '../src/modules/pos/controllers/posHandlers.js'), 'utf8');

describe('POS Z-reading history route contract', () => {
    it('keeps history on the authorized read path and uses the additive list handler', () => {
        expect(routeSource).toContain("router.get('/z-readings', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateZReadingHistoryQuery, posController.listPosZReadings);");
        expect(fs.readFileSync(path.resolve(testDirectory, '../src/validators/posValidator.js'), 'utf8')).toMatch(/const zReadingHistoryQuerySchema = Joi\.object\([\s\S]*?search: Joi\.string\(\)\.trim\(\)\.max\(120\)/);
        expect(fs.readFileSync(path.resolve(testDirectory, '../src/validators/posValidator.js'), 'utf8')).toContain("terminal_id: Joi.string().trim().max(100).allow('').optional()");
        expect(fs.readFileSync(path.resolve(testDirectory, '../src/validators/posValidator.js'), 'utf8')).toContain("closed_by: Joi.string().trim().max(100).allow('').optional()");
        expect(controllerSource).toContain('listPosZReadings');
        expect(handlerSource).toContain('listPosZReadingsUseCase({');
        expect(routeSource).toContain("router.get('/z-reading/:date/details', checkPermission(PERMISSIONS.REPORTS.actions.VIEW_REPORTS), validateZReadingDateParam, validateZReadingQuery, posController.getDailyZReadingDetails);");
        expect(controllerSource).toContain('getDailyZReadingDetails');
        expect(handlerSource).toContain('getDailyZReadingDetailsUseCase({');
        expect(routeSource).toContain("router.get('/z-reading/:date', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateZReadingDateParam, validateZReadingQuery, posController.getDailyZReading);");
    });
});
