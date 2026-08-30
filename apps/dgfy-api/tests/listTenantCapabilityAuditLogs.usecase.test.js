import { jest } from '@jest/globals';
import {
    buildListTenantCapabilityAuditLogsUseCase,
    buildListTenantPosMetadataAuditLogsUseCase,
    buildListTenantAffiliateSlotsAuditLogsUseCase
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

    // RF-2 (PR #1228 round-1 review): tenant IDs are UUIDs -- the envelope previously serialized
    // `tenant_id: Number(id)`, which is `NaN` (-> null over JSON) for every UUID tenant.
    it('returns the UUID tenant id in the response envelope, not Number(id) (RF-2)', async () => {
        const UUID_TENANT_ID = '5b1f7f1e-2a3b-4c5d-9e6f-0123456789ab';
        const repository = {
            findTenantById: jest.fn().mockResolvedValue({ id: UUID_TENANT_ID }),
            listTenantAdminAuditLogs: jest.fn().mockResolvedValue([
                {
                    get: () => ({
                        tenant_admin_audit_log_id: 31,
                        tenant_id: UUID_TENANT_ID,
                        action: 'affiliate_slots_update',
                        actor_username: 'admin_jp',
                        reason: 'commercial upgrade approved',
                        before_snapshot: { max_affiliate_slots: 1, slots_used: 1 },
                        after_snapshot: { max_affiliate_slots: 2 },
                        metadata: { previous_value: 1, new_value: 2 },
                        created_at: '2026-08-31T00:00:00.000Z'
                    })
                }
            ])
        };
        const useCase = buildListTenantAffiliateSlotsAuditLogsUseCase({
            tenantAdminRepository: repository,
            logger: { error: jest.fn() }
        });

        const result = await useCase({ id: UUID_TENANT_ID, limit: 5 });

        expect(result.success).toBe(true);
        expect(repository.listTenantAdminAuditLogs).toHaveBeenCalledWith(UUID_TENANT_ID, { limit: 5, action: 'affiliate_slots_update' });
        // Envelope-level tenant_id -- this is the field RF-2 fixed.
        expect(result.data.payload.data.tenant_id).toBe(UUID_TENANT_ID);
        expect(Number.isNaN(result.data.payload.data.tenant_id)).toBe(false);
        // Row-level tenant_id -- was already correct (sourced from the DB row), preserved by the fix.
        expect(result.data.payload.data.logs[0]).toEqual(expect.objectContaining({
            id: 31,
            tenant_id: UUID_TENANT_ID,
            action: 'affiliate_slots_update'
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
