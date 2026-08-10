import fs from 'fs';
import path from 'path';

const readBackendFile = (relativePath) => (
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
);

describe('mode financial tracking source contracts', () => {
  it('keeps dashboard inventory metrics stock-bearing only', () => {
    const source = readBackendFile('src/services/dashboardService.js');

    expect(source).toContain("import { buildStockBearingItemWhere } from '../modules/shared/utils/stockBearingPolicy.js';");
    expect(source).toContain('where: buildStockBearingItemWhere(buildVisibleWhere({ status: \'active\' }))');
    expect(source).toContain('const valueItemWhere = buildStockBearingItemWhere(buildVisibleWhere({');
    expect(source).toContain('items_missing_cost: itemsMissingCost');
  });

  it('keeps reports and inventory valuation stock-bearing only', () => {
    const reportSource = readBackendFile('src/services/reportService.js');
    const valuationSource = readBackendFile('src/modules/inventory/services/costValuationService.js');

    expect(reportSource).toContain("import { buildStockBearingItemWhere } from '../modules/shared/utils/stockBearingPolicy.js';");
    expect(reportSource).toContain('where: buildStockBearingItemWhere(buildVisibleWhere({ status: \'active\' }))');
    expect(reportSource).toContain('getWeightedInventoryValueOverview()');

    expect(valuationSource).toContain("import { buildStockBearingItemWhere } from '../../shared/utils/stockBearingPolicy.js';");
    expect(valuationSource).toContain("where: buildStockBearingItemWhere({ status: 'active', deleted_at: null })");
    expect(valuationSource).toContain("attributes: ['item_id', 'current_stock', 'cost_per_unit', 'category', 'mode_item_preset', 'fifo_enabled']");
  });
});
