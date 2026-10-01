import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(
    path.resolve(__dirname, relativePath),
    'utf8'
);

describe('cashier history scope request contract', () => {
    it('omits the automatic operating location for company-wide history', () => {
        const source = readSource('../pages/TerminalPage.jsx');

        expect(source).toContain("const canViewAllCashierHistory = hasPermission('business_admin:branches:view_all');");
        expect(source).toContain('const scopedLocationId = explicitlyRequestedLocationId');
        expect(source).toContain('|| (!canViewAllCashierHistory ? operatingLocationId : null);');
        expect(source).toContain('else delete historyFilters.location_id;');
        expect(source).toContain('historyScope: payload?.history_scope || null');
        expect(source).not.toContain("scope: 'company'");
    });

    it('keeps company-wide history out of the read-only branch-view pane', () => {
        const source = readSource('../components/TerminalOperationsWorkspace.jsx');

        expect(source).toContain('if (isBranchReadOnlyView) return renderShiftLocationPane();');
        expect(source).toContain('<CashierHistoryPanel');
    });
});
