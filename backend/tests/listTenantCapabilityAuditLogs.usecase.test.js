import { jest } from '@jest/globals';
import { buildListTenantCapabilityAuditLogsUseCase } from '../src/modules/tenants/usecases/listTenantCapabilityAuditLogsUseCase.js';

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
        expect(repository.listTenantAdminAuditLogs).toHaveBeenCalledWith(7, { limit: 5 });
        expect(result.data.payload.data.logs[0]).toEqual(expect.objectContaining({
            id: 12,
            tenant_id: 7,
            actor_username: 'skupervisor',
            reason: 'Terminal issue remediation',
            before_snapshot: { pos_enabled: true },
            after_snapshot: { pos_enabled: false }
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
