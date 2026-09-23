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
const userManagementModal = fs.readFileSync(
    path.resolve(__dirname, '../../../../packages/web-core/Components/users/UserManagementModal.jsx'),
    'utf8'
);

describe('Business Admin team member invitation contract', () => {
    it('keeps one canonical team-management workflow', () => {
        expect(businessAdminPage).toContain('Manage team');
        expect(businessAdminPage).toContain('Manage users &amp; roles');
        expect(businessAdminPage).toContain('<UserManagementModal');
        expect(businessAdminPage).toContain('locationOptions={invitationLocations}');
        expect(businessAdminPage).toContain('invitationTitle="Add team member"');
        expect(businessAdminPage).toContain('invitationSubmitLabel="Send invitation"');
        expect(businessAdminPage).not.toContain('function BusinessAdminMemberInviteModal');
        expect(businessAdminPage).not.toContain('memberInviteOpen');
    });

    it('keeps invitation, role, permission, status, and branch management in the shared modal', () => {
        expect(userManagementModal).toContain('UserInvitationModal');
        expect(userManagementModal).toContain('locationOptions={locationOptions}');
        expect(userManagementModal).toContain('title={invitationTitle}');
        expect(userManagementModal).toContain('submitLabel={invitationSubmitLabel}');
        expect(userManagementModal).toContain('getRoleCatalog()');
        expect(userManagementModal).toContain('updateUserStatus');
        expect(userManagementModal).toContain('api.put(`/users/${userId}/permissions`');
        expect(userManagementModal).toContain('updateUserLocationGrants');
    });

    it('exposes the canonical activity owner without merging operational workforce modules', () => {
        expect(businessAdminPage).toContain('View activity');
        expect(businessAdminPage).toContain('view_audit');
        expect(businessAdminPage).toContain("buildBackOfficeModulePath(rootPath, 'audit')");
        expect(businessAdminPage).toContain('initialTab="employees"');
        expect(businessAdminPage).toContain("allowedTabIds={['employees']}");
        expect(businessAdminPage).toContain("if (activeSection === 'attendance') return <AttendanceWorkspace");
        expect(businessAdminPage).toContain("if (activeSection === 'shifts') return <ShiftsWorkspace");
    });

    it('keeps the team action readable on narrow screens', () => {
        expect(businessAdminCss).toContain('.business-admin-team-actions { display: flex;');
        expect(businessAdminCss).toContain('.business-admin-team-actions .business-admin-button { white-space: nowrap; }');
        expect(businessAdminCss).toContain('.business-admin-team-actions { align-items: stretch; justify-content: stretch; width: 100%; }');
        expect(businessAdminCss).toContain('.business-admin-team-actions .business-admin-button { flex: 1 1 auto; justify-content: center; }');
    });
});
