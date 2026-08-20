import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const repositorySource = readFileSync(
    new URL('../src/modules/pos/repositories/posRepository.js', import.meta.url),
    'utf8'
);
const searchUtilitySource = readFileSync(
    new URL('../src/modules/pos/utils/posTransactionHistorySearch.js', import.meta.url),
    'utf8'
);

describe('POS transaction history search contract', () => {
    it('supports cashier-name filtering and searches beyond invoice number', () => {
        expect(repositorySource).toContain('filters.cashier_name');
        expect(repositorySource).toContain('findHistoryUserIds');
        expect(repositorySource).toContain('cashier_id');
        expect(repositorySource).toContain('accepted_by');
        expect(repositorySource).toContain('findHistoryDiscountTransactionIds');
        expect(repositorySource).toContain('buildPosTransactionHistorySearchConditions');
        expect(searchUtilitySource).toContain('employee_credit_employee_name_snapshot');
        expect(repositorySource).toContain('pos_transaction_id');
        expect(searchUtilitySource).toContain('total_amount');
        expect(searchUtilitySource).toContain('DATE_FORMAT');
        expect(repositorySource).not.toContain('where.invoice_number = { [Op.like]: `%${String(filters.search).trim()}%` }');
    });
});
