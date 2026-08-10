import { jest } from '@jest/globals';

const mockFindOne = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
    AiUsageLog: { findOne: mockFindOne }
}));

let getTenantAiSpendSince;

beforeAll(async () => {
    const mod = await import('../src/modules/menuImport/repositories/menuImportBudgetRepository.js');
    getTenantAiSpendSince = mod.getTenantAiSpendSince;
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('getTenantAiSpendSince', () => {
    it('sums across all features when none are given (pre-#195 behaviour)', async () => {
        mockFindOne.mockResolvedValue({ total: '1.5' });
        const total = await getTenantAiSpendSince('tenant-1', new Date());
        expect(total).toBe(1.5);
        const where = mockFindOne.mock.calls[0][0].where;
        expect(where.feature).toBeUndefined();
    });

    it('filters to the given features so unrelated AI spend is not counted', async () => {
        mockFindOne.mockResolvedValue({ total: '0.75' });
        const total = await getTenantAiSpendSince('tenant-1', new Date(), { features: ['menu_import', 'item_image_generation'] });
        expect(total).toBe(0.75);
        const where = mockFindOne.mock.calls[0][0].where;
        expect(where.feature).toBeDefined();
    });

    it('returns 0 when the sum is null (no matching rows)', async () => {
        mockFindOne.mockResolvedValue({ total: null });
        const total = await getTenantAiSpendSince('tenant-1', new Date());
        expect(total).toBe(0);
    });
});
