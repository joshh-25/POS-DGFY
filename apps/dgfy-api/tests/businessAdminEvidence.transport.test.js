import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

describe('Business Admin Item 7/8 evidence transport contract', () => {
    it('keeps the evidence endpoints on the POS Business Admin route surface', () => {
        const route = read('src/routes/businessAdmin.js');
        const handler = read('src/modules/businessAdmin/controllers/businessAdminHandlers.js');
        const api = fs.readFileSync(path.resolve(__dirname, '../../../packages/web-core/src/features/merchantBackOffice/api/businessAdminReportsApi.js'), 'utf8');
        const page = fs.readFileSync(path.resolve(__dirname, '../../../packages/web-core/src/features/merchantBackOffice/pages/ReportsPage.jsx'), 'utf8');
        const panel = fs.readFileSync(path.resolve(__dirname, '../../../packages/web-core/src/features/merchantBackOffice/components/EvidencePanel.jsx'), 'utf8');

        expect(route).toContain("router.get('/reports/evidence/catalog', businessAdminHandlers.listEvidenceCatalog);");
        expect(route).toContain("router.get('/reports/evidence/ejournal', businessAdminHandlers.getEJournalEvidence);");
        expect(handler).toContain('getBusinessAdminEJournalEvidenceUseCase');
        expect(handler).toContain("format === 'summary'");
        expect(api).toContain("/business-admin/reports/evidence/catalog");
        expect(api).toContain("/business-admin/reports/evidence/ejournal");
        expect(page).toContain('EvidencePanel');
        expect(panel).toContain('external BIR/provider grammar review is still required');
        expect(panel).toContain('Download evidence');
        expect(panel).not.toContain('BIR-approved');
    });
});
