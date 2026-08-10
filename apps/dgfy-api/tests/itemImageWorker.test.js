import { jest } from '@jest/globals';

const mockGenerateItemImage = jest.fn();
const mockUploadStorefrontCatalogImageUseCase = jest.fn();
const mockFindTenantById = jest.fn();
const mockGetConnection = jest.fn();
const mockGetTenantModels = jest.fn();
const mockDbStoreRun = jest.fn();
const mockAiUsageLogCreate = jest.fn();
const mockUnlink = jest.fn();
const mockSetItemImageStatus = jest.fn();
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

class ItemImageGenerationError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ItemImageGenerationError';
        this.code = code;
    }
}

jest.unstable_mockModule('../src/config/redis.js', () => ({
    isRedisConnected: jest.fn(() => true),
    getRedisClient: jest.fn(() => ({ lPush: jest.fn(), rPop: jest.fn() }))
}));
jest.unstable_mockModule('../src/config/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('../src/services/itemImageGenerationService.js', () => ({
    generateItemImage: mockGenerateItemImage,
    ItemImageGenerationError
}));
jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
    uploadStorefrontCatalogImageUseCase: mockUploadStorefrontCatalogImageUseCase
}));
jest.unstable_mockModule('../src/services/landlordService.js', () => ({
    findTenantById: mockFindTenantById
}));
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: { getConnection: mockGetConnection }
}));
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: mockGetTenantModels
}));
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: { run: mockDbStoreRun }
}));
jest.unstable_mockModule('../src/models/index.js', () => ({
    AiUsageLog: { create: mockAiUsageLogCreate }
}));
jest.unstable_mockModule('fs/promises', () => ({
    default: { unlink: mockUnlink },
    unlink: mockUnlink
}));
jest.unstable_mockModule('../src/workers/itemImageStatusStore.js', () => ({
    setItemImageStatus: mockSetItemImageStatus
}));

let processImageTask;

beforeAll(async () => {
    const mod = await import('../src/workers/itemImageWorker.js');
    processImageTask = mod.processImageTask;
});

beforeEach(() => {
    jest.clearAllMocks();
    // dbStore.run just invokes the callback directly in these tests — the
    // real AsyncLocalStorage plumbing is exercised by tenantModelFactory /
    // dbStore's own tests, not this worker's.
    mockDbStoreRun.mockImplementation((context, callback) => callback());
    mockGetTenantModels.mockReturnValue({ Item: {} });
});

