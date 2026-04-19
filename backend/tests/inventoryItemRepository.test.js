import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
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

    expect(result).toEqual({
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
          id: 1
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
          id: 2
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

  it('lists folders with item counts using visible-item filter', async () => {
    const ItemFolder = {
      findAll: jest.fn().mockResolvedValue([
        {
          folder_id: 1,
          name: 'Raw Materials',
          description: 'Core inputs',
          parent_id: null,
          items: [{ item_id: 10 }, { item_id: 11 }]
        },
        {
          folder_id: 2,
          name: 'Packaging',
          description: '',
          parent_id: null,
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
    expect(args.include[0].where.deleted_at).toBeNull();
    expect(args.include[0].where.status[Op.ne]).toBe('inactive');
    expect(result).toEqual([
        {
          folder_id: 1,
          name: 'Raw Materials',
          description: 'Core inputs',
          show_in_pos_filter: true,
          parent_id: null,
          item_count: 2
        },
        {
          folder_id: 2,
          name: 'Packaging',
          description: '',
          show_in_pos_filter: true,
          parent_id: null,
          item_count: 0
        }
    ]);
  });

  it('creates folder and normalizes unique constraint errors', async () => {
    const ItemFolder = {
      create: jest.fn().mockResolvedValue({
        folder_id: 44,
        name: 'Dry Goods'
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
      show_in_pos_filter: true,
      message: 'Inventory folder "Dry Goods" created successfully'
    });

    ItemFolder.create.mockRejectedValueOnce({ name: 'SequelizeUniqueConstraintError' });
    await expect(itemRepository.createFolder('Dry Goods')).rejects.toThrow('Folder "Dry Goods" already exists');
  });

  it('deletes folder and unassigns items', async () => {
    const folder = {
      name: 'Legacy Folder',
      destroy: jest.fn().mockResolvedValue(true)
    };
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue(folder)
    };
    const Item = {
      update: jest.fn().mockResolvedValue([3])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return Item;
      return {};
    });

    const result = await itemRepository.deleteFolder(7);

    const updateArgs = Item.update.mock.calls[0];
    expect(updateArgs[0]).toEqual({ folder_id: null, product_folder: null });
    expect(updateArgs[1].where.folder_id).toBe(7);
    expect(updateArgs[1].where.deleted_at).toBeNull();
    expect(updateArgs[1].where.status[Op.ne]).toBe('inactive');
    expect(folder.destroy).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      unassigned_count: 3,
      message: 'Folder "Legacy Folder" deleted successfully. 3 item(s) unassigned.'
    });
  });

  it('returns 404 when deleting a missing folder', async () => {
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue(null)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'Item') return {};
      return {};
    });

    await expect(itemRepository.deleteFolder(404)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Folder not found'
    });
  });

  it('updates folder POS filter visibility', async () => {
    const folder = {
      folder_id: 9,
      name: 'Finished Goods',
      description: 'Sellable products',
      parent_id: null,
      show_in_pos_filter: true,
      update: jest.fn().mockImplementation(async (updates) => {
        folder.show_in_pos_filter = updates.show_in_pos_filter;
      })
    };
    const ItemFolder = {
      findByPk: jest.fn().mockResolvedValue(folder)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolder') return ItemFolder;
      return {};
    });

    const result = await itemRepository.updateFolder(9, { show_in_pos_filter: false });

    expect(folder.update).toHaveBeenCalledWith({ show_in_pos_filter: false });
    expect(result).toEqual({
      success: true,
      folder_id: 9,
      name: 'Finished Goods',
      description: 'Sellable products',
      parent_id: null,
      show_in_pos_filter: false,
      message: 'Folder "Finished Goods" updated successfully.'
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
      message: 'No valid folder fields to update'
    });
  });
});
