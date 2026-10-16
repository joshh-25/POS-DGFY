import { describe, expect, it, jest } from '@jest/globals';
import { buildUpdateBusinessAdminCompanyNameUseCase } from '../src/modules/businessAdmin/usecases/businessAdminCompanyNameUseCase.js';

const tenant = { id: 'tenant-1' };

const buildUseCase = ({
    repositoryResult = null,
    syncResult = { ok: true, attempts: 1, reconciled: false },
    publishSettingsResult = true
} = {}) => {
    const businessAdminCompanyRepository = {
        updateCanonicalName: jest.fn().mockResolvedValue(repositoryResult)
    };
    const syncStorefrontDiscoveryWithReliability = jest.fn().mockResolvedValue(syncResult);
    const publishPosSettingsChange = jest.fn().mockResolvedValue(publishSettingsResult);
    const useCase = buildUpdateBusinessAdminCompanyNameUseCase({
        businessAdminCompanyRepository,
        syncStorefrontDiscoveryWithReliability,
        publishPosSettingsChange
    });
    return {
        useCase,
        businessAdminCompanyRepository,
        syncStorefrontDiscoveryWithReliability,
        publishPosSettingsChange
    };
};

describe('business admin canonical company name use case', () => {
    it('updates the canonical name, records the sync contract, and preserves stable identity', async () => {
        const { useCase, businessAdminCompanyRepository, syncStorefrontDiscoveryWithReliability, publishPosSettingsChange } = buildUseCase({
            repositoryResult: {
                status: 'updated',
                tenant_id: tenant.id,
                name: 'New Business Name',
                previous_name: 'Old Business Name',
                canonical_name_changed: true,
                pos_business_name_changed: true,
                pos_business_name: 'New Business Name'
            }
        });

        const result = await useCase({
            body: { name: '  New Business Name  ' },
            user: { user_id: 7, role: 'admin', username: 'admin@example.com' },
            tenant,
            auditContext: { requestId: 'req-1', ipAddress: '127.0.0.1', userAgent: 'test' }
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            tenant_id: tenant.id,
            name: 'New Business Name',
            previous_name: 'Old Business Name',
            changed: true,
            pos_business_name: 'New Business Name',
            pos_business_name_changed: true,
            display_name_synchronized: true,
            stable_identity: {
                tenant_id_unchanged: true,
                storefront_urls_unchanged: true,
                qr_tokens_unchanged: true
            },
            storefront_sync: { ok: true, status: 'synchronized' }
        });
        expect(businessAdminCompanyRepository.updateCanonicalName).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: tenant.id,
            name: 'New Business Name',
            audit: expect.objectContaining({ actorUsername: 'admin@example.com', requestId: 'req-1' })
        }));
        expect(syncStorefrontDiscoveryWithReliability).toHaveBeenCalledWith({
            tenantId: tenant.id,
            source: 'opis_business_name_update',
            requestId: 'req-1'
        });
        expect(publishPosSettingsChange).toHaveBeenCalledWith({
            tenantId: tenant.id,
            reason: 'business_name_updated'
        });
    });

    it('rejects non-admin users before changing the tenant', async () => {
        const { useCase, businessAdminCompanyRepository } = buildUseCase({
            repositoryResult: { status: 'updated', tenant_id: tenant.id, name: 'Should Not Update' }
        });

        const result = await useCase({
            body: { name: 'Should Not Update' },
            user: { user_id: 8, role: 'manager', permissions: ['business_admin:access'] },
            tenant
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.details).toEqual({ reason_code: 'BUSINESS_NAME_EDIT_DENIED' });
        expect(businessAdminCompanyRepository.updateCanonicalName).not.toHaveBeenCalled();
    });

    it('rejects invalid names before changing the tenant', async () => {
        const { useCase, businessAdminCompanyRepository } = buildUseCase();

        const result = await useCase({
            body: { name: ' ' },
            user: { user_id: 9, is_master_admin: true },
            tenant
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(businessAdminCompanyRepository.updateCanonicalName).not.toHaveBeenCalled();
    });

    it('does not run discovery sync when the name is already current', async () => {
        const { useCase, syncStorefrontDiscoveryWithReliability, publishPosSettingsChange } = buildUseCase({
            repositoryResult: {
                status: 'unchanged',
                tenant_id: tenant.id,
                name: 'Same Business',
                previous_name: 'Same Business'
            }
        });

        const result = await useCase({
            body: { name: 'Same Business' },
            user: { user_id: 7, role: 'admin' },
            tenant
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ changed: false, storefront_sync: { status: 'not_required' } });
        expect(syncStorefrontDiscoveryWithReliability).not.toHaveBeenCalled();
        expect(publishPosSettingsChange).not.toHaveBeenCalled();
    });

    it('repairs a stale POS display name without running storefront discovery sync', async () => {
        const { useCase, syncStorefrontDiscoveryWithReliability, publishPosSettingsChange } = buildUseCase({
            repositoryResult: {
                status: 'updated',
                tenant_id: tenant.id,
                name: 'Same Business',
                previous_name: 'Same Business',
                canonical_name_changed: false,
                pos_business_name_changed: true,
                pos_business_name: 'Same Business'
            }
        });

        const result = await useCase({
            body: { name: 'Same Business' },
            user: { user_id: 7, role: 'admin' },
            tenant
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            changed: true,
            pos_business_name_changed: true,
            storefront_sync: { status: 'not_required' }
        });
        expect(syncStorefrontDiscoveryWithReliability).not.toHaveBeenCalled();
        expect(publishPosSettingsChange).toHaveBeenCalledWith({
            tenantId: tenant.id,
            reason: 'business_name_updated'
        });
    });

    it('returns a conflict when another rename changed the canonical name first', async () => {
        const { useCase } = buildUseCase({
            repositoryResult: {
                status: 'conflict',
                tenant_id: tenant.id,
                name: 'Concurrent Business',
                previous_name: 'Concurrent Business'
            }
        });

        const result = await useCase({
            body: { name: 'Requested Business' },
            user: { user_id: 7, role: 'admin' },
            tenant
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details).toEqual({ reason_code: 'BUSINESS_NAME_CHANGED_CONCURRENTLY' });
    });
});
