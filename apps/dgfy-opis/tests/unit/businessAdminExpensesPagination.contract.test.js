import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'),
    'utf8'
);
const businessAdminCss = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/businessAdmin.css'),
    'utf8'
);

describe('Business Admin Expenses pagination contract', () => {
    it('requests and renders no more than 20 expense rows', () => {
        expect(businessAdminPage).toContain('businessAdminApi.expenses({ ...params, page: expensesPage, limit: BUSINESS_ADMIN_ORDERS_PAGE_SIZE }, requestConfig)');
        expect(businessAdminPage).toContain('<ExpensesPagination');
    });

    it('loads the selected page and resets pagination when filters change', () => {
        expect(businessAdminPage).toContain('const [expensesPage, setExpensesPage] = useState(1);');
        expect(businessAdminPage).toContain('onPageChange={setExpensesPage}');
        expect(businessAdminPage).toContain('if (activeSection === \'expenses\') setExpensesPage(1);');
        expect(businessAdminPage).toContain('Previous expenses page');
        expect(businessAdminPage).toContain('Next <ChevronRight size={14} />');
    });

    it('keeps the expense panel stable during page changes', () => {
        expect(businessAdminPage).toContain('canKeepPaginatedWorkspace');
        expect(businessAdminPage).toContain('data-testid="business-admin-expenses-results"');
        expect(businessAdminPage).toContain('Updating expense ledger…');
        expect(businessAdminPage).toContain('refreshError={sectionError}');
        expect(businessAdminPage).toContain('refreshing={refreshing}');
        expect(businessAdminCss).toContain('.business-admin-expenses-results.is-refreshing .business-admin-expenses-results-content');
    });
});
