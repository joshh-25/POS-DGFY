import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readRepoFile = (relativePath) => fs.readFileSync(
    path.resolve(__dirname, '../../../..', relativePath),
    'utf8'
);

const businessAdminPage = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/BusinessAdminPage.jsx');
const businessAdminService = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/businessAdminService.js');

describe('Business Admin approval queue contract', () => {
    it('keeps approval review and decision actions on the OPIS Business Admin surface', () => {
        expect(businessAdminPage).toContain("activeSection === 'approvals'");
        expect(businessAdminPage).toContain("businessAdminApi.approvals({ status: 'pending', limit: 100 })");
        expect(businessAdminPage).toContain("businessAdminApi.decideApproval(id, decision, `${decision} requested from Back Office.`)");
        expect(businessAdminPage).toContain('Review high-risk POS requests here; POS remains the canonical execution owner');
        expect(businessAdminPage).toContain("{ key: 'reason', label: 'Reason'");
        expect(businessAdminService).toContain("get('/business-admin/approvals', params)");
        expect(businessAdminService).toContain("api.post(`/business-admin/approvals/${encodeURIComponent(id)}/${decision}`, { note })");
    });
});
