import { jest } from '@jest/globals';
import {
    buildCreateProductUseCase,
    buildListProductsUseCase,
    buildUpdateProductUseCase,
    buildSetProductBookableUseCase
} from '../../../../src/modules/products/usecases/productUseCases.js';
import {
    buildCreateProductFolderUseCase,
    buildListProductFoldersUseCase
} from '../../../../src/modules/products/usecases/productFolderUseCases.js';

const makeProduct = (overrides = {}) => ({
    id: 1,
    name: 'Haircut',
    category: 'service',
    inventory_mode: 'non_stock',
    folder_id: null,
    is_bookable: false,
    slot_duration_minutes: null,
    concurrent_capacity: null,
    base_price: 250,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
});

const makeFolder = (overrides = {}) => ({
    id: 1,
    name: 'Drinks',
    description: null,
    show_in_pos_filter: true,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
});

const makeBusiness = (overrides = {}) => ({
    id: 'biz-1',
    business_handle: 'acme-store',
    legal_name: 'Acme Inc.',
    display_name: 'Acme Store',
    status: 'active',
    ...overrides
});

const makeMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-1',
    business_id: 'biz-1',
    role: 'owner',
    status: 'active',
    ...overrides
});

const baseProductRepository = (overrides = {}) => ({
    create: jest.fn().mockResolvedValue(makeProduct()),
    findById: jest.fn().mockResolvedValue(makeProduct()),
    findAll: jest.fn().mockResolvedValue([makeProduct()]),
    update: jest.fn().mockResolvedValue(makeProduct({ name: 'Updated' })),
    delete: jest.fn().mockResolvedValue(makeProduct({ is_active: false })),
    ...overrides
});

const baseFolderRepository = (overrides = {}) => ({
    create: jest.fn().mockResolvedValue(makeFolder()),
    findById: jest.fn().mockResolvedValue(makeFolder()),
    findByName: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([makeFolder()]),
    update: jest.fn().mockResolvedValue(makeFolder({ name: 'Updated' })),
    ...overrides
});

const baseBusinessRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue(makeBusiness()),
    getMembership: jest.fn().mockResolvedValue(makeMembership()),
    ...overrides
});

