import { Sequelize } from 'sequelize';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import {
    ALL_ORDER_METHODS,
    POS_ORDER_METHODS,
    STOREFRONT_ORDER_METHODS,
    ORDER_METHOD_FEE_METHODS,
    STOREFRONT_FULFILLMENT_ORDER_METHODS,
    ORDER_METHOD_LOCATION_SUPPORT_KEYS
} from '../src/modules/shared/constants/orderMethods.js';
import { POS_WORKFLOW_CONFIGS } from '../../../packages/web-core/src/features/pos/utils/posWorkflowResolver.js';

describe('order method cross-layer contracts', () => {
    it('keeps ALL_ORDER_METHODS identical to the pos_transactions order_method DB enum', async () => {
        const tenantSequelize = new Sequelize('order_method_contract', 'root', '', {
            dialect: 'mysql',
            logging: false
        });

        try {
            const models = getTenantModels(tenantSequelize);

            expect(models.PosTransaction.rawAttributes.order_method.values).toEqual([...ALL_ORDER_METHODS]);
            expect(models.PosTransaction.rawAttributes.service_fee_method_snapshot.values).toEqual([...ALL_ORDER_METHODS]);
        } finally {
            await tenantSequelize.close();
        }
    });

    it('keeps every surface vocabulary a subset of the enum with the intended exclusions', () => {
        // POS terminals write everything except the reserved storefront-origin `online`.
        expect([...POS_ORDER_METHODS]).toEqual(ALL_ORDER_METHODS.filter((method) => method !== 'online'));

        // Storefront product checkout never writes booking-style methods.
        STOREFRONT_ORDER_METHODS.forEach((method) => {
            expect(POS_ORDER_METHODS).toContain(method);
        });
        expect(STOREFRONT_ORDER_METHODS).not.toContain('appointment');
        expect(STOREFRONT_ORDER_METHODS).not.toContain('walk_in');
        expect(STOREFRONT_ORDER_METHODS).not.toContain('online');

        // Per-method service fees are configurable for every method the enum can hold,
        // matching the service_fee_method_snapshot column.
        expect([...ORDER_METHOD_FEE_METHODS]).toEqual([...ALL_ORDER_METHODS]);
    });

    it('keeps the storefront fulfillment axis (#1093) scoped to delivery/pickup only', () => {
        // The ecommerce fulfillment axis never includes dine_in/takeout -- those are in-venue
        // concerns, not something a public storefront checkout offers. A store that takes no
        // online orders at all expresses that via customer_access_mode 'catalog', not by
        // disabling both of these.
        expect([...STOREFRONT_FULFILLMENT_ORDER_METHODS]).toEqual(['delivery', 'pickup']);
        STOREFRONT_FULFILLMENT_ORDER_METHODS.forEach((method) => {
            expect(STOREFRONT_ORDER_METHODS).toContain(method);
        });

        // Every storefront-checkout-eligible method must resolve to a real tenant_locations
        // support column, since the storefront's availability resolver and the server's own
        // checkout enforcement (storeUseCases.js) both key off this map.
        STOREFRONT_ORDER_METHODS.forEach((method) => {
            expect(ORDER_METHOD_LOCATION_SUPPORT_KEYS[method]).toBeTruthy();
        });
    });

    it('keeps every POS workflow config writing only methods the DB enum can hold', () => {
        Object.values(POS_WORKFLOW_CONFIGS).forEach((config) => {
            config.allowedMethods.forEach((method) => {
                expect(POS_ORDER_METHODS).toContain(method);
            });
        });
    });
});
