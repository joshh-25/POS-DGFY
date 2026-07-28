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
