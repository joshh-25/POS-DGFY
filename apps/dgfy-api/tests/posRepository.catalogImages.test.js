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
                variants: {
                  pos_thumbnail_url: '/uploads/storefront/cheese-sauce-pos-thumb.webp'
                },
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
          source: 'tenant_generated',
          scope: 'pos',
          toJSON: () => ({
            item_barcode_id: 501,
            item_id: 101,
            code: 'CHEESE-101',
            source: 'tenant_generated',
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
      pos_image_variants: expect.objectContaining({
        pos_thumbnail_url: '/uploads/storefront/cheese-sauce-pos-thumb.webp'
      }),
      storefront_image_url: '/uploads/storefront/cheese-sauce.png',
      primary_barcode: {
        item_barcode_id: 501,
        code: 'CHEESE-101',
        source: 'tenant_generated',
        scope: 'pos',
        is_primary: true
      }
    }));
    expect(ItemBarcode.findAll).toHaveBeenCalledTimes(1);
  });

  it('shows legacy inventory-scoped manufacturer GTINs so POS edits can repair their scope', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([{
        toJSON: () => ({
          item_id: 176,
          name: 'Stabilo Boss original',
          sku_code: 'STABILO-176',
          category: 'product',
          product_type: 'finished_goods',
          unit_of_measure: 'pcs',
          current_stock: 1,
          cost_per_unit: 10,
          default_sale_price: 20,
          vat_type: 'vatable'
        })
      }])
    };
    const ItemBarcode = {
      findAll: jest.fn().mockResolvedValue([{
        source: 'manufacturer',
        scope: 'inventory',
        toJSON: () => ({
          item_barcode_id: 26,
          item_id: 176,
          code: '4006381333672',
          source: 'manufacturer',
          scope: 'inventory',
          is_primary: true
        })
      }])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemBarcode') return ItemBarcode;
      if (name === 'PosCatalogOverride') return { findAll: jest.fn().mockResolvedValue([]) };
      if (name === 'StorefrontCatalogOverride') return { findAll: jest.fn().mockResolvedValue([]) };
      if (name === 'ItemLocationStock') return null;
      if (['ServiceItemDetail', 'FnbModifierGroup', 'FnbModifierOption', 'FnbItemKitchenRoute', 'FnbKitchenStation'].includes(name)) return null;
      return {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result[0].primary_barcode).toEqual({
      item_barcode_id: 26,
      code: '4006381333672',
      source: 'manufacturer',
      scope: 'inventory',
      is_primary: true
    });
  });

  it('prefers a working POS-specific override image over the Storefront fallback when both exist (#871)', async () => {
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
            pos_image_path: 'pos/current-iced-latte.png',
            pos_image_url: '/uploads/pos/current-iced-latte.png'
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
                variants: {
                  pos_thumbnail_url: '/uploads/storefront/new-iced-latte-pos-thumb.webp',
                  thumbnail_url: '/uploads/storefront/new-iced-latte-thumb.webp'
                },
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
      // #871: a working POS-specific image must win over the Storefront
      // fallback -- applyCatalogOverrides() previously always used the
      // Storefront image unconditionally, silently dropping a valid
      // pos_catalog_overrides image whenever both existed.
      pos_image_url: '/uploads/pos/current-iced-latte.png',
      // storefront_image_url is a separate, Storefront-facing field and is
      // unaffected by which image POS chooses to display.
      storefront_image_url: '/uploads/storefront/new-iced-latte.png'
    }));
    expect(result[0].storefront_image_variants.pos_thumbnail_url)
      .toBe('/uploads/storefront/new-iced-latte-pos-thumb.webp');
  });

  it('prefers a working POS-specific override image over the Storefront fallback in getCatalogReadinessByItemId (#871)', async () => {
    const Item = {
      findOne: jest.fn().mockResolvedValue({
        toJSON: () => ({
          item_id: 303,
          name: 'Mango Shake',
          sku_code: 'BEV-303-MANGO-SHAKE',
          category: 'product',
          product_type: 'finished_goods',
          status: 'active',
          default_sale_price: 90,
          current_stock: 10,
          folder_id: null,
          product_folder: null
        })
      })
    };
    const PosCatalogOverride = {
      findOne: jest.fn().mockResolvedValue({
        toJSON: () => ({
          item_id: 303,
          pos_visible: true,
          pos_image_path: 'pos/current-mango-shake.png',
          pos_image_url: '/uploads/pos/current-mango-shake.png'
        })
      })
    };
    const StorefrontCatalogOverride = {
      findAll: jest.fn().mockResolvedValue([
        {
          toJSON: () => ({
            item_id: 303,
            storefront_image_path: 'storefront/new-mango-shake.png',
            storefront_image_url: '/uploads/storefront/new-mango-shake.png',
            storefront_image_gallery: null
          })
        }
      ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'PosCatalogOverride') return PosCatalogOverride;
      if (name === 'StorefrontCatalogOverride') return StorefrontCatalogOverride;
      if (name === 'SystemSetting') return null;
      if (name === 'ItemFolder') return null;
      if (['ServiceItemDetail', 'FnbModifierGroup', 'FnbModifierOption', 'FnbItemKitchenRoute', 'FnbKitchenStation'].includes(name)) return null;
      return {};
    });

    const result = await posRepository.getCatalogReadinessByItemId(303);

    expect(result).toEqual(expect.objectContaining({
      item_id: 303,
      // #871: same fallback-order bug as listCatalog()'s applyCatalogOverrides(),
      // fixed via the same shared resolvePosDisplayImage() helper.
      pos_image_url: '/uploads/pos/current-mango-shake.png',
      storefront_image_url: '/uploads/storefront/new-mango-shake.png'
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