const baseUser = { user_id: 7, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:edit'] };

describe('processImageTask', () => {
    it('discards a malformed task without calling any downstream service', async () => {
        await processImageTask({ user: { tenant_id: 'tenant-1' } }); // missing user_id/itemId/name
        expect(mockGenerateItemImage).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();
        // No itemId to key a status record on — nothing to write, same as today.
        expect(mockSetItemImageStatus).not.toHaveBeenCalled();
    });

    it('generates, resolves tenant context, attaches the image, and logs usage on success', async () => {
        mockGenerateItemImage.mockResolvedValue({
            path: '/tmp/fake.png',
            originalname: 'ai-generated-abc.png',
            mimetype: 'image/png',
            size: 1234,
            provenance: { type: 'ai_generated', model: 'gpt-image-2' },
            usage: { model: 'gpt-image-2', sizeTier: '1K', costUsd: 0.03, estimated: false }
        });
        const fakeTenant = { id: 'tenant-1', company_token: 'tok', name: 'Acme', plan: 'pro' };
        mockFindTenantById.mockResolvedValue(fakeTenant);
        mockGetConnection.mockResolvedValue({ fakeSequelize: true });
        mockUploadStorefrontCatalogImageUseCase.mockResolvedValue({ item_id: 42 });

        await processImageTask({ user: baseUser, itemId: 42, name: 'Sisig', description: 'Pork sisig', category: 'Mains' });

        expect(mockGenerateItemImage).toHaveBeenCalledWith({ name: 'Sisig', description: 'Pork sisig', category: 'Mains' });
        expect(mockFindTenantById).toHaveBeenCalledWith('tenant-1');
        expect(mockGetConnection).toHaveBeenCalledWith(fakeTenant);
        expect(mockDbStoreRun).toHaveBeenCalledTimes(1);
        const [contextArg] = mockDbStoreRun.mock.calls[0];
        expect(contextArg.tenantId).toBe('tenant-1');
        expect(contextArg.Item).toBeDefined();

        expect(mockUploadStorefrontCatalogImageUseCase).toHaveBeenCalledWith(expect.objectContaining({
            itemId: 42,
            user: baseUser,
            file: expect.objectContaining({ path: '/tmp/fake.png' }),
            provenance: expect.objectContaining({ type: 'ai_generated' })
        }));

        expect(mockAiUsageLogCreate).toHaveBeenCalledWith(expect.objectContaining({
            tenant_id: 'tenant-1',
            user_id: 7,
            feature: 'item_image_generation',
            units: 1,
            cost_usd: '0.030000'
        }));
        expect(mockUnlink).not.toHaveBeenCalled();

        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(1, 'tenant-1', 42, { status: 'processing' });
        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(2, 'tenant-1', 42, { status: 'completed' });
    });

    it('logs, records a failed status, and returns without throwing when generation itself fails', async () => {
        mockGenerateItemImage.mockRejectedValue(new ItemImageGenerationError('boom', 'GENERATION_REQUEST_FAILED'));

        await expect(processImageTask({ user: baseUser, itemId: 42, name: 'Sisig' })).resolves.toBeUndefined();
        expect(mockFindTenantById).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();

        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(1, 'tenant-1', 42, { status: 'processing' });
        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(2, 'tenant-1', 42, {
            status: 'failed',
            error_code: 'GENERATION_REQUEST_FAILED',
            error_message: 'boom'
        });
    });

    it('cleans up the generated temp file and records a failed status when the tenant cannot be resolved', async () => {
        mockGenerateItemImage.mockResolvedValue({
            path: '/tmp/orphan.png',
            originalname: 'ai-generated-orphan.png',
            mimetype: 'image/png',
            size: 10,
            provenance: {},
            usage: { model: 'gpt-image-2', sizeTier: '1K', costUsd: 0.03, estimated: false }
        });
        mockFindTenantById.mockResolvedValue(null);

        await processImageTask({ user: baseUser, itemId: 42, name: 'Sisig' });

        expect(mockUploadStorefrontCatalogImageUseCase).not.toHaveBeenCalled();
        expect(mockUnlink).toHaveBeenCalledWith('/tmp/orphan.png');

        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(1, 'tenant-1', 42, { status: 'processing' });
        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(2, 'tenant-1', 42, {
            status: 'failed',
            error_code: 'TENANT_NOT_FOUND',
            error_message: 'Tenant not found'
        });
    });

    it('logs, records a failed status, and does not throw when attaching the generated image fails', async () => {
        mockGenerateItemImage.mockResolvedValue({
            path: '/tmp/fake.png',
            originalname: 'ai-generated-abc.png',
            mimetype: 'image/png',
            size: 1234,
            provenance: {},
            usage: { model: 'gpt-image-2', sizeTier: '1K', costUsd: 0.03, estimated: false }
        });
        mockFindTenantById.mockResolvedValue({ id: 'tenant-1' });
        mockGetConnection.mockResolvedValue({});
        mockUploadStorefrontCatalogImageUseCase.mockRejectedValue(new Error('item not found'));

        await expect(processImageTask({ user: baseUser, itemId: 42, name: 'Sisig' })).resolves.toBeUndefined();
        expect(mockAiUsageLogCreate).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalled();

        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(1, 'tenant-1', 42, { status: 'processing' });
        expect(mockSetItemImageStatus).toHaveBeenNthCalledWith(2, 'tenant-1', 42, {
            status: 'failed',
            error_code: 'ATTACH_FAILED',
            error_message: 'item not found'
        });
    });
});
