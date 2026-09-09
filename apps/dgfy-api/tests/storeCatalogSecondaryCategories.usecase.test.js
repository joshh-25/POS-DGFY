// Phase 285 (#1318, C1) -- buildListStoreCatalogUseCase/serializeStoreCatalogItem threading
// secondary_categories from the repository row through to the public catalog response.
// No database is used -- storeRepository is a hand-built fake, same convention as
// tests/storeCatalogPaymentMode.unit.test.js (whose fixture shape this file borrows).

import { jest } from '@jest/globals';

const { buildListStoreCatalogUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');
const dbStore = (await import('../src/utils/dbStore.js')).default;

const TENANT_ID = '44444444-4444-4444-8444-444444444444';

const resolveWorkflowCapabilitySettingsFixture = jest.fn().mockResolvedValue({ mode: 'retail', enabledCapabilities: [] });

describe('buildListStoreCatalogUseCase -- Phase 285 (#1318, C1) secondary_categories projection', () => {
    test('threads secondary_categories from the repository row through to the serialized item, alongside the unchanged primary folder projection', async () => {
        const storeRepository = {
            listStoreCatalog: jest.fn().mockResolvedValue([{
                item_id: 40,
                name: 'Widget',
                current_stock: 100,
                default_sale_price: 500,
                folder_id: 1,
                folder_name: 'Primary',
                folder_id: 4,
                folder_sort_order: 7,
                secondary_categories: [
                    { folder_id: 5, folder_name: 'Seasonal', sort_order: 2 },
                    { folder_id: 6, folder_name: 'Clearance', sort_order: 3 }
                ]
            }])
        };
        const useCase = buildListStoreCatalogUseCase({
            storeRepository,
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'cat-store' }, () => (
            useCase({ query: { limit: 20 } })
        ));

        expect(result.success).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0].secondary_categories).toEqual([
            { folder_id: 5, folder_name: 'Seasonal', sort_order: 2 },
            { folder_id: 6, folder_name: 'Clearance', sort_order: 3 }
        ]);
        expect(result.data.items[0].folder_name).toBe('Primary');
        expect(result.data.items[0].folder_id).toBe(4);
        expect(result.data.items[0].folder_sort_order).toBe(7);
    });

    test('defaults to an empty array for a repository row with no secondary_categories field (pre-Phase-285 shape, e.g. a fallback path this phase did not touch)', async () => {
        const storeRepository = {
            listStoreCatalog: jest.fn().mockResolvedValue([{
                item_id: 41,
                name: 'Legacy Widget',
                current_stock: 3,
                default_sale_price: 100
            }])
        };
        const useCase = buildListStoreCatalogUseCase({
            storeRepository,
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'cat-store' }, () => (
            useCase({ query: { limit: 20 } })
        ));

        expect(result.success).toBe(true);
        expect(result.data.items[0].secondary_categories).toEqual([]);
    });

    test('a non-array secondary_categories value from the repository is normalized to an empty array rather than propagated', async () => {
        const storeRepository = {
            listStoreCatalog: jest.fn().mockResolvedValue([{
                item_id: 42,
                name: 'Odd Widget',
                current_stock: 1,
                default_sale_price: 50,
                secondary_categories: null
            }])
        };
        const useCase = buildListStoreCatalogUseCase({
            storeRepository,
            resolveWorkflowCapabilitySettings: resolveWorkflowCapabilitySettingsFixture
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'cat-store' }, () => (
            useCase({ query: { limit: 20 } })
        ));

        expect(result.success).toBe(true);
        expect(result.data.items[0].secondary_categories).toEqual([]);
    });
});
