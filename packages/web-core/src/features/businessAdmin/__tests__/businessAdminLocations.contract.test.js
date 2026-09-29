import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const businessAdminPage = read('../BusinessAdminPage.jsx');
const businessAdminCss = read('../businessAdmin.css');
const businessAdminManifest = read('../businessAdminManifest.js');
const settingsModel = read('../businessAdminSettingsModel.js');
const terminalSettings = read('../../pos/settings/PosTerminalSettingsSection.jsx');

describe('Business Admin Locations consolidation contract', () => {
    it('renders Branches and Registers under one Locations workspace', () => {
        expect(businessAdminPage).toContain('function LocationsWorkspace');
        expect(businessAdminPage).toContain('aria-label="Locations sections"');
        expect(businessAdminPage).toContain('Branches');
        expect(businessAdminPage).toContain('Registers');
        expect(businessAdminPage).toContain("activeSection === 'locations'");
        expect(businessAdminPage).toContain("['overview', 'locations'].includes(activeSection)");
    });

    it('keeps overview summary-only and routes management to canonical settings', () => {
        expect(businessAdminPage).toContain('locationsPath={buildBackOfficeLocationsPath(rootPath, \'branches\')}');
        expect(businessAdminPage).toContain('Manage locations');
        expect(businessAdminPage).toContain("onManageBranches={() => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, 'branches'))}");
        expect(businessAdminPage).toContain("onManageRegisters={() => navigateBusinessAdmin(buildBusinessAdminSettingsPath(rootPath, 'registers'))}");
        expect(businessAdminPage).not.toContain('BranchLocationEditorModal');
    });

    it('resolves legacy branch/register routes without changing IDs or terminal assignment ownership', () => {
        expect(businessAdminManifest).toContain("locations: module('Operations', 'locations', 'Locations'");
        expect(businessAdminManifest).toContain('buildBackOfficeLocationsPath');
        expect(settingsModel).toContain("const legacyLocationView = requestedSection === 'registers' ? 'registers' : requestedSection === 'branches' ? 'branches' : '';");
        expect(terminalSettings).toContain('location_id');
        expect(terminalSettings).toContain('cashier_user_ids');
    });

    it('keeps location results mounted and slides them during branch-scope refreshes', () => {
        expect(businessAdminPage).toContain("const canKeepLocationsWorkspace = activeSection === 'locations'");
        expect(businessAdminPage).toContain('data-testid="business-admin-locations-results"');
        expect(businessAdminPage).toContain('refreshing={sectionLoading}');
        expect(businessAdminPage).toContain('Updating branch metrics…');
        expect(businessAdminCss).toContain('.business-admin-locations-results.is-refreshing .business-admin-locations-results-content');
        expect(businessAdminCss).toContain('transition: transform .2s cubic-bezier(.2, .65, .3, 1)');
    });
});
