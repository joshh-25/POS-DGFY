import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { validateComposition } from '../src/services/compositionValidationService.js';
import { getFinancialSummary } from '../src/services/reportService.js';
import { applyThresholdSettings } from '../src/services/settingsService.js';

describe('soft-delete hardening regression', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects composition when ingredient is missing or soft-deleted', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([{ item_id: 1 }]),
    };
    const ProductComposition = {
      findAll: jest.fn(),
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ProductComposition') return ProductComposition;
      return {};
    });

    const result = await validateComposition(50, [1, 2]);

    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('INGREDIENT_NOT_FOUND');

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.deleted_at).toBeNull();
    expect(args.where.status[Op.ne]).toBe('inactive');
    expect(ProductComposition.findAll).not.toHaveBeenCalled();
  });

  it('uses visible-record filter for financial summary item totals', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await getFinancialSummary();

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.deleted_at).toBeNull();
    expect(args.where.status).toBe('active');
  });

  it('applies threshold updates only to active, non-deleted items', async () => {
    const Item = {
      update: jest.fn().mockResolvedValue([3]),
    };
    const SystemSetting = {
      findAll: jest.fn().mockResolvedValue([
        { setting_key: 'enable_auto_reorder', setting_value: 'true', data_type: 'boolean' },
        { setting_key: 'min_stock_threshold_percent', setting_value: '40', data_type: 'number' },
        { setting_key: 'purchase_allowance_percent', setting_value: '20', data_type: 'number' },
      ]),
    };
    const sequelize = {
      literal: jest.fn((expr) => expr),
    };

    jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize });
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'SystemSetting') return SystemSetting;
      if (name === 'sequelize') return sequelize;
      return {};
    });

    await applyThresholdSettings();

    const [, options] = Item.update.mock.calls[0];
    expect(options.where.deleted_at).toBeNull();
    expect(options.where.status).toBe('active');
    expect(options.where.max_capacity[Op.gt]).toBe(0);
  });
});
