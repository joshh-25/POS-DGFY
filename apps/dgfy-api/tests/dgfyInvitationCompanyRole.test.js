import { describe, expect, it, jest } from '@jest/globals';
import { buildCreateDgfyInvitationUseCase } from '../src/modules/dgfy/usecases/dgfyAuthUseCases.js';
import { getModeRolePreset } from '../src/config/modeRolePresets.js';

const buildAccount = () => ({
    id: 'dgfy-role-account',
    email: 'role@example.test',
    first_name: 'Role',
    middle_name: null,
    last_name: 'Tester',
    phone: '+639171234567',
    is_active: true
});

const buildMembership = (account, role) => ({
    id: 401,
    dgfy_account_id: account.id,
    tenant_id: 'tenant-fnb',
    tenant_user_id: 77,
    role,
    status: 'pending',
    source: 'invite',
    tenant: {
        id: 'tenant-fnb',
        name: 'Masu Cafe',
        status: 'active'
    }
});

describe('DGFY company-scoped invitation roles', () => {
    it('creates a custom staff-role invitation for an owner with inherited permissions and assigned locations', async () => {
        const account = buildAccount();
        const repository = {
            createInvitationForDgfyAccount: jest.fn().mockResolvedValue({
                account,
                membership: buildMembership(account, 'staff')
            }),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildCreateDgfyInvitationUseCase({ repository });

        const result = await useCase({
            tenant: { id: 'tenant-fnb', company_token: 'tenant-token', name: 'Masu Cafe' },
            adminUser: { user_id: 1, username: 'Owner', is_master_admin: true },
            body: {
                dgfy_account_id: account.id,
                role: 'staff',
                staff_role_id: '7',
                location_ids: [4, 5],
                permissions: []
            }
        });

        expect(result.success).toBe(true);
        expect(repository.createInvitationForDgfyAccount).toHaveBeenCalledWith(expect.objectContaining({
            dgfyAccountId: account.id,
            role: 'staff',
            rolePresetKey: null,
            staffRoleId: 7,
            permissions: [],
            locationIds: [4, 5]
        }));
    });

    it('rejects malformed custom role ids before persistence', async () => {
        const repository = { createInvitationForDgfyAccount: jest.fn() };
        const useCase = buildCreateDgfyInvitationUseCase({ repository });

        for (const staffRoleId of [true, [], {}, '7x', '1.5', 0, -1, 1.5]) {
            const result = await useCase({
                tenant: { id: 'tenant-fnb', company_token: 'tenant-token', name: 'Masu Cafe' },
                adminUser: { user_id: 1, role: 'admin' },
                body: { dgfy_account_id: 'dgfy-role-account', staff_role_id: staffRoleId, location_ids: [4] }
            });
            expect(result.success).toBe(false);
            expect(result.error.statusCode).toBe(422);
        }

        expect(repository.createInvitationForDgfyAccount).not.toHaveBeenCalled();
    });

    it('requires owner/admin authority, no permission overrides, no conflicting role/preset, and valid locations', async () => {
        const repository = { createInvitationForDgfyAccount: jest.fn() };
        const useCase = buildCreateDgfyInvitationUseCase({ repository });
        const tenant = { id: 'tenant-fnb', company_token: 'tenant-token', name: 'Masu Cafe' };
        const baseBody = { dgfy_account_id: 'dgfy-role-account', staff_role_id: 7, location_ids: [4] };

        for (const [adminUser, body] of [
            [{ user_id: 2, role: 'manager', permissions: ['users:manage'] }, baseBody],
            [{ user_id: 1, role: 'admin' }, { ...baseBody, role: 'cashier' }],
            [{ user_id: 1, role: 'admin' }, { ...baseBody, role_preset_key: 'msme_manager' }],
            [{ user_id: 1, role: 'admin' }, { ...baseBody, permissions: ['orders:pack'] }],
            [{ user_id: 1, role: 'admin' }, { ...baseBody, location_ids: [] }],
            [{ user_id: 1, role: 'admin' }, { ...baseBody, location_ids: [0] }]
        ]) {
            const result = await useCase({ tenant, adminUser, body });
            expect(result.success).toBe(false);
        }

        expect(repository.createInvitationForDgfyAccount).not.toHaveBeenCalled();
    });

    it('uses the target F&B company preset as the authoritative role and permissions', async () => {
        const account = buildAccount();
        const preset = getModeRolePreset('fnb_cashier', 'fnb');
        const repository = {
            getTenantWorkflowMode: jest.fn().mockResolvedValue('fnb'),
            createInvitationForDgfyAccount: jest.fn().mockResolvedValue({
                account,
                membership: buildMembership(account, preset.role)
            }),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildCreateDgfyInvitationUseCase({ repository });

        const result = await useCase({
            tenant: { id: 'tenant-fnb', company_token: 'tenant-token', name: 'Masu Cafe' },
            adminUser: { user_id: 1, username: 'Owner', is_master_admin: true },
            body: {
                dgfy_account_id: account.id,
                role: 'cashier',
                role_preset_key: 'fnb_cashier',
                location_ids: [4],
                permissions: ['system.manage_users']
            }
        });

        expect(result.success).toBe(true);
        expect(repository.createInvitationForDgfyAccount).toHaveBeenCalledWith(expect.objectContaining({
            dgfyAccountId: account.id,
            role: 'cashier',
            rolePresetKey: 'fnb_cashier',
            permissions: preset.permissions,
            locationIds: [4]
        }));
    });

    it('rejects a role preset from another company workflow', async () => {
        const repository = {
            getTenantWorkflowMode: jest.fn().mockResolvedValue('fnb'),
            createInvitationForDgfyAccount: jest.fn()
        };
        const useCase = buildCreateDgfyInvitationUseCase({ repository });

        const result = await useCase({
            tenant: { id: 'tenant-fnb', company_token: 'tenant-token', name: 'Masu Cafe' },
            adminUser: { user_id: 1, username: 'Owner', is_master_admin: true },
            body: {
                dgfy_account_id: 'dgfy-role-account',
                role: 'cashier',
                role_preset_key: 'msme_cashier',
                location_ids: [4]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toContain('not valid');
        expect(repository.createInvitationForDgfyAccount).not.toHaveBeenCalled();
    });

    it('rejects an explicit role that conflicts with the selected preset', async () => {
        const repository = {
            getTenantWorkflowMode: jest.fn().mockResolvedValue('fnb'),
            createInvitationForDgfyAccount: jest.fn()
        };
        const useCase = buildCreateDgfyInvitationUseCase({ repository });

        const result = await useCase({
            tenant: { id: 'tenant-fnb', company_token: 'tenant-token', name: 'Masu Cafe' },
            adminUser: { user_id: 1, username: 'Owner', is_master_admin: true },
            body: {
                dgfy_account_id: 'dgfy-role-account',
                role: 'admin',
                role_preset_key: 'fnb_cashier',
                location_ids: [4]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toBe('Invitation role does not match the selected role preset.');
        expect(repository.createInvitationForDgfyAccount).not.toHaveBeenCalled();
    });
});
