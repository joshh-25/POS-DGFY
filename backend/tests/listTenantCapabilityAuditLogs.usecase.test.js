import { jest } from '@jest/globals';
import {
    buildListTenantCapabilityAuditLogsUseCase,
    buildListTenantPosMetadataAuditLogsUseCase
} from '../src/modules/tenants/usecases/listTenantCapabilityAuditLogsUseCase.js';

describe('listTenantCapabilityAuditLogsUseCase', () => {
    it('returns tenant-scoped capability audit logs with snapshots', async () => {
        const repository = {
            findTenantById: jest.fn().mockResolvedValue({ id: 7 }),
            listTenantAdminAuditLogs: jest.fn().mockResolvedValue([
                {
                    get: () => ({
                        tenant_admin_audit_log_id: 12,
                        tenant_id: 7,
                        action: 'capability_update',
                        actor_username: 'skupervisor',
                        reason: 'Terminal issue remediation',
                        request_id: 'req-1',
                        before_snapshot: { pos_enabled: true },
                        after_snapshot: { pos_enabled: false },
                        metadata: { changed_fields: ['tenant_pos_enabled'] },
                        created_at: '2026-06-07T03:00:00.000Z'
                    })
                }
            ])
        };
        const useCase = buildListTenantCapabilityAuditLogsUseCase({
            tenantAdminRepository: repository,
            logger: { error: jest.fn() }
        });

        const result = await useCase({ id: 7, limit: 5 });

        expect(result.success).toBe(true);
        expect(repository.findTenantById).toHaveBeenCalledWith(7);
        expect(repository.listTenantAdminAuditLogs).toHaveBeenCalledWith(7, { limit: 5, action: 'capability_update' });
        expect(result.data.payload.data.logs[0]).toEqual(expect.objectContaining({
            id: 12,
            tenant_id: 7,
            actor_username: 'skupervisor',
            reason: 'Terminal issue remediation',
            before_snapshot: { pos_enabled: true },
            after_snapshot: { pos_enabled: false }
        }));
    });

    it('returns tenant-scoped POS metadata audit logs', async () => {
        const repository = {
            findTenantById: jest.fn().mockResolvedValue({ id: 7 }),
            listTenantAdminAuditLogs: jest.fn().mockResolvedValue([
                {
                    get: () => ({
                        tenant_admin_audit_log_id: 22,
                        tenant_id: 7,
                        action: 'pos_metadata_update',
                        actor_username: 'platform_admin',
                        reason: 'Approved BIR receipt update',
                        request_id: 'req-pos-1',
                        before_snapshot: { pos_registered_name: 'Old' },
                        after_snapshot: { pos_registered_name: 'New' },
                        metadata: { pending_action: 'approve' },
                        created_at: '2026-06-15T03:00:00.000Z'
                    })
                }
            ])
        };
        const useCase = buildListTenantPosMetadataAuditLogsUseCase({
            tenantAdminRepository: repository,
            logger: { error: jest.fn() }
        });

        const result = await useCase({ id: 7, limit: 10 });

        expect(result.success).toBe(true);
        expect(repository.listTenantAdminAuditLogs).toHaveBeenCalledWith(7, { limit: 10, action: 'pos_metadata_update' });
        expect(result.data.payload.data.logs[0]).toEqual(expect.objectContaining({
            id: 22,
            action: 'pos_metadata_update',
            reason: 'Approved BIR receipt update',
            metadata: { pending_action: 'approve' }
        }));
    });

    it('returns 404 when tenant does not exist', async () => {
        const useCase = buildListTenantCapabilityAuditLogsUseCase({
            tenantAdminRepository: {
                findTenantById: jest.fn().mockResolvedValue(null),
                listTenantAdminAuditLogs: jest.fn()
            },
            logger: { error: jest.fn() }
        });

        const result = await useCase({ id: 999, limit: 5 });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });
});
