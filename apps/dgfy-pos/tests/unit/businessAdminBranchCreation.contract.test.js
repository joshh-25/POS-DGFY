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
const settingsWorkspace = fs.readFileSync(
    path.resolve(__dirname, '../../../../packages/web-core/src/features/pos/settings/PosSettingsWorkspace.jsx'),
    'utf8'
);
const storefrontSettingsPane = fs.readFileSync(
    path.resolve(__dirname, '../../../../packages/web-core/src/features/pos/settings/PosStorefrontSettingsPane.jsx'),
    'utf8'
);

describe('Business Admin branch creation contract', () => {
    it('keeps the Locations branch surface summary-only and links to canonical branch settings', () => {
        expect(businessAdminPage).toContain('function BranchWorkspace({ data, onManageBranches, canViewBranchSettings = false, refreshing = false, refreshError = \'\' })');
        expect(businessAdminPage).toContain('Manage branches');
        expect(businessAdminPage).toContain("buildBusinessAdminSettingsPath(rootPath, 'branches')");
        expect(businessAdminPage).not.toContain('function BranchLocationEditorModal');
        expect(businessAdminPage).not.toContain('startWithNewLocation');
        expect(businessAdminPage).not.toContain('locationEditorOnly');
    });

    it('keeps branch creation and editing in the shared SettingsWorkspace location editor', () => {
        expect(settingsWorkspace).toContain('startWithNewLocation = false');
        expect(settingsWorkspace).toContain('locationEditorOnly = false');
        expect(storefrontSettingsPane).toContain('business-admin-location-editor-only');
        expect(storefrontSettingsPane).toContain('const autoStartLocationEditor = startWithNewLocation && !readOnly && !loading;');
        expect(storefrontSettingsPane).toContain('settingsSurface !== \'business-admin\' || readOnly || startWithNewLocation');
        expect(storefrontSettingsPane).toContain("editorSection === 'branches' ? 'Branches' : 'Storefront Locations'");
        expect(storefrontSettingsPane).toContain('const locationEditorTitle = editingLocationId');
        expect(storefrontSettingsPane).toContain('STOREFRONT_LOCATION_LABELS.addBranch');
    });

    it('removes the duplicate branch modal styling after the workflow consolidation', () => {
        expect(businessAdminCss).not.toContain('.business-admin-branch-editor-backdrop');
        expect(businessAdminCss).not.toContain('.business-admin-branch-editor-modal');
    });
});
