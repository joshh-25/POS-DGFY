import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { tenantLocationRepository } from '../src/modules/tenantLocations/repositories/tenantLocationRepository.js';
import { TENANT_LOCATION_REFERENCE_SOURCES } from '../src/modules/tenantLocations/repositories/tenantLocationReferenceSources.js';

describe('tenantLocationRepository permanent-delete reference guard', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('fails closed when a reference model is missing from the active tenant context', async () => {
        const [firstSource] = TENANT_LOCATION_REFERENCE_SOURCES;
        jest.spyOn(dbStore, 'getStore').mockReturnValue({});

        await expect(
            tenantLocationRepository.countOperationalReferences(9)
        ).rejects.toMatchObject({
            name: 'TenantLocationReferenceGuardUnavailableError',
            code: 'TENANT_LOCATION_REFERENCE_GUARD_UNAVAILABLE',
            sourceKey: firstSource.key,
            modelName: firstSource.modelName,
            reason: 'model_missing_from_tenant_context'
        });
    });

    it('fails closed when a reference model cannot count rows', async () => {
        // Build a fully working mock store from the manifest so adding a new
        // reference source can't silently break this test by tripping the
        // "missing from tenant context" guard before reaching the target model.
        const targetSource = TENANT_LOCATION_REFERENCE_SOURCES.find(
            (source) => source.key === 'itemLocationStocks'
        );
        const tenantModels = Object.fromEntries(
            TENANT_LOCATION_REFERENCE_SOURCES.map((source) => [
                source.modelName,
                { count: jest.fn().mockResolvedValue(0) }
            ])
        );
        tenantModels[targetSource.modelName] = {};
        jest.spyOn(dbStore, 'getStore').mockReturnValue(tenantModels);

        await expect(
            tenantLocationRepository.countOperationalReferences(9)
        ).rejects.toMatchObject({
            name: 'TenantLocationReferenceGuardUnavailableError',
            code: 'TENANT_LOCATION_REFERENCE_GUARD_UNAVAILABLE',
            sourceKey: targetSource.key,
            modelName: targetSource.modelName,
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
