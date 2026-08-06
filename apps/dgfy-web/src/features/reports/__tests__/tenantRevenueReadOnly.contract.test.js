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

  it('shows fees, payable, settlements, and references without financial mutation controls', () => {
    expect(panel).toContain('Tenant Revenue & Settlement');
    expect(panel).toContain('PayMongo fees');
    expect(panel).toContain('DGFY fees');
    expect(panel).toContain('Net payable');
    expect(panel).toContain('Pending settlement');
    expect(panel).toContain('Paid to tenant');
    expect(panel).not.toContain('Approve adjustment');
    expect(panel).not.toContain('Confirm paid');
  });
});
