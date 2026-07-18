import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { tenantLocationRepository } from '../src/modules/tenantLocations/repositories/tenantLocationRepository.js';
import { TENANT_LOCATION_REFERENCE_SOURCES } from '../src/modules/tenantLocations/repositories/tenantLocationReferenceSources.js';

describe('tenantLocationRepository permanent-delete reference guard', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('fails closed when a reference model is missing from the active tenant context', async () => {
        jest.spyOn(dbStore, 'getStore').mockReturnValue({});

        await expect(
            tenantLocationRepository.countOperationalReferences(9)
        ).rejects.toMatchObject({
            name: 'TenantLocationReferenceGuardUnavailableError',
            code: 'TENANT_LOCATION_REFERENCE_GUARD_UNAVAILABLE',
            sourceKey: 'deliveryJobs',
            modelName: 'DeliveryJob',
            reason: 'model_missing_from_tenant_context'
        });
    });

    it('fails closed when a reference model cannot count rows', async () => {
        jest.spyOn(dbStore, 'getStore').mockReturnValue({
            DeliveryJob: { count: jest.fn().mockResolvedValue(0) },
            ItemLocationStock: {}
        });

        await expect(
            tenantLocationRepository.countOperationalReferences(9)
        ).rejects.toMatchObject({
            name: 'TenantLocationReferenceGuardUnavailableError',
            code: 'TENANT_LOCATION_REFERENCE_GUARD_UNAVAILABLE',
            sourceKey: 'itemLocationStocks',
            modelName: 'ItemLocationStock',
            reason: 'model_count_unavailable'
        });
    });

    it('counts every manifest source through tenant-scoped models only', async () => {
        const tenantModels = Object.fromEntries(
            TENANT_LOCATION_REFERENCE_SOURCES.map((source, index) => [
                source.modelName,
                {
                    count: jest.fn().mockResolvedValue(index + 1)
                }
            ])
        );
        jest.spyOn(dbStore, 'getStore').mockReturnValue(tenantModels);

        const counts = await tenantLocationRepository.countOperationalReferences(15, {
            transaction: 'txn'
        });

        let expectedTotal = 0;
        TENANT_LOCATION_REFERENCE_SOURCES.forEach((source, index) => {
            const count = index + 1;
            expectedTotal += count;
            expect(counts[source.key]).toBe(count);
            expect(tenantModels[source.modelName].count).toHaveBeenCalledWith({
                where: source.where(15),
                transaction: 'txn'
            });
        });
        expect(counts.total).toBe(expectedTotal);
    });
});
