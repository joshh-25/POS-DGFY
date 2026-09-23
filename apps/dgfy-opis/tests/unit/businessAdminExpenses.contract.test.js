import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const page = fs.readFileSync(path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'), 'utf8');
const service = fs.readFileSync(path.resolve(__dirname, '../../src/features/businessAdmin/businessAdminService.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../../src/features/businessAdmin/businessAdmin.css'), 'utf8');

describe('Business Admin expense ledger contract', () => {
  it('loads, creates, and voids tenant-local expense records', () => {
    expect(service).toContain("expenses: (params) => get('/business-admin/expenses', params)");
    expect(service).toContain("createExpense: (body) => api.post('/business-admin/expenses', body)");
    expect(service).toContain("voidExpense: (expenseId, body) => api.post(`/business-admin/expenses/${encodeURIComponent(expenseId)}/void`, body)");
    expect(page).toContain("else if (activeSection === 'expenses') payload = await businessAdminApi.expenses");
    expect(page).toContain('Record an operating expense');
    expect(page).toContain('idempotency_key: createExpenseIdempotencyKey()');
    expect(page).toContain('Void expense');
  });

  it('keeps the expense workspace readable on mobile and preserves the cash boundary', () => {
    expect(page).toContain('Cash drawer additions and cash-outs remain in Shifts & cash.');
    expect(page).toContain('Profit-after-expenses and tax calculations remain deferred.');
    expect(css).toContain('.business-admin-expenses-table-view { display: block; }');
    expect(css).toContain('.business-admin-expenses-mobile-view { display: none; }');
    expect(css).toContain('.business-admin-expenses-table-view { display: none; }');
    expect(css).toContain('.business-admin-expenses-mobile-view { display: block; }');
    expect(css).toContain('.business-admin-expense-form-grid');
    expect(css).toContain('.business-admin-expense-card-facts { grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});
