import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('../src/routes/pos.js', import.meta.url), 'utf8');
const handlerSource = readFileSync(new URL('../src/modules/pos/controllers/posHandlers.js', import.meta.url), 'utf8');

describe('POS report breakdown route contract', () => {
    it('exposes the additive breakdown endpoint with the existing POS read permissions', () => {
        expect(routeSource).toContain("router.get('/reports/breakdowns', checkAnyPermission([PERMISSIONS.POS.actions.VIEW_POS, PERMISSIONS.POS.actions.VIEW_BRANCH_POS]), validatePosReportsBreakdownQuery, posController.getReportBreakdown);");
        expect(routeSource).toContain('validatePosReportsBreakdownQuery');
        expect(handlerSource).toContain('getPosReportBreakdownUseCase');
        expect(handlerSource).toContain('export const getReportBreakdown');
    });

    it('keeps the existing overview and export routes intact', () => {
        expect(routeSource).toContain("router.get('/reports/overview', checkAnyPermission([PERMISSIONS.POS.actions.VIEW_POS, PERMISSIONS.POS.actions.VIEW_BRANCH_POS]), validatePosReportsQuery, posController.getReportsOverview);");
        expect(routeSource).toContain("router.get('/reports/export', checkAnyPermission([PERMISSIONS.POS.actions.VIEW_POS, PERMISSIONS.POS.actions.VIEW_BRANCH_POS]), validatePosReportsExportQuery, posController.exportReports);");
    });
});
