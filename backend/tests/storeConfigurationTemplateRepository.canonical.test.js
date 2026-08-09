import { jest } from '@jest/globals';

// Issue #178 Phase 20: before this, findPublishedCanonicalForMode resolved
// "canonical" by lowest template_id - correct only because
// STORE_TEMPLATE_PRESETS happens to list each canonical preset before its
// non-canonical sibling. This test proves the query now filters on
// is_canonical explicitly, independent of insertion order, by mocking a
// StoreConfigurationTemplate whose lowest-id row for a mode is NOT the
// canonical one.
const mockStoreConfigurationTemplate = {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
};
const mockStoreConfigurationTemplateModule = {
    bulkCreate: jest.fn(),
    destroy: jest.fn()
};
const mockStoreConfigurationTemplateAuditLog = {
    create: jest.fn(),
    findAll: jest.fn()
};
const mockSequelize = {
    transaction: jest.fn(async (fn) => fn({}))
};

jest.unstable_mockModule('../src/models/index.js', () => ({
    default: {
        StoreConfigurationTemplate: mockStoreConfigurationTemplate,
        StoreConfigurationTemplateModule: mockStoreConfigurationTemplateModule,
        StoreConfigurationTemplateAuditLog: mockStoreConfigurationTemplateAuditLog,
        sequelize: mockSequelize
    },
    StoreConfigurationTemplate: mockStoreConfigurationTemplate,
    StoreConfigurationTemplateModule: mockStoreConfigurationTemplateModule,
    StoreConfigurationTemplateAuditLog: mockStoreConfigurationTemplateAuditLog,
    sequelize: mockSequelize
}));

const { storeConfigurationTemplateRepository } = await import(
    '../src/modules/templates/repositories/storeConfigurationTemplateRepository.js'
);

describe('storeConfigurationTemplateRepository.findPublishedCanonicalForMode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('filters the query on is_canonical: true rather than relying on template_id order', async () => {
        mockStoreConfigurationTemplate.findOne.mockResolvedValue(null);

        await storeConfigurationTemplateRepository.findPublishedCanonicalForMode('fnb');

        expect(mockStoreConfigurationTemplate.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    base_mode: 'fnb',
                    status: 'published',
                    is_canonical: true
                })
            })
        );
        // The query no longer needs is_preset to disambiguate the canonical
        // row - is_canonical alone is authoritative.
        const calledWhere = mockStoreConfigurationTemplate.findOne.mock.calls[0][0].where;
        expect(calledWhere).not.toHaveProperty('is_preset');
    });

    it('resolves the row the DB reports as is_canonical even if it does not have the lowest template_id', async () => {
        // A published non-canonical preset (e.g. fnb_counter_service, seeded
        // second) with a lower template_id than the canonical preset -
        // simulating curation or reseeding order that no longer matches
        // Object.entries(STORE_TEMPLATE_PRESETS).
        const canonicalRow = {
            get: () => ({
                template_id: 99,
                template_key: 'fnb_full_service',
                base_mode: 'fnb',
                status: 'published',
                is_canonical: true,
                modules: [{ module_key: 'fnbDining', enabled: true }]
            })
        };
        mockStoreConfigurationTemplate.findOne.mockResolvedValue(canonicalRow);

        const result = await storeConfigurationTemplateRepository.findPublishedCanonicalForMode('fnb');

        expect(result.template_key).toBe('fnb_full_service');
    });
});
