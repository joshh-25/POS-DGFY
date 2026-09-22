import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const panel = fs.readFileSync(path.resolve(__dirname, '../TenantRevenueReadOnlyPanel.jsx'), 'utf8');
const service = fs.readFileSync(
  path.resolve(__dirname, '../../../services/tenantRevenueService.js'),
  'utf8'
);

describe('Tenant revenue read-only report contract', () => {
  it('loads only tenant-scoped financial endpoints', () => {
    expect(service).toContain('/tenant-revenue/tenant/summary');
    expect(service).toContain('/tenant-revenue/tenant/transactions');
    expect(service).toContain('/tenant-revenue/tenant/settlements');
    expect(service).toContain('/tenant-revenue/tenant/fee-history');
    expect(service).not.toContain('/tenant-revenue/admin/');
  });

  it('shows tenant-friendly payment and transfer information without financial mutation controls', () => {
    expect(panel).toContain('Payments & transfers');
    expect(panel).toContain('Payment processing fees');
    expect(panel).toContain('Platform fee');
    expect(panel).toContain('Amount due to your business');
    expect(panel).toContain('Awaiting transfer');
    expect(panel).toContain('Transferred to your business');
    expect(panel).not.toContain('DGFY fees');
    expect(panel).not.toContain('Net payable');
    expect(panel).not.toContain('Pending settlement');
    expect(panel).not.toContain('Paid to tenant');
    expect(panel).not.toContain('Approve adjustment');
    expect(panel).not.toContain('Confirm paid');
  });

  it('paginates the payment statement at 20 records per page', () => {
    expect(panel).toContain('const TRANSACTION_PAGE_SIZE = 20;');
    expect(panel).toContain('limit: TRANSACTION_PAGE_SIZE');
    expect(panel).toContain('offset: (page - 1) * TRANSACTION_PAGE_SIZE');
    expect(panel).toContain('Showing {transactionRangeStart}–{transactionRangeEnd} of {totalTransactions} payments');
    expect(panel).toContain('Previous');
    expect(panel).toContain('Next');
  });
});
