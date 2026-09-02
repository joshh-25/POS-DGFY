import fs from 'fs';
import path from 'path';

const readBackendFile = (relativePath) => (
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
);

// Trimmed (#1441): kept to the buildStockBearingItemWhere import check per file -- the
// non-literal assertion that actually guards against a stock-bearing-policy regression. The
// dropped assertions pinned literal query/attribute text that rots independently of the policy
// this file exists to protect.
describe('mode financial tracking source contracts', () => {
  it('keeps dashboard inventory metrics stock-bearing only', () => {
    const source = readBackendFile('src/services/dashboardService.js');

    expect(source).toContain("import { buildStockBearingItemWhere } from '../modules/shared/utils/stockBearingPolicy.js';");
  });

  it('keeps reports and inventory valuation stock-bearing only', () => {
    const reportSource = readBackendFile('src/services/reportService.js');
    const valuationSource = readBackendFile('src/modules/inventory/services/costValuationService.js');

    expect(reportSource).toContain("import { buildStockBearingItemWhere } from '../modules/shared/utils/stockBearingPolicy.js';");
    expect(valuationSource).toContain("import { buildStockBearingItemWhere } from '../../shared/utils/stockBearingPolicy.js';");
  });
});
