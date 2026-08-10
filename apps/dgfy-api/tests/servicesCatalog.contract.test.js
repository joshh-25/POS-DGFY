import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, jest } from '@jest/globals';
import {
    buildCreateServiceCatalogItemUseCase,
    buildUpdateServiceCatalogItemUseCase
} from '../src/modules/services/usecases/serviceUseCases.js';
import {
    validateCreateServiceCatalogItem,
    validateUpdateServiceCatalogItem
} from '../src/validators/serviceValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const transaction = () => ({
    finished: false,
    commit: jest.fn(async function commit() {
        this.finished = 'commit';
    }),
    rollback: jest.fn(async function rollback() {
        this.finished = 'rollback';
    })
});

const serviceRow = (overrides = {}) => ({
    item_id: 41,
    sku_code: 'SVC-0041',
    name: 'Laundry Basket',
    category: 'service',
    product_type: null,
    mode_item_preset: 'service',
    current_stock: 0,
    unit_of_measure: 'service',
    default_sale_price: 5000,
    fifo_enabled: false,
    status: 'active',
    serviceDetail: {
        service_detail_id: 9,
        visible_in_pos: true,
        visible_in_storefront: true,
        bookable: true,
        duration_minutes: 60
    },
    ...overrides
});

const response = () => {
    const res = {
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

describe('Services catalog contract', () => {
    it('creates a stock-exempt service with the governed mode preset and commits both records', async () => {
        const tx = transaction();
        const createServiceItem = jest.fn(async (payload) => ({ item_id: 41, ...payload }));
        const upsertServiceDetail = jest.fn(async () => ({ service_detail_id: 9 }));
        const findServiceItemById = jest.fn(async () => serviceRow());
        const useCase = buildCreateServiceCatalogItemUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                createServiceItem,
                upsertServiceDetail,
                findServiceItemById
            }
        });

        const result = await useCase({
            payload: {
                name: 'Laundry Basket',
                default_sale_price: 5000,
                visible_in_pos: true,
                visible_in_storefront: true
            }
        });

        expect(result.success).toBe(true);
        expect(createServiceItem).toHaveBeenCalledWith(expect.objectContaining({
            category: 'service',
            product_type: null,
            mode_item_preset: 'service',
            current_stock: 0,
            fifo_enabled: false,
            default_sale_price: 5000
        }), { transaction: tx });
        expect(upsertServiceDetail).toHaveBeenCalledWith(41, expect.objectContaining({
            visible_in_pos: true,
            visible_in_storefront: true
        }), { transaction: tx });
        expect(result.data.service).toEqual(expect.objectContaining({
            item_id: 41,
            category: 'service',
            mode_item_preset: 'service',
            default_sale_price: 5000
        }));
        expect(tx.commit).toHaveBeenCalledTimes(1);
        expect(tx.rollback).not.toHaveBeenCalled();
    });

    it('rolls back when a visible service does not have a positive selling price', async () => {
        const tx = transaction();
        const useCase = buildCreateServiceCatalogItemUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                createServiceItem: jest.fn(async (payload) => ({ item_id: 41, ...payload })),
                upsertServiceDetail: jest.fn(async () => ({ service_detail_id: 9 })),
                findServiceItemById: jest.fn(async () => serviceRow({ default_sale_price: 0 }))
            }
        });

        const result = await useCase({
            payload: { name: 'Laundry Basket', default_sale_price: 0 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.details).toEqual({ reason_code: 'SERVICE_SALE_PRICE_REQUIRED' });
        expect(tx.rollback).toHaveBeenCalledTimes(1);
        expect(tx.commit).not.toHaveBeenCalled();
    });

    it('rolls back the item when service-detail persistence fails', async () => {
        const tx = transaction();
        const useCase = buildCreateServiceCatalogItemUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                createServiceItem: jest.fn(async (payload) => ({ item_id: 41, ...payload })),
                upsertServiceDetail: jest.fn(async () => {
                    throw new Error('detail write failed');
                }),
                findServiceItemById: jest.fn()
            }
        });

        const result = await useCase({
            payload: { name: 'Laundry Basket', default_sale_price: 5000 }
        });

        expect(result.success).toBe(false);
        expect(tx.rollback).toHaveBeenCalledTimes(1);
        expect(tx.commit).not.toHaveBeenCalled();
    });

    it('preserves the governed service preset during update', async () => {
        const tx = transaction();
        const updateServiceItem = jest.fn(async () => serviceRow({ name: 'Laundry Basket XL' }));
        const useCase = buildUpdateServiceCatalogItemUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                updateServiceItem,
                upsertServiceDetail: jest.fn(async () => ({ service_detail_id: 9 })),
                findServiceItemById: jest.fn(async () => serviceRow({ name: 'Laundry Basket XL' }))
            }
        });

        const result = await useCase({
            itemId: 41,
            payload: { name: 'Laundry Basket XL', default_sale_price: 5500 }
        });

        expect(result.success).toBe(true);
        expect(updateServiceItem).toHaveBeenCalledWith(41, expect.objectContaining({
            category: 'service',
            product_type: null,
            mode_item_preset: 'service',
            current_stock: 0,
            fifo_enabled: false,
            default_sale_price: 5500
        }), { transaction: tx, lock: true });
        expect(tx.commit).toHaveBeenCalledTimes(1);
    });
});

describe('Services catalog validators', () => {
    it('rejects zero selling price on service creation', () => {
        const req = { body: { name: 'Laundry Basket', default_sale_price: 0 } };
        const res = response();
        const next = jest.fn();

        validateCreateServiceCatalogItem(req, res, next);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        expect(next).not.toHaveBeenCalled();
    });

    it('accepts a positive service selling price', () => {
        const req = { body: { name: 'Laundry Basket', default_sale_price: 5000 } };
        const res = response();
        const next = jest.fn();

        validateCreateServiceCatalogItem(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData).toEqual(expect.objectContaining({
            name: 'Laundry Basket',
            default_sale_price: 5000
        }));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('allows a partial service update without resubmitting price', () => {
        const req = { body: { addons_enabled: true } };
        const res = response();
        const next = jest.fn();

        validateUpdateServiceCatalogItem(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.addons_enabled).toBe(true);
        expect(req.validatedData.default_sale_price).toBeUndefined();
        expect(res.status).not.toHaveBeenCalled();
    });
});

describe('Services catalog invalidation transport contract', () => {
    it('publishes tenant-scoped POS catalog invalidation only after successful catalog mutations', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../src/modules/services/controllers/serviceHandlers.js'),
            'utf8'
        );

        expect(source).toContain("import { publishCatalogChange } from '../../shared/services/catalogChangeEventBus.js'");
        expect(source).toContain("if (result.success) {\n            await publishCatalogInvalidation(req, 'service_catalog_created'");
        expect(source).toContain("if (result.success) {\n            await publishCatalogInvalidation(req, 'service_catalog_updated'");
        expect(source).toContain('const tenantId = req.user?.tenant_id || req.tenant?.id');
        expect(source).toContain('publishCatalogChange({ tenantId, reason, itemIds })');
    });
});
