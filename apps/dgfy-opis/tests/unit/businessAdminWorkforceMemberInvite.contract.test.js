import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'),
    'utf8'
);
const businessAdminCss = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/businessAdmin.css'),
    'utf8'
);

describe('Business Admin workforce member invitation contract', () => {
    it('keeps Workforce informational and links management to Team & access', () => {
        expect(businessAdminPage).toContain('function WorkforceWorkspace({ data, bootstrap, teamCapability, onManageTeam })');
        expect(businessAdminPage).toContain('title="Workforce activity"');
        expect(businessAdminPage).toContain('Manage team');
        expect(businessAdminPage).toContain("buildBackOfficeModulePath(rootPath, 'users-roles')");
        expect(businessAdminPage).toContain('teamCapability={settingsCapabilities.team}');
        const workforceStart = businessAdminPage.indexOf('function WorkforceWorkspace');
        const settingsStart = businessAdminPage.indexOf('function BusinessAdminSettingsEditor');
        const workforceSource = businessAdminPage.slice(workforceStart, settingsStart);
        expect(workforceSource).not.toContain('Add member');
        expect(workforceSource).not.toContain('UserInvitationModal');
    });

    it('keeps the management link permission-aware', () => {
        expect(businessAdminPage).toContain('const canViewUsers = canEditUsers || teamCapability?.user_view === true;');
    });

    it('keeps the workforce action usable on narrow screens', () => {
        expect(businessAdminCss).toContain('.business-admin-workforce-header-actions { display: flex;');
        expect(businessAdminCss).toContain('.business-admin-workforce-header-actions .business-admin-button { white-space: nowrap; }');
        expect(businessAdminCss).toContain('.business-admin-workforce-header-actions .business-admin-button { width: 100%; justify-content: center; }');
    });
});
