import { Sequelize } from 'sequelize';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import {
    ALL_ORDER_METHODS,
    POS_ORDER_METHODS,
    STOREFRONT_ORDER_METHODS,
    ORDER_METHOD_FEE_METHODS
} from '../src/modules/shared/constants/orderMethods.js';
import { POS_WORKFLOW_CONFIGS } from '../../frontend/src/features/pos/utils/posWorkflowResolver.js';

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

    it('keeps every POS workflow config writing only methods the DB enum can hold', () => {
        Object.values(POS_WORKFLOW_CONFIGS).forEach((config) => {
            config.allowedMethods.forEach((method) => {
                expect(POS_ORDER_METHODS).toContain(method);
            });
        });
    });
});
