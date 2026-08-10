import { publishCatalogChange, subscribeCatalogChanges } from '../src/modules/shared/services/catalogChangeEventBus.js';

describe('catalog change event bus', () => {
    test('delivers a sanitized change event only to the matching tenant', async () => {
        const tenantOneEvents = [];
        const tenantTwoEvents = [];
        const unsubscribeOne = subscribeCatalogChanges('tenant-one', (event) => tenantOneEvents.push(event));
        const unsubscribeTwo = subscribeCatalogChanges('tenant-two', (event) => tenantTwoEvents.push(event));

        await publishCatalogChange({
            tenantId: 'tenant-one',
            reason: 'item_created',
            itemIds: ['12', 12, 0, 'invalid', 15]
        });

        expect(tenantOneEvents).toHaveLength(1);
        expect(tenantOneEvents[0]).toMatchObject({
            type: 'pos.catalog.changed',
            tenant_id: 'tenant-one',
            reason: 'item_created',
            item_ids: [12, 15]
        });
        expect(tenantTwoEvents).toHaveLength(0);

        unsubscribeOne();
        unsubscribeTwo();
    });

    test('does not publish without tenant context', async () => {
        const events = [];
        const unsubscribe = subscribeCatalogChanges('tenant-one', (event) => events.push(event));

        await expect(publishCatalogChange({ reason: 'item_updated', itemIds: [1] })).resolves.toBe(false);
        expect(events).toHaveLength(0);

        unsubscribe();
    });
});
