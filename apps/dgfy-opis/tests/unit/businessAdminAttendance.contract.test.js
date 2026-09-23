import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Business Admin attendance workspace contract', () => {
    it('connects the dedicated API route to the canonical POS lifecycle reader', () => {
        const service = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/businessAdminService.js');
        const route = readRepoFile('apps/dgfy-api/src/routes/businessAdmin.js');
        const useCase = readRepoFile('apps/dgfy-api/src/modules/businessAdmin/usecases/businessAdminAttendanceUseCase.js');
        const repository = readRepoFile('apps/dgfy-api/src/modules/pos/repositories/posRepository.js');

        expect(service).toContain("attendance: (params) => get('/business-admin/attendance', params)");
        expect(route).toContain("router.get('/attendance', businessAdminHandlers.getAttendance)");
        expect(useCase).toContain('posRepository.getCashierLifecycleReport');
        expect(repository).toContain('async getCashierLifecycleReport(filters = {}, options = {})');
        expect(useCase).toContain('BUSINESS_ADMIN_BRANCH_ACCESS_DENIED');
    });

    it('renders filters, both read-only tables, and explicit empty/denied states', () => {
        const page = readRepoFile('apps/dgfy-opis/src/features/businessAdmin/BusinessAdminPage.jsx');

        expect(page).toContain('function AttendanceWorkspace');
        expect(page).toContain("activeSection === 'attendance'");
        expect(page).toContain('Attendance sessions');
        expect(page).toContain('Operator sessions');
        expect(page).toContain('business-admin-attendance-workspace');
        expect(page).toContain('business-admin-attendance-record-list');
        expect(page).toContain('business-admin-attendance-record-facts');
        expect(page).toContain('No attendance sessions were recorded for these filters.');
        expect(page).toContain('No operator sessions were recorded for these filters.');
        expect(page).toContain("'attendance', 'shifts'");
        expect(page).toContain("business-admin-section-access-denied");
        expect(page).toContain('Biometric capture, payroll, and schedule management are not part of this workspace.');
    });
});
