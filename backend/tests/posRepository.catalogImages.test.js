import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';

describe('posRepository catalog image mapping', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses Storefront item image as the POS catalog image fallback', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 101,
            name: 'Cheese Sauce',
            sku_code: 'SB-059-CHEESE-SAUCE',
            category: 'product',
            product_type: 'finished_goods',
            unit_of_measure: 'serving',
            current_stock: 50,
            cost_per_unit: 0,
            default_sale_price: 80,
            vat_type: 'vatable'
          })
        }
      ])
    };
    const PosCatalogOverride = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 101,
            pos_visible: true,
            pos_image_path: null,
            pos_image_url: null
          })
        }
      ])
    };
    const StorefrontCatalogOverride = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 101,
            storefront_image_path: 'storefront/cheese-sauce.png',
            storefront_image_url: '/uploads/storefront/cheese-sauce.png',
            storefront_image_gallery: [
              {
                path: 'storefront/cheese-sauce.png',
                url: '/uploads/storefront/cheese-sauce.png',
                is_primary: true,
                sort_order: 0
              }
            ]
          })
        }
      ])
    };
    const ItemBarcode = {
      findAll: jest.fn().mockResolvedValue([
        {
          scope: 'pos',
          toJSON: () => ({
            item_barcode_id: 501,
            item_id: 101,
            code: 'CHEESE-101',
            scope: 'pos',
            is_primary: true
          })
        }
      ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'PosCatalogOverride') return PosCatalogOverride;
      if (name === 'StorefrontCatalogOverride') return StorefrontCatalogOverride;
      if (name === 'ItemBarcode') return ItemBarcode;
      if (name === 'ItemLocationStock') return null;
      if (['ServiceItemDetail', 'FnbModifierGroup', 'FnbModifierOption', 'FnbItemKitchenRoute', 'FnbKitchenStation'].includes(name)) return null;
      return {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      item_id: 101,
      pos_image_url: '/uploads/storefront/cheese-sauce.png',
      storefront_image_url: '/uploads/storefront/cheese-sauce.png',
      primary_barcode: {
        item_barcode_id: 501,
        code: 'CHEESE-101',
        scope: 'pos',
        is_primary: true
      }
    }));
    expect(ItemBarcode.findAll).toHaveBeenCalledTimes(1);
  });

  it('never returns a stale pos_catalog_overrides image once a storefront image exists', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 202,
            name: 'Iced Latte',
            sku_code: 'BEV-202-ICED-LATTE',
            category: 'product',
            product_type: 'finished_goods',
            unit_of_measure: 'serving',
            current_stock: 20,
            cost_per_unit: 0,
            default_sale_price: 120,
            vat_type: 'vatable'
          })
        }
      ])
    };
    const PosCatalogOverride = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 202,
            pos_visible: true,
            pos_image_path: 'pos/stale-iced-latte.png',
            pos_image_url: '/uploads/pos/stale-iced-latte.png'
          })
        }
      ])
    };
    const StorefrontCatalogOverride = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 202,
            storefront_image_path: 'storefront/new-iced-latte.png',
            storefront_image_url: '/uploads/storefront/new-iced-latte.png',
            storefront_image_gallery: [
              {
                path: 'storefront/new-iced-latte.png',
                url: '/uploads/storefront/new-iced-latte.png',
                is_primary: true,
                sort_order: 0
              }
            ]
          })
        }
      ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'PosCatalogOverride') return PosCatalogOverride;
      if (name === 'StorefrontCatalogOverride') return StorefrontCatalogOverride;
      if (name === 'ItemLocationStock') return null;
      if (['ServiceItemDetail', 'FnbModifierGroup', 'FnbModifierOption', 'FnbItemKitchenRoute', 'FnbKitchenStation'].includes(name)) return null;
      return {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      item_id: 202,
      pos_image_url: '/uploads/storefront/new-iced-latte.png',
      storefront_image_url: '/uploads/storefront/new-iced-latte.png'
    }));
  });

  it('resolves server-owned Best Seller tags from completed paid sales and overrides', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        { toJSON: () => ({ item_id: 101, name: 'Auto', category: 'product', current_stock: 5, default_sale_price: 50, vat_type: 'vatable' }) },
        { toJSON: () => ({ item_id: 102, name: 'Forced', category: 'product', current_stock: 5, default_sale_price: 50, vat_type: 'vatable' }) },
        { toJSON: () => ({ item_id: 103, name: 'Suppressed', category: 'product', current_stock: 5, default_sale_price: 50, vat_type: 'vatable' }) }
      ])
    };
    const PosCatalogOverride = {
      findAll: jest.fn().mockResolvedValue([
        { toJSON: () => ({ item_id: 101, pos_visible: true, pos_always_available: false, pos_best_seller_mode: 'auto' }) },
        { toJSON: () => ({ item_id: 102, pos_visible: true, pos_always_available: false, pos_best_seller_mode: 'force' }) },
        { toJSON: () => ({ item_id: 103, pos_visible: true, pos_always_available: false, pos_best_seller_mode: 'never' }) }
      ])
    };
    const SystemSetting = {
      findOne: jest.fn().mockResolvedValue({ setting_value: JSON.stringify({ enabled: true, lookback_days: 30, top_limit: 3 }) })
    };
    const PosTransactionLine = {
      findAll: jest.fn().mockResolvedValue([
        { item_id: 101, sold_quantity: 18 },
        { item_id: 103, sold_quantity: 17 }
      ])
    };
    const sequelize = {
      fn: jest.fn((name, value) => ({ name, value })),
      col: jest.fn((value) => value),
      literal: jest.fn((value) => value)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'PosCatalogOverride') return PosCatalogOverride;
      if (name === 'SystemSetting') return SystemSetting;
      if (name === 'PosTransaction') return {};
      if (name === 'PosTransactionLine') return PosTransactionLine;
      if (name === 'sequelize') return sequelize;
      if (name === 'ItemLocationStock') return null;
      if (['StorefrontCatalogOverride', 'ServiceItemDetail', 'FnbModifierGroup', 'FnbModifierOption', 'FnbItemKitchenRoute', 'FnbKitchenStation'].includes(name)) return null;
      return {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result.map((item) => ({ item_id: item.item_id, is_best_seller: item.is_best_seller }))).toEqual([
      { item_id: 101, is_best_seller: true },
      { item_id: 102, is_best_seller: true },
      { item_id: 103, is_best_seller: false }
    ]);
    expect(PosTransactionLine.findAll).toHaveBeenCalledWith(expect.objectContaining({
      include: [expect.objectContaining({
        where: expect.objectContaining({ status: 'completed', payment_status: 'paid' })
      })]
    }));
  });
});
