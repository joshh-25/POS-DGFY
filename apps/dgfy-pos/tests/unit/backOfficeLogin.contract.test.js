import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const loginPage = read('../../src/features/businessAdmin/BackOfficeLoginPage.jsx');
const authModule = read('../../src/features/businessAdmin/businessAdminAuth.js');
const businessAdminPage = read('../../src/features/businessAdmin/BusinessAdminPage.jsx');
const main = read('../../src/main.jsx');

describe('Back Office login contract', () => {
    it('uses the DGFY account and company-session APIs before opening the workspace', () => {
        expect(loginPage).toContain('loginDgfyAccount');
        expect(loginPage).toContain('listDgfyAccountCompanies');
        expect(loginPage).toContain('startDgfyTenantSession');
        expect(loginPage).toContain('grantBackOfficeSession();');
        expect(loginPage).toContain('data-testid="backoffice-login-page"');
        expect(loginPage).not.toContain('localStorage');
    });

    it('keeps the client gate non-authoritative and tab-scoped', () => {
        expect(authModule).toContain('window.sessionStorage');
        expect(authModule).not.toContain('localStorage');
        expect(authModule).toContain('buildBackOfficeLoginPath');
        expect(authModule).toContain('normalizeBackOfficeReturnPath');
        expect(authModule).toContain('isBackOfficePosHandoff');
        expect(authModule).toContain('removeBackOfficePosHandoff');
    });

    it('protects both Back Office route aliases and exposes a dedicated login route', () => {
        expect(main).toContain('<Route path="/backoffice/login" element={<BackOfficeLoginPage />} />');
        expect(main).toContain('<Route path="/business-admin/*" element={<BackOfficeRouteGuard />} />');
        expect(main).toContain('<Route path="/backoffice/*" element={<BackOfficeRouteGuard />} />');
        expect(main).toContain('!granted && !isBackOfficePosHandoff(location.search)');
    });

    it('grants only after the POS handoff receives a successful Back Office bootstrap', () => {
        expect(businessAdminPage).toContain('isBackOfficePosHandoff(location.search)');
        expect(businessAdminPage).toContain('grantBackOfficeSession();');
        expect(businessAdminPage).toContain('removeBackOfficePosHandoff(location.search)');
    });
});
