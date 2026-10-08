import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(testDirectory, '../../src/features/businessAdmin');
const readSource = (fileName) => readFileSync(resolve(sourceRoot, fileName), 'utf8');

describe('Business Admin processing-fee surface contract', () => {
  it('keeps the tenant-revenue API contract source-aware and tenant-scoped', () => {
    const service = readSource('businessAdminService.js');
    expect(service).toContain("'/tenant-revenue/tenant/summary'");
    expect(service).toContain("'/tenant-revenue/tenant/transactions'");
    expect(service).toContain("'/tenant-revenue/tenant/fee-history'");
    expect(service).toContain("'/tenant-revenue/tenant/fee-policies'");
  });

  it('renders Owner configuration and separates actual, estimated, and manual-review fees', () => {
    const page = readSource('BusinessAdminPage.jsx');
    const editor = readSource('ProcessingFeePolicyEditor.jsx');
    expect(page).toContain('ProcessingFeePolicyEditor');
    expect(page).toContain("'processing_fees'");
    expect(page).toContain('processingFeePane');
    expect(page).toContain('processing_fee_sources');
    expect(page).toContain('Estimated fallback');
    expect(page).toContain('tenant_revenue');
    expect(editor).toContain('expected_policy_version');
    expect(editor).toContain('Save preparation fee');
    expect(editor).toContain('customer_processing_fee_policy');
    expect(editor).toContain('Item processing fee');
    expect(editor).toContain('<option value="percentage">Percentage</option>');
    expect(editor).not.toContain('Percentage of discounted items');
    expect(editor).toContain('This is not a payment-processing fee.');
    expect(editor).not.toContain('Payment provider fallback fees and item processing fee');
    expect(editor).not.toContain('business-admin-processing-fee-method-grid');
    expect(editor).not.toContain('Fallback configuration');
  });
});
