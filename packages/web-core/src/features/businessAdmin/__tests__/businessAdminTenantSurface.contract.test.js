import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readRepoFile = (relativePath) => fs.readFileSync(
    path.resolve(__dirname, '../../../../../../', relativePath),
    'utf8'
);

const businessAdminPage = readRepoFile('packages/web-core/src/features/businessAdmin/BusinessAdminPage.jsx');
const businessAdminService = readRepoFile('packages/web-core/src/features/businessAdmin/businessAdminService.js');
const migratedModule = readRepoFile('packages/web-core/src/features/businessAdmin/MigratedBackOfficeModule.jsx');
const businessAdminManifest = readRepoFile('packages/web-core/src/features/businessAdmin/businessAdminManifest.js');
const reportsPage = readRepoFile('packages/web-core/src/features/merchantBackOffice/pages/ReportsPage.jsx');
const aiChatPage = readRepoFile('packages/web-core/src/features/merchantBackOffice/pages/AiChatPage.jsx');

describe('Tenant Back Office presentation boundary', () => {
    it('brands the shell with the active tenant instead of a platform admin title', () => {
        expect(businessAdminPage).toContain('{bootstrap.business?.name || \'Your business\'}');
        expect(businessAdminPage).toContain('Business back office');
        expect(businessAdminPage).not.toContain('DGFY Business Admin');
    });

    it('does not request or render the cross-company platform portfolio', () => {
        expect(businessAdminPage).not.toContain('multiCompanyOverview');
        expect(businessAdminPage).not.toContain('All-company overview');
        expect(businessAdminPage).not.toContain('Tenant portfolio');
        expect(businessAdminService).not.toContain('multiCompanyOverview');
    });

    it('uses tenant-facing names for migrated reports and assistant surfaces', () => {
        expect(businessAdminManifest).toContain("'ai-chat': module('Settings', 'ai-chat', 'Business assistant'");
        expect(reportsPage).toContain('Revenue &amp; transfers');
        expect(aiChatPage).toContain('Business Back Office assistant');
        expect(aiChatPage).toContain('>Business Assistant</h2>');
        expect(migratedModule).not.toContain('DGFY assistant');
    });

    it('keeps payment monitoring read-only while using tenant language', () => {
        expect(businessAdminPage).toContain('Read-only payment activity');
        expect(businessAdminPage).toContain('Payment account');
        expect(businessAdminPage).toContain('Payment reconciliation');
        expect(businessAdminPage).not.toContain('Manual settlement');
    });

    it('explains tenant-scoped customer, loyalty, and Team & Access boundaries', () => {
        expect(businessAdminPage).toContain('Tenant-scoped customer workspace');
        expect(businessAdminPage).toContain('Earning, redemption, refunds, adjustments, ownership, and accounting treatment');
        expect(businessAdminPage).toContain('Employee records describe the person and operational activity. Login accounts control authentication.');
        expect(businessAdminPage).toContain('terminal permissions and Back Office permissions remain separate.');
        expect(businessAdminPage).toContain('Branch access');
    });
});
