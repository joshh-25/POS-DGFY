import { jest } from '@jest/globals';

const storefrontOverrideFindAllMock = jest.fn();
const listItemFolderMembershipsMock = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (name) => {
            if (name === 'StorefrontCatalogOverride') return { findAll: storefrontOverrideFindAllMock };
            throw new Error(`Unexpected model lookup in test: ${name}`);
        },
        getStore: () => null
    }
}));

jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
    itemRepository: {
        listItemFolderMemberships: listItemFolderMembershipsMock
    }
}));

let storeRepository;

const missingOverrideTableError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_NO_SUCH_TABLE',
        sqlMessage: "Table 'tenant_db.storefront_catalog_overrides' doesn't exist"
    }
});

describe('storeRepository.listStorefrontItemImages', () => {
    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ storeRepository } = await import('../src/modules/store/repositories/storeRepository.js'));
    });

    it('returns derived thumbnail URLs for rows with images and omits rows without images', async () => {
        storefrontOverrideFindAllMock.mockResolvedValue([
            {
                item_id: 100,
                storefront_image_path: 'storefront-catalog/tenant-x/item-100/large.webp',
                storefront_image_url: '/uploads/storefront-catalog/tenant-x/item-100/large.webp'
            },
            {
                item_id: 101,
                storefront_image_path: null,
                storefront_image_url: '/uploads/storefront-catalog/tenant-x/legacy-item.png'
            },
            {
                item_id: 102,
                storefront_image_path: null,
                storefront_image_url: null
            }
        ]);

        await expect(storeRepository.listStorefrontItemImages([100, '100', 101, 102, 0, -1]))
            .resolves.toEqual({
                100: '/uploads/storefront-catalog/tenant-x/item-100/thumb.webp',
                101: '/uploads/storefront-catalog/tenant-x/legacy-item.png'
            });

        expect(storefrontOverrideFindAllMock).toHaveBeenCalledWith({
            where: { item_id: [100, 101, 102] },
            attributes: ['item_id', 'storefront_image_path', 'storefront_image_url']
        });
    });

    it('returns an empty image map when the tenant catalog override table is missing', async () => {
        storefrontOverrideFindAllMock.mockRejectedValueOnce(missingOverrideTableError());

        await expect(storeRepository.listStorefrontItemImages([100])).resolves.toEqual({});
    });
});
