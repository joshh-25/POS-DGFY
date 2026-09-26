import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const overviewRepository = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/businessAdmin/repositories/businessAdminOverviewRepository.js'),
  'utf8'
);

describe('Business Admin overview sales trend contract', () => {
  it('groups completed transaction totals by business date inside the requested scope', () => {
    expect(overviewRepository).toContain("import { businessAdminFinancialReportRepository } from './businessAdminFinancialReportRepository.js';");
    expect(overviewRepository).toContain("reportKey: 'sales_trend'");
    expect(overviewRepository).toContain('registerId');
    expect(overviewRepository).toContain("period: String(row.period || '').slice(0, 16)");
    expect(overviewRepository).toContain('gross_sales: toNumber(row.gross_sales)');
    expect(overviewRepository).toContain('refunds: toNumber(row.refunds_voids)');
    expect(overviewRepository).toContain('discounts: toNumber(row.discounts)');
    expect(overviewRepository).toContain('net_sales: toNumber(row.net_sales)');
    expect(overviewRepository).toContain('gross_profit: toNumber(row.pos_profit_loss)');
    expect(overviewRepository).toContain('vat: toNumber(row.vat)');
    expect(overviewRepository).toContain('transaction_count: toNumber(row.transaction_count)');
    expect(overviewRepository).toContain('sales_trend: salesTrendRows.map');
    const financialReportRepository = fs.readFileSync(
      path.resolve(__dirname, '../src/modules/businessAdmin/repositories/businessAdminFinancialReportRepository.js'),
      'utf8'
    );
    expect(financialReportRepository).toContain('isSingleBusinessDate: Boolean(dateFrom && dateTo && dateFrom === dateTo)');
    expect(financialReportRepository).toContain("DATE_FORMAT(DATE_ADD(t.created_at, INTERVAL 8 HOUR), '%Y-%m-%d %H:00') AS period");
  });
});
