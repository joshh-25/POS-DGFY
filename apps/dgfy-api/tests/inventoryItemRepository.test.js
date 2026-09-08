import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import logger from '../src/config/logger.js';
import { itemRepository, inventoryRepositoryDependencies } from '../src/modules/inventory/repositories/itemRepository.js';

const DEFAULT_REPOSITORY_DEPENDENCIES = {
  validateComposition: inventoryRepositoryDependencies.validateComposition,
  invalidateDependencyGraphCache: inventoryRepositoryDependencies.invalidateDependencyGraphCache,
  getAllSettings: inventoryRepositoryDependencies.getAllSettings,
  createStockMovement: inventoryRepositoryDependencies.createStockMovement,
  syncItemEmbedding: inventoryRepositoryDependencies.syncItemEmbedding,
  searchByMeaning: inventoryRepositoryDependencies.searchByMeaning
};

describe('inventory itemRepository', () => {
  beforeEach(() => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'manufacturing' },
      enable_auto_reorder: { value: true },
      min_stock_threshold_percent: { value: 40 },
      purchase_allowance_percent: { value: 20 }
    });
  });

  afterEach(() => {
    inventoryRepositoryDependencies.validateComposition = DEFAULT_REPOSITORY_DEPENDENCIES.validateComposition;
    inventoryRepositoryDependencies.invalidateDependencyGraphCache = DEFAULT_REPOSITORY_DEPENDENCIES.invalidateDependencyGraphCache;
    inventoryRepositoryDependencies.getAllSettings = DEFAULT_REPOSITORY_DEPENDENCIES.getAllSettings;
    inventoryRepositoryDependencies.createStockMovement = DEFAULT_REPOSITORY_DEPENDENCIES.createStockMovement;
    inventoryRepositoryDependencies.syncItemEmbedding = DEFAULT_REPOSITORY_DEPENDENCIES.syncItemEmbedding;
    inventoryRepositoryDependencies.searchByMeaning = DEFAULT_REPOSITORY_DEPENDENCIES.searchByMeaning;
    jest.restoreAllMocks();
  });

  it('returns dropdown item payload with id aliases', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        {
          item_id: 1,
          toJSON: () => ({
            item_id: 1,
            sku_code: 'RAW-001',
            name: 'Flour',
            unit_of_measure: 'kg',
            category: 'raw_material',
            product_type: null,
            status: 'active',
            current_stock: 10
          })
        },
        {
          item_id: 2,
          toJSON: () => ({
            item_id: 2,
            sku_code: 'RAW-002',
            name: 'Sugar',
            unit_of_measure: 'kg',
            category: 'raw_material',
            product_type: null,
            status: 'active',
            current_stock: 8
          })
        }
      ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return {};
      if (name === 'ItemFolder') return {};
      return {};
    });

    const result = await itemRepository.getItems({
      fields: 'dropdown',
      limit: '2',
      category: 'raw_material',
      status: 'active'
    });

    const args = Item.findAll.mock.calls[0][0];
    expect(args.limit).toBe(2);
    expect(args.where).toMatchObject({
      deleted_at: null,
      category: 'raw_material',
      status: 'active'
    });

    expect(result).toMatchObject({
      items: [
        {
          item_id: 1,
          sku_code: 'RAW-001',
          name: 'Flour',
          unit_of_measure: 'kg',
          category: 'raw_material',
          product_type: null,
          status: 'active',
          current_stock: 10,
          id: 1,
          cost_metrics: {
            global: {
              available_qty: 10,
              source: 'item_cost_fallback'
            }
          }
        },
        {
          item_id: 2,
          sku_code: 'RAW-002',
          name: 'Sugar',
          unit_of_measure: 'kg',
          category: 'raw_material',
          product_type: null,
          status: 'active',
          current_stock: 8,
          id: 2,
          cost_metrics: {
            global: {
              available_qty: 8,
              source: 'item_cost_fallback'
            }
          }
        }
      ],
      pagination: {
        page: 1,
        limit: 2,
        total: 2,
        pages: 1
      }
    });
  });

  it('listStorefrontCatalogOverrides retries without gallery when tenant schema is missing the gallery column', async () => {
    const missingGalleryColumnError = {
      name: 'SequelizeDatabaseError',
      original: {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'storefrontCatalogOverride.storefront_image_gallery' in 'field list'"
      }
    };
    const Item = {
      findAll: jest.fn()
        .mockRejectedValueOnce(missingGalleryColumnError)
        .mockResolvedValueOnce([
          {
            toJSON: () => ({
              item_id: 901,
              name: 'Iced Tea',
              sku_code: 'FNB-TEA',
              category: 'product',
              product_type: 'finished_goods',
              mode_item_preset: 'menu_item',
              status: 'active',
              default_sale_price: 85,
              current_stock: 12,
              storefrontCatalogOverride: {
                storefront_visible: true,
                storefront_image_path: 'storefront/iced-tea.png',
                storefront_image_url: '/uploads/storefront/iced-tea.png'
              }
            })
          }
        ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'StorefrontCatalogOverride') return {};
      if (name === 'PosCatalogOverride') return {};
      if (name === 'ServiceItemDetail') return null;
      if (name === 'TenantLocation') return null;
      if (name === 'StorefrontLocationItemOverride') return null;
      return {};
    });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({
      tenantId: 'gallery-column-fallback-test'
    });

    const result = await itemRepository.listStorefrontCatalogOverrides({ limit: 50 });

    expect(Item.findAll).toHaveBeenCalledTimes(2);
    const retryInclude = Item.findAll.mock.calls[1][0].include.find((entry) => (
      entry.as === 'storefrontCatalogOverride'
    ));
    expect(retryInclude.attributes).toEqual([
      'storefront_visible',
      'storefront_image_path',
      'storefront_image_url'
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      item_id: 901,
      storefront_visible: true,
      storefront_image_url: '/uploads/storefront/iced-tea.png',
      storefront_image_gallery: expect.arrayContaining([
        expect.objectContaining({
          path: 'storefront/iced-tea.png',
          url: '/uploads/storefront/iced-tea.png',
          is_primary: true,
          sort_order: 0
        })
      ])
    }));
  });

  it('loads Storefront override primary key before updating gallery images', async () => {
    const StorefrontCatalogOverride = {
      findOne: jest.fn().mockResolvedValue({
        storefront_catalog_override_id: 77,
        item_id: 901,
        storefront_visible: true,
        storefront_image_path: 'storefront/iced-tea.png',
        storefront_image_url: '/uploads/storefront/iced-tea.png',
        storefront_image_gallery: [],
        update: jest.fn()
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'StorefrontCatalogOverride') return StorefrontCatalogOverride;
      return {};
    });

    await itemRepository.findStorefrontCatalogOverrideByItemId(901);

    expect(StorefrontCatalogOverride.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { item_id: 901 },
      attributes: expect.arrayContaining([
        'storefront_catalog_override_id',
        'item_id',
        'image_fingerprint',
        'optimization_version',
        'processing_status',
        'variant_metadata'
      ])
    }));
  });

  it('does not append a fourth image when persisting an already-optimized three-image gallery', async () => {
    const gallery = [1, 2, 3].map((number) => ({
      path: `storefront/item-901/image-${number}/large.webp`,
      url: `/uploads/storefront/item-901/image-${number}/large.webp`,
      variants: { thumbnail_url: `/uploads/storefront/item-901/image-${number}/thumb.webp` },
      is_primary: number === 1,
      sort_order: number - 1
    }));
    const update = jest.fn().mockResolvedValue();
    const existing = {
      storefront_catalog_override_id: 77,
      item_id: 901,
      storefront_visible: true,
      storefront_image_path: gallery[0].path,
      storefront_image_url: gallery[0].url,
      storefront_image_gallery: [],
      update
    };
    const StorefrontCatalogOverride = {
      findOne: jest.fn().mockResolvedValue(existing)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'StorefrontCatalogOverride') return StorefrontCatalogOverride;
      return {};
    });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'gallery-count-test' });

    await itemRepository.updateStorefrontCatalogImage(901, {
      path: gallery[0].path,
      url: gallery[0].url,
      gallery
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].storefront_image_gallery).toHaveLength(3);
    expect(update.mock.calls[0][0].storefront_image_gallery.map((entry) => entry.path)).toEqual(
      gallery.map((entry) => entry.path)
    );
  });

  it('retries Storefront override updates without gallery when tenant schema is missing the gallery column', async () => {
    const missingGalleryColumnError = {
      name: 'SequelizeDatabaseError',
      original: {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'storefront_image_gallery' in 'field list'"
      }
    };
    const update = jest.fn()
      .mockRejectedValueOnce(missingGalleryColumnError)
      .mockResolvedValueOnce();
    const existing = {
      storefront_catalog_override_id: 77,
      item_id: 901,
      storefront_visible: true,
      storefront_image_path: null,
      storefront_image_url: null,
      storefront_image_gallery: [],
      update
    };
    const StorefrontCatalogOverride = {
      findOne: jest.fn().mockResolvedValue(existing)
    };

    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'StorefrontCatalogOverride') return StorefrontCatalogOverride;
      return {};
    });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'gallery-update-fallback-test' });

    await itemRepository.updateStorefrontCatalogImage(901, {
      path: 'storefront/iced-tea.png',
      url: '/uploads/storefront/iced-tea.png',
      gallery: [{ path: 'storefront/iced-tea.png', url: '/uploads/storefront/iced-tea.png' }]
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0]).toHaveProperty('storefront_image_gallery');
    expect(update.mock.calls[1][0]).not.toHaveProperty('storefront_image_gallery');
  });

  it('retries Storefront override creates without gallery when tenant schema is missing the gallery column', async () => {
    const missingGalleryColumnError = {
      name: 'SequelizeDatabaseError',
      original: {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'storefront_image_gallery' in 'field list'"
      }
    };
    const created = { storefront_catalog_override_id: 88, item_id: 902 };
    const StorefrontCatalogOverride = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn()
        .mockRejectedValueOnce(missingGalleryColumnError)
        .mockResolvedValueOnce(created)
    };

    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(itemRepository, 'getStorefrontCatalogReadinessByItemId').mockResolvedValue({
      storefront_visible: true
    });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'StorefrontCatalogOverride') return StorefrontCatalogOverride;
      return {};
    });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'gallery-create-fallback-test' });

    const result = await itemRepository.updateStorefrontCatalogImage(902, {
      path: 'storefront/lemonade.png',
      url: '/uploads/storefront/lemonade.png',
      gallery: [{ path: 'storefront/lemonade.png', url: '/uploads/storefront/lemonade.png' }]
    });

    expect(result).toBe(created);
    expect(StorefrontCatalogOverride.create).toHaveBeenCalledTimes(2);
    expect(StorefrontCatalogOverride.create.mock.calls[0][0]).toHaveProperty('storefront_image_gallery');
    expect(StorefrontCatalogOverride.create.mock.calls[1][0]).not.toHaveProperty('storefront_image_gallery');
  });

  it('maps list payload for product compositions in getItems', async () => {
    const ProductComposition = {};
    const ItemFolder = {};
    const Item = {
      findAndCountAll: jest.fn().mockResolvedValue({
        count: 1,
        rows: [
          {
            toJSON: () => ({
              item_id: 5,
              sku_code: 'PROD-005',
              name: 'Cake',
              category: 'product',
              productCompositions: [
                {
                  composition_type: 'ingredient',
                  ingredient_id: 10,
                  quantity_required: 2,
                  ingredient: {
                    name: 'Flour',
                    unit_of_measure: 'kg',
                    cost_per_unit: 3
                  }
                },
                {
                  composition_type: 'packaging',
                  ingredient_id: 11,
                  quantity_required: 1,
                  ingredient: {
                    name: 'Box',
                    unit_of_measure: 'pcs',
                    cost_per_unit: 0.5
                  }
                }
              ]
            })
          }
        ]
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'ItemFolder') return ItemFolder;
      return {};
    });

    const result = await itemRepository.getItems({
      page: '2',
      limit: '1',
      sortBy: 'name',
      sortOrder: 'desc'
    });

    const args = Item.findAndCountAll.mock.calls[0][0];
    expect(args.limit).toBe(1);
    expect(args.offset).toBe(1);
    expect(args.order).toEqual([['name', 'DESC']]);
    expect(args.include[0].model).toBe(ProductComposition);
    expect(args.include[1].model).toBe(ItemFolder);

    expect(result.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 1,
      pages: 1
    });
    expect(result.items[0]).toMatchObject({
      item_id: 5,
      id: 5,
      recipe_cost: 6.5,
      ingredients: [
        {
          item_id: 10,
          item_name: 'Flour',
          quantity: 2,
          unit: 'kg'
        }
      ]
    });
    expect(result.items[0].productCompositions).toBeUndefined();
  });

  it('does not query ItemLocationStock when location_id is omitted (#682 backward-compat guard)', async () => {
    const ProductComposition = {};
    const ItemFolder = {};
    const ItemLocationStock = { findAll: jest.fn() };
    const Item = {
      findAndCountAll: jest.fn().mockResolvedValue({
        count: 1,
        rows: [{ toJSON: () => ({ item_id: 5, sku_code: 'PROD-005', name: 'Cake', category: 'product', current_stock: 42 }) }]
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemLocationStock') return ItemLocationStock;
      return {};
    });

    const result = await itemRepository.getItems({ page: '1', limit: '20' });

    expect(ItemLocationStock.findAll).not.toHaveBeenCalled();
    expect(result.items[0].current_stock).toBe(42);
    expect(result.location_scope).toEqual({ location_id: null, resolved: true });
  });

  it('overlays branch-scoped current_stock from item_location_stocks when location_id is given (#682)', async () => {
    const ProductComposition = {};
    const ItemFolder = {};
    const ItemLocationStock = {
      findAll: jest.fn().mockResolvedValue([
        { toJSON: () => ({ item_id: 5, quantity_on_hand: '3.000000000000' }) }
      ])
    };
    const Item = {
      findAndCountAll: jest.fn().mockResolvedValue({
        count: 1,
        rows: [{ toJSON: () => ({ item_id: 5, sku_code: 'PROD-005', name: 'Cake', category: 'product', current_stock: 999 }) }]
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemLocationStock') return ItemLocationStock;
      return {};
    });

    const result = await itemRepository.getItems({ page: '1', limit: '20', location_id: '2' });

    expect(ItemLocationStock.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ location_id: 2 })
    }));
    expect(result.items[0].current_stock).toBe(3);
    expect(result.location_scope).toEqual({ location_id: 2, resolved: true });
  });

  it('falls back to the tenant-wide aggregate and reports resolved:false when item_location_stocks schema is missing (#682)', async () => {
    const ProductComposition = {};
    const ItemFolder = {};
    const ItemLocationStock = {
      findAll: jest.fn().mockRejectedValue({
        original: { code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'tenant_db.item_location_stocks' doesn't exist" }
      })
    };
    const Item = {
      findAndCountAll: jest.fn().mockResolvedValue({
        count: 1,
        rows: [{ toJSON: () => ({ item_id: 5, sku_code: 'PROD-005', name: 'Cake', category: 'product', current_stock: 42 }) }]
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemLocationStock') return ItemLocationStock;
      return {};
    });

    const result = await itemRepository.getItems({ page: '1', limit: '20', location_id: '2' });

    // Honest fallback, not a hard error: the tenant-wide aggregate is kept, but the caller is
    // told the branch-scoped overlay did NOT happen, so the frontend can render the distinct
    // fallback-warning copy instead of a legitimate branch-scoped zero.
    expect(result.items[0].current_stock).toBe(42);
    expect(result.location_scope).toEqual({ location_id: 2, resolved: false });
  });

  it('returns a soft-deleted, inactive item under include_inactive=true (#1495 Part A, RF-1)', async () => {
    // Regression test for PR #1502's pr-reviewer RF-1 finding: the include_inactive branch used
    // to call buildVisibleWhere without includeDeleted, which always forced deleted_at: null onto
    // the query -- since deleteItem sets deleted_at, a real DB could never return the deleted rows
    // this "show inactive" list is meant to surface, even though a mocked findAndCountAll would
    // happily hand one back regardless of the where clause. Assert on the where clause itself, not
    // just the mocked result, so this actually catches the defect the way an unfiltered mock can't.
    const ProductComposition = {};
    const ItemFolder = {};
    const Item = {
      findAndCountAll: jest.fn().mockResolvedValue({
        count: 1,
        rows: [
          {
            toJSON: () => ({
              item_id: 9,
              sku_code: 'DEL-009',
              name: 'Discontinued Syrup',
              category: 'raw_material',
              status: 'inactive',
              deleted_at: new Date('2026-08-20T00:00:00Z'),
              current_stock: 0
            })
          }
        ]
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'ItemFolder') return ItemFolder;
      return {};
    });

    const result = await itemRepository.getItems({ page: '1', limit: '20', include_inactive: true });

    const args = Item.findAndCountAll.mock.calls[0][0];
    expect(args.where).not.toHaveProperty('deleted_at');
    expect(args.where.status).toBeUndefined();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      item_id: 9,
      status: 'inactive',
      deleted_at: new Date('2026-08-20T00:00:00Z')
    });
  });

  it('maps item detail payload to wizard contract in getItemById', async () => {
    const ItemNutrition = {};
    const ItemAllergen = {};
    const ItemPhysicalProperties = {};
    const ItemShelfLife = {};
    const ItemPackaging = {};
    const ItemQualityControl = {};
    const ItemRegulatoryCompliance = {};
    const ItemCostBreakdown = {};
    const ProductComposition = {};
    const FIFOBatch = {};
    const ItemLocationStock = { findAll: jest.fn() };
    const SupplierItem = {};
    const Supplier = {};
    const ItemFolder = {};

    const modelCompositions = [
      {
        composition_type: 'ingredient',
        ingredient_id: 10,
        quantity_required: 2,
        ingredient: {
          name: 'Flour',
          unit_of_measure: 'kg',
          cost_per_unit: 3
        }
      },
      {
        composition_type: 'packaging',
        ingredient_id: 11,
        quantity_required: 1,
        ingredient: {
          name: 'Box',
          unit_of_measure: 'pcs',
          cost_per_unit: 0.5
        }
      }
    ];

    const Item = {
      findOne: jest.fn().mockResolvedValue({
        productCompositions: modelCompositions,
        toJSON: () => ({
          item_id: 55,
          name: 'Cake',
          nutrition: { calories: 100 },
          allergens: [
            { allergen_name: 'milk', is_cross_contamination: false },
            { allergen_name: 'soy', is_cross_contamination: true }
          ],
          physicalProperties: { color: 'brown' },
          shelfLife: { shelf_days: 7 },
          packaging: { package_type: 'box' },
          qualityControl: { pass_rate: 99 },
          regulatoryCompliance: { haccp: true },
          costBreakdown: {
            labor_cost: 1,
            overhead_cost: 2,
            additional_packaging_cost: 3
          },
          productCompositions: modelCompositions,
          fifoBatches: [{ batch_id: 1 }],
          locationStocks: [
            {
              item_location_stock_id: 900,
              item_id: 55,
              location_id: 4,
              quantity_on_hand: '12.5',
              location: { name: 'Villa Store' }
            }
          ],
          supplierItems: [
            {
              supplier: { supplier_id: 7, name: 'Vendor A' },
              moq: 5,
              price_per_unit: 4.5
            }
          ],
          folder: { folder_id: 2, name: 'Products' }
        })
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemNutrition') return ItemNutrition;
      if (name === 'ItemAllergen') return ItemAllergen;
      if (name === 'ItemPhysicalProperties') return ItemPhysicalProperties;
      if (name === 'ItemShelfLife') return ItemShelfLife;
      if (name === 'ItemPackaging') return ItemPackaging;
      if (name === 'ItemQualityControl') return ItemQualityControl;
      if (name === 'ItemRegulatoryCompliance') return ItemRegulatoryCompliance;
      if (name === 'ItemCostBreakdown') return ItemCostBreakdown;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'FIFOBatch') return FIFOBatch;
      if (name === 'ItemLocationStock') return ItemLocationStock;
      if (name === 'SupplierItem') return SupplierItem;
      if (name === 'Supplier') return Supplier;
      if (name === 'ItemFolder') return ItemFolder;
      return {};
    });

    const result = await itemRepository.getItemById(55);
    const args = Item.findOne.mock.calls[0][0];
    expect(args.where.item_id).toBe(55);
    expect(args.where.deleted_at).toBeNull();
    expect(args.where.status[Op.ne]).toBe('inactive');

    expect(result.suppliers).toEqual([
      {
        supplier_id: 7,
        name: 'Vendor A',
        moq: 5,
        price_per_unit: 4.5
      }
    ]);
    expect(result.nutritional_info).toEqual({ calories: 100 });
    expect(result.allergens).toEqual(['milk']);
    expect(result.may_contain_allergens).toEqual(['soy']);
    expect(result.ingredients).toHaveLength(1);
    expect(result.packaging_items).toHaveLength(1);
    expect(result.fifo_batches).toEqual([{ batch_id: 1 }]);
    expect(result.item_location_stocks).toEqual([
      {
        item_location_stock_id: 900,
        item_id: 55,
        location_id: 4,
        quantity_on_hand: 12.5,
        location_name: 'Villa Store'
      }
    ]);
    expect(result.recipe_cost).toBe(6.5);
    expect(['fifo_batches', 'item_cost_fallback']).toContain(result.cost_metrics?.global?.source);
    expect(result.cost_metrics?.global?.source).not.toBe('fifo_on_hand');
    expect(result.costBreakdown).toBeUndefined();
    expect(result.fifoBatches).toBeUndefined();
    expect(result.locationStocks).toBeUndefined();
  });

  it('blocks getItemMovements for soft-deleted items', async () => {
    const Item = { findOne: jest.fn().mockResolvedValue(null) };
    const StockMovement = { findAll: jest.fn() };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'StockMovement') return StockMovement;
      return {};
    });

    await expect(itemRepository.getItemMovements(555)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Item not found'
    });

    const findOneArgs = Item.findOne.mock.calls[0][0];
    expect(findOneArgs.where.item_id).toBe(555);
    expect(findOneArgs.where.deleted_at).toBeNull();
    expect(findOneArgs.where.status[Op.ne]).toBe('inactive');
    expect(StockMovement.findAll).not.toHaveBeenCalled();
  });

  it('returns mapped stock history payload', async () => {
    const Item = { findOne: jest.fn().mockResolvedValue({ item_id: 77 }) };
    const User = {};
    const StockMovement = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            movement_id: 1,
            item_id: 77,
            movement_type: 'adjustment',
            quantity: 5,
            reference_id: 'ref-1',
            reference_type: 'manual',
            userResponsible: { username: 'alice' },
            timestamp: '2026-03-01T00:00:00.000Z'
          })
        },
        {
          toJSON: () => ({
            movement_id: 2,
            item_id: 77,
            movement_type: 'adjustment',
            quantity: -1,
            reference_id: 'ref-2',
            reference_type: 'manual',
            userResponsible: null,
            timestamp: '2026-03-02T00:00:00.000Z'
          })
        }
      ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'StockMovement') return StockMovement;
      if (name === 'User') return User;
      return {};
    });

    const result = await itemRepository.getItemStockHistory(77, {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      movementType: 'adjustment',
      limit: '10'
    });

    const findAllArgs = StockMovement.findAll.mock.calls[0][0];
    expect(findAllArgs.where.item_id).toBe(77);
    expect(findAllArgs.where.movement_type).toBe('adjustment');
    expect(findAllArgs.where.timestamp[Op.gte]).toBeInstanceOf(Date);
    expect(findAllArgs.where.timestamp[Op.lte]).toBeInstanceOf(Date);
    expect(findAllArgs.limit).toBe(10);
    expect(findAllArgs.include[0].model).toBe(User);

    expect(result).toEqual([
      {
        movement_id: 1,
        item_id: 77,
        movement_type: 'adjustment',
        quantity: 5,
        reference_id: 'ref-1',
        reference_type: 'manual',
        user_responsible: 'alice',
        timestamp: '2026-03-01T00:00:00.000Z'
      },
      {
        movement_id: 2,
        item_id: 77,
        movement_type: 'adjustment',
        quantity: -1,
        reference_id: 'ref-2',
        reference_type: 'manual',
        user_responsible: null,
        timestamp: '2026-03-02T00:00:00.000Z'
      }
    ]);
  });

  it('queries FIFO batches using quantity > quantity_consumed filter', async () => {
    const Item = { findOne: jest.fn().mockResolvedValue({ item_id: 9 }) };
    const FIFOBatch = { findAll: jest.fn().mockResolvedValue([{ batch_id: 1 }]) };
    const sequelize = {
      where: jest.fn().mockReturnValue('where-clause'),
      col: jest.fn((name) => `col:${name}`)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'FIFOBatch') return FIFOBatch;
      if (name === 'sequelize') return sequelize;
      return {};
    });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize });

    const result = await itemRepository.getItemBatches(9);

    expect(sequelize.col).toHaveBeenNthCalledWith(1, 'quantity');
    expect(sequelize.col).toHaveBeenNthCalledWith(2, 'quantity_consumed');
    expect(sequelize.where).toHaveBeenCalledWith('col:quantity', Op.gt, 'col:quantity_consumed');

    const findAllArgs = FIFOBatch.findAll.mock.calls[0][0];
    expect(findAllArgs.where.item_id).toBe(9);
    expect(findAllArgs.where[Op.and]).toEqual(['where-clause']);
    expect(findAllArgs.order).toEqual([['received_date', 'ASC']]);
    expect(result).toEqual([{ batch_id: 1 }]);
  });

  it('returns supplier coverage summary grouped by supplier assignment', async () => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'manufacturing' }
    });

    const Item = {
      findAll: jest.fn().mockResolvedValue([
        {
          item_id: 1,
          name: 'Flour',
          sku_code: 'RAW-001',
          category: 'raw_material',
          current_stock: 10,
          min_threshold: 5,
          unit_of_measure: 'kg'
        },
        {
          item_id: 2,
          name: 'Bottle',
          sku_code: 'PKG-001',
          category: 'packaging',
          current_stock: 20,
          min_threshold: 8,
          unit_of_measure: 'pcs'
        }
      ])
    };
    const Supplier = {};
    const SupplierItem = {
      findAll: jest.fn().mockResolvedValue([
        {
          item_id: 1,
          supplier_id: 11,
          moq: 3,
          price_per_unit: 1.5,
          supplier: { name: 'Vendor A' }
        }
      ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'Supplier') return Supplier;
      if (name === 'SupplierItem') return SupplierItem;
      return {};
    });

    const result = await itemRepository.getItemSupplierCoverage();

    expect(inventoryRepositoryDependencies.getAllSettings).toHaveBeenCalled();
    expect(Item.findAll).toHaveBeenCalled();
    expect(SupplierItem.findAll).toHaveBeenCalled();
    expect(result.items_with_supplier).toHaveLength(1);
    expect(result.items_without_supplier).toHaveLength(1);
    expect(result.summary).toEqual({
      total_purchasable_items: 2,
      items_with_supplier_count: 1,
      items_without_supplier_count: 1,
      coverage_percent: 50
    });
  });

  it('includes product category in supplier coverage when workflow mode is MSME', async () => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'msme' }
    });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId: 'tenant-msme-coverage' });

    const Item = {
      findAll: jest.fn().mockResolvedValue([])
    };
    const Supplier = {};
    const SupplierItem = {
      findAll: jest.fn().mockResolvedValue([])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'Supplier') return Supplier;
      if (name === 'SupplierItem') return SupplierItem;
      return {};
    });

    await itemRepository.getItemSupplierCoverage();

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.category[Op.in]).toContain('product');
    expect(args.where.category[Op.in]).toContain('supplies');
  });

  it('replaces supplier links for an item deterministically', async () => {
    const itemRecord = { item_id: 77 };
    const Item = { findOne: jest.fn().mockResolvedValue(itemRecord) };
    const Supplier = {
      findAll: jest.fn().mockResolvedValue([
        { supplier_id: 5, name: 'Vendor A' },
        { supplier_id: 9, name: 'Vendor B' }
      ])
    };
    const SupplierItem = {
      destroy: jest.fn().mockResolvedValue(2),
      bulkCreate: jest.fn().mockResolvedValue([])
    };

    const transaction = {
      finished: false,
      commit: jest.fn(async () => {
        transaction.finished = 'commit';
      }),
      rollback: jest.fn(async () => {
        transaction.finished = 'rollback';
      })
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'Supplier') return Supplier;
      if (name === 'SupplierItem') return SupplierItem;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    const result = await itemRepository.replaceItemSuppliers(77, [
      { supplier_id: 5, moq: 2, price_per_unit: 10.5 },
      { supplier_id: 9, moq: 4, price_per_unit: 10.2 }
    ]);

    expect(sequelize.transaction).toHaveBeenCalled();
    expect(Item.findOne).toHaveBeenCalled();
    expect(SupplierItem.destroy).toHaveBeenCalledWith({
      where: { item_id: 77 },
      transaction
    });
    expect(SupplierItem.bulkCreate).toHaveBeenCalledWith([
      { item_id: 77, supplier_id: 5, moq: 2, price_per_unit: 10.5 },
      { item_id: 77, supplier_id: 9, moq: 4, price_per_unit: 10.2 }
    ], { transaction });
    expect(transaction.commit).toHaveBeenCalled();
    expect(result).toEqual({
      item_id: 77,
      supplier_count: 2,
      suppliers: [
        { supplier_id: 5, supplier_name: 'Vendor A', moq: 2, price_per_unit: 10.5 },
        { supplier_id: 9, supplier_name: 'Vendor B', moq: 4, price_per_unit: 10.2 }
      ]
    });
  });

  it('blocks deleteItem when referenced by active records and returns detailed reasons', async () => {
    const itemRecord = {
      name: 'Sugar',
      update: jest.fn()
    };
    const Item = { findOne: jest.fn().mockResolvedValue(itemRecord) };
    const ProductComposition = {
      findAll: jest.fn().mockResolvedValue([
        { product: { name: 'Cake Mix', sku_code: 'PROD-1' } }
      ])
    };
    const POLineItem = {
      findAll: jest.fn().mockResolvedValue([
        { purchaseOrder: { po_number: 'PO-100', status: 'open' } }
      ])
    };
    const JOIngredient = {
      findAll: jest.fn().mockResolvedValue([
        { jobOrder: { jo_number: 'JO-500', status: 'in_progress' } }
      ])
    };
    const PurchaseOrder = {};
    const JobOrder = {};

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'POLineItem') return POLineItem;
      if (name === 'PurchaseOrder') return PurchaseOrder;
      if (name === 'JOIngredient') return JOIngredient;
      if (name === 'JobOrder') return JobOrder;
      return {};
    });

    await expect(itemRepository.deleteItem(88, 7)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Cannot delete item "Sugar"'),
      details: [
        'Used as ingredient in 1 active product(s): Cake Mix (PROD-1)',
        'Referenced in 1 purchase order(s): PO-100 (open)',
        'Referenced in 1 job order(s): JO-500 (in_progress)'
      ]
    });

    expect(itemRecord.update).not.toHaveBeenCalled();
  });

  it('soft-deletes item with audit fields when delete checks pass', async () => {
    const itemRecord = {
      name: 'Salt',
      update: jest.fn().mockResolvedValue(true)
    };
    const Item = { findOne: jest.fn().mockResolvedValue(itemRecord) };
    const ProductComposition = { findAll: jest.fn().mockResolvedValue([]) };
    const POLineItem = { findAll: jest.fn().mockResolvedValue([]) };
    const JOIngredient = { findAll: jest.fn().mockResolvedValue([]) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const sequelize = {
      transaction: jest.fn(async (callback) => callback(transaction))
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-delete-item' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      if (name === 'POLineItem') return POLineItem;
      if (name === 'PurchaseOrder') return {};
      if (name === 'JOIngredient') return JOIngredient;
      if (name === 'JobOrder') return {};
      return {};
    });

    const result = await itemRepository.deleteItem(99, 42);

    expect(result).toBe(true);
    const updatePayload = itemRecord.update.mock.calls[0][0];
    expect(updatePayload).toMatchObject({
      status: 'inactive',
      deleted_by: 42
    });
    expect(updatePayload.deleted_at).toBeInstanceOf(Date);
    expect(itemRecord.update.mock.calls[0][1]).toEqual({ transaction });
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
  });

  it('restores a deleted item to active and clears deleted_at/deleted_by (#1495 Part A)', async () => {
    const itemRecord = {
      item_id: 55,
      name: 'Flour',
      sku_code: 'FLOUR-001',
      status: 'inactive',
      deleted_at: new Date('2026-08-01T00:00:00Z'),
      update: jest.fn().mockResolvedValue(true)
    };
    const Item = { findOne: jest.fn().mockResolvedValue(itemRecord) };
    const AuditLog = { create: jest.fn().mockResolvedValue({}) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const sequelize = { transaction: jest.fn(async (callback) => callback(transaction)) };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 55, name: 'Flour', status: 'active' });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-restore-item' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'AuditLog') return AuditLog;
      return {};
    });

    const result = await itemRepository.restoreItem(55, 42);

    expect(Item.findOne).toHaveBeenCalledWith({
      where: { item_id: 55 },
      transaction,
      lock: 'UPDATE'
    });
    expect(itemRecord.update).toHaveBeenCalledWith({
      status: 'active',
      deleted_by: null,
      deleted_at: null
    }, { transaction });
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESTORE',
        event_type: 'item_restored',
        changes: expect.objectContaining({
          item_id: 55,
          item_name: 'Flour',
          sku_code: 'FLOUR-001',
          previous_status: 'inactive',
          status: 'active'
        })
      }),
      { transaction }
    );
    expect(result).toEqual({ item_id: 55, name: 'Flour', status: 'active' });
  });

  it('rejects restore with 400 when the item is not currently deleted (#1495 Part A)', async () => {
    // deleted_at is null even though status is 'inactive' -- e.g. deactivated via a plain PUT
    // rather than through deleteItem. Gating on status alone would incorrectly accept this.
    const itemRecord = { item_id: 56, name: 'Sugar', status: 'inactive', deleted_at: null, update: jest.fn() };
    const Item = { findOne: jest.fn().mockResolvedValue(itemRecord) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const sequelize = { transaction: jest.fn(async (callback) => callback(transaction)) };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-restore-not-deleted' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await expect(itemRepository.restoreItem(56, 42)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Item is not deleted'
    });
    expect(itemRecord.update).not.toHaveBeenCalled();
  });

  it('rejects restore with 404 when the item does not exist (#1495 Part A)', async () => {
    const Item = { findOne: jest.fn().mockResolvedValue(null) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const sequelize = { transaction: jest.fn(async (callback) => callback(transaction)) };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-restore-missing' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await expect(itemRepository.restoreItem(999, 42)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('normalizes an active_sku_code collision into a friendly 409 on restore (#1495 Part A)', async () => {
    const itemRecord = {
      item_id: 57,
      name: 'Conflicting Item',
      sku_code: 'DUP-001',
      status: 'inactive',
      deleted_at: new Date('2026-08-01T00:00:00Z'),
      update: jest.fn().mockRejectedValue({
        name: 'SequelizeUniqueConstraintError',
        parent: { constraint: 'uq_items_active_sku_code' }
      })
    };
    const Item = { findOne: jest.fn().mockResolvedValue(itemRecord) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const sequelize = { transaction: jest.fn(async (callback) => callback(transaction)) };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-restore-sku-conflict' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await expect(itemRepository.restoreItem(57, 42)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Item with this SKU code already exists'
    });
  });

  it('creates item with fifo initial stock via stock movement', async () => {
    const itemRecord = { item_id: 1001 };
    const Item = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(itemRecord)
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 1001, name: 'Milk' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 1 });
    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-create-fifo' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    const result = await itemRepository.createItem({
      status: 'active',
      category: 'raw_material',
      sku_code: 'MILK-001',
      name: 'Milk',
      fifo_enabled: true,
      current_stock: 12
    }, 5);

    expect(Item.findOne).toHaveBeenCalledWith({
      where: {
        sku_code: 'MILK-001',
        deleted_at: null,
        status: { [Op.notIn]: ['draft', 'inactive'] }
      }
    });

    expect(Item.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        category: 'raw_material',
        sku_code: 'MILK-001',
        name: 'Milk',
        fifo_enabled: true,
        current_stock: 0
      }),
      { transaction }
    );

    expect(inventoryRepositoryDependencies.createStockMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: 1001,
        quantity: 12,
        movement_type: 'adjustment',
        reference_type: 'MANUAL'
      }),
      5,
      transaction
    );
    expect(inventoryRepositoryDependencies.syncItemEmbedding).toHaveBeenCalledWith(itemRecord);
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(result).toEqual({ item_id: 1001, name: 'Milk' });
  });

  it('persists an explicitly POS-scoped manufacturer GTIN in the item transaction', async () => {
    const itemRecord = { item_id: 1004, name: 'POS GTIN Item', sku_code: 'POS-GTIN-001', status: 'active', category: 'product' };
    const Item = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(itemRecord)
    };
    const barcodeRecord = { item_barcode_id: 44, item_id: 1004 };
    const ItemBarcode = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(barcodeRecord)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 1004, name: 'POS GTIN Item' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 1 });
    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-pos-gtin' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemBarcode') return ItemBarcode;
      if (name === 'AuditLog') return null;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.createItem({
      status: 'active',
      category: 'product',
      product_type: 'finished_goods',
      sku_code: 'POS-GTIN-001',
      name: 'POS GTIN Item',
      manufacturer_barcode: { code: '4006381333931', scope: 'pos' }
    }, 5);

    expect(ItemBarcode.create).toHaveBeenCalledWith(expect.objectContaining({
      item_id: 1004,
      code: '4006381333931',
      source: 'manufacturer',
      scope: 'pos',
      is_primary: true,
      is_active: true
    }), { transaction });
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('creates an admin-requested category in the same transaction as a new item', async () => {
    const itemRecord = { item_id: 1002 };
    const folderRecord = { folder_id: 12, name: 'Seasonal Drinks', is_active: true };
    const Item = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(itemRecord)
    };
    const ItemFolder = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(folderRecord)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 1002, folder_id: 12, product_folder: 'Seasonal Drinks' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 1 });
    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-inline-category' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.createItem({
      status: 'active',
      category: 'product',
      product_type: 'finished_goods',
      sku_code: 'SEASON-001',
      name: 'Summer Tea',
      create_category_name: '  Seasonal   Drinks  '
    }, 7, { canManageCategories: true });

    expect(ItemFolder.create).toHaveBeenCalledWith({
      name: 'Seasonal Drinks',
      description: '',
      show_in_pos_filter: true,
      is_active: true,
      parent_id: null
    }, { transaction });
    expect(Item.create).toHaveBeenCalledWith(expect.objectContaining({
      folder_id: 12,
      product_folder: 'Seasonal Drinks'
    }), { transaction });
    expect(Item.create.mock.calls[0][0]).not.toHaveProperty('create_category_name');
    expect(transaction.commit).toHaveBeenCalled();
  });

  it('reuses an active category case-insensitively and rejects inline creation by non-admin users', async () => {
    const Item = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ item_id: 1003 }) };
    const existingFolder = { folder_id: 13, name: 'Mains', is_active: true };
    const ItemFolder = { findAll: jest.fn().mockResolvedValue([existingFolder]), create: jest.fn() };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 1003, folder_id: 13 });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 1 });
    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-inline-category-reuse' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.createItem({
      status: 'active', category: 'product', product_type: 'finished_goods', sku_code: 'MAIN-001', name: 'Rice Bowl', create_category_name: 'mAiNs'
    }, 7, { canManageCategories: true });
    expect(ItemFolder.create).not.toHaveBeenCalled();
    expect(Item.create).toHaveBeenCalledWith(expect.objectContaining({ folder_id: 13, product_folder: 'Mains' }), { transaction });

    await expect(itemRepository.createItem({
      status: 'active', category: 'product', product_type: 'finished_goods', sku_code: 'NOADMIN-001', name: 'No Admin', create_category_name: 'New Category'
    }, 8, { canManageCategories: false })).rejects.toMatchObject({
      statusCode: 403,
      message: 'Admin access is required to create a category while adding an item.'
    });
  });

  it('creates a ServiceItemDetail row when creating a service-category item', async () => {
    const itemRecord = { item_id: 3003 };
    const Item = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(itemRecord)
    };
    const ServiceItemDetail = {
      create: jest.fn().mockResolvedValue({ service_detail_id: 1, item_id: 3003 })
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 3003, category: 'service' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 1 });
    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-create-service' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ServiceItemDetail') return ServiceItemDetail;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.createItem({
      status: 'active',
      category: 'service',
      sku_code: 'SVC-001',
      name: 'Computer Repair',
      unit_of_measure: 'service',
      default_sale_price: 5000,
      current_stock: 100
    }, 7);

    expect(ServiceItemDetail.create).toHaveBeenCalledWith(
      { item_id: 3003 },
      { transaction }
    );
    expect(inventoryRepositoryDependencies.createStockMovement).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('does not create a ServiceItemDetail row for non-service items', async () => {
    const itemRecord = { item_id: 4004 };
    const Item = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(itemRecord)
    };
    const ServiceItemDetail = {
      create: jest.fn().mockResolvedValue({})
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 4004, category: 'product' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 1 });
    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-create-product' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ServiceItemDetail') return ServiceItemDetail;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.createItem({
      status: 'active',
      category: 'product',
      product_type: 'finished_goods',
      sku_code: 'PROD-001',
      name: 'Widget'
    }, 7);

    expect(ServiceItemDetail.create).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalled();
  });

  it('creates draft item without sku uniqueness check and stores wizard metadata', async () => {
    const itemRecord = { item_id: 2002, status: 'draft' };
    const Item = {
      findOne: jest.fn().mockResolvedValue({ item_id: 999 }),
      create: jest.fn().mockResolvedValue(itemRecord)
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 2002, status: 'draft' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 2 });
    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-create-draft' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.createItem({
      status: 'draft',
      category: 'product',
      sku_code: 'DR-001',
      name: 'Draft Product',
      labor_cost: 5,
      ingredients: [{ item_id: 1, quantity: 2 }]
    }, 11);

    expect(Item.findOne).not.toHaveBeenCalled();
    const createPayload = Item.create.mock.calls[0][0];
    expect(createPayload.wizard_metadata).toMatchObject({
      labor_cost: 5,
      ingredients: [{ item_id: 1, quantity: 2 }]
    });
    expect(inventoryRepositoryDependencies.createStockMovement).not.toHaveBeenCalled();
  });

  it('returns conflict when createItem sku already exists and rolls back', async () => {
    const Item = {
      findOne: jest.fn().mockResolvedValue({ item_id: 100 }),
      create: jest.fn()
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-create-conflict' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.createItem({
      status: 'active',
      category: 'raw_material',
      sku_code: 'DUP-1',
      name: 'Duplicate'
    }, 12)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Item with this SKU code already exists'
    });

    expect(Item.create).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('maps DB unique-constraint errors to a stable 409 conflict on createItem', async () => {
    const Item = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue({
        name: 'SequelizeUniqueConstraintError',
        fields: { active_sku_code: 'DUP-DB-1' },
        errors: [{ path: 'active_sku_code' }]
      })
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-create-db-constraint' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.createItem({
      status: 'active',
      category: 'raw_material',
      sku_code: ' DUP-DB-1 ',
      name: 'Duplicate DB Constraint'
    }, 12)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Item with this SKU code already exists'
    });

    expect(Item.create).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('enforces MSME pricing requirements on create for non-draft items', async () => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'msme' }
    });

    const Item = {
      findOne: jest.fn(),
      create: jest.fn()
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-create-msme-pricing' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.createItem({
      status: 'active',
      category: 'supplies',
      sku_code: 'MSME-001',
      name: 'Soap',
      cost_per_unit: 12.5,
      default_sale_price: null
    }, 12)).rejects.toMatchObject({
      statusCode: 422,
      message: 'default_sale_price is required for MSME items'
    });

    expect(Item.findOne).not.toHaveBeenCalled();
    expect(Item.create).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('finalizes a draft item and returns reloaded associations', async () => {
    const draftItem = {
      item_id: 3003,
      status: 'draft',
      wizard_metadata: {},
      sku_code: 'DRF-3003',
      name: 'Draft Product',
      category: 'product',
      description: 'desc',
      product_folder: null,
      max_capacity: 100,
      min_threshold: 20,
      purchase_allowance: 10,
      unit_of_measure: 'kg',
      cost_per_unit: 1.5,
      current_stock: 0,
      fifo_enabled: true,
      batch_size: 10,
      yield_percentage: 90,
      processing_loss: 5,
      production_notes: 'note',
      update: jest.fn().mockResolvedValue(true)
    };
    const finalized = { item_id: 3003, status: 'active', productCompositions: [] };
    const Item = {
      findOne: jest.fn()
        .mockResolvedValueOnce(draftItem)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(finalized)
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-finalize-success' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      if (name === 'ItemNutrition') return {};
      if (name === 'ItemAllergen') return {};
      if (name === 'ItemPhysicalProperties') return {};
      if (name === 'ItemShelfLife') return {};
      if (name === 'ItemPackaging') return {};
      if (name === 'ItemQualityControl') return {};
      if (name === 'ItemRegulatoryCompliance') return {};
      if (name === 'ItemCostBreakdown') return {};
      if (name === 'FIFOBatch') return {};
      if (name === 'ProductComposition') return {};
      return {};
    });

    const result = await itemRepository.finalizeItem(3003, {}, 6);

    expect(draftItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        wizard_metadata: null,
        updated_by: 6
      }),
      { transaction }
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(inventoryRepositoryDependencies.syncItemEmbedding).toHaveBeenCalledWith(draftItem);
    expect(result).toBe(finalized);
  });

  it('clears manufacturing-only side-table rows when finalizing an F&B product draft', async () => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'fnb' }
    });
    const draftItem = {
      item_id: 3303,
      status: 'draft',
      wizard_metadata: {
        physical_properties: { texture: 'Liquid' },
        quality_control: { test_frequency: 'Daily' }
      },
      sku_code: 'FNB-DRAFT',
      name: 'Draft Iced Tea',
      category: 'product',
      product_type: 'finished_goods',
      vat_type: 'vatable',
      description: 'desc',
      product_folder: null,
      max_capacity: 100,
      min_threshold: 20,
      purchase_allowance: 10,
      unit_of_measure: 'serving',
      cost_per_unit: 1.5,
      current_stock: 0,
      fifo_enabled: true,
      batch_size: 10,
      yield_percentage: 90,
      processing_loss: 5,
      production_notes: 'note',
      update: jest.fn().mockResolvedValue(true)
    };
    const finalized = { item_id: 3303, status: 'active', productCompositions: [] };
    const Item = {
      findOne: jest.fn()
        .mockResolvedValueOnce(draftItem)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(finalized)
    };
    const ItemPhysicalProperties = {
      destroy: jest.fn().mockResolvedValue(1)
    };
    const ItemQualityControl = {
      destroy: jest.fn().mockResolvedValue(1)
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    inventoryRepositoryDependencies.syncItemEmbedding = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-finalize-fnb-clear' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      if (name === 'ItemNutrition') return {};
      if (name === 'ItemAllergen') return {};
      if (name === 'ItemPhysicalProperties') return ItemPhysicalProperties;
      if (name === 'ItemShelfLife') return {};
      if (name === 'ItemPackaging') return {};
      if (name === 'ItemQualityControl') return ItemQualityControl;
      if (name === 'ItemRegulatoryCompliance') return {};
      if (name === 'ItemCostBreakdown') return {};
      if (name === 'FIFOBatch') return {};
      if (name === 'ProductComposition') return {};
      return {};
    });

    await itemRepository.finalizeItem(3303, {
      physical_properties: {},
      quality_control: {}
    }, 6);

    expect(ItemPhysicalProperties.destroy).toHaveBeenCalledWith({
      where: { item_id: 3303 },
      transaction
    });
    expect(ItemQualityControl.destroy).toHaveBeenCalledWith({
      where: { item_id: 3303 },
      transaction
    });
    expect(draftItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        wizard_metadata: null,
        updated_by: 6
      }),
      { transaction }
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('blocks finalize when item is not in draft status', async () => {
    const Item = {
      findOne: jest.fn().mockResolvedValue({ status: 'active' })
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-finalize-notdraft' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.finalizeItem(4004, {}, 2)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Only draft items can be finalized'
    });

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('validates required finalize fields from merged draft data', async () => {
    const Item = {
      findOne: jest.fn().mockResolvedValue({
        status: 'draft',
        wizard_metadata: {},
        sku_code: null,
        category: 'product',
        max_capacity: 100,
        unit_of_measure: 'kg'
      })
    };
    const transaction = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-finalize-required' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.finalizeItem(5005, {}, 2)).rejects.toMatchObject({
      statusCode: 422,
      message: 'SKU code is required to finalize item'
    });

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('updates FIFO items using stock movement when current stock changes', async () => {
    const updateSpy = jest.fn().mockResolvedValue(true);
    const itemRecord = {
      item_id: 15,
      sku_code: 'SKU-001',
      current_stock: 10,
      fifo_enabled: true,
      status: 'active',
      category: 'raw_material',
      wizard_metadata: null,
      update: updateSpy
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(itemRecord)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 15, name: 'Flour' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 123 });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-update-fifo' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    const result = await itemRepository.updateItem(15, {
      name: 'Flour',
      current_stock: 25
    }, 7);

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Flour',
        updated_by: 7
      }),
      { transaction }
    );
    const firstUpdatePayload = updateSpy.mock.calls[0][0];
    expect(firstUpdatePayload.current_stock).toBeUndefined();

    expect(inventoryRepositoryDependencies.createStockMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: 15,
        quantity: 15,
        movement_type: 'adjustment',
        reference_type: 'MANUAL'
      }),
      7,
      transaction
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(result).toEqual({ item_id: 15, name: 'Flour' });
  });

  it('clears manufacturing-only side-table rows when updating an F&B product with empty wizard fields', async () => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'fnb' }
    });
    const updateSpy = jest.fn().mockResolvedValue(true);
    const itemRecord = {
      item_id: 515,
      sku_code: 'FNB-515',
      current_stock: 0,
      fifo_enabled: true,
      status: 'active',
      category: 'product',
      wizard_metadata: null,
      update: updateSpy
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(itemRecord)
    };
    const ItemPhysicalProperties = {
      destroy: jest.fn().mockResolvedValue(1)
    };
    const ItemQualityControl = {
      destroy: jest.fn().mockResolvedValue(1)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 515, name: 'Iced Tea' });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-fnb-clear-manufacturing' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      if (name === 'ItemPhysicalProperties') return ItemPhysicalProperties;
      if (name === 'ItemQualityControl') return ItemQualityControl;
      return {};
    });

    await itemRepository.updateItem(515, {
      status: 'active',
      category: 'product',
      physical_properties: {},
      quality_control: {}
    }, 7);

    expect(ItemPhysicalProperties.destroy).toHaveBeenCalledWith({
      where: { item_id: 515 },
      transaction
    });
    expect(ItemQualityControl.destroy).toHaveBeenCalledWith({
      where: { item_id: 515 },
      transaction
    });
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('does not clear manufacturing side-table rows for non-F&B product updates with empty wizard fields', async () => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'food_manufacturing' }
    });
    const itemRecord = {
      item_id: 516,
      sku_code: 'MFG-516',
      current_stock: 0,
      fifo_enabled: true,
      status: 'active',
      category: 'product',
      wizard_metadata: null,
      update: jest.fn().mockResolvedValue(true)
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(itemRecord)
    };
    const ItemPhysicalProperties = {
      destroy: jest.fn().mockResolvedValue(1)
    };
    const ItemQualityControl = {
      destroy: jest.fn().mockResolvedValue(1)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 516, name: 'Sauce Batch' });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-non-fnb-keeps-manufacturing' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      if (name === 'ItemPhysicalProperties') return ItemPhysicalProperties;
      if (name === 'ItemQualityControl') return ItemQualityControl;
      return {};
    });

    await itemRepository.updateItem(516, {
      status: 'active',
      category: 'product',
      physical_properties: {},
      quality_control: {}
    }, 7);

    expect(ItemPhysicalProperties.destroy).not.toHaveBeenCalled();
    expect(ItemQualityControl.destroy).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('uses selected location stock as baseline when updating stock with location_id', async () => {
    const updateSpy = jest.fn().mockResolvedValue(true);
    const itemRecord = {
      item_id: 115,
      sku_code: 'SKU-115',
      current_stock: 100,
      fifo_enabled: true,
      status: 'active',
      category: 'raw_material',
      wizard_metadata: null,
      update: updateSpy
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(itemRecord)
    };
    const ItemLocationStock = {
      findOne: jest.fn().mockResolvedValue({
        item_id: 115,
        location_id: 9,
        quantity_on_hand: 40
      })
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 115, name: 'Sugar' });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 321 });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-update-location-baseline' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemLocationStock') return ItemLocationStock;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.updateItem(115, {
      current_stock: 55,
      location_id: 9
    }, 3);

    expect(ItemLocationStock.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { item_id: 115, location_id: 9 },
      transaction
    }));
    expect(inventoryRepositoryDependencies.createStockMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: 115,
        quantity: 15,
        movement_type: 'adjustment',
        location_id: 9
      }),
      3,
      transaction
    );
  });

  it('recalculates thresholds when max_capacity changes', async () => {
    const updateSpy = jest.fn().mockResolvedValue(true);
    const itemRecord = {
      item_id: 16,
      sku_code: 'SKU-002',
      current_stock: 5,
      fifo_enabled: false,
      status: 'active',
      category: 'raw_material',
      wizard_metadata: null,
      update: updateSpy
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(itemRecord)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(itemRepository, 'getItemById').mockResolvedValue({ item_id: 16, name: 'Salt' });
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      enable_auto_reorder: { value: true },
      min_stock_threshold_percent: { value: 25 },
      purchase_allowance_percent: { value: 10 }
    });
    inventoryRepositoryDependencies.createStockMovement = jest.fn().mockResolvedValue({ movement_id: 999 });
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-update-thresholds' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await itemRepository.updateItem(16, { max_capacity: 200 }, 8);

    const updatePayload = updateSpy.mock.calls[0][0];
    expect(updatePayload).toMatchObject({
      max_capacity: 200,
      min_threshold: 50,
      purchase_allowance: 20,
      updated_by: 8
    });
    expect(inventoryRepositoryDependencies.createStockMovement).not.toHaveBeenCalled();
  });

  it('returns conflict when sku already exists and rolls back', async () => {
    const itemRecord = {
      item_id: 17,
      sku_code: 'OLD-SKU',
      current_stock: 1,
      fifo_enabled: false,
      status: 'active',
      category: 'raw_material',
      wizard_metadata: null,
      update: jest.fn()
    };
    const Item = {
      findOne: jest.fn()
        .mockResolvedValueOnce(itemRecord)
        .mockResolvedValueOnce({ item_id: 99 })
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-update-conflict' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.updateItem(17, { sku_code: 'NEW-SKU' }, 9)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Item with this SKU code already exists'
    });

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('maps DB unique-constraint errors to a stable 409 conflict on updateItem', async () => {
    const itemRecord = {
      item_id: 170,
      sku_code: 'OLD-SKU',
      current_stock: 1,
      fifo_enabled: false,
      status: 'active',
      category: 'raw_material',
      wizard_metadata: null,
      update: jest.fn().mockRejectedValue({
        name: 'SequelizeUniqueConstraintError',
        fields: { active_sku_code: 'NEW-SKU' },
        errors: [{ path: 'active_sku_code' }]
      })
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(itemRecord)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-update-db-constraint' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.updateItem(170, { sku_code: 'NEW-SKU' }, 9)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Item with this SKU code already exists'
    });

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('enforces MSME pricing requirements on update when final payload is incomplete', async () => {
    inventoryRepositoryDependencies.getAllSettings = jest.fn().mockResolvedValue({
      ops_workflow_mode: { value: 'msme' }
    });

    const itemRecord = {
      item_id: 18,
      sku_code: 'MSME-UPD-18',
      current_stock: 1,
      fifo_enabled: false,
      status: 'active',
      category: 'supplies',
      cost_per_unit: null,
      default_sale_price: null,
      wizard_metadata: null,
      update: jest.fn()
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(itemRecord)
    };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
      finished: null
    };
    const sequelize = {
      transaction: jest.fn().mockResolvedValue(transaction)
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize, tenantId: 'tenant-update-msme-pricing' });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.updateItem(18, { name: 'Updated MSME Item' }, 9)).rejects.toMatchObject({
      statusCode: 422,
      message: 'cost_per_unit is required for MSME items'
    });

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('lists folders with every assigned item so deletion requirements match the displayed count', async () => {
    const ItemFolder = {
      findAll: jest.fn().mockResolvedValue([
        {
          folder_id: 1,
          name: 'Raw Materials',
          description: 'Core inputs',
          parent_id: null,
          is_active: true,
          items: [{ item_id: 10 }, { item_id: 11 }]
        },
        {
          folder_id: 2,
          name: 'Packaging',
          description: '',
          parent_id: null,
          is_active: false,
          items: []
        }
      ])
    };
    const Item = {};

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      return {};
    });

    const result = await itemRepository.listFolders();

    const args = ItemFolder.findAll.mock.calls[0][0];
    expect(args.include[0].model).toBe(Item);
    expect(args.include[0].as).toBe('items');
    expect(args.include[0].where).toMatchObject({ deleted_at: null });
    expect(result).toEqual([
        {
          folder_id: 1,
          name: 'Raw Materials',
          description: 'Core inputs',
          show_in_pos_filter: true,
          is_active: true,
          parent_id: null,
          item_count: 2,
          secondary_item_count: 0,
          sort_order: 0
        },
        {
          folder_id: 2,
          name: 'Packaging',
          description: '',
          show_in_pos_filter: true,
          is_active: false,
          parent_id: null,
          item_count: 0,
          secondary_item_count: 0,
          sort_order: 0
        }
    ]);
  });

  it('lists folders with a secondary_item_count for items that only list a folder as a secondary category', async () => {
    const ItemFolder = {
      findAll: jest.fn().mockResolvedValue([
        {
          folder_id: 1,
          name: 'Raw Materials',
          description: 'Core inputs',
          parent_id: null,
          is_active: true,
          // item 10 is primarily assigned here.
          items: [{ item_id: 10 }]
        },
        {
          folder_id: 2,
          name: 'Packaging',
          description: '',
          parent_id: null,
          is_active: true,
          items: []
        }
      ])
    };
    const membershipFindAll = jest.fn().mockResolvedValue([
      // item 20 lists folder 1 only as a secondary category.
      { item_id: 20, folder_id: 1 },
      // item 10's primary is already folder 1 -- must not be double-counted here.
      { item_id: 10, folder_id: 1 }
    ]);
    const itemFindAll = jest.fn().mockResolvedValue([{ item_id: 20 }, { item_id: 10 }]);
    const Item = { findAll: itemFindAll };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      return {};
    });

    const result = await itemRepository.listFolders();

    expect(membershipFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { folder_id: { [Op.in]: [1, 2] } }
    }));
    expect(result.find((folder) => folder.folder_id === 1)).toMatchObject({ item_count: 1, secondary_item_count: 1 });
    expect(result.find((folder) => folder.folder_id === 2)).toMatchObject({ item_count: 0, secondary_item_count: 0 });
  });

  it('creates folder and normalizes unique constraint errors', async () => {
    const ItemFolder = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        folder_id: 44,
        name: 'Dry Goods',
        description: 'Shelf stable',
        parent_id: null,
        show_in_pos_filter: true,
        is_active: true
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      return {};
    });

    const result = await itemRepository.createFolder('Dry Goods', 'Shelf stable');
    expect(result).toEqual({
      success: true,
      folder_id: 44,
      name: 'Dry Goods',
      description: 'Shelf stable',
      parent_id: null,
      show_in_pos_filter: true,
      is_active: true,
      sort_order: 0,
      message: 'Inventory folder "Dry Goods" created successfully'
    });

    ItemFolder.create.mockRejectedValueOnce({ name: 'SequelizeUniqueConstraintError' });
    await expect(itemRepository.createFolder('Dry Goods')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CATEGORY_EXISTS',
      message: 'Category "Dry Goods" already exists.'
    });
  });

  it('allows recreating a category name when only an inactive category has that name', async () => {
    const inactiveFolder = { folder_id: 17, name: 'Mains', is_active: false, deleted_at: null };
    const ItemFolder = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        folder_id: 18,
        name: 'Mains',
        description: '',
        parent_id: null,
        show_in_pos_filter: true,
        is_active: true
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => (name === 'ItemFolder' ? ItemFolder : {}));

    await expect(itemRepository.createFolder('Mains')).resolves.toMatchObject({ folder_id: 18, name: 'Mains' });
    expect(ItemFolder.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ deleted_at: null })
    }));
    expect(inactiveFolder.is_active).toBe(false);
  });

  it('reorders every current category atomically', async () => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const ItemFolder = {
      findAll: jest.fn().mockResolvedValue([{ folder_id: 1 }, { folder_id: 2 }, { folder_id: 3 }]),
      update: jest.fn().mockResolvedValue([1])
    };
    jest.spyOn(dbStore, 'get').mockImplementation((name) => (name === 'ItemFolder' ? ItemFolder : {}));
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: { transaction: jest.fn().mockResolvedValue(transaction) } });

    await expect(itemRepository.reorderFolders([3, 1, 2])).resolves.toEqual({ success: true, folder_ids: [3, 1, 2] });
    expect(ItemFolder.update).toHaveBeenNthCalledWith(1, { sort_order: 0 }, { where: { folder_id: 3 }, transaction });
    expect(ItemFolder.update).toHaveBeenNthCalledWith(3, { sort_order: 2 }, { where: { folder_id: 2 }, transaction });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale category reorder without writing partial positions', async () => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const ItemFolder = { findAll: jest.fn().mockResolvedValue([{ folder_id: 1 }, { folder_id: 2 }]), update: jest.fn() };
    jest.spyOn(dbStore, 'get').mockImplementation((name) => (name === 'ItemFolder' ? ItemFolder : {}));
    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: { transaction: jest.fn().mockResolvedValue(transaction) } });

    await expect(itemRepository.reorderFolders([2])).rejects.toMatchObject({ statusCode: 409, code: 'CATEGORY_ORDER_STALE' });
    expect(ItemFolder.update).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('deletes an unassigned folder without altering item records', async () => {
    const folder = {
      folder_id: 7,
      name: 'Legacy Folder',
      update: jest.fn().mockResolvedValue(true)
    };
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue(folder)
    };
    const Item = {
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn()
    };
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    const result = await itemRepository.deleteFolder(7);

    expect(Item.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ folder_id: 7, deleted_at: null }), transaction }));
    expect(Item.update).not.toHaveBeenCalled();
    expect(folder.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false, deleted_at: expect.any(Date) }), { transaction });
    expect(transaction.commit).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      replacement_folder_id: null,
      items_moved: 0,
      secondary_items_affected: 0,
      message: 'Category "Legacy Folder" deleted successfully.'
    });
  });

  it('counts an item that only lists the deleted folder as a secondary category, without double-counting a primary item that also has a stray membership row', async () => {
    const folder = { folder_id: 7, name: 'Mains', update: jest.fn().mockResolvedValue(true) };
    const replacementFolder = { folder_id: 8, name: 'Rice Meals', is_active: true };
    const ItemFolder = {
      findByPk: jest.fn().mockImplementation((folderId) => Promise.resolve(Number(folderId) === 7 ? folder : replacementFolder))
    };
    // item 12 is the folder's one primary assignment; item 12 also has a
    // (legal per ADR 0080 clause 2) overlapping secondary membership row for
    // the same folder, and item 20 has ONLY a secondary membership here.
    const Item = {
      findAll: jest.fn()
        .mockResolvedValueOnce([{ item_id: 12 }]) // primary assignedItems query
        .mockResolvedValueOnce([{ item_id: 20 }]), // visibility check for secondary candidates (item 12 excluded as overlap)
      update: jest.fn().mockResolvedValue([1])
    };
    const membershipFindAll = jest.fn().mockResolvedValue([
      { item_id: 20, folder_id: 7 },
      { item_id: 12, folder_id: 7 }
    ]);
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (name === 'sequelize') return sequelize;
      return {};
    });

    const result = await itemRepository.deleteFolder(7, 8);

    expect(membershipFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { folder_id: { [Op.in]: [7] } },
      transaction
    }));
    // Only item 20 should have reached the visibility check -- item 12 was
    // already excluded as an overlap with the primary set.
    expect(Item.findAll).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ item_id: { [Op.in]: [20] } }),
      transaction
    }));
    expect(result).toEqual({
      success: true,
      replacement_folder_id: 8,
      items_moved: 1,
      secondary_items_affected: 1,
      message: 'Category "Mains" deleted and 1 item(s) moved to "Rice Meals". 1 item(s) also list this as a secondary category and will lose that link.'
    });
  });

  it('does not count an item as secondary when it has no membership row for the deleted folder', async () => {
    const folder = {
      folder_id: 7,
      name: 'Legacy Folder',
      update: jest.fn().mockResolvedValue(true)
    };
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue(folder)
    };
    const Item = {
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn()
    };
    // No membership rows at all for folder 7 -- an item that merely exists
    // elsewhere must never contribute to this folder's secondary count.
    const membershipFindAll = jest.fn().mockResolvedValue([]);
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (name === 'sequelize') return sequelize;
      return {};
    });

    const result = await itemRepository.deleteFolder(7);

    expect(result).toEqual({
      success: true,
      replacement_folder_id: null,
      items_moved: 0,
      secondary_items_affected: 0,
      message: 'Category "Legacy Folder" deleted successfully.'
    });
  });

  it('reassigns assigned items to an active category before deleting the source category', async () => {
    const folder = { folder_id: 7, name: 'Mains', update: jest.fn().mockResolvedValue(true) };
    const replacementFolder = { folder_id: 8, name: 'Rice Meals', is_active: true };
    const ItemFolder = {
      findByPk: jest.fn().mockImplementation((folderId) => Promise.resolve(Number(folderId) === 7 ? folder : replacementFolder))
    };
    const Item = {
      findAll: jest.fn().mockResolvedValue([{ item_id: 12 }, { item_id: 13 }]),
      update: jest.fn().mockResolvedValue([2])
    };
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.deleteFolder(7, 8)).resolves.toEqual({
      success: true,
      replacement_folder_id: 8,
      items_moved: 2,
      secondary_items_affected: 0,
      message: 'Category "Mains" deleted and 2 item(s) moved to "Rice Meals".'
    });
    expect(Item.update).toHaveBeenCalledWith(
      { folder_id: 8, product_folder: 'Rice Meals' },
      expect.objectContaining({ where: { folder_id: 7 }, transaction })
    );
    expect(folder.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false, deleted_at: expect.any(Date) }), { transaction });
  });

  it('requires an active replacement when deleting a folder with assigned items', async () => {
    const folder = { folder_id: 7, name: 'Mains', update: jest.fn() };
    const ItemFolder = { findByPk: jest.fn().mockResolvedValue(folder) };
    const Item = { findAll: jest.fn().mockResolvedValue([{ item_id: 12 }]) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.deleteFolder(7)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CATEGORY_REASSIGNMENT_REQUIRED'
    });
    expect(transaction.rollback).toHaveBeenCalled();
    expect(folder.update).not.toHaveBeenCalled();
  });

  it('includes the secondary-membership count in the reassignment-required error when the folder also has secondary-only items', async () => {
    const folder = { folder_id: 7, name: 'Mains', update: jest.fn() };
    const ItemFolder = { findByPk: jest.fn().mockResolvedValue(folder) };
    const Item = {
      findAll: jest.fn()
        .mockResolvedValueOnce([{ item_id: 12 }]) // primary assignedItems
        .mockResolvedValueOnce([{ item_id: 20 }]) // visibility check for secondary candidate
    };
    const membershipFindAll = jest.fn().mockResolvedValue([{ item_id: 20, folder_id: 7 }]);
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.deleteFolder(7)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CATEGORY_REASSIGNMENT_REQUIRED',
      secondary_items_affected: 1,
      // itemHandlers.js's mapInventoryControllerError only forwards `error.details`
      // into the response body (a bare top-level property is dropped) -- see #1578
      // review RF-1. Asserted here too so a future edit can't silently drop the
      // `.details` mirror while leaving the top-level property intact.
      details: { secondary_items_affected: 1 },
      message: 'Category "Mains" is assigned to 1 item(s). Choose an active replacement category before deleting it. 1 item(s) also list this as a secondary category and will lose that link.'
    });
    expect(transaction.rollback).toHaveBeenCalled();
    expect(folder.update).not.toHaveBeenCalled();
  });

  it('rejects using the source category as its own replacement', async () => {
    const folder = { folder_id: 7, name: 'Mains', update: jest.fn() };
    const ItemFolder = { findByPk: jest.fn().mockResolvedValue(folder) };
    const Item = { findAll: jest.fn().mockResolvedValue([{ item_id: 12 }]) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.deleteFolder(7, 7)).rejects.toMatchObject({
      statusCode: 400,
      code: 'CATEGORY_REASSIGNMENT_INVALID'
    });
    expect(folder.update).not.toHaveBeenCalled();
  });

  it('rejects an inactive replacement category', async () => {
    const folder = { folder_id: 7, name: 'Mains', update: jest.fn() };
    const replacementFolder = { folder_id: 8, name: 'Archived', is_active: false };
    const ItemFolder = {
      findByPk: jest.fn().mockImplementation((folderId) => Promise.resolve(Number(folderId) === 7 ? folder : replacementFolder))
    };
    const Item = { findAll: jest.fn().mockResolvedValue([{ item_id: 12 }]) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.deleteFolder(7, 8)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CATEGORY_REPLACEMENT_INACTIVE'
    });
    expect(folder.update).not.toHaveBeenCalled();
  });

  it('returns 404 when deleting a missing folder', async () => {
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue(null)
    };
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn(), finished: false };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return {};
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await expect(itemRepository.deleteFolder(404)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Folder not found'
    });
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it('updates category lifecycle details and preserves category assignment on rename', async () => {
    const folder = {
      folder_id: 9,
      name: 'Finished Goods',
      description: 'Sellable products',
      parent_id: null,
      show_in_pos_filter: true,
      is_active: true,
      update: jest.fn().mockImplementation(async (updates) => {
        Object.assign(folder, updates);
      })
    };
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue(folder),
      findAll: jest.fn().mockResolvedValue([folder])
    };
    const Item = { update: jest.fn().mockResolvedValue([2]) };
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      finished: null,
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true)
    };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    const result = await itemRepository.updateFolder(9, {
      name: 'Prepared Foods',
      description: 'Ready to sell',
      is_active: false,
      show_in_pos_filter: false
    });

    expect(folder.update).toHaveBeenCalledWith({
      name: 'Prepared Foods',
      description: 'Ready to sell',
      is_active: false,
      show_in_pos_filter: false
    }, { transaction });
    expect(Item.update).toHaveBeenCalledWith(
      { product_folder: 'Prepared Foods' },
      { where: { folder_id: 9 }, transaction }
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      folder_id: 9,
      name: 'Prepared Foods',
      description: 'Ready to sell',
      parent_id: null,
      show_in_pos_filter: false,
      is_active: false,
      message: 'Category "Prepared Foods" updated successfully.'
    });
  });

  it('rejects updateFolder payload without supported fields', async () => {
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue({
        folder_id: 11,
        name: 'Archive',
        update: jest.fn()
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      return {};
    });

    await expect(itemRepository.updateFolder(11, { unsupported: true })).rejects.toMatchObject({
      statusCode: 400,
      message: 'No valid category fields to update'
    });
  });

  describe('ADR 0080 Amendment (Phase 286, #1318) — catalog filter widens to secondary categories', () => {
    const buildItemRows = (items) => items.map((item) => ({ toJSON: () => item }));

    it('widens the folder_id filter to the membership union when secondary members exist', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({
          count: 1,
          rows: buildItemRows([{ item_id: 5, name: 'Latte', folder_id: 10 }])
        })
      };
      const membershipFindAll = jest.fn().mockImplementation(({ where }) => {
        if (where?.folder_id) return Promise.resolve([{ item_id: 5, folder_id: 20 }, { item_id: 6, folder_id: 20 }]);
        if (where?.item_id) return Promise.resolve([{ item_id: 5, folder_id: 30 }]);
        return Promise.resolve([]);
      });
      const ItemFolder = {
        findOne: jest.fn().mockResolvedValue({ folder_id: 20 }),
        findAll: jest.fn().mockResolvedValue([{ folder_id: 30 }])
      };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
        return {};
      });

      const result = await itemRepository.getItems({ folder_id: '20', page: '1', limit: '20' });

      expect(ItemFolder.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { folder_id: 20, is_active: true, deleted_at: null }
      }));
      const args = Item.findAndCountAll.mock.calls[0][0];
      expect(args.where.folder_id).toBeUndefined();
      expect(args.where[Op.and]).toEqual([
        { [Op.or]: [
          { folder_id: '20' },
          { item_id: { [Op.in]: [5, 6] } }
        ] }
      ]);
      expect(result.items[0].secondary_folder_ids).toEqual([30]);
    });

    it('stays primary-only when no secondary members exist for the folder', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] })
      };
      const membershipFindAll = jest.fn().mockResolvedValue([]);
      const ItemFolder = { findOne: jest.fn().mockResolvedValue({ folder_id: 20 }), findAll: jest.fn().mockResolvedValue([]) };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
        return {};
      });

      await itemRepository.getItems({ folder_id: '20', page: '1', limit: '20' });

      const args = Item.findAndCountAll.mock.calls[0][0];
      expect(args.where.folder_id).toBe('20');
      expect(args.where[Op.and]).toBeUndefined();
    });

    it('never queries memberships for the null/none "uncategorized" sentinel', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] })
      };
      const membershipFindAll = jest.fn().mockResolvedValue([]);
      const ItemFolder = { findOne: jest.fn() };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
        return {};
      });

      await itemRepository.getItems({ folder_id: 'none', page: '1', limit: '20' });

      const args = Item.findAndCountAll.mock.calls[0][0];
      expect(args.where.folder_id).toBeNull();
      // The folder_id -> item_id membership lookup (and the folder liveness check that gates
      // it) is only ever attempted for a real numeric folder id, never for the null/none
      // sentinel. attachSecondaryFolderIds still runs afterward, but with zero result rows its
      // own itemIds list is empty, so it also never calls findAll.
      expect(ItemFolder.findOne).not.toHaveBeenCalled();
      expect(membershipFindAll).not.toHaveBeenCalled();
    });

    it('degrades to primary-only, without throwing, when ItemFolderMembership is unavailable on this tenant', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({
          count: 1,
          rows: buildItemRows([{ item_id: 5, name: 'Latte', folder_id: 10 }])
        })
      };
      const ItemFolder = { findOne: jest.fn().mockResolvedValue({ folder_id: 20 }) };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        // Catch-all stub, the same convention already used throughout this test suite for
        // models a given test doesn't care about -- must not be mistaken for "the
        // membership model is available" (it has no .findAll).
        return {};
      });

      const result = await itemRepository.getItems({ folder_id: '20', page: '1', limit: '20' });

      const args = Item.findAndCountAll.mock.calls[0][0];
      expect(args.where.folder_id).toBe('20');
      expect(args.where[Op.and]).toBeUndefined();
      expect(result.items[0].secondary_folder_ids).toEqual([]);
    });

    // --- RF-1: inactive / soft-deleted / mixed folder liveness ---------------------------

    it('RF-1: returns zero rows for an inactive requested folder, never a primary-only fallback', async () => {
      const Item = { findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] }) };
      const membershipFindAll = jest.fn();
      // Active-only query for folder_id 20 finds nothing -- folder 20 exists but is inactive.
      const ItemFolder = { findOne: jest.fn().mockResolvedValue(null) };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
        return {};
      });

      await itemRepository.getItems({ folder_id: '20', page: '1', limit: '20' });

      const args = Item.findAndCountAll.mock.calls[0][0];
      expect(args.where.folder_id).toBe(-1);
      // Never even attempts the membership union query once the folder itself fails the
      // active-only check.
      expect(membershipFindAll).not.toHaveBeenCalled();
    });

    it('RF-1: returns zero rows for a soft-deleted requested folder (same as inactive)', async () => {
      const Item = { findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] }) };
      // Same active-only query shape covers both is_active:false and a non-null deleted_at --
      // this test exists as its own case (not folded into the inactive one) per the review's
      // explicit ask for a distinct soft-deleted case.
      const ItemFolder = { findOne: jest.fn().mockResolvedValue(null) };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        if (name === 'ItemFolderMembership') return { findAll: jest.fn() };
        return {};
      });

      await itemRepository.getItems({ folder_id: '20', page: '1', limit: '20' });

      expect(ItemFolder.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { folder_id: 20, is_active: true, deleted_at: null }
      }));
      const args = Item.findAndCountAll.mock.calls[0][0];
      expect(args.where.folder_id).toBe(-1);
    });

    it('RF-1: drops a secondary membership pointing at an inactive/soft-deleted folder, keeps an active one (mixed case)', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({
          count: 1,
          rows: buildItemRows([{ item_id: 5, name: 'Latte', folder_id: 10 }])
        })
      };
      // Item 5 has two secondary memberships: folder 30 (active) and folder 40 (stale).
      const membershipFindAll = jest.fn().mockResolvedValue([
        { item_id: 5, folder_id: 30 },
        { item_id: 5, folder_id: 40 }
      ]);
      // The active-only ItemFolder query for [30, 40] only returns 30 -- 40 is inactive/deleted.
      const ItemFolder = {
        findAll: jest.fn().mockImplementation(({ where }) => {
          const requested = where?.folder_id?.[Op.in] || [];
          return Promise.resolve(requested.filter((id) => id === 30).map((id) => ({ folder_id: id })));
        })
      };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
        return {};
      });

      const result = await itemRepository.getItems({ page: '1', limit: '20' });

      expect(result.items[0].secondary_folder_ids).toEqual([30]);
    });

    // --- RF-2: a missing item_folder_memberships table (schema drift, not a missing model) --

    it('RF-2: filter widening degrades to primary-only when ItemFolderMembership.findAll rejects with ER_NO_SUCH_TABLE', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({
          count: 1,
          rows: buildItemRows([{ item_id: 5, name: 'Latte', folder_id: 10 }])
        })
      };
      const tableMissingError = Object.assign(new Error("Table 'tenant_x.item_folder_memberships' doesn't exist"), {
        original: { code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'tenant_x.item_folder_memberships' doesn't exist" }
      });
      const ItemFolder = { findOne: jest.fn().mockResolvedValue({ folder_id: 20 }) };

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return ItemFolder;
        if (name === 'ItemFolderMembership') return { findAll: jest.fn().mockRejectedValue(tableMissingError) };
        return {};
      });

      const result = await itemRepository.getItems({ folder_id: '20', page: '1', limit: '20' });

      const args = Item.findAndCountAll.mock.calls[0][0];
      expect(args.where.folder_id).toBe('20');
      expect(args.where[Op.and]).toBeUndefined();
      expect(result.items[0].secondary_folder_ids).toEqual([]);
    });

    it('RF-2: attachSecondaryFolderIds degrades to primary-only when ItemFolderMembership.findAll rejects with ER_NO_SUCH_TABLE', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({
          count: 1,
          rows: buildItemRows([{ item_id: 5, name: 'Latte', folder_id: 10 }])
        })
      };
      const tableMissingError = Object.assign(new Error("Table 'tenant_x.item_folder_memberships' doesn't exist"), {
        original: { code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'tenant_x.item_folder_memberships' doesn't exist" }
      });

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return {};
        if (name === 'ItemFolderMembership') return { findAll: jest.fn().mockRejectedValue(tableMissingError) };
        return {};
      });

      const result = await itemRepository.getItems({ page: '1', limit: '20' });

      expect(result.items[0].secondary_folder_ids).toEqual([]);
    });

    it('RF-2: a rejection unrelated to the missing table still propagates (not silently swallowed)', async () => {
      const Item = {
        findAndCountAll: jest.fn().mockResolvedValue({
          count: 1,
          rows: buildItemRows([{ item_id: 5, name: 'Latte', folder_id: 10 }])
        })
      };
      const unrelatedError = new Error('connection reset');

      jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return Item;
        if (name === 'ProductComposition') return {};
        if (name === 'ItemFolder') return {};
        if (name === 'ItemFolderMembership') return { findAll: jest.fn().mockRejectedValue(unrelatedError) };
        return {};
      });

      await expect(itemRepository.getItems({ page: '1', limit: '20' })).rejects.toThrow('connection reset');
    });
  });
});