describe('buildCreateProductUseCase', () => {
    it('creates a product with valid owner membership, category food, inventory_mode non_stock', async () => {
        const repository = baseProductRepository({
            create: jest.fn().mockResolvedValue(makeProduct({ category: 'food', inventory_mode: 'non_stock' }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Rice Meal',
            category: 'food',
            inventory_mode: 'non_stock'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            businessId: 'biz-1',
            name: 'Rice Meal',
            category: 'food',
            inventory_mode: 'non_stock'
        }));
        expect(result.data.product.category).toBe('food');
    });

    it('rejects a missing category', async () => {
        const repository = baseProductRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Rice Meal'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.statusCode).toBe(400);
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid category', async () => {
        const repository = baseProductRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Rice Meal',
            category: 'not-a-category'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a non-owner requester with HTTP 403', async () => {
        const repository = baseProductRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildCreateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-2',
            name: 'Rice Meal',
            category: 'food'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.statusCode).toBe(403);
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('returns NO_TENANT_DATABASE (404) when the tenant registry has no row for this business', async () => {
        const tenantError = new Error('No tenant database is registered for this business.');
        tenantError.name = 'TenantDatabaseUnavailableError';
        tenantError.reason = 'missing';
        const repository = baseProductRepository({ create: jest.fn().mockRejectedValue(tenantError) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Rice Meal',
            category: 'food'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(result.error.statusCode).toBe(404);
        expect(result.error.details.error_code).toBe('NO_TENANT_DATABASE');
    });

    it('returns a stable SERVICE_UNAVAILABLE (503) failure for a still-provisioning tenant database', async () => {
        const tenantError = new Error('Tenant database is still provisioning.');
        tenantError.name = 'TenantDatabaseUnavailableError';
        tenantError.reason = 'provisioning';
        const repository = baseProductRepository({ create: jest.fn().mockRejectedValue(tenantError) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Rice Meal',
            category: 'food'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.statusCode).toBe(503);
        expect(result.error.details.reason).toBe('provisioning');
    });
});

describe('buildListProductsUseCase', () => {
    it('returns products for a member', async () => {
        const repository = baseProductRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildListProductsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.products).toHaveLength(1);
    });

    it('filters out inactive products by default', async () => {
        const repository = baseProductRepository({
            findAll: jest.fn().mockResolvedValue([
                makeProduct({ id: 1, is_active: true }),
                makeProduct({ id: 2, is_active: false })
            ])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListProductsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.data.products).toHaveLength(1);
        expect(result.data.products[0].id).toBe(1);
    });
});

describe('buildUpdateProductUseCase', () => {
    it('rejects a non-owner requester', async () => {
        const repository = baseProductRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildUpdateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            productId: 1,
            requestingAccountId: 'acct-2',
            updates: { name: 'Whatever' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });

    it('returns NOT_FOUND for a missing product', async () => {
        const repository = baseProductRepository({ findById: jest.fn().mockResolvedValue(null) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateProductUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            productId: 99,
            requestingAccountId: 'acct-1',
            updates: { name: 'Whatever' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });
});

describe('buildSetProductBookableUseCase', () => {
    it('marks a service product bookable with slot_duration_minutes and concurrent_capacity', async () => {
        const repository = baseProductRepository({
            findById: jest.fn().mockResolvedValue(makeProduct({ category: 'service' })),
            update: jest.fn().mockResolvedValue(makeProduct({
                category: 'service',
                is_bookable: true,
                slot_duration_minutes: 30,
                concurrent_capacity: 2
            }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildSetProductBookableUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            productId: 1,
            requestingAccountId: 'acct-1',
            slot_duration_minutes: 30,
            concurrent_capacity: 2
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.update).toHaveBeenCalledWith('biz-1', 1, {
            is_bookable: true,
            slot_duration_minutes: 30,
            concurrent_capacity: 2
        });
        expect(result.data.product.is_bookable).toBe(true);
        expect(result.data.product.slot_duration_minutes).toBe(30);
        expect(result.data.product.concurrent_capacity).toBe(2);
    });

    it('rejects marking a non-service product bookable', async () => {
        const repository = baseProductRepository({
            findById: jest.fn().mockResolvedValue(makeProduct({ category: 'retail' }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildSetProductBookableUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            productId: 1,
            requestingAccountId: 'acct-1',
            slot_duration_minutes: 30,
            concurrent_capacity: 2
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a non-positive-integer slot_duration_minutes', async () => {
        const repository = baseProductRepository({
            findById: jest.fn().mockResolvedValue(makeProduct({ category: 'service' }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildSetProductBookableUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            productId: 1,
            requestingAccountId: 'acct-1',
            slot_duration_minutes: -5,
            concurrent_capacity: 2
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.update).not.toHaveBeenCalled();
    });
});

describe('buildCreateProductFolderUseCase', () => {
    it('creates a folder with a unique name', async () => {
        const repository = baseFolderRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateProductFolderUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Drinks'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            businessId: 'biz-1',
            name: 'Drinks'
        }));
    });

    it('returns a 409 conflict when the folder name is already used in this tenant', async () => {
        const repository = baseFolderRepository({ findByName: jest.fn().mockResolvedValue(makeFolder()) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateProductFolderUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Drinks'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a non-owner requester', async () => {
        const repository = baseFolderRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildCreateProductFolderUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-2',
            name: 'Drinks'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(repository.create).not.toHaveBeenCalled();
    });
});

describe('buildListProductFoldersUseCase', () => {
    it('returns folders for a member', async () => {
        const repository = baseFolderRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildListProductFoldersUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.folders).toHaveLength(1);
    });
});
